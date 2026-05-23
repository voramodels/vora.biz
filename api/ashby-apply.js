/* Vercel Serverless Function — POST /api/ashby-apply
 *
 * Funnels every application from vora.biz directly into Ashby.
 *
 * Architecture: candidate.create + application.create. We deliberately
 * do NOT use applicationForm.submit because that endpoint requires a
 * pre-existing public Job Posting in Ashby — and Ashby's API has no
 * jobPosting.create method, so postings would have to be created in
 * the Ashby UI. application.create routes by jobId (the requisition
 * UUID), which the portal already manages, so we skip the manual UI
 * step entirely.
 *
 * Tier metadata — what offer the candidate saw — attaches via Ashby
 * candidate tags: `vora.biz`, `tier-N`, `country-XX`, plus the literal
 * salary string. Tags are the reliable carrier — Ashby's
 * customField.setValue API silently no-ops or 500s on Application-typed
 * fields, so we don't depend on it. Tags are searchable in Ashby's
 * candidate search and filterable in pipeline views.
 *
 * Tag flow (Ashby's API):
 *   1. candidateTag.create({title}) creates a global tag definition
 *      and returns a tagId.
 *   2. candidate.addTag({candidateId, tagId}) attaches it.
 * We list-then-cache global tags on cold start so we only create new
 * tags when a tag title we've never used before appears (e.g., a
 * country we haven't seen).
 *
 * ── Required Vercel env vars ───────────────────────────────────────
 * ASHBY_API_KEY
 *   API key with jobs:write, candidates:write, applications:write,
 *   hiringProcessMetadata:write scopes (the last is needed for
 *   candidateTag.create).
 *
 * ── Optional Vercel env vars ───────────────────────────────────────
 * ASHBY_SOURCE_TIER_1 / ASHBY_SOURCE_TIER_2 / ASHBY_SOURCE_TIER_3
 *   Source UUIDs from Ashby (Settings → Sources) for each tier. If
 *   set, the candidate's source is set to the matching tier source
 *   for pipeline-source segmentation. Optional — tier already shows
 *   up via tags.
 *
 * VORA_PORTAL_JOBS_URL
 *   Where to fetch the published portal jobs from. Defaults to
 *   https://teamvora.net/api/vora/jobs. Override for staging.
 *
 * ── File uploads ───────────────────────────────────────────────────
 * Files are NOT streamed through this endpoint — Vercel function
 * payload caps would lose 30–60s videos. Candidates upload to a
 * Dropbox file-request URL the public site links them to after
 * this submission succeeds.
 */

const truthy = (s) => typeof s === "string" && s.trim().length > 0;

const PORTAL_JOBS_URL = process.env.VORA_PORTAL_JOBS_URL
  || "https://teamvora.net/api/vora/jobs";

let jobsCache = null;
let jobsCacheAt = 0;
const JOBS_CACHE_TTL_MS = 5 * 60 * 1000;

