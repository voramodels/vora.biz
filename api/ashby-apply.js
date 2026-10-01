/* Vercel Serverless Function — POST /api/ashby-apply
 *
 * PORTAL-PRIMARY intake. Every application from vora.biz is durably stored in
 * the portal FIRST (hard gate), then best-effort mirrored to Ashby.
 *
 * Why the flip (2026-07-17): this used to be Ashby-first and hard-gated —
 * candidate.create failing (or the ASHBY_API_KEY missing) returned 5xx and the
 * applicant was REJECTED. The moment Ashby was cancelled, every applicant would
 * have been turned away. Now:
 *   1. Mint our OWN crypto-random candidate id (the portal returns the
 *      canonical id, deduped by email on its side).
 *   2. Write the portal application-record — RETRIED + HARD-GATED. The applicant
 *      is only rejected if OUR durable store fails, never because of Ashby.
 *   3. Ashby mirror is BEST-EFFORT and only runs while ASHBY_API_KEY is set
 *      (and ASHBY_MIRROR !== 'off'). Remove the key → the whole Ashby block is
 *      skipped and intake is pure-portal. No dependency.
 *
 * ── Required Vercel env vars ───────────────────────────────────────
 *   APPLY_RECORD_SECRET   shared secret gating /api/vora/application-record
 *   VORA_PORTAL_JOBS_URL  (optional) portal jobs endpoint; defaults to prod
 *   VORA_PORTAL_BASE      (optional) portal origin; defaults to teamvora.net
 * ── Optional (Ashby mirror only) ───────────────────────────────────
 *   ASHBY_API_KEY, ASHBY_SOURCE_TIER_1/2/3, ASHBY_FALLBACK_JOB_ID, ASHBY_MIRROR
 *
 * Files are uploaded to the portal's R2 endpoint by the browser BEFORE this
 * call; we receive only their URLs in body.attachments.
 */

import { randomUUID } from "node:crypto";

const truthy = (s) => typeof s === "string" && s.trim().length > 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PORTAL_BASE = (process.env.VORA_PORTAL_BASE || "https://teamvora.net").replace(/\/$/, "");
const PORTAL_JOBS_URL = process.env.VORA_PORTAL_JOBS_URL || `${PORTAL_BASE}/api/vora/jobs`;

let jobsCache = null;
let jobsCacheAt = 0;
const JOBS_CACHE_TTL_MS = 5 * 60 * 1000;

async function loadJobs() {
  const now = Date.now();
  if (jobsCache && (now - jobsCacheAt) < JOBS_CACHE_TTL_MS) return jobsCache;
  const sep = PORTAL_JOBS_URL.includes("?") ? "&" : "?";
  const r = await fetch(`${PORTAL_JOBS_URL}${sep}includeHidden=true`, { cache: "no-store" });
  if (!r.ok) throw new Error(`portal-jobs-${r.status}`);
  const body = await r.json();
  jobsCache = Array.isArray(body.jobs) ? body.jobs : [];
  jobsCacheAt = now;
  return jobsCache;
}

function tierLabel(tier) {
  const n = Number(tier);
  return Number.isFinite(n) && n >= 1 && n <= 3 ? n : null;
}