async function loadJobs() {
  const now = Date.now();
  if (jobsCache && (now - jobsCacheAt) < JOBS_CACHE_TTL_MS) return jobsCache;
  // includeHidden so we can resolve the ashbyJobId for hidden roles
  // (NSFW Artist + any private listings) — the portal /api/vora/jobs
  // endpoint defaults to filtering them out for the public board.
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
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method-not-allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  for (const k of ["name", "email"]) {
    if (!truthy(body[k])) return res.status(400).json({ error: `missing-${k}` });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
    return res.status(400).json({ error: "invalid-email" });
  }

  const apiKey = process.env.ASHBY_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "ashby-not-configured",
      hint: "Set ASHBY_API_KEY in Vercel project env vars.",
    });
  }

  // Resolve the Ashby job id. Prefer body override, else look up from
  // portal by internal jobId, else accept legacy ashbyJobPostingId
  // for backwards compatibility (treated as a job id).
  //
  // We ALWAYS attempt the portal lookup when a jobId is provided —
  // even if ashbyJobId is already set — because we need resolvedJob
  // to populate the candidate record's `jobTitle` (otherwise the ATS
  // can't pair the application to its job-specific pipeline; the
  // candidate ends up only in the "all" view).
  let ashbyJobId = (body.ashbyJobId || body.ashbyJobPostingId || "").trim();
  let resolvedJob = null;
  if (body.jobId != null) {
    try {
      const jobs = await loadJobs();
      resolvedJob = jobs.find((j) => Number(j.id) === Number(body.jobId)) || null;
      if (!ashbyJobId) {
        ashbyJobId = resolvedJob?.ashbyJobId || resolvedJob?.ashbyJobPostingId || "";
      }
    } catch (err) {
      console.warn("ashby-apply: portal lookup failed", String(err).slice(0, 120));
    }
  }
  if (!ashbyJobId) {
    ashbyJobId = (process.env.ASHBY_FALLBACK_JOB_ID || process.env.ASHBY_FALLBACK_JOB_POSTING_ID || "").trim();
  }
  if (!ashbyJobId) {
    return res.status(400).json({
      error: "no-ashby-mapping",
      hint:
        "This role isn't wired to an Ashby job yet. Set ashbyJobId on the role in the portal editor (vora.biz/edit), or set ASHBY_FALLBACK_JOB_ID as a backstop.",
      jobId: body.jobId ?? null,
    });
  }

  const tier = tierLabel(body.tier);
  const country = truthy(body.country) ? body.country.trim().slice(0, 8).toUpperCase() : "";
  const salaryShown = truthy(body.salaryShown) ? body.salaryShown.trim().slice(0, 80) : "";

  // ── Step 1: create candidate.
  const candidatePayload = {
    name: body.name.trim().slice(0, 200),
    email: body.email.trim().slice(0, 200),
  };
  if (truthy(body.phone)) candidatePayload.phoneNumbers = [{ value: body.phone.trim().slice(0, 80), type: "Mobile" }];

  const cRes = await ashby(apiKey, "candidate.create", candidatePayload);
  if (!cRes.ok || !cRes.data?.results?.id) {
    return res.status(502).json({
      error: "ashby-candidate-create-failed",
      detail: cRes.data?.errors || cRes.data || `HTTP ${cRes.status}`,
    });
  }
  const candidateId = cRes.data.results.id;

  // ── Step 1b: candidate social links — portfolio + the dedicated
  // review page on the portal where reviewers can play videos
  // inline (Ashby's UI forces video-as-download, no inline player).
  // The review URL is the actionable one — reviewers click it from
  // the candidate profile and land on a page with all media embedded.
  const portalBase = (process.env.VORA_PORTAL_BASE || "https://teamvora.net").replace(/\/$/, "");
  const reviewUrl = `${portalBase}/api/vora/review/${candidateId}`;
  const candidateSocialLinks = [{ type: "Website", url: reviewUrl }];
  if (truthy(body.portfolio)) {
    candidateSocialLinks.push({ type: "Website", url: body.portfolio.trim().slice(0, 400) });
  }
  const lRes = await ashby(apiKey, "candidate.update", {
    candidateId,
    socialLinks: candidateSocialLinks,
  });
  if (!lRes.ok) {
    console.warn("ashby-apply: socialLinks set failed", JSON.stringify(lRes.data).slice(0, 200));
  }

  // ── Step 1c: upload each candidate file to Ashby's Files tab.
  // We pull each file from the R2 URL the browser already wrote
  // to and pipe it through Ashby's multipart upload endpoint, so
  // reviewers see proper file attachments (with inline preview
  // for images / PDFs, popup-player for video) instead of plain
  // URLs in a note. Best-effort per file — if one fails we keep
  // going so the rest still land.
  const uploadedFiles = [];
  const failedUploads = [];
  if (Array.isArray(body.attachments)) {
    for (let i = 0; i < body.attachments.length; i += 1) {
      const a = body.attachments[i];
      if (!a || typeof a.url !== "string" || !/^https?:\/\//i.test(a.url)) continue;
      try {
        const fetched = await fetch(a.url);
        if (!fetched.ok) throw new Error(`fetch-${fetched.status}`);
        const buf = await fetched.arrayBuffer();
        const blob = new Blob([buf], { type: fetched.headers.get("content-type") || "application/octet-stream" });

        // Use uploadResume for the very first file if it's a paper
        // / pdf / doc — that's the closest mapping to Ashby's
        // "Resume" concept and surfaces it prominently on the
        // candidate header. Everything else goes to uploadFile.
        const isPaperish = /\.(pdf|doc|docx|txt|md|rtf)$/i.test(a.name || "")
          || (a.kind === "paper" && uploadedFiles.length === 0);

        const form = new FormData();
        form.append("candidateId", candidateId);
        form.append(isPaperish ? "resume" : "file", blob, a.name || `file-${i + 1}`);

        const uploadEndpoint = isPaperish
          ? "https://api.ashbyhq.com/candidate.uploadResume"
          : "https://api.ashbyhq.com/candidate.uploadFile";
        const r = await fetch(uploadEndpoint, {
          method: "POST",
          headers: { Authorization: `Basic ${Buffer.from(apiKey + ":").toString("base64")}` },
          body: form,
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok || data?.success === false) {
          throw new Error(data?.errors?.[0] || `ashby-upload-${r.status}`);
        }
        uploadedFiles.push({ label: a.label, name: a.name, asResume: isPaperish });
      } catch (err) {
        failedUploads.push({ name: a.name || `attachment-${i + 1}`, error: String(err?.message || err) });
        console.warn(`ashby-apply: file upload failed for ${a.name}`, String(err).slice(0, 200));
      }
    }
  }

  // ── Step 2: tag the candidate. We use Ashby's two-step flow:
  // ensureTag(title) returns a tagId (looking up an existing global
  // tag if it exists, creating a new one otherwise), then
  // candidate.addTag attaches it. Cold-start tag-cache prefetches the
  // existing tag list once so subsequent submissions only hit
  // candidate.addTag.
  const tagTitles = ["vora.biz"];
  if (tier) tagTitles.push(`tier-${tier}`);
  if (country) tagTitles.push(`country-${country}`);
  if (salaryShown) tagTitles.push(`offer-${salaryShown}`);
  // Campaign attribution mirrors into Ashby as a tag so the Ashby
  // workspace can filter / pipeline by campaign too — duplicate of
  // the `source` field we forward to the portal record, but visible
  // wherever the Ashby team works.
  const sourceTag = String(body.source || "").toLowerCase().trim().replace(/[^a-z0-9._-]/g, "-").slice(0, 80);
  if (sourceTag) tagTitles.push(`src-${sourceTag}`);

  // Referral decode — vora.biz visitors arriving via a "Know someone
  // creative?" link carry `?ref=<base64url>` where the payload is
  // `{ n: referrerName, e: referrerEmail, t: createdAt }`. Pull the
  // raw token from `referralToken`, decode it, and stamp the candidate
  // with both a high-visibility "referred-by-…" tag AND a structured
  // line that gets prepended to the candidate note so reviewers see
  // who's owed the $100 bounty without leaving the candidate profile.
  let referralPayload = null;
  let referralSummary = "";
  const rawRefToken = String(body.referralToken || "").trim().slice(0, 600);
  if (rawRefToken) {
    try {
      // base64url → base64 → utf-8 JSON
      const b64 = rawRefToken.replace(/-/g, "+").replace(/_/g, "/");
      const pad = b64.length % 4 ? b64 + "=".repeat(4 - (b64.length % 4)) : b64;
      const decoded = Buffer.from(pad, "base64").toString("utf-8");
      const parsed = JSON.parse(decoded);
      const name = String(parsed?.n || "").trim().slice(0, 80);
      const email = String(parsed?.e || "").trim().toLowerCase().slice(0, 120);
      const ts = Number(parsed?.t) || null;
      if (name && /.+@.+\..+/.test(email)) {
        referralPayload = { name, email, createdAt: ts };
        referralSummary = `${name} <${email}>`;
        // Ashby tag — safe-slug normalized so duplicates collapse.
        // Surfaces in candidate search, pipeline view, and segment filters.
        const safeReferrerSlug = email.replace(/[^a-z0-9._-]/g, "-").slice(0, 80);
        tagTitles.push("referred-link");
        tagTitles.push(`referred-by-${safeReferrerSlug}`);
      }
    } catch (err) {
      console.warn("ashby-apply: referral token decode failed", String(err).slice(0, 160));
    }
  }

  for (const title of tagTitles) {
    try {
      const tagId = await ensureTag(apiKey, title);
      if (tagId) await ashby(apiKey, "candidate.addTag", { candidateId, tagId });
    } catch (err) {
      console.warn(`ashby-apply: tag "${title}" failed`, String(err).slice(0, 160));
    }
  }

  // ── Step 3: optional source (per-tier env var)
  const tierSourceVar = tier ? process.env[`ASHBY_SOURCE_TIER_${tier}`] : "";
  if (tierSourceVar && tierSourceVar.trim()) {
    const sRes = await ashby(apiKey, "candidate.update", {
      candidateId,
      sourceId: tierSourceVar.trim(),
    });
    if (!sRes.ok) {
      console.warn("ashby-apply: source set failed", JSON.stringify(sRes.data).slice(0, 200));
    }
  }

  // ── Step 4: create the application linking candidate → job
  const aRes = await ashby(apiKey, "application.create", {
    jobId: ashbyJobId,
    candidateId,
  });
  if (!aRes.ok || !aRes.data?.results?.id) {
    return res.status(502).json({
      error: "ashby-application-create-failed",
      detail: aRes.data?.errors || aRes.data || `HTTP ${aRes.status}`,
      candidateId,
    });
  }
  const applicationId = aRes.data.results.id;

  // ── Step 5: structured note on the candidate. The actual files
  // sit on the Files tab now (uploaded via Step 1c) — this note
  // captures the offer context + maps each Files-tab attachment
  // back to the apply-form question it answered, so reviewers see
  // "this video file is the 30-60 second selfie" rather than
  // having to guess from the filename.
  const noteLines = [];
  // Referral block goes first — high-visibility so a reviewer can
  // pay the $100 without hunting through other notes. Empty when the
  // candidate didn't arrive via a referral link.
  if (referralPayload) {
    noteLines.push("🎁 REFERRED via Vora referral link");
    noteLines.push(`Referrer: ${referralPayload.name} <${referralPayload.email}>`);
    if (referralPayload.createdAt) {
      const refDate = new Date(referralPayload.createdAt);
      if (!Number.isNaN(refDate.getTime())) {
        noteLines.push(`Link issued: ${refDate.toISOString()}`);
      }
    }
    noteLines.push("Pay $100 bounty to referrer after 30 days of employment.");
    noteLines.push("");
  }
  noteLines.push(`Tier shown: ${tier || "—"}${country ? ` · ${country}` : ""}`);
  if (salaryShown) noteLines.push(`Offer shown: ${salaryShown}`);
  if (Array.isArray(body.attachments) && body.attachments.length) {
    noteLines.push("");
    noteLines.push("Files (see Files tab)");
    for (const a of body.attachments) {
      if (!a) continue;
      const sz = a.size ? ` (${(a.size / (1024 * 1024)).toFixed(1)} MB)` : "";
      noteLines.push(`• ${a.label || "File"}: ${a.name || "file"}${sz}`);
    }
    if (failedUploads.length) {
      noteLines.push("");
      noteLines.push("Files that failed to attach to Ashby (still in our R2 backup):");
      for (const f of failedUploads) {
        noteLines.push(`• ${f.name} — ${f.error}`);
      }
      // Keep the URL references as a fallback only when the proper
      // upload didn't work, so reviewers can still get to the file.
      for (const a of body.attachments) {
        const failed = failedUploads.find((f) => f.name === a.name);
        if (failed && a.url) noteLines.push(`  ${a.url}`);
      }
    }
  }
  if (truthy(body.notes)) {
    noteLines.push("");
    noteLines.push("Answers");
    noteLines.push(body.notes);
  }
  if (noteLines.length) {
    const noteRes = await ashby(apiKey, "candidate.createNote", {
      candidateId,
      note: noteLines.join("\n").slice(0, 8000),
    });
    if (!noteRes.ok) {
      console.warn("ashby-apply: note create failed", JSON.stringify(noteRes.data).slice(0, 200));
    }
  }

  // ── Step 6: durably store the review record on the portal so the
  // /api/vora/review/<candidateId> page can render with inline
  // video players. Best-effort — if the portal write fails the
  // submission is still saved in Ashby. APPLY_RECORD_SECRET gates
  // the portal endpoint; vora.biz visitors can't write directly.
  try {
    const recordSecret = (process.env.APPLY_RECORD_SECRET || "").trim();
    if (recordSecret) {
      const answers = [];
      if (truthy(body.notes)) {
        for (const line of String(body.notes).split("\n")) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const colon = trimmed.indexOf(":");
          if (colon > 0) {
            answers.push({ label: trimmed.slice(0, colon).trim(), value: trimmed.slice(colon + 1).trim() });
          }
        }
      }
      await fetch(`${portalBase}/api/vora/application-record`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-apply-secret": recordSecret,
        },
        body: JSON.stringify({
          candidateId,
          name: body.name,
          email: body.email,
          phone: body.phone || "",
          jobTitle: resolvedJob?.title || "",
          jobId: ashbyJobId,
          tier: tier || null,
          country,
          salaryShown,
          portfolio: body.portfolio,
          attachments: body.attachments || [],
          answers,
          // Campaign attribution — vora.biz reads ?src= or utm_* on
          // first load, persists in sessionStorage, and attaches the
          // campaign id on submit. Empty for organic visitors.
          source: String(body.source || "").toLowerCase().trim().slice(0, 80),
          // Forward the decoded referral payload so the portal review
          // page + Talent Hub ATS list both show "referred by <name>
          // <email>" instead of an opaque base64 src tag. `null` when
          // the candidate didn't arrive via a referral link.
          referredBy: referralPayload || null,
          submittedAt: new Date().toISOString(),
        }),
      });
    }
  } catch (err) {
    console.warn("ashby-apply: portal record write failed", String(err).slice(0, 200));
  }

  return res.status(200).json({
    ok: true,
    candidateId,
    applicationId,
    jobId: ashbyJobId,
    tier: tier || null,
    attachments: Array.isArray(body.attachments) ? body.attachments.length : 0,
    reviewUrl,
    // Reflect referral attribution so the client (and smoke tests)
    // can verify the token decoded cleanly server-side.
    referredBy: referralPayload || null,
  });
}

// Cold-start cached map of { tagTitle: tagId }. Populated lazily on
// first ensureTag() call. Subsequent calls hit the map first; only
// new tag titles incur a candidateTag.create round-trip.
let tagMap = null;

async function ensureTag(apiKey, title) {
  const norm = String(title || "").trim();
  if (!norm) return null;
  if (!tagMap) {
    tagMap = new Map();
    try {
      const r = await fetch("https://api.ashbyhq.com/candidateTag.list", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(apiKey + ":").toString("base64")}`,
        },
        body: JSON.stringify({}),
      });
      const data = await r.json();
      if (data?.results) {
        for (const t of data.results) {
          if (!t.isArchived) tagMap.set(String(t.title), t.id);
        }
      }
    } catch (err) {
      console.warn("ashby-apply: tag list failed", String(err).slice(0, 160));
    }
  }
  if (tagMap.has(norm)) return tagMap.get(norm);
  // Create the tag once. Concurrency window: two near-simultaneous
  // submissions could both create the same tag — Ashby will return
  // an error on the duplicate; we recover by re-listing.
  const c = await fetch("https://api.ashbyhq.com/candidateTag.create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(apiKey + ":").toString("base64")}`,
    },
    body: JSON.stringify({ title: norm }),
  });
  const cdata = await c.json();
  if (cdata?.success && cdata?.results?.id) {
    tagMap.set(norm, cdata.results.id);
    return cdata.results.id;
  }
  // Refresh and retry — duplicate races land here.
  tagMap = null;
  return null;
}