async function ashby(apiKey, method, body) {
  const r = await fetch(`https://api.ashbyhq.com/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(apiKey + ":").toString("base64")}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  let data = null;
  try { data = await r.json(); } catch { /* ignore */ }
  return { status: r.status, ok: r.ok && data?.success !== false, data };
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-methods", "POST, OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type");
    return res.status(204).end();
  }
  if (req.method !== "POST") return res.status(405).json({ error: "method-not-allowed" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  for (const k of ["name", "email"]) {
    if (!truthy(body[k])) return res.status(400).json({ error: `missing-${k}` });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
    return res.status(400).json({ error: "invalid-email" });
  }

  // Resolve the portal job for its title (so the ATS can pair the application
  // to the right pipeline). No Ashby job mapping required anymore.
  let resolvedJob = null;
  if (body.jobId != null) {
    try {
      const jobs = await loadJobs();
      resolvedJob = jobs.find((j) => Number(j.id) === Number(body.jobId)) || null;
    } catch (err) {
      console.warn("apply: portal job lookup failed", String(err).slice(0, 120));
    }
  }

  const tier = tierLabel(body.tier);
  const country = truthy(body.country) ? body.country.trim().slice(0, 8).toUpperCase() : "";
  const salaryShown = truthy(body.salaryShown) ? body.salaryShown.trim().slice(0, 80) : "";
  const source = String(body.source || "").toLowerCase().trim().slice(0, 80);
  // Stage 2 assessment key — set by the site from the role's seed config
  // (Velocity Editor / Marketing Team Lead). The portal validates it against
  // its own allowlist and mints the per-candidate token; we only pass it on.
  const assessmentKey = /^[a-z0-9][a-z0-9-]{2,39}$/.test(String(body.assessmentKey || ""))
    ? String(body.assessmentKey)
    : "";
  // Listing attribution from the /apply funnel (job-board links). Passed
  // through length-capped; the portal sanitizes and stamps first-touch.
  const capped = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const listing = {
    intake: capped(body.intake, 24),
    jobSlug: capped(body.jobSlug, 80),
    listingId: capped(body.listingId, 80),
    listingLabel: capped(body.listingLabel, 200),
    accountName: capped(body.accountName, 120),
    listingUrl: capped(body.listingUrl, 1024),
  };

  // Referral decode — `?ref=<base64url>` → { n, e, t }.
  let referralPayload = null;
  const rawRefToken = String(body.referralToken || "").trim().slice(0, 600);
  if (rawRefToken) {
    try {
      const b64 = rawRefToken.replace(/-/g, "+").replace(/_/g, "/");
      const pad = b64.length % 4 ? b64 + "=".repeat(4 - (b64.length % 4)) : b64;
      const parsed = JSON.parse(Buffer.from(pad, "base64").toString("utf-8"));
      const name = String(parsed?.n || "").trim().slice(0, 80);
      const email = String(parsed?.e || "").trim().toLowerCase().slice(0, 120);
      const ts = Number(parsed?.t) || null;
      if (name && /.+@.+\..+/.test(email)) referralPayload = { name, email, createdAt: ts };
    } catch (err) {
      console.warn("apply: referral token decode failed", String(err).slice(0, 160));
    }
  }

  // Parse the free-text answers ("Label: value" lines) the same way the portal
  // record expects them.
  const answers = [];
  if (truthy(body.notes)) {
    for (const line of String(body.notes).split("\n")) {
      const t = line.trim();
      if (!t) continue;
      const c = t.indexOf(":");
      if (c > 0) answers.push({ label: t.slice(0, c).trim(), value: t.slice(c + 1).trim() });
    }
  }

  // ── PRIMARY (hard gate): durable portal write, retried. The portal mints/
  // dedupes the canonical candidateId by email and returns it. ──────────
  const recordSecret = (process.env.APPLY_RECORD_SECRET || "").trim();
  if (!recordSecret) {
    return res.status(500).json({ error: "portal-not-configured", hint: "Set APPLY_RECORD_SECRET in Vercel env." });
  }
  const mintedId = randomUUID();
  const recordBody = {
    candidateId: mintedId,
    name: body.name, email: body.email, phone: body.phone || "",
    jobTitle: resolvedJob?.title || "", jobId: body.jobId ?? "",
    tier: tier || null, country, salaryShown, portfolio: body.portfolio,
    attachments: Array.isArray(body.attachments) ? body.attachments : [],
    answers, source, referredBy: referralPayload || null,
    assessmentKey,
    ...listing,
    submittedAt: new Date().toISOString(),
  };

  let candidateId = mintedId;
  let assessmentToken = "";
  let assessmentStatus = "";
  let portalOk = false;
  let lastErr = "";
  for (let attempt = 0; attempt < 3 && !portalOk; attempt += 1) {
    try {
      const r = await fetch(`${PORTAL_BASE}/api/vora/application-record`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-apply-secret": recordSecret },
        body: JSON.stringify(recordBody),
        signal: AbortSignal.timeout(20_000),
      });
      if (r.ok) {
        const d = await r.json().catch(() => ({}));
        if (d && d.candidateId) candidateId = String(d.candidateId);
        if (d && d.assessmentToken) assessmentToken = String(d.assessmentToken).slice(0, 80);
        if (d && d.assessmentStatus) assessmentStatus = String(d.assessmentStatus).slice(0, 32);
        portalOk = true;
      } else {
        lastErr = `record-http-${r.status}`;
      }
    } catch (err) {
      lastErr = String(err?.message || err).slice(0, 160);
    }
    if (!portalOk && attempt < 2) await sleep(600 * (attempt + 1));
  }
  if (!portalOk) {
    // The ONLY reason we reject an applicant now: our own durable store failed.
    return res.status(502).json({ error: "portal-record-failed", detail: lastErr });
  }

  const reviewUrl = `${PORTAL_BASE}/api/vora/review/${candidateId}`;

  // ── BEST-EFFORT: mirror to Ashby. Skipped entirely without a key, and every
  // step is wrapped — nothing here can affect the 200 the applicant gets. ──
  const apiKey = process.env.ASHBY_API_KEY;
  let ashbyCandidateId = null;
  let ashbyApplicationId = null;
  if (apiKey && process.env.ASHBY_MIRROR !== "off") {
    try {
      await mirrorToAshby(apiKey, { body, tier, country, salaryShown, source, referralPayload, resolvedJob, reviewUrl, answers })
        .then((r) => { ashbyCandidateId = r.candidateId; ashbyApplicationId = r.applicationId; });
    } catch (err) {
      console.warn("apply: Ashby mirror failed (non-fatal)", String(err?.message || err).slice(0, 200));
    }
  }

  return res.status(200).json({
    ok: true,
    candidateId,
    reviewUrl,
    jobId: body.jobId ?? null,
    tier: tier || null,
    attachments: Array.isArray(body.attachments) ? body.attachments.length : 0,
    referredBy: referralPayload || null,
    // Stage 2: the browser opens /stage-2/<token> after the Stage 1
    // processing animation. Empty when the role has no assessment or the
    // candidate already completed it (assessmentStatus === "submitted").
    assessmentToken,
    assessmentStatus,
    ashby: ashbyCandidateId ? { candidateId: ashbyCandidateId, applicationId: ashbyApplicationId } : null,
  });
}

// ── Ashby mirror (transition-only, best-effort) ──────────────────────────
// Kept intact so Ashby still gets a copy while the key lives, but wholly
// optional. Its review-link points at the PORTAL review page (canonical id).
async function mirrorToAshby(apiKey, ctx) {
  const { body, tier, country, salaryShown, source, referralPayload, resolvedJob, reviewUrl } = ctx;

  // Reuse an existing Ashby candidate for this email, else create.
  const candidatePayload = { name: body.name.trim().slice(0, 200), email: body.email.trim().slice(0, 200) };
  if (truthy(body.phone)) candidatePayload.phoneNumbers = [{ value: body.phone.trim().slice(0, 80), type: "Mobile" }];
  let candidateId = null;
  try {
    const sRes = await ashby(apiKey, "candidate.search", { email: candidatePayload.email });
    const hits = Array.isArray(sRes.data?.results) ? sRes.data.results : [];
    if (sRes.ok && typeof hits[0]?.id === "string") candidateId = hits[0].id;
  } catch { /* fall through */ }
  if (!candidateId) {
    const cRes = await ashby(apiKey, "candidate.create", candidatePayload);
    if (!cRes.ok || !cRes.data?.results?.id) throw new Error("ashby-candidate-create");
    candidateId = cRes.data.results.id;
  }

  const socialLinks = [{ type: "Website", url: reviewUrl }];
  if (truthy(body.portfolio)) socialLinks.push({ type: "Website", url: body.portfolio.trim().slice(0, 400) });
  await ashby(apiKey, "candidate.update", { candidateId, socialLinks }).catch(() => {});

  // Tags
  const tagTitles = ["vora.biz"];
  if (tier) tagTitles.push(`tier-${tier}`);
  if (country) tagTitles.push(`country-${country}`);
  if (salaryShown) tagTitles.push(`offer-${salaryShown}`);
  const sourceTag = source.replace(/[^a-z0-9._-]/g, "-").slice(0, 80);
  if (sourceTag) tagTitles.push(`src-${sourceTag}`);
  if (referralPayload) {
    const slug = referralPayload.email.replace(/[^a-z0-9._-]/g, "-").slice(0, 80);
    tagTitles.push("referred-link", `referred-by-${slug}`);
  }
  for (const title of tagTitles) {
    try { const tagId = await ensureTag(apiKey, title); if (tagId) await ashby(apiKey, "candidate.addTag", { candidateId, tagId }); } catch { /* ignore */ }
  }

  // Application (dedupe on reuse)
  const ashbyJobId = resolvedJob?.ashbyJobId || resolvedJob?.ashbyJobPostingId
    || (process.env.ASHBY_FALLBACK_JOB_ID || "").trim();
  let applicationId = null;
  if (ashbyJobId) {
    const aRes = await ashby(apiKey, "application.create", { jobId: ashbyJobId, candidateId });
    if (aRes.ok && aRes.data?.results?.id) applicationId = aRes.data.results.id;
  }

  // Note (offer context + answers)
  const noteLines = [];
  if (referralPayload) {
    noteLines.push("🎁 REFERRED via Vora referral link", `Referrer: ${referralPayload.name} <${referralPayload.email}>`, "Pay $100 bounty after 30 days.", "");
  }
  noteLines.push(`Tier shown: ${tier || "—"}${country ? ` · ${country}` : ""}`);
  if (salaryShown) noteLines.push(`Offer shown: ${salaryShown}`);
  if (Array.isArray(body.attachments) && body.attachments.length) {
    noteLines.push("", "Files (in portal R2):");
    for (const a of body.attachments) { if (a?.url) noteLines.push(`• ${a.name || "file"}: ${a.url}`); }
  }
  if (truthy(body.notes)) noteLines.push("", "Answers", body.notes);
  if (noteLines.length) await ashby(apiKey, "candidate.createNote", { candidateId, note: noteLines.join("\n").slice(0, 8000) }).catch(() => {});

  return { candidateId, applicationId };
}

// Cold-start cached map of { tagTitle: tagId }.
let tagMap = null;
async function ensureTag(apiKey, title) {
  const norm = String(title || "").trim();
  if (!norm) return null;
  if (!tagMap) {
    tagMap = new Map();
    try {
      const r = await ashby(apiKey, "candidateTag.list", {});
      for (const t of (r.data?.results || [])) if (!t.isArchived) tagMap.set(String(t.title), t.id);
    } catch { /* ignore */ }
  }
  if (tagMap.has(norm)) return tagMap.get(norm);
  const c = await ashby(apiKey, "candidateTag.create", { title: norm });
  if (c.ok && c.data?.results?.id) { tagMap.set(norm, c.data.results.id); return c.data.results.id; }
  tagMap = null;
  return null;
}
