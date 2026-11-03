import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";

/* ═════════════════════════════════════════════════════════════════
   VORA — CAREERS
   Editorial vertical hiring page. Replaced the pannable canvas
   with a quiet, scrollable masthead → roles → about → footer flow.
   Brand colors used as accents. Sparse motion. Mobile-first.
   ═════════════════════════════════════════════════════════════════ */

const BRAND = {
  blue:    { hex: "#0677D0", rgb: "6,119,208" },
  gold:    { hex: "#EBB306", rgb: "235,179,6" },
  magenta: { hex: "#E204CC", rgb: "226,4,204" },
  ember:   { hex: "#CE3C11", rgb: "206,60,17" },
  vora:    { hex: "#FFFFFF", rgb: "255,255,255" },
};

const LOGO_SRC = "/vora-logo.png";

/* CMS endpoint root. The Vora Internal Portal exposes /api/vora/* read
   endpoints (CORS-open, 60s SWR). When unreachable, the public site
   gracefully falls back to the inline seed data below so the page
   never goes dark. Override at build time via VITE_VORA_API. */
/* Job-board funnel hosts. On these the app is the unbranded /apply funnel
   only (vercel.json serves apply.html there): the board, slug pages and
   legal pages never render, and stray paths get a neutral "link isn't
   valid" page. */
const FUNNEL_HOSTS = ["apply-vora.com", "www.apply-vora.com"];
function isFunnelHost() {
  try {
    if (typeof window === "undefined") return false;
    if (FUNNEL_HOSTS.includes(String(window.location.hostname || "").toLowerCase())) return true;
    // A hiring company's own apply domain (the portal's hiring-sites
    // Worker) serves this same funnel and marks its pages.
    return Boolean(document.querySelector('meta[name="vora-funnel-host"]'));
  } catch {
    return false;
  }
}
/* On a funnel host, portal calls (uploads, geo, Stage 2) go through this
   origin's /p proxy (vercel.json → the portal) so an applicant's devtools
   never show a Vora host. Verified live 2026-09-20: a real 5 MiB multipart
   part went through the rewrite in 1.7 s with an etag. */
const FUNNEL_API_PROXY = true;
const VORA_API = (isFunnelHost() && FUNNEL_API_PROXY)
  ? `${window.location.origin}/p`
  : ((typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_VORA_API) ||
    "https://vora-internal-portal.pages.dev");

/* Default tagline copy — used when the CMS doesn't return overrides. */
const DEFAULT_TAGLINE_BEFORE = "Making money should be fun. We go viral with AI. ";
const DEFAULT_TAGLINE_GREEN = "Hiring";
const DEFAULT_TAGLINE_AFTER = " globally.";

/* ─── Geo-priced tier model ───
   Countries grouped into 3 tiers by average income / typical creative
   wage. Anything not in TIER_1 or TIER_3 falls to TIER_2 (the default
   middle band). Each role carries a `salaries` map keyed by tier.
   Detection is silent — the tagline stays static "Hiring globally."
   so the geo-tailoring isn't surfaced and applicants can't game it
   by VPN-shopping for a higher-tier rate.

   Some traffic will still resolve to the wrong tier (VPN, satellite,
   corporate egress in another country). We accept that — the
   application form captures declared country at submit so any
   mispriced offer gets reviewed before being made formal. What we do
   NOT accept is failing DOWNWARD: see UNKNOWN_TIER below. */
const TIER_1 = new Set([
  // North America + UK
  "US", "CA", "GB",
  // Western Europe
  "DE", "FR", "NL", "BE", "AT", "IE", "LU", "CH",
  // Nordics
  "SE", "NO", "DK", "FI", "IS",
  // South-Pacific advanced
  "AU", "NZ",
  // Asia advanced
  "JP", "KR", "SG", "HK",
  // Gulf
  "AE", "QA", "KW", "SA", "BH", "IL",
]);
const TIER_3 = new Set([
  // Southeast Asia
  "PH", "VN", "ID", "MM", "KH", "LA", "NP",
  // South Asia
  "IN", "PK", "BD", "LK",
  // North + East Africa
  "EG", "MA", "DZ", "TN", "ET", "KE", "UG", "TZ", "RW",
  // West + Sub-Saharan Africa
  "NG", "GH", "SN", "CI", "ZW", "ZM", "MW", "MZ",
  // Other lower-income
  "BO", "HN", "NI", "GT", "SV", "VE", "MN",
]);
/* Unknown country → TOP tier, deliberately.

   This used to default to 2, which meant any visitor whose geo lookup
   failed was silently shown the MIDDLE salary band. In practice that
   punished exactly the people it shouldn't: a US/UK/EU candidate on
   mobile data — where the lookup is most likely to be blocked — saw a
   lower number than the role actually pays, and we lose them without
   ever knowing. Failing upward costs at most one correction, and the
   apply form captures the candidate's declared country, which is
   reviewed before any offer is formalised. */
const UNKNOWN_TIER = 1;

const tierForCountry = (code) => {
  if (!code) return UNKNOWN_TIER;
  const c = String(code).toUpperCase();
  if (TIER_1.has(c)) return 1;
  if (TIER_3.has(c)) return 3;
  return 2;
};

/* IANA timezone → country, for the zones where the answer changes the
   tier. This is the offline backstop: it needs no network, can't be
   blocked or rate-limited, and it's what makes the FIRST paint show
   the right number instead of a wrong one that corrects itself half a
   second later (or never, if the network lookups are blocked). */
const TZ_COUNTRY = Object.fromEntries(
  Object.entries({
    US: ["America/New_York", "America/Detroit", "America/Chicago", "America/Denver",
      "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "America/Boise",
      "America/Indiana/Indianapolis", "America/Kentucky/Louisville", "Pacific/Honolulu"],
    CA: ["America/Toronto", "America/Vancouver", "America/Edmonton", "America/Winnipeg",
      "America/Halifax", "America/St_Johns", "America/Regina", "America/Montreal"],
    GB: ["Europe/London"], IE: ["Europe/Dublin"], DE: ["Europe/Berlin"],
    FR: ["Europe/Paris"], NL: ["Europe/Amsterdam"], BE: ["Europe/Brussels"],
    AT: ["Europe/Vienna"], CH: ["Europe/Zurich"], LU: ["Europe/Luxembourg"],
    SE: ["Europe/Stockholm"], NO: ["Europe/Oslo"], DK: ["Europe/Copenhagen"],
    FI: ["Europe/Helsinki"], IS: ["Atlantic/Reykjavik"],
    AU: ["Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane", "Australia/Perth",
      "Australia/Adelaide", "Australia/Hobart", "Australia/Darwin"],
    NZ: ["Pacific/Auckland"], JP: ["Asia/Tokyo"], KR: ["Asia/Seoul"],
    SG: ["Asia/Singapore"], HK: ["Asia/Hong_Kong"], AE: ["Asia/Dubai"],
    QA: ["Asia/Qatar"], KW: ["Asia/Kuwait"], SA: ["Asia/Riyadh"], BH: ["Asia/Bahrain"],
    IL: ["Asia/Jerusalem", "Asia/Tel_Aviv"],
    PH: ["Asia/Manila"], VN: ["Asia/Ho_Chi_Minh", "Asia/Saigon"],
    ID: ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"],
    MM: ["Asia/Yangon", "Asia/Rangoon"], KH: ["Asia/Phnom_Penh"], LA: ["Asia/Vientiane"],
    NP: ["Asia/Kathmandu", "Asia/Katmandu"], IN: ["Asia/Kolkata", "Asia/Calcutta"],
    PK: ["Asia/Karachi"], BD: ["Asia/Dhaka"], LK: ["Asia/Colombo"], MN: ["Asia/Ulaanbaatar"],
    EG: ["Africa/Cairo"], MA: ["Africa/Casablanca"], DZ: ["Africa/Algiers"],
    TN: ["Africa/Tunis"], ET: ["Africa/Addis_Ababa"], KE: ["Africa/Nairobi"],
    UG: ["Africa/Kampala"], TZ: ["Africa/Dar_es_Salaam"], RW: ["Africa/Kigali"],
    NG: ["Africa/Lagos"], GH: ["Africa/Accra"], SN: ["Africa/Dakar"], CI: ["Africa/Abidjan"],
    ZW: ["Africa/Harare"], ZM: ["Africa/Lusaka"], MW: ["Africa/Blantyre"], MZ: ["Africa/Maputo"],
    BO: ["America/La_Paz"], HN: ["America/Tegucigalpa"], NI: ["America/Managua"],
    GT: ["America/Guatemala"], SV: ["America/El_Salvador"], VE: ["America/Caracas"],
  }).flatMap(([cc, zones]) => zones.map((zone) => [zone, cc])),
);

/* Country from device signals only — no network. Timezone first: it
   reflects where the device physically is. Locale region second and
   only as a tiebreak, because plenty of people abroad run a US-English
   device, and trusting that alone would over-assign the top tier. */
function countryFromDevice() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && TZ_COUNTRY[tz]) return TZ_COUNTRY[tz];
  } catch { /* Intl unavailable — fall through */ }
  try {
    const tags = [navigator.language, ...(navigator.languages || [])].filter(Boolean);
    for (const tag of tags) {
      const region = String(tag).split("-")[1];
      if (region && /^[A-Za-z]{2}$/.test(region)) return region.toUpperCase();
    }
  } catch { /* no navigator — fall through */ }
  return null;
}

/* ── Visitor country resolution ──────────────────────────────────────
   Ordered authoritative-first:

     0. ?country=XX     manual override (testing + support)
     1. /api/geo        same-origin, Vercel edge header. Can't be
                        blocked as a third party, never rate-limited.
     2. /api/vora/geo   portal, Cloudflare edge header. Second
                        authoritative opinion if the Vercel fn errors.
     3. device signals  timezone / locale — seeds the first paint
     4. ipapi.co        the previous SOLE source. Free tier is
                        rate-limited and the domain is on common
                        mobile/content blocklists, so it fails exactly
                        where we can least afford it. Last resort now.

   Resolution runs ONCE per page load and is shared by every consumer.
   Previously each useGeo() caller fired its own ipapi.co request, so a
   single pageview spent several of a small daily quota — the fix and
   the failure were compounding each other. */
const GEO_CACHE_KEY = "vora-geo";
const GEO_SOURCES = [
  { name: "origin", url: "/api/geo", pick: (d) => d?.country },
  { name: "portal", url: `${VORA_API}/api/vora/geo`, pick: (d) => d?.country },
  { name: "ipapi", url: "https://ipapi.co/json/", pick: (d) => d?.country_code },
];
const GEO_AUTHORITATIVE = new Set(["override", "origin", "portal", "ipapi"]);

function readCachedGeo() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(GEO_CACHE_KEY) || "null");
    // Only ever trust a cached country we actually resolved. The old
    // code wrote {code:null} on failure, which pinned the rest of the
    // session to the fallback tier after a single blocked request.
    if (parsed && typeof parsed.code === "string" && /^[A-Z]{2}$/.test(parsed.code)) {
      return { code: parsed.code, source: parsed.source || "origin" };
    }
  } catch { /* unreadable cache — ignore */ }
  return null;
}

function initialGeo() {
  if (typeof window === "undefined") return { code: null, source: "pending" };
  try {
    const q = new URLSearchParams(window.location.search).get("country");
    if (q && /^[A-Za-z]{2}$/.test(q)) return { code: q.toUpperCase(), source: "override" };
  } catch { /* no search params — ignore */ }
  const cached = readCachedGeo();
  if (cached) return cached;
  const guess = countryFromDevice();
  return guess ? { code: guess, source: "device" } : { code: null, source: "pending" };
}

// ISO-2 → international dialling code, for the applicant's own country. Used
// only to PREFILL the placeholder on phone fields so the expected shape is
// obvious ("+63 …" to someone in the Philippines). Mirrors the country table
// in the portal's functions/api/talent/_phone.js — duplicated deliberately,
// as this bundle is a separate deploy with no shared import path.
const DIAL_BY_ISO = {
  AE: '+971', AR: '+54', AT: '+43', AU: '+61', BD: '+880', BE: '+32', BR: '+55',
  CA: '+1', CH: '+41', CL: '+56', CO: '+57', CZ: '+420', DE: '+49', DK: '+45',
  EG: '+20', ES: '+34', FI: '+358', FR: '+33', GB: '+44', GH: '+233', GR: '+30',
  HU: '+36', ID: '+62', IE: '+353', IL: '+972', IN: '+91', IT: '+39', JP: '+81',
  KE: '+254', KR: '+82', LK: '+94', MA: '+212', MX: '+52', MY: '+60', NG: '+234',
  NL: '+31', NO: '+47', NZ: '+64', PE: '+51', PH: '+63', PK: '+92', PL: '+48',
  PT: '+351', RO: '+40', RS: '+381', RU: '+7', SA: '+966', SE: '+46', SG: '+65',
  TH: '+66', TR: '+90', UA: '+380', US: '+1', VE: '+58', VN: '+84', ZA: '+27',
};
function dialForGeo(geo) {
  const iso = String(geo?.code || '').toUpperCase();
  return DIAL_BY_ISO[iso] || '';
}

let geoState = initialGeo();
let geoPromise = null;
const geoSubscribers = new Set();

async function fetchCountry({ url, pick }) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 4000) : null;
  try {
    const r = await fetch(url, controller ? { signal: controller.signal } : undefined);
    if (!r.ok) return null;
    const code = String(pick(await r.json()) || "").toUpperCase();
    return /^[A-Z]{2}$/.test(code) ? code : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function resolveGeoOnce() {
  if (geoPromise) return geoPromise;
  geoPromise = (async () => {
    if (GEO_AUTHORITATIVE.has(geoState.source)) return geoState;
    for (const source of GEO_SOURCES) {
      const code = await fetchCountry(source);
      if (!code) continue;
      geoState = { code, source: source.name };
      try { sessionStorage.setItem(GEO_CACHE_KEY, JSON.stringify(geoState)); } catch { /* ignore */ }
      for (const notify of geoSubscribers) { try { notify(geoState); } catch { /* ignore */ } }
      return geoState;
    }
    // Every network source failed. Keep whatever the device inferred;
    // if even that is unknown, UNKNOWN_TIER shows the top offer rather
    // than the bottom one.
    return geoState;
  })();
  return geoPromise;
}

/* useGeo — returns { code, source }. Shares one resolution across every
   caller; re-renders when an authoritative answer lands. */
function useGeo() {
  const [geo, setGeo] = useState(geoState);
  useEffect(() => {
    geoSubscribers.add(setGeo);
    setGeo(geoState); // catch up if resolution finished before mount
    resolveGeoOnce();
    return () => { geoSubscribers.delete(setGeo); };
  }, []);
  return geo;
}

// Dev-only hook so the geo→tier chain is testable without driving the
// planet UI. Dead-code-eliminated from production builds.
if (import.meta.env.DEV && typeof window !== "undefined") {
  window.__voraGeoTest = {
    tierForCountry,
    countryFromDevice,
    fetchCountry,
    resolveGeoOnce,
    state: () => geoState,
    sources: () => GEO_SOURCES.map((s) => ({ name: s.name, url: s.url })),
  };
}

/* Language picker for the bilingual makeup artist application — the
   primary audience is Latin America, so we default to Spanish for any
   country code in LATAM_CODES OR when the browser's language starts
   with `es`. Otherwise English. Choice is persisted in localStorage
   so a manual toggle sticks across visits.

   We deliberately scope this only to the makeup artist apply form for
   now — the rest of the site stays English-only until there's an
   actual translation pass. The toggle lives inline in the form so it's
   findable without ever leaving the page. */
const LATAM_CODES = new Set([
  "AR", "BO", "BR", "CL", "CO", "CR", "CU", "DO", "EC", "SV", "GT",
  "HN", "MX", "NI", "PA", "PY", "PE", "PR", "UY", "VE",
]);
const LANG_STORAGE_KEY = "vora-lang";

// Language detection runs in priority order:
//   1. Manual choice persisted to localStorage — always wins. A user
//      who explicitly clicked EN/ES never gets overridden.
//   2. IP-geo country code — LATAM countries → ES, anything else → EN.
//      Comes from the async useGeo() fetch. Until it resolves, we use
//      step 3 instead, which is why the fallback matters.
//   3. Browser navigator.language — `es-*` OR `pt-*` → ES. Portuguese
//      speakers from Brazil get the closest available language; that's
//      better than serving them English by default since Spanish and
//      Portuguese are mutually intelligible enough that the page is
//      readable, and we don't have a PT translation.
//   4. Default — ES. The Meta-ad funnel is targeted at LATAM, so the
//      cold-start guess that gets it right most of the time is
//      Spanish. Visitors from the US / UK / non-LATAM countries get
//      corrected by step 2 the moment their geo IP resolves (~500ms).
function detectDefaultLang(geoCode) {
  if (typeof window === "undefined") return "es";
  try {
    const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (stored === "en" || stored === "es") return stored;
  } catch {}
  if (geoCode) {
    const upper = String(geoCode).toUpperCase();
    if (LATAM_CODES.has(upper)) return "es";
    // Explicit English-default countries — once geo confirms one of
    // these, we flip to EN even if the browser language is ambiguous.
    if (["US", "CA", "GB", "AU", "NZ", "IE"].includes(upper)) return "en";
    // Other countries fall through to navigator.language below.
  }
  const navLang = String((typeof navigator !== "undefined" && navigator.language) || "").toLowerCase();
  if (navLang.startsWith("es")) return "es";
  if (navLang.startsWith("pt")) return "es";
  if (navLang.startsWith("en")) return "en";
  // No reliable signal — default to ES since the audience is
  // primarily LATAM Meta-ad traffic.
  return "es";
}

// Custom event name used to keep every useLanguage instance in sync
// when one of them flips the language. The makeup-artist page renders
// TWO toggles (top header + inline Apply form) — they both call
// useLanguage independently, so without a broadcast they desynced
// visually (one says EN, the other says ES) until the next reload.
const LANG_EVENT = "vora-lang-change";

function useLanguage(geoCode) {
  const [lang, setLangState] = useState(() => detectDefaultLang(geoCode));
  // Re-detect once when geo arrives, but never overwrite a manual choice.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
      if (stored === "en" || stored === "es") return;
    } catch {}
    setLangState(detectDefaultLang(geoCode));
  }, [geoCode]);
  // Cross-instance sync: every mounted useLanguage hook subscribes to
  // the LANG_EVENT and updates its local state when any other instance
  // changes language. Also listens to the native `storage` event, which
  // fires for other tabs/windows on the same origin — changing language
  // in one tab now flips an open second tab too.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onChange = (e) => {
      const next = e?.detail;
      if (next === "en" || next === "es") setLangState(next);
    };
    const onStorage = (e) => {
      if (e.key !== LANG_STORAGE_KEY) return;
      if (e.newValue === "en" || e.newValue === "es") setLangState(e.newValue);
    };
    window.addEventListener(LANG_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(LANG_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  const setLang = (next) => {
    setLangState(next);
    try { window.localStorage.setItem(LANG_STORAGE_KEY, next); } catch {}
    try { window.dispatchEvent(new CustomEvent(LANG_EVENT, { detail: next })); } catch {}
  };
  return [lang, setLang];
}

/* Tiny string-or-object translator. `t(value, lang)` lets us write
   labels as either a plain string (used as-is) or a {en, es} object
   (looked up by lang). Keeps the i18n footprint zero — no library, no
   keys file. */
function t(value, lang) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") return value[lang] || value.en || Object.values(value)[0] || "";
  return String(value);
}

/* Meta Pixel — pixel id is duplicated in index.html (where the base
   script lives + fires PageView). Keeping it here too so the helpers
   below can re-init with advanced-matching user data when a submit
   happens. */
const META_PIXEL_ID = "1500053108436109";

/* Construct an advanced-matching user-data object Meta will use to
   deduplicate visitors across visits and devices. Meta's browser
   pixel hashes these values for us when "Advanced Matching" is
   enabled on the pixel (Events Manager → Settings) — we just pass
   them in lowercase + stripped of obvious whitespace. */
function buildMetaUserData({ name, email, phone, country, city } = {}) {
  const out = {};
  const em = String(email || "").trim().toLowerCase();
  if (em) out.em = em;
  const phDigits = String(phone || "").replace(/[^\d]/g, "");
  if (phDigits) out.ph = phDigits;
  const fullName = String(name || "").trim();
  if (fullName) {
    const spaceIdx = fullName.indexOf(" ");
    if (spaceIdx > 0) {
      out.fn = fullName.slice(0, spaceIdx).toLowerCase();
      out.ln = fullName.slice(spaceIdx + 1).trim().toLowerCase();
    } else {
      out.fn = fullName.toLowerCase();
    }
  }
  const ctry = String(country || "").trim().toLowerCase();
  if (ctry) out.country = ctry.length === 2 ? ctry : ctry.slice(0, 2);
  const ct = String(city || "").trim().toLowerCase().replace(/\s+/g, "");
  if (ct) out.ct = ct;
  return out;
}

/* Fire Meta Pixel Lead event after a successful application or
   business inquiry submit — Meta uses Lead conversions to optimise
   our paid campaigns. Also fires SubmitApplication (job apps) or
   Contact (business inquiries) so Meta's algorithm has multiple
   standard-event signals per conversion. Safe no-op if fbq failed
   to load (ad blockers, network errors). */
function trackLead({ role, source, kind = "application", value, currency = "USD", userData } = {}) {
  if (typeof window === "undefined") return;
  // A local test apply must never count as a Lead in Meta (compile-time
  // false in production builds, so this costs nothing there).
  if (import.meta.env.DEV) return;
  if (typeof window.fbq !== "function") return;
  try {
    // Re-init with advanced-matching user data so the values attach
    // to every subsequent event in this session. Skipped when no
    // user data is supplied (the helper falls back to whatever the
    // last init carried).
    if (userData && Object.keys(userData).length > 0) {
      try { window.fbq("init", META_PIXEL_ID, userData); } catch { /* */ }
    }
    const params = {
      content_name: role || kind,
      content_category: kind,
    };
    if (source) params.source = source;
    if (typeof value === "number") {
      params.value = value;
      params.currency = currency;
    }
    window.fbq("track", "Lead", params);
    if (kind === "application") {
      // SubmitApplication is the more specific standard event Meta
      // recognises for job applications; many recruiting advertisers
      // optimise on it directly. Firing both gives the algorithm
      // the strongest signal.
      window.fbq("track", "SubmitApplication", params);
    } else if (kind === "business-inquiry") {
      // Contact is the standard event for business / inquiry forms.
      window.fbq("track", "Contact", params);
    }
  } catch {
    /* never let analytics break a submit */
  }
}

/* Fire Meta Pixel ViewContent event when a candidate lands on a
   specific role's dedicated page (e.g. /makeupartist,
   /nsfw-artist-application). Lets Meta build remarketing audiences
   of "people who looked at this role but didn't apply" — directly
   useful for paid retargeting. */
function trackViewContent({ role, slug, kind = "job-listing" } = {}) {
  if (typeof window === "undefined") return;
  if (import.meta.env.DEV) return;
  if (typeof window.fbq !== "function") return;
  try {
    const params = {
      content_name: role || slug || "role",
      content_category: kind,
    };
    if (slug) params.content_ids = [slug];
    window.fbq("track", "ViewContent", params);
  } catch {
    /* */
  }
}

/* Roles. The cx/cy/cxM/cyM canvas coordinates are kept inert as part
   of the brand schema (see ADMIN-PANEL-HANDOFF.md) so the data layer
   stays compatible with the future admin tool.
   videoUrl: drop a 30-sec "Am I a good fit?" clip here per role. Empty
   string falls back to a styled placeholder. Use mp4 (or webm); host
   the file in /public/videos/ and reference as "/videos/role.mp4", or
   point to any external CDN URL. */
// Standard apply-form for every position on the careers track. Name +
// email are the only typed fields; every position then asks for the
// same two drag-and-drop uploads (relevant experience + a 30–60s
// selfie video). Per-position overrides — like videoUrl — live on the
// job record itself.
const STANDARD_APPLY_FORM = {
  hidePortfolio: true,
  submitLabel: "Apply →",
  questions: [
    {
      id: "experience",
      type: "file",
      label: { en: "Relevant experience", es: "Experiencia relevante" },
      hint: {
        en: "Drop any work that shows your relevant experience.",
        es: "Adjunta cualquier trabajo que muestre tu experiencia relevante.",
      },
      multiple: true,
      accept: "image/*,video/*,application/pdf,.zip",
      required: false,
    },
    {
      id: "selfie",
      type: "file",
      label: { en: "30–60 second selfie video", es: "Video selfie de 30–60 segundos" },
      hint: {
        en: "Talk about yourself and why you'd be a good fit. Uncut, one take.",
        es: "Cuéntanos sobre ti y por qué encajarías bien. Sin cortes, una sola toma.",
      },
      multiple: false,
      accept: "video/*",
      required: true,
    },
  ],
};

// Assessment roles (Velocity Editor, Marketing Team Lead) and every
// job-board applicant: details + optional experience, NO selfie video —
// the Stage 2 assessment is the screen and the first interview covers
// presentation (decided with Sage, 2026-09-21). Other roles keep the
// standard form above.
const ASSESSMENT_APPLY_FORM = {
  hidePortfolio: true,
  submitLabel: "Apply →",
  questions: STANDARD_APPLY_FORM.questions.filter((q) => q.id !== "selfie"),
};
// Strip the selfie question from any role's form (the /apply funnel).
function withoutSelfie(form) {
  if (!form || !Array.isArray(form.questions)) return form;
  return { ...form, questions: form.questions.filter((q) => q.id !== "selfie") };
}

// AI R&D-specific apply form. Replaces the selfie-video step with a
// short paper upload — that role is judged on thinking, not on camera.
const AI_RND_APPLY_FORM = {
  hidePortfolio: true,
  submitLabel: "Apply →",
  questions: [
    {
      id: "experience",
      type: "file",
      label: "Relevant experience",
      hint: "Drop any work that shows your relevant experience.",
      multiple: true,
      accept: "image/*,video/*,application/pdf,.zip",
      required: false,
    },
    {
      id: "paper",
      type: "file",
      label: "One-page paper",
      hint: "Upload a one-page paper explaining why you'd be a good fit.",
      multiple: false,
      accept: ".pdf,.doc,.docx,.txt,.md,.rtf",
      required: true,
    },
  ],
};

// Marketing Team Lead apply form — the lead role still asks for the selfie
// video (owner, 2026-09-21): the standard two uploads, with the selfie
// prompt pointed at why they stand out. Stage 1 reads it as before.
const MTL_APPLY_FORM = {
  ...STANDARD_APPLY_FORM,
  questions: STANDARD_APPLY_FORM.questions.map((q) => (
    q.id === "selfie"
      ? {
          ...q,
          hint: {
            en: "Explain why you think you stand out. Uncut, one take.",
            es: "Explica por qué crees que destacas. Sin cortes, una sola toma.",
          },
        }
      : q
  )),
};

/* ─── Stage 2 assessment (Velocity Editor + Marketing Team Lead) ───
   Everything an applicant sees in Stage 2 lives in this one object, so
   swapping the viral clip, the stats, the recreate-prompt or a line of
   copy is a one-object edit. `key` must match ASSESSMENT_KEYS in the
   portal (functions/api/vora/_assessment.js) — it's what the apply flow
   sends to get a per-candidate token back.

   GO-LIVE GATE: the flow only runs for the public while `viral.videoUrl`
   is set (the questions are about that clip, so without it there is no
   assessment). Clear it to go dark again; `?stage2=preview` on the URL
   (sticks in localStorage; `?stage2=off` clears it) walks the flow in
   that browser regardless. Media files live in /public like the role
   intro videos:
     /stage2-intro.mp4  (+ /stage2-intro-poster.jpg)   Jamie's Stage 2 word
     /stage2-viral.mp4  (+ /stage2-viral-poster.jpg)   the viral clip, 9:16 */
const STAGE2_ASSESSMENT = {
  key: "viral-reverse-v1",
  version: 1,
  enabled: true,
  estimate: "Takes 2–8 minutes",
  intro: {
    // Jamie's 45 s Stage 2 brief (2026-09-19), 4:3 landscape. No brand or
    // name spoken, so the unbranded /apply funnel plays it too.
    videoUrl: "/stage2-intro.mp4",
    poster: "/stage2-intro-poster.jpg",
    aspect: "4 / 3",
  },
  viral: {
    // @cherdleys, Instagram reel of 2025-09-19 — "I had to rewatch this
    // video to realize that my wife was cheating on me…." 15 s, 9:16.
    videoUrl: "/stage2-viral.mp4",
    poster: "/stage2-viral-poster.jpg",
    platform: "Instagram",
    handle: "@cherdleys",
    // Shown beside the clip, in order. Numbers format as 72.4M / 416K;
    // strings pass through. Remove a pair to hide it.
    metrics: [
      { label: "views", value: 72400000 },
      { label: "likes", value: 416000 },
    ],
  },
  q1: {
    title: "Reverse engineer it.",
    prompt:
      "Deeply reverse engineer this video. Explain as many reasons as to why you think it went viral.",
    minChars: 40,
    // A worked example on a DIFFERENT clip, collapsed behind "See a worked
    // example". Renders only once `text` is set — a half-finished example
    // never reaches an applicant.
    example: {
      videoUrl: "",
      poster: "",
      aspect: "9 / 16",
      handle: "",
      platform: "",
      metrics: [],
      text: "",
    },
  },
  q2: {
    title: "Debug the prompt.",
    prompt:
      "This text prompt is meant to recreate the viral video. Remove whatever hurts the prompt. Add what you think the prompt's missing, or leave it unchanged if you think it's good to go. Set the length the video should be generated at. We recommend using your reverse-engineered success factors to guide some of the edits.",
    // Format controls beside the prompt. Defaults are deliberately wrong
    // for this clip (it is 9:16 and 15 s) — that is part of the test. The
    // reviewer key lives server-side (functions/api/vora/_assessment.js).
    // Format is pinned to 9:16 (no control); only the length is the applicant's
    // call. The default length is deliberately wrong for this clip (it is 15 s).
    defaults: { aspect: "9:16", seconds: 20 },
    // The flawed prompt's REAL generated output, shown under the original on
    // question 2 so someone without AI experience can see what went wrong.
    // Renders only once `videoUrl` is set (generate it from `draft` at the
    // default 9:16 · 20 s).
    output: { videoUrl: "", poster: "", aspect: "9 / 16", label: "What this prompt produced" },
    // Optional wrong → right prompt example on another clip, collapsed
    // behind "See an example fix". Renders only when both texts are set.
    example: { before: "", after: "", note: "" },
    // A near miss of the correct prompt: same scenario and beats, wrong
    // execution — polished-camera language against an uncut phone video,
    // the wife "genuinely thrilled" instead of concerned and fake-excited,
    // the hidden man made obvious and noticed, a sit-down-and-hug ending
    // instead of the jump onto the bed, an explanatory title card, and the
    // "sorry, I didn't order room service" opening missing. A strong
    // applicant removes, adds AND keeps.
    draft: [
      "A video of a husband surprising his wife at her hotel room, recorded from the husband's point of view on a cinema camera with smooth gimbal movement, color graded, with a light music bed underneath.",
      "",
      "It starts with the door swinging open to the wife, who is genuinely thrilled to see him and says \"I didn't know you were coming. You came all this way to see me? Oh my god, you're the best!\"",
      "",
      "As the husband walks in, another man is clearly visible waving from behind the curtain by the window. The husband notices him and laughs.",
      "",
      "Then the husband sits down on the bed next to her and they hug.",
      "",
      "End with a title card that explains she was cheating on him.",
    ].join("\n"),
  },
};

/* ─── /apply funnel listings (job-board links, unbranded) ───
   URL: /apply/<key>. The key doubles as the listingId Analytics groups by
   (one per ad); the row supplies the role (jobSlug → Vora pipeline), the
   title + company shown on the page, and the account/label Analytics
   files it under. Any field can also ride the query string for an ad-hoc
   link: ?job=&title=&company=&label=&account=&url=&src= . */
const FUNNEL_LISTINGS = {
  "smm-teamasia": {
    jobSlug: "socials-manager",
    title: "Social Media Manager",
    company: "TeamAsia LTD",
    listingLabel: "Indeed · TeamAsia · Social Media Manager",
    accountName: "TeamAsia LTD",
    listingUrl: "",
    source: "indeed",
  },
  "video-editor-indeed": {
    jobSlug: "creative-video-editor",
    title: "Video Editor",
    company: "",
    listingLabel: "Indeed · Video Editor",
    accountName: "",
    listingUrl: "",
    source: "indeed",
  },
};

const SEED_JOBS = [
  {
    id: 1,
    slug: "creative-video-editor",
    color: "blue",
    title: "Velocity Editor",
    /* Per-tier offers — placeholders, edit in the admin tool when it ships. */
    salaries: {
      1: "$5.5k–$9k USD/mo",
      2: "$4k–$6.5k USD/mo",
      3: "$2.8k–$4.5k USD/mo",
    },
    type: "Full-time · 40–45 hrs/wk · Remote",
    blurb: "Master AI. Tell stories. Go viral.",
    desc:
      "Master our AI workflows, show intelligence and hunger, earn commission on each viral video you post.",
    bullets: ["AI-native production", "Short-form storyteller"],
    reqs: [
      "Intelligent and ambitious",
      "Ready to work hard",
      "Visually sharp, with attention to detail",
    ],
    videoUrl: "/velocity-editor-intro.mp4",
    videoPoster: "/velocity-editor-intro-poster.jpg",
    videoDuration: 42,
    applyForm: ASSESSMENT_APPLY_FORM,
    // Renders "+ commission" under the salary on the board (see CommissionTag).
    commission: true,
    // Stage 2 (Stage1Processing → /stage-2/<token>) after the apply lands.
    assessment: STAGE2_ASSESSMENT,
    cx: 1150, cy: 1100, cxM: 1330, cyM: 1240,
  },
  // Leadership track for Velocity Editors — sits directly under that
  // role on the board. Pay is DERIVED, never typed: `salaryFrom` makes
  // every tier exactly `factor`x the Velocity Editor's live offer, so
  // re-pricing that role in the portal re-prices this one too.
  {
    id: 8,
    slug: "marketing-team-lead",
    color: "gold",
    title: "Marketing Team Lead",
    salaryFrom: { id: 1, factor: 2 },
    type: "Full-time · 40–45 hrs/wk · Remote",
    blurb: "",
    desc:
      "Confident in your abilities to be a top performer, leading a team of velocity editors? Apply and explain to us why you think you stand out. The typical route involves first consistent, sustained performance as a velocity editor before management opportunities are presented, but we're all for your confidence.",
    bullets: [],
    reqs: [
      "Strong English and communication skills",
      "Strong professionalism (reliability / timeliness)",
      "Deep intelligence to develop expertise in this craft",
    ],
    videoUrl: "",
    videoPoster: "",
    videoDuration: 0,
    applyForm: MTL_APPLY_FORM,
    commission: true,
    assessment: STAGE2_ASSESSMENT,
  },
  {
    id: 3,
    slug: "ai-tool-research",
    color: "magenta",
    title: "AI Tool R&D (Devs)",
    salaries: {
      1: "$8k–$13k USD/mo",
      2: "$5.5k–$9k USD/mo",
      3: "$4k–$6.5k USD/mo",
    },
    type: "Full-time · 40–45 hrs/wk · Remote",
    blurb: "Build the AI stack.",
    desc:
      "Push the frontier of generative AI use cases. Find valuable opportunities in the newest tools. Ship the workflows to our team of marketing killers, creatively solving advanced problems.",
    bullets: ["Generative models", "Production pipelines"],
    reqs: [
      "Obsessed with generative AI",
      "Proof of exceptional thinking skills, creative problem solving, and overall intelligence",
      "Hungry and ambitious to crack codes, fuel real growth, and grow at the company",
    ],
    videoUrl: "/airnd-intro.mp4",
    videoPoster: "/airnd-intro-poster.jpg",
    videoDuration: 39,
    applyForm: AI_RND_APPLY_FORM,
    cx: 1500, cy: 1050, cxM: 1500, cyM: 1190,
  },
  {
    id: 2,
    slug: "copywriter",
    // Archived 2026-09-19 — off the board and unreachable by URL, but the
    // record is kept whole: reinstating the role is deleting this line.
    archived: true,
    color: "gold",
    title: "Copywriting",
    salaries: {
      1: "$5k–$8k USD/mo",
      2: "$3.5k–$5.5k USD/mo",
      3: "$2.5k–$4k USD/mo",
    },
    type: "Full-time · 40–45 hrs/wk · Remote",
    blurb: "Scripts. Direction. Short-form.",
    desc:
      "Write video scripts and plan video creative direction for our fleet. Short-form expertise, brand voice across multiple accounts, and a sharp eye for what cuts through the feed.",
    bullets: ["Video scripts", "Creative direction"],
    reqs: [
      "Strong copy portfolio with examples of creative work",
      "Short-form fluency",
    ],
    videoUrl: "/copywriting-intro.mp4",
    videoPoster: "/copywriting-intro-poster.jpg",
    videoDuration: 52,
    applyForm: STANDARD_APPLY_FORM,
    cx: 1850, cy: 1100, cxM: 1670, cyM: 1240,
  },
  {
    id: 5,
    slug: "ai-artist",
    // Archived 2026-09-19 — off the board and unreachable by URL, but the
    // record is kept whole: reinstating the role is deleting this line.
    archived: true,
    color: "blue",
    title: "AI Artist",
    salaries: {
      1: "$6k–$10k USD/mo",
      2: "$4k–$7k USD/mo",
      3: "$3k–$5k USD/mo",
    },
    type: "Full-time · 40–45 hrs/wk · Remote",
    blurb: "Generate at the frontier.",
    desc:
      "Generate visuals at the bleeding edge of AI. Design imagery, motion, and characters that scale across our fleet of accounts and reach millions every month.",
    bullets: ["AI-native aesthetic", "Image + motion fluency"],
    reqs: [
      "A strong eye for detail (high visual intelligence)",
      "Proof of visual intelligence",
    ],
    videoUrl: "/ai-artist-intro.mp4",
    videoPoster: "/ai-artist-intro-poster.jpg",
    videoDuration: 48,
    applyForm: STANDARD_APPLY_FORM,
    cx: 1800, cy: 1550, cxM: 1670, cyM: 1560,
  },
  {
    id: 4,
    slug: "socials-manager",
    color: "ember",
    title: "Socials Manager",
    salaries: {
      1: "$7k–$11k USD/mo",
      2: "$5k–$7.5k USD/mo",
      3: "$3.5k–$5.5k USD/mo",
    },
    type: "Full-time · 40–45 hrs/wk · Remote",
    blurb: "Keep the fleet organized.",
    desc: "SMM: keep our fleet organized, take care of regular tasks, precisely follow.",
    bullets: ["Fleet-wide ops", "Daily execution"],
    reqs: [
      "Highly highly organized",
      "Extremely punctual",
      "Healthy, strong internet connection",
      "Remote setup",
    ],
    videoUrl: "/smm-intro.mp4",
    videoPoster: "/smm-intro-poster.jpg",
    videoDuration: 29,
    applyForm: STANDARD_APPLY_FORM,
    cx: 1200, cy: 1550, cxM: 1330, cyM: 1560,
  },
  // The brand sphere — kept in the data layer (admin schema) but not
  // rendered as a job. The About section uses its desc for context.
  {
    id: 6,
    kind: "about",
    color: "vora",
    title: "Vora",
    type: "About the company",
    blurb: "An AI-powered media operation building the next wave of social.",
    desc: "Vora designs and runs AI-native content systems. Our team builds the workflows, models, and pipelines that produce, edit, and distribute short-form video at the speed of culture — for our own brands and a select group of partners. We hire creators who think like operators and operators who think like creators.",
    bullets: ["Founded by creators", "AI-native production", "Small senior team"],
    cx: 1500, cy: 1830, cxM: 1500, cyM: 1660, restSize: 158,
  },
];

const SEED_ABOUT_SECTIONS = [
  { id: "why",     title: "Why work here?",   color: BRAND.blue },
  {
    id: "ops",
    title: "Operations",
    color: BRAND.gold,
    body:
      "Vora deploys teams of superstar talent to handle the most state-of-the-art and competitive generative AI workflows. All in the effort of making entertaining, viral, organic social media content to build brands, push massive amounts of traffic, garner attention, and ultimately make money. Our positioning, scrappiness, and overall dedication to the game has made us the most effective company in this industry to date. We specialize in short-form video production, which is where our focus is.",
  },
  // Stats chapter renders its own animated panel (see StatsPanel)
  // rather than free-form body copy. The id stays "results" so existing
  // CMS pointers still resolve; only the display title changed.
  { id: "results", title: "Stats",            color: BRAND.magenta },
  {
    id: "biz",
    title: "Talkin' Business",
    color: BRAND.ember,
    body:
      "Vora is currently pushing the frontier of what is possible with generative AI marketing. To our understanding, no other group is accomplishing the feats and growth that we are purely with AI.\n\nIf you have a product that you believe is worthy of being bootstrapped with this type of organic marketing, reach out here describing the opportunity. A call will be set up with one of our founders if we believe it makes sense.",
  },
];

/* Map a CMS color slug to its hex/rgb pair, so admin-edited sections
   resolve to the correct accent color when rendered. */
const SECTION_COLOR_MAP = {
  blue: BRAND.blue,
  gold: BRAND.gold,
  magenta: BRAND.magenta,
  ember: BRAND.ember,
};
const resolveSectionColor = (raw) => {
  if (!raw) return BRAND.blue;
  if (typeof raw === "object" && raw.hex) return raw;
  return SECTION_COLOR_MAP[String(raw).toLowerCase()] || BRAND.blue;
};

/* useVoraData — single in-flight fetch of all four /api/vora/* read
   endpoints. Returns whatever the CMS publishes, falls back to inline
   seed data if the network is down or the endpoint hasn't been wired
   yet. Schema-tolerant: each consumer of `jobs` already handles both
   the new tier-keyed `salaries: {1,2,3}` shape and the legacy single
   `salary` string, so this hook can switch over silently as the admin
   schema gets extended in the portal. */
// Format the duration label that sits above the video player on each
// expanded role card. Uses videoDuration (seconds) from the seed if
// present, or falls back to a generic label so roles without a clip
// still read cleanly.
function clipLabel(job) {
  const d = job?.videoDuration;
  if (typeof d === "number" && d > 0) {
    return `${Math.round(d)}-second clip`;
  }
  return "Intro clip";
}

// Fields the seed authoritatively owns for a given job id. When the
// portal returns a job whose id matches a seed id, these fields are
// pinned to the seed value so the public site reflects the latest copy
// without needing the portal to re-publish. Lets us ship per-position
// rewrites (titles, custom apply forms, intro videos, requirements,
// etc.) directly here while the portal catches up.
const SEED_PINNED_FIELDS = [
  "title",
  "desc",
  "blurb",
  "reqs",
  "bullets",
  "type",
  "videoUrl",
  "videoPoster",
  "videoDuration",
  "applyForm",
  "color",
  "slug",
  // Site-only role flags. Portal records don't carry them, so without
  // pinning they'd be dropped whenever a portal copy of the role exists.
  "archived",
  "commission",
  "salaryFrom",
  "assessment",
];
const SEED_BY_ID = Object.fromEntries(SEED_JOBS.map((j) => [j.id, j]));

// Normalize a job record from the portal API into the shape the public
// site renders. The portal evolved its schema (`description`/`requirements`,
// `salaries.tier1/tier2/tier3`) faster than the public site, so this is
// the boundary that keeps the two in sync without coupling them. Known
// seed fields override portal data so newly-shipped copy doesn't get
// clobbered by stale portal state.
function normalizeJob(j) {
  if (!j || typeof j !== "object") return null;
  const portalSalaries = j.salaries || {};
  const salaries = {
    1: portalSalaries[1] || portalSalaries.tier1 || j.salary || "",
    2: portalSalaries[2] || portalSalaries.tier2 || j.salary || "",
    3: portalSalaries[3] || portalSalaries.tier3 || j.salary || "",
  };
  const reqs = Array.isArray(j.reqs)
    ? j.reqs
    : Array.isArray(j.requirements)
    ? j.requirements
    : [];
  const bullets = Array.isArray(j.bullets) ? j.bullets : [];
  const merged = {
    ...j,
    salaries,
    desc: j.desc || j.description || "",
    blurb: j.blurb || "",
    reqs,
    bullets,
    videoUrl: j.videoUrl || "",
    applyForm: j.applyForm || null,
    isOpen: j.isOpen !== false,
  };
  // Pin authoritative seed fields for known job ids.
  const pinned = SEED_BY_ID[j.id];
  if (pinned) {
    for (const k of SEED_PINNED_FIELDS) {
      if (pinned[k] !== undefined) merged[k] = pinned[k];
    }
  }
  return merged;
}

// Multiply every dollar amount in an offer string, keeping its format:
// "$8k-$10k USD/mo" x2 -> "$16k-$20k USD/mo", "$2.8k–$4.5k" -> "$5.6k–$9k".
// Separators, the k suffix and the trailing unit pass through untouched,
// so whatever the portal editor typed keeps reading the same way.
function scaleSalary(str, factor) {
  if (typeof str !== "string" || !str) return str;
  return str.replace(/\$(\d[\d,]*(?:\.\d+)?)(\s*[kK])?/g, (match, num, k) => {
    const value = Number(num.replace(/,/g, "")) * factor;
    if (!Number.isFinite(value)) return match;
    const rounded = Math.round(value * 10) / 10;
    const out = num.includes(",") ? rounded.toLocaleString("en-US") : String(rounded);
    return `$${out}${k || ""}`;
  });
}

// Resolve `salaryFrom` roles against the rest of the list. Runs on the
// normalized list, so the multiplier applies to the source role's LIVE
// (portal) offer — tierCount included.
function withDerivedSalaries(list) {
  const byId = Object.fromEntries(list.map((j) => [j.id, j]));
  return list.map((j) => {
    const from = j.salaryFrom && byId[j.salaryFrom.id];
    if (!from || !from.salaries) return j;
    const factor = Number(j.salaryFrom.factor) || 1;
    const salaries = {};
    for (const t of [1, 2, 3]) salaries[t] = scaleSalary(from.salaries[t], factor);
    return { ...j, salaries, tierCount: from.tierCount };
  });
}

// What the public board lists: derived offers resolved first (so a role
// can still price off one that's closed), then archived + closed dropped.
function listedJobs(list) {
  return withDerivedSalaries(list).filter((j) => j && !j.archived && j.isOpen !== false);
}

function useVoraData() {
  const [data, setData] = useState({
    jobs: null,
    sections: null,
    meta: null,
    aboutPlanet: null,
  });
  useEffect(() => {
    let cancelled = false;
    const safeFetch = (path) =>
      fetch(`${VORA_API}${path}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
    Promise.all([
      safeFetch("/api/vora/jobs"),
      safeFetch("/api/vora/about-sections"),
      safeFetch("/api/vora/meta"),
      safeFetch("/api/vora/about-planet"),
    ]).then(([jobs, sections, meta, aboutPlanet]) => {
      if (cancelled) return;
      // Treat the seed as the canonical job list. Portal-only ids are
      // ignored so deletions in the seed (e.g. removing a role) take
      // effect without depending on the portal to drop the record.
      // Portal data still hot-updates volatile fields (salaries,
      // isOpen) for known seed jobs via normalizeJob's pin pass.
      const portalById = Array.isArray(jobs?.jobs)
        ? Object.fromEntries(jobs.jobs.map((j) => [j.id, j]))
        : {};
      const normalizedJobs = listedJobs(
        SEED_JOBS
          .filter((s) => s.kind !== "about")
          .map((s) => normalizeJob(portalById[s.id] || s))
          .filter(Boolean),
      );
      setData({
        jobs: normalizedJobs.length ? normalizedJobs : null,
        sections:
          Array.isArray(sections?.aboutSections) && sections.aboutSections.length
            ? sections.aboutSections.map((s) => ({
                ...s,
                color: resolveSectionColor(s.color),
              }))
            : null,
        meta: meta?.meta || null,
        aboutPlanet: aboutPlanet?.aboutPlanet || null,
      });
    });
    return () => { cancelled = true; };
  }, []);
  return data;
}

/* ─── Reveal: scroll-driven fade-up via IntersectionObserver ─── */
function Reveal({ children, delay = 0, className }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setVisible(true);
            obs.disconnect();
          }
        });
      },
      { threshold: 0.05, rootMargin: "0px 0px -8% 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: `translateY(${visible ? 0 : 24}px)`,
        transition: `opacity 0.9s cubic-bezier(0.22, 1, 0.36, 1) ${delay}s, transform 0.9s cubic-bezier(0.22, 1, 0.36, 1) ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

/* ─── Wordmark ─── */
function VoraLogo({ height = 32 }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <VoraLogoFallback height={height} />;
  return (
    <div
      style={{
        height,
        aspectRatio: "2.6",
        overflow: "hidden",
        display: "block",
        userSelect: "none",
      }}
    >
      <img
        src={LOGO_SRC}
        alt="vora"
        onError={() => setFailed(true)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center",
          display: "block",
        }}
        draggable={false}
      />
    </div>
  );
}

function VoraLogoFallback({ height }) {
  const h = typeof height === "number" ? height : 40;
  const fontSize = Math.round(h / 0.72);
  return (
    <span
      aria-label="vora"
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        fontFamily: "'Switzer', 'Inter', system-ui, sans-serif",
        fontWeight: 900,
        fontSize,
        lineHeight: 1,
        letterSpacing: "-0.06em",
        whiteSpace: "nowrap",
        userSelect: "none",
      }}
    >
      <span style={{ color: BRAND.blue.hex }}>v</span>
      <span style={{ color: BRAND.gold.hex, fontSize: "1.15em", margin: "0 -0.04em", display: "inline-block", lineHeight: 0.8, transform: "translateY(0.04em)" }}>*</span>
      <span style={{ color: BRAND.magenta.hex }}>r</span>
      <span style={{ color: BRAND.ember.hex }}>a</span>
    </span>
  );
}

/* ─── Sticky top bar — fades in after hero ─── */
function TopBar({ onBusinessClick }) {
  const [show, setShow] = useState(false);
  const { w } = useResponsive();
  const isMobile = w <= 640;
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > window.innerHeight * 0.55);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navLink = (href, label, onClick) => (
    <a
      key={label}
      href={href}
      onClick={onClick}
      style={{
        fontFamily: "'Geist Mono', monospace",
        fontSize: 10,
        fontWeight: 500,
        color: "rgba(255,255,255,0.62)",
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        textDecoration: "none",
        padding: "6px 2px",
        transition: "color 0.2s ease",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
      onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.62)")}
    >
      {label}
    </a>
  );

  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        padding: "16px 24px",
        opacity: show ? 1 : 0,
        pointerEvents: show ? "auto" : "none",
        transition: "opacity 0.4s ease",
        background:
          "linear-gradient(to bottom, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.5) 60%, rgba(0,0,0,0))",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
      }}
    >
      <a
        href="#top"
        aria-label="Top of page"
        style={{ display: "inline-flex", textDecoration: "none" }}
      >
        <VoraLogo height={isMobile ? 22 : 26} />
      </a>

      <nav
        aria-label="Section navigation"
        style={{
          display: "flex",
          alignItems: "center",
          gap: isMobile ? 14 : 24,
        }}
      >
        {navLink("#positions", isMobile ? "Roles" : "Open positions")}
        {!isMobile && navLink("#about", "About")}
        <button
          onClick={(e) => {
            e.preventDefault();
            onBusinessClick && onBusinessClick();
          }}
          style={{
            appearance: "none",
            background: "rgba(255,255,255,0.04)",
            color: "rgba(255,255,255,0.85)",
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 999,
            padding: isMobile ? "8px 12px" : "9px 16px",
            fontFamily: "'Geist Mono', monospace",
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            cursor: "pointer",
            transition:
              "background 0.2s ease, border-color 0.2s ease, color 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.08)";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.32)";
            e.currentTarget.style.color = "#fff";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.04)";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.14)";
            e.currentTarget.style.color = "rgba(255,255,255,0.85)";
          }}
        >
          {isMobile ? "Business" : "For business"}
        </button>
      </nav>
    </header>
  );
}

/* ─── Hero / Masthead ─── */
function useResponsive() {
  const [size, setSize] = useState(() => ({
    w: typeof window !== "undefined" ? window.innerWidth : 1200,
    h: typeof window !== "undefined" ? window.innerHeight : 800,
  }));
  useEffect(() => {
    const onR = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    onR();
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, []);
  return size;
}

function Hero({ meta }) {
  const { w } = useResponsive();
  const isMobile = w <= 640;
  const taglineBefore = meta?.taglineBefore || DEFAULT_TAGLINE_BEFORE;
  const taglineGreen = meta?.taglineGreen || DEFAULT_TAGLINE_GREEN;
  const taglineAfter = meta?.taglineAfter || DEFAULT_TAGLINE_AFTER;
  const primaryLabel = meta?.primaryButtonLabel || "Job Opportunities";
  const logoH = isMobile
    ? Math.max(64, Math.min(96, w * 0.22))
    : Math.max(110, Math.min(220, w * 0.15));

  return (
    <section
      id="top"
      style={{
        minHeight: "100svh",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: isMobile
          ? "calc(env(safe-area-inset-top) + 56px) 22px calc(env(safe-area-inset-bottom) + 32px)"
          : "120px 24px 100px",
        boxSizing: "border-box",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(235,179,6,0.07) 0%, rgba(0,0,0,0) 60%)",
          pointerEvents: "none",
          animation: "voraBreath 14s ease-in-out infinite",
          willChange: "transform, opacity",
        }}
      />

      <Reveal>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <VoraLogo height={logoH} />
        </div>
      </Reveal>

      <Reveal delay={0.18}>
        <h1
          style={{
            margin: isMobile ? "30px 0 0" : "44px 0 0",
            maxWidth: 760,
            textAlign: "center",
            fontFamily: "'Switzer', 'Inter', system-ui, sans-serif",
            fontWeight: 500,
            fontSize: "clamp(18px, 2.4vw, 24px)",
            lineHeight: 1.4,
            letterSpacing: "-0.012em",
            color: "rgba(255,255,255,0.9)",
          }}
        >
          {taglineBefore}
          <span
            style={{
              color: "#22C55E",
              textShadow: "0 0 8px rgba(34,197,94,0.18)",
            }}
          >
            {taglineGreen}
          </span>
          {taglineAfter}
        </h1>
      </Reveal>

      {/* One CTA. The "Businesses looking to connect" button was retired
          2026-09-19; the business page stays reachable from the top bar. */}
      <Reveal delay={0.36}>
        <div
          className="vora-hero-ctas"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 14,
            marginTop: isMobile ? 30 : 40,
          }}
        >
          <a
            href="#opportunities-intro"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
              padding: "15px 32px",
              background: "#fff",
              color: "#000",
              borderRadius: 999,
              // The page's reading face instead of wide-tracked uppercase
              // mono, so the one CTA reads at a glance.
              fontFamily: "'Switzer', 'Inter', system-ui, sans-serif",
              fontSize: 15.5,
              fontWeight: 600,
              letterSpacing: "-0.01em",
              textDecoration: "none",
              boxShadow: "0 12px 32px rgba(255,255,255,0.08)",
              transition: "transform 0.25s cubic-bezier(0.22,1,0.36,1), box-shadow 0.25s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 18px 42px rgba(255,255,255,0.14)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 12px 32px rgba(255,255,255,0.08)";
            }}
          >
            {primaryLabel}
            <span style={{ fontSize: 16 }}>→</span>
          </a>
        </div>
      </Reveal>
    </section>
  );
}

/* ─── Opportunities intro video ───
   Sits between the Hero and the Positions list. Autoplays muted the
   moment the player is roughly centered in the viewport, pauses when
   the visitor scrolls past it. A "Tap for sound" pill sits over the
   frame while muted; clicking anywhere unmutes and reveals native
   controls. preload="metadata" keeps initial payload tiny. */
function OpportunitiesIntro() {
  const b = BRAND.gold;
  const wrapRef = useRef(null);
  const videoRef = useRef(null);
  const [muted, setMuted] = useState(true);
  const [interacted, setInteracted] = useState(false);

  // IntersectionObserver — play when ≥60% of the player is on screen
  // (i.e. roughly centered in the viewport at the standard 880px frame),
  // pause when it scrolls out. Threshold list lets us read intersectionRatio
  // continuously instead of just edges. Once the user has tapped to unmute
  // we still gate playback on visibility so scrolling away pauses, but we
  // don't fight a manual pause: if they paused via native controls and
  // it's still in view, we leave it alone.
  useEffect(() => {
    const el = wrapRef.current;
    const v = videoRef.current;
    if (!el || !v || typeof IntersectionObserver === "undefined") return;
    let inView = false;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          inView = entry.intersectionRatio >= 0.6;
          if (inView) {
            const p = v.play();
            if (p && typeof p.catch === "function") p.catch(() => {});
          } else if (!v.paused) {
            v.pause();
          }
        }
      },
      { threshold: [0, 0.6, 1] },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const onUnmute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    v.volume = 1;
    setMuted(false);
    setInteracted(true);
    const p = v.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  };

  return (
    <section
      id="opportunities-intro"
      style={{
        // Tight bottom padding so on mobile (especially in IG's in-app
        // browser where viewport height is tight) the next section's
        // "open j*bs ↳" header peeks just below the video — gives the
        // visitor a visual cue that there's more to scroll to instead
        // of feeling like the video is the whole story.
        padding: "80px 24px 16px",
        scrollMarginTop: 72,
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", justifyContent: "center" }}>
        <Reveal>
          <div
            ref={wrapRef}
            onClick={muted ? onUnmute : undefined}
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 880,
              aspectRatio: "16 / 9",
              borderRadius: 16,
              overflow: "hidden",
              background: "#000",
              border: `1px solid rgba(${b.rgb},0.18)`,
              boxShadow: `0 24px 64px rgba(${b.rgb},0.12), 0 0 0 1px rgba(255,255,255,0.04)`,
              cursor: muted ? "pointer" : "default",
            }}
          >
            <video
              ref={videoRef}
              src="/opportunities-intro.mp4"
              poster="/opportunities-intro-poster.jpg"
              muted
              playsInline
              preload="metadata"
              controls={interacted}
              onEnded={() => {
                // Video played all the way through → drop the visitor at
                // the open jobs list. `scrollIntoView` is supported on
                // every modern desktop + mobile browser; `block: "start"`
                // lands on the section header just below the sticky
                // top bar (its scrollMarginTop handles the offset).
                const target = typeof document !== "undefined"
                  ? document.getElementById("positions")
                  : null;
                if (target && typeof target.scrollIntoView === "function") {
                  target.scrollIntoView({ behavior: "smooth", block: "start" });
                }
              }}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
                background: "#000",
              }}
            />

            {muted ? (
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "flex-end",
                  justifyContent: "center",
                  padding: 22,
                  background:
                    "linear-gradient(180deg, rgba(0,0,0,0) 60%, rgba(0,0,0,0.45) 100%)",
                  pointerEvents: "none",
                }}
              >
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 18px 10px 14px",
                    borderRadius: 999,
                    background: "rgba(0,0,0,0.62)",
                    border: `1px solid rgba(${b.rgb},0.45)`,
                    backdropFilter: "blur(10px)",
                    WebkitBackdropFilter: "blur(10px)",
                    color: "#fff",
                    fontFamily: "'Switzer', sans-serif",
                    fontSize: 13.5,
                    fontWeight: 500,
                    letterSpacing: "-0.005em",
                    boxShadow: `0 0 22px rgba(${b.rgb},0.35)`,
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={b.hex}
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M11 5L6 9H2v6h4l5 4V5z" />
                    <path d="M16 9c1 1 1.5 2 1.5 3s-.5 2-1.5 3" />
                    <path d="M19 6c2 2 3 4 3 6s-1 4-3 6" />
                  </svg>
                  Tap for sound
                </div>
              </div>
            ) : null}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* Sleek J-curve arrow that replaces the colon at the end of
   "open j*bs". Swoops out from the top of the cap line, bends
   right, then drops straight down to an arrowhead — points the
   eye at the jobs list immediately below. A gentle 2.4s bob loop
   pulses the cue without being distracting. Scoped keyframes are
   injected once via a sibling style tag so multiple renders share
   the animation. */
function OpenJobsArrowStyleInjector() {
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const id = "vora-open-jobs-arrow-keyframes";
    if (document.getElementById(id)) return undefined;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      @keyframes vora-open-jobs-arrow-bob {
        0%   { transform: translateY(0); }
        50%  { transform: translateY(0.12em); }
        100% { transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);
    return () => { /* keep style — sibling renders rely on it */ };
  }, []);
  return null;
}

function OpenJobsArrow() {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-flex",
        alignItems: "center",
        marginLeft: "0.08em",
        animation: "vora-open-jobs-arrow-bob 2.4s ease-in-out infinite",
      }}
    >
      <OpenJobsArrowStyleInjector />
      <svg
        viewBox="0 0 64 92"
        width="0.6em"
        height="0.88em"
        style={{
          display: "block",
          // Pulls the arrow down slightly so its tail sits at the
          // cap line of the word — keeps it from floating above
          // the baseline like an apostrophe.
          marginTop: "0.2em",
          color: BRAND.gold.hex,
        }}
      >
        {/* Sleek J-hook: the tail starts horizontal on the left
            (where the word ends), sweeps right with a long graceful
            bezier, and lands vertical at the foot — pointing the
            eye smoothly from "open j*bs" down into the jobs list.
            One continuous path keeps the curve fluid (no S-bend),
            and a slim 3.4 stroke reads as a typographic flourish
            rather than a fat icon. */}
        <path
          d="M 6 10 C 46 10, 50 28, 50 60 L 50 72"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.4"
          strokeLinecap="round"
        />
        <path
          d="M 40 62 L 50 78 L 60 62"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/* ─── Positions list ─── */
function PositionsSection({ expanded, setExpanded, tier, geo, jobs: jobsProp }) {
  // First paint renders the seed before the portal fetch lands — same
  // listing pass, so archived roles never flash in and derived offers
  // are already resolved.
  const source = jobsProp && jobsProp.length
    ? jobsProp
    : listedJobs(SEED_JOBS.filter((j) => j.kind !== "about"));
  const jobs = source.filter((j) => j.kind !== "about");
  return (
    <section
      id="positions"
      style={{
        // Smaller top padding on mobile (clamp scales the gap with
        // viewport width) so the "open j*bs ↳" header peeks below
        // the centered video after a visitor taps Opportunities —
        // they see the next step instead of just an empty void.
        padding: "clamp(36px, 8vw, 96px) 24px 80px",
        // Removed the 1px top border so the video → open-jobs flow
        // reads as one continuous block — the smooth-scroll on intro
        // end already positions the header cleanly without needing
        // a visual divider.
        scrollMarginTop: 72,
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <Reveal>
          <h2
            aria-label="Open jobs"
            style={{
              fontFamily: "'Switzer', 'Inter', system-ui, sans-serif",
              fontWeight: 700,
              fontSize: "clamp(48px, 9vw, 120px)",
              lineHeight: 0.92,
              letterSpacing: "-0.045em",
              color: "#fff",
              margin: 0,
              marginBottom: 48,
              display: "flex",
              alignItems: "baseline",
              gap: "0.05em",
              flexWrap: "wrap",
            }}
          >
            <span aria-hidden>
              open j
              <span style={{ color: BRAND.gold.hex }}>*</span>
              bs
            </span>
            {/* Sleek curved arrow replacing the colon — swoops out
                and down, ending in an arrowhead pointing at the
                jobs list below. Tells the eye "keep going" without
                needing a label. Subtle bobbing animation pulses the
                cue for visitors who land on the page and pause. */}
            <OpenJobsArrow />
          </h2>
        </Reveal>

        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {jobs.map((j, i) => (
            <Reveal key={j.id} delay={Math.min(i * 0.04, 0.16)}>
              <PositionRow
                job={j}
                index={i + 1}
                tier={tier}
                geo={geo}
                expanded={expanded === j.id}
                onToggle={() => setExpanded(expanded === j.id ? null : j.id)}
              />
            </Reveal>
          ))}
          <Reveal delay={Math.min(jobs.length * 0.04, 0.18)}>
            <ReferralRow
              index={jobs.length + 1}
              expanded={expanded === "referral"}
              onToggle={() => setExpanded(expanded === "referral" ? null : "referral")}
            />
          </Reveal>
        </ul>
      </div>
    </section>
  );
}

/* ─── Referral row ───
   Sits at the bottom of the open-jobs list as one more "option" the
   visitor can act on — but instead of an apply form, it generates a
   personal referral link they paste to a creative friend. If the
   friend applies and stays 30 days, we Venmo / wire the referrer
   $100. The link uses the existing campaign-attribution `?src=`
   channel (prefix `referral-<token>`) so the Ashby webhook captures
   the attribution at submit time without any new backend work.
   Visual: same row geometry as PositionRow so it doesn't disrupt
   scroll rhythm, but with a green-gold treatment + animated gift
   glyph instead of a salary chip.
*/

/* Sleek glowing-gift glyph used in place of the 🎁 emoji.
   Soft green stroke, subtle pulse + breathing glow. Animation is
   scoped via a one-shot stylesheet injection so multiple instances
   share keyframes without React re-inserting them on every render. */
function VoraGiftStyleInjector() {
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const id = "vora-gift-glyph-keyframes";
    if (document.getElementById(id)) return undefined;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      @keyframes voraGiftPulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.08); }
      }
      @keyframes voraGiftGlow {
        0%, 100% { opacity: 0.55; }
        50% { opacity: 1; }
      }
      @keyframes voraGiftRibbonShimmer {
        0%, 100% { stroke-opacity: 0.85; }
        50% { stroke-opacity: 1; }
      }
      .vora-gift-glyph { display: inline-flex; align-items: center; justify-content: center; }
      .vora-gift-glyph svg { transform-origin: center; animation: voraGiftPulse 2.8s ease-in-out infinite; }
      .vora-gift-glyph .vora-gift-halo { animation: voraGiftGlow 2.8s ease-in-out infinite; }
      .vora-gift-glyph .vora-gift-ribbon { animation: voraGiftRibbonShimmer 2.8s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) {
        .vora-gift-glyph svg,
        .vora-gift-glyph .vora-gift-halo,
        .vora-gift-glyph .vora-gift-ribbon { animation: none; }
      }
    `;
    document.head.appendChild(style);
    return () => { /* leave keyframes in head — cheaper than churning on remount */ };
  }, []);
  return null;
}

function GiftGlyph({ size = 18, color = "#22C55E", haloColor = "rgba(34,197,94,0.55)" }) {
  return (
    <span className="vora-gift-glyph" aria-hidden style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        style={{
          filter: `drop-shadow(0 0 4px ${haloColor})`,
        }}
      >
        {/* Halo blob behind the glyph — fades in/out for the breathing glow. */}
        <circle
          className="vora-gift-halo"
          cx="12"
          cy="13"
          r="9.5"
          fill={haloColor}
          opacity="0.55"
          style={{ filter: "blur(4px)" }}
        />
        <g
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Bow loops */}
          <path d="M12 7.2C9.5 4.2 6 4.6 7.5 7.2" />
          <path d="M12 7.2C14.5 4.2 18 4.6 16.5 7.2" />
          {/* Lid (slight overhang vs the body) */}
          <rect x="3.2" y="7.2" width="17.6" height="3.6" rx="0.9" />
          {/* Box body */}
          <rect x="4.2" y="10.8" width="15.6" height="10" rx="0.9" />
          {/* Vertical ribbon — shimmers */}
          <path className="vora-gift-ribbon" d="M12 7.2v13.6" />
        </g>
      </svg>
    </span>
  );
}

function ReferralRow({ index, expanded, onToggle }) {
  const [hover, setHover] = useState(false);
  const accent = hover || expanded;
  const accentHex = BRAND.gold.hex;
  return (
    <li
      style={{
        borderTop: index === 1 ? "1px solid rgba(255,255,255,0.08)" : undefined,
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <VoraGiftStyleInjector />
      <button
        onClick={onToggle}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="vora-pos-row"
        aria-expanded={expanded}
        aria-controls="role-panel-referral"
        aria-label={`Refer someone saucy, win $100. ${expanded ? "Collapse" : "Expand"} referral details.`}
        style={{
          width: "100%",
          appearance: "none",
          background: "transparent",
          border: "none",
          color: "inherit",
          cursor: "pointer",
          padding: "32px 0",
          display: "grid",
          gridTemplateColumns: "1fr auto auto",
          minHeight: 88,
          alignItems: "baseline",
          gap: 24,
          textAlign: "left",
          transition: "background 0.3s ease",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontFamily: "'Switzer', 'Inter', system-ui, sans-serif",
            fontWeight: 600,
            fontSize: "clamp(28px, 5vw, 60px)",
            lineHeight: 1,
            letterSpacing: "-0.038em",
            color: accent ? "#fff" : "rgba(255,255,255,0.86)",
            transition: "color 0.35s ease, transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)",
            transform: accent ? "translateX(8px)" : "translateX(0)",
          }}
        >
          <span style={{ color: accentHex, marginRight: 14, transition: "color 0.3s ease" }}>*</span>
          Know someone saucy?
        </h3>
        <span
          className="vora-pos-salary"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 14px",
            borderRadius: 999,
            fontFamily: "'Geist Mono', monospace",
            fontSize: 15,
            fontWeight: 600,
            color: "#22C55E",
            background: accent
              ? "linear-gradient(135deg, rgba(34,197,94,0.18) 0%, rgba(235,179,6,0.14) 100%)"
              : "linear-gradient(135deg, rgba(34,197,94,0.10) 0%, rgba(235,179,6,0.07) 100%)",
            border: `1px solid ${accent ? "rgba(34,197,94,0.55)" : "rgba(34,197,94,0.32)"}`,
            letterSpacing: "0.005em",
            textShadow: accent ? "0 0 14px rgba(34,197,94,0.45)" : "0 0 10px rgba(34,197,94,0.22)",
            whiteSpace: "nowrap",
            transition: "background 0.3s ease, border-color 0.3s ease, transform 0.3s ease, text-shadow 0.3s ease",
            transform: accent ? "scale(1.03)" : "scale(1)",
          }}
        >
          <GiftGlyph size={18} />
          Win&nbsp;$100
        </span>
        <span
          className="vora-pos-arrow"
          aria-hidden
          style={{
            fontFamily: "'Switzer', sans-serif",
            fontWeight: 400,
            fontSize: 22,
            color: accent ? accentHex : "rgba(255,255,255,0.4)",
            transition: "transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), color 0.3s ease",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            width: 16,
            textAlign: "center",
            lineHeight: 1,
          }}
        >
          →
        </span>
      </button>

      <ReferralPanel expanded={expanded} />
    </li>
  );
}

function ReferralPanel({ expanded }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const canGenerate = name.trim().length >= 2 && /.+@.+\..+/.test(email.trim());

  const generate = () => {
    if (!canGenerate) {
      setErrorMsg("Enter your name and a valid email so we know who to pay.");
      return;
    }
    setErrorMsg("");
    try {
      // Pack { name, email, ts } into a URL-safe token — small enough
      // for a tweet/DM, big enough to attribute. The application
      // submission picks this up via the existing `?src=` channel
      // because the campaign attribution layer reads `src` first.
      const payload = JSON.stringify({
        n: name.trim().slice(0, 80),
        e: email.trim().slice(0, 120).toLowerCase(),
        t: Date.now(),
      });
      const utf8 = new TextEncoder().encode(payload);
      let binary = "";
      utf8.forEach((byte) => { binary += String.fromCharCode(byte); });
      const token = btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      const origin = typeof window !== "undefined" ? window.location.origin : "https://vora.biz";
      // `?ref=<token>` is a dedicated channel kept verbatim by
      // campaign-attribution.js — the previous `?src=referral-<token>`
      // path got lowercased by the campaign-id slug normalizer,
      // destroying the base64 case and making the token un-decodable
      // server-side. Separate param = no slug normalization, full
      // referral payload arrives at the apply endpoint intact.
      const generated = `${origin}/?ref=${token}`;
      setLink(generated);
      setCopied(false);
    } catch (error) {
      setErrorMsg("Couldn't generate a link — try again.");
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
      } else if (typeof document !== "undefined") {
        const node = document.createElement("textarea");
        node.value = link;
        node.style.position = "fixed";
        node.style.opacity = "0";
        document.body.appendChild(node);
        node.select();
        document.execCommand("copy");
        document.body.removeChild(node);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch (error) {
      setErrorMsg("Couldn't copy — long-press the link and copy by hand.");
    }
  };

  const reset = () => {
    setLink("");
    setCopied(false);
  };

  return (
    <div
      id="role-panel-referral"
      role="region"
      aria-label="Referral program — generate a personal link"
      aria-hidden={!expanded}
      style={{
        maxHeight: expanded ? 2000 : 0,
        overflow: "hidden",
        transition: "max-height 0.7s cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    >
      <div
        style={{
          padding: "28px 0 56px",
          display: "grid",
          gap: 32,
          maxWidth: 760,
        }}
      >
        <div style={{ display: "grid", gap: 14 }}>
          <p
            style={{
              margin: 0,
              fontFamily: "'Switzer', 'Inter', system-ui, sans-serif",
              fontSize: "clamp(17px, 1.6vw, 21px)",
              lineHeight: 1.5,
              color: "rgba(255,255,255,0.92)",
              letterSpacing: "-0.01em",
            }}
          >
            We're seeking smart and hungry individuals who are ready to learn,
            work hard, and earn big — refer someone and if they're hired for
            30 days+, we'll pay you <strong style={{ color: "#22C55E" }}>$100</strong>.
          </p>
        </div>

        {!link ? (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gap: 8 }}>
              <label
                htmlFor="referral-name"
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.5)",
                }}
              >
                Your name
              </label>
              <input
                id="referral-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="So we know who to send the $100 to"
                style={referralInputStyle}
              />
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <label
                htmlFor="referral-email"
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.5)",
                }}
              >
                Your email
              </label>
              <input
                id="referral-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="we'll only use this to pay you out"
                style={referralInputStyle}
              />
            </div>
            {errorMsg && (
              <p
                style={{
                  margin: 0,
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: 12,
                  color: "#ff8c80",
                }}
              >
                {errorMsg}
              </p>
            )}
            <button
              type="button"
              onClick={generate}
              disabled={!canGenerate}
              style={{
                appearance: "none",
                border: "none",
                cursor: canGenerate ? "pointer" : "not-allowed",
                padding: "16px 22px",
                borderRadius: 14,
                fontFamily: "'Switzer', sans-serif",
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: "-0.005em",
                color: canGenerate ? "#0a0a0a" : "rgba(255,255,255,0.5)",
                background: canGenerate
                  ? "linear-gradient(135deg, #22C55E 0%, #EBB306 100%)"
                  : "rgba(255,255,255,0.06)",
                boxShadow: canGenerate
                  ? "0 12px 28px rgba(34,197,94,0.28), 0 0 0 1px rgba(34,197,94,0.4) inset"
                  : "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                justifySelf: "start",
                transition: "transform 0.18s ease, box-shadow 0.18s ease, background 0.3s ease",
              }}
              onMouseDown={(e) => {
                if (canGenerate) e.currentTarget.style.transform = "scale(0.98)";
              }}
              onMouseUp={(e) => {
                if (canGenerate) e.currentTarget.style.transform = "scale(1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              <GiftGlyph size={20} color="#0a0a0a" haloColor="rgba(10,10,10,0.18)" />
              Generate my referral link
            </button>
          </div>
        ) : (
          <ReferralLinkResult link={link} copied={copied} onCopy={copy} onReset={reset} />
        )}
      </div>
    </div>
  );
}

// Sleek result card shown after the user generates their referral
// link. Single capsule with the URL on the left and Copy/Done on the
// right, plus a subtle "Generate another" text-link below. Mounts
// with a soft ring-glow pulse so it reads as a fresh artifact the
// user just made. Truncation is handled with a CSS ellipsis so a
// 200-char base64 token doesn't wrap onto five lines.
function ReferralLinkResult({ link, copied, onCopy, onReset }) {
  return (
    <div
      style={{
        display: "grid",
        gap: 12,
        animation: "voraLinkReveal 0.55s cubic-bezier(0.22, 1, 0.36, 1) both",
      }}
    >
      <ReferralLinkAnimStyle />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 12px 10px 18px",
          borderRadius: 999,
          background: "rgba(34,197,94,0.06)",
          border: "1px solid rgba(34,197,94,0.45)",
          boxShadow: copied
            ? "0 0 0 1px rgba(34,197,94,0.6) inset, 0 0 24px rgba(34,197,94,0.35)"
            : "0 0 0 1px rgba(34,197,94,0.18) inset, 0 0 18px rgba(34,197,94,0.15)",
          transition: "box-shadow 0.25s ease",
          maxWidth: 560,
          minWidth: 0,
        }}
      >
        <span
          style={{
            flex: "1 1 auto",
            minWidth: 0,
            fontFamily: "'Geist Mono', monospace",
            fontSize: 12.5,
            color: "rgba(255,255,255,0.92)",
            letterSpacing: "-0.005em",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            direction: "ltr",
          }}
          title={link}
        >
          {link}
        </span>
        <button
          type="button"
          onClick={onCopy}
          aria-label={copied ? "Copied" : "Copy link"}
          style={{
            appearance: "none",
            flex: "0 0 auto",
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            padding: "8px 14px",
            borderRadius: 999,
            border: "none",
            background: copied
              ? "linear-gradient(135deg, #22C55E 0%, #1ea34d 100%)"
              : "linear-gradient(135deg, #22C55E 0%, #EBB306 100%)",
            color: "#0a0a0a",
            fontFamily: "'Switzer', sans-serif",
            fontWeight: 700,
            fontSize: 12.5,
            letterSpacing: "0.01em",
            cursor: "pointer",
            boxShadow: "0 6px 18px rgba(34,197,94,0.32)",
            transition: "transform 0.15s ease, background 0.25s ease",
            transform: copied ? "scale(1.03)" : "scale(1)",
          }}
          onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.97)"; }}
          onMouseUp={(e) => { e.currentTarget.style.transform = copied ? "scale(1.03)" : "scale(1)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = copied ? "scale(1.03)" : "scale(1)"; }}
        >
          {copied ? (
            <>
              <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>✓</span>
              Copied
            </>
          ) : (
            <>
              Copy link
            </>
          )}
        </button>
      </div>
      <button
        type="button"
        onClick={onReset}
        style={{
          appearance: "none",
          justifySelf: "start",
          padding: 0,
          background: "transparent",
          border: "none",
          color: "rgba(255,255,255,0.45)",
          fontFamily: "'Geist Mono', monospace",
          fontSize: 11,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          cursor: "pointer",
          textDecoration: "underline",
          textUnderlineOffset: 3,
        }}
      >
        Generate another
      </button>
    </div>
  );
}

// One-shot keyframes for the link-reveal pulse. Same singleton-style
// injection as VoraGiftStyleInjector so it doesn't fight React on
// re-renders.
function ReferralLinkAnimStyle() {
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const id = "vora-referral-link-keyframes";
    if (document.getElementById(id)) return undefined;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      @keyframes voraLinkReveal {
        0%   { opacity: 0; transform: translateY(6px) scale(0.985); }
        100% { opacity: 1; transform: translateY(0) scale(1); }
      }
    `;
    document.head.appendChild(style);
    return undefined;
  }, []);
  return null;
}

const referralInputStyle = {
  appearance: "none",
  width: "100%",
  maxWidth: 480,
  padding: "14px 16px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.04)",
  color: "#fff",
  fontFamily: "'Switzer', sans-serif",
  fontSize: 16,
  letterSpacing: "-0.005em",
  outline: "none",
  // Mobile fix: width:100% + padding without border-box was pushing
  // the inputs past the right edge of the viewport on narrow screens.
  boxSizing: "border-box",
  // 16px font size also prevents iOS Safari's auto-zoom on focus,
  // which was contributing to the layout shift on first tap.
};

// Visitor's tier comes from geo, but the role can opt to surface
// fewer tiers (1 = unified offer, 2 = tier1+tier2, 3 = full ladder).
// Anyone in a higher tier than the role exposes sees the highest
// tier the role does expose (e.g. tierCount=1 → everyone sees tier 1).
function effectiveTier(job, tier) {
  const tc = Number(job?.tierCount) || 3;
  const safe = Number.isFinite(tier) ? tier : 2;
  return Math.min(Math.max(1, safe), tc);
}

/* "+ commission per viral contribution" — rides under the salary on
   commission-earning roles. The coin makes two small hops, then rests,
   so it reads as alive without twitching; reduced-motion users get it
   still. Flat: 1px ring, no glow. */
// Under the salary: a centred "+" line, then the role's commission label.
// No coin, no animation (owner, 2026-09-20).
function CommissionTag() {
  return (
    <span
      style={{
        fontFamily: "'Geist Mono', monospace",
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: "0.02em",
        color: "rgba(34,197,94,0.88)",
        whiteSpace: "nowrap",
      }}
    >
      + commission
    </span>
  );
}

function PositionRow({ job, index, tier, geo, expanded, onToggle }) {
  const b = BRAND[job.color];
  const [hover, setHover] = useState(false);
  const accent = hover || expanded;
  const eff = effectiveTier(job, tier);
  const salary = job.salaries
    ? job.salaries[eff] || job.salaries[1] || job.salaries[2] || job.salaries[3]
    : job.salary;
  return (
    <li
      style={{
        borderTop: index === 1 ? "1px solid rgba(255,255,255,0.08)" : undefined,
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <button
        onClick={onToggle}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="vora-pos-row"
        aria-expanded={expanded}
        aria-controls={`role-panel-${job.id}`}
        aria-label={`${job.title}, ${salary}${job.commission ? ", plus commission" : ""}. ${expanded ? "Collapse" : "Expand"} role details.`}
        style={{
          width: "100%",
          appearance: "none",
          background: "transparent",
          border: "none",
          color: "inherit",
          cursor: "pointer",
          padding: "32px 0",
          display: "grid",
          gridTemplateColumns: "1fr auto auto",
          minHeight: 88,
          alignItems: "baseline",
          gap: 24,
          textAlign: "left",
          transition: "background 0.3s ease",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontFamily: "'Switzer', 'Inter', system-ui, sans-serif",
            fontWeight: 600,
            fontSize: "clamp(28px, 5vw, 60px)",
            lineHeight: 1,
            letterSpacing: "-0.038em",
            color: accent ? "#fff" : "rgba(255,255,255,0.86)",
            transition: "color 0.35s ease, transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)",
            transform: accent ? "translateX(8px)" : "translateX(0)",
          }}
        >
          <span style={{ color: b.hex, marginRight: 14, transition: "color 0.3s ease" }}>*</span>
          {job.title}
        </h3>
        <span
          className="vora-pos-salary"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 6,
          }}
        >
          <span
            style={{
              fontFamily: "'Geist Mono', monospace",
              fontSize: 17,
              fontWeight: 500,
              color: "#22C55E",
              letterSpacing: "0.005em",
              textShadow: "0 0 10px rgba(34,197,94,0.22)",
              whiteSpace: "nowrap",
            }}
          >
            {salary}
          </span>
          {job.commission && <CommissionTag />}
        </span>
        <span
          className="vora-pos-arrow"
          aria-hidden
          style={{
            fontFamily: "'Switzer', sans-serif",
            fontWeight: 400,
            fontSize: 22,
            color: accent ? b.hex : "rgba(255,255,255,0.4)",
            transition: "transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), color 0.3s ease",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            width: 16,
            textAlign: "center",
            lineHeight: 1,
          }}
        >
          →
        </span>
      </button>

      <ExpandedDetail
        job={job}
        expanded={expanded}
        tier={tier}
        geo={geo}
        salaryShown={salary}
      />
    </li>
  );
}

/* Job Details column: the seed `type` line ("Full-time · 40–45 hrs/wk ·
   Remote") split into its parts so it reads as a list beside Requirements. */
function jobDetailItems(job) {
  const raw = String(job.type || "").trim();
  if (!raw) return [];
  return raw.split(/\s+[·•|]\s+/).map((x) => x.trim()).filter(Boolean);
}

function ExpandedDetail({ job, expanded, tier, geo, salaryShown }) {
  const b = BRAND[job.color];
  const applyRef = useRef(null);
  // The application lives in a locked full-screen layer (ApplyOverlay) so the
  // card stays a clean brief: clip, description, Requirements | Job Details and
  // one button. `applied` remembers a finished submission for the rest of the
  // visit so the button doesn't invite a second one.
  const [applyOpen, setApplyOpen] = useState(false);
  const [applied, setApplied] = useState(false);
  const details = jobDetailItems(job);
  // The briefing clip's pop-out: pause inline, resume where they were.
  const clipRef = useRef(null);
  const [clipPop, setClipPop] = useState(false);
  const openClip = () => { try { if (clipRef.current) clipRef.current.pause(); } catch { /* */ } setClipPop(true); };
  const closeClip = (t) => {
    setClipPop(false);
    if (clipRef.current && Number.isFinite(t)) { try { clipRef.current.currentTime = t; } catch { /* */ } }
  };

  // When the briefing video ends, bring the Apply button into view so the
  // viewer lands on the next step without hunting for it.
  const handleVideoEnded = () => {
    if (applyRef.current) {
      applyRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };
  const closeApply = (finished) => {
    setApplyOpen(false);
    if (finished) setApplied(true);
    // Hand keyboard focus back to the button that opened the layer.
    window.setTimeout(() => {
      if (applyRef.current) applyRef.current.focus({ preventScroll: true });
    }, 0);
  };

  const eyebrow = {
    fontFamily: "'Geist Mono', monospace",
    fontSize: 10,
    fontWeight: 500,
    color: "rgba(255,255,255,0.45)",
    letterSpacing: "0.22em",
    textTransform: "uppercase",
    marginBottom: 14,
    display: "flex",
    alignItems: "center",
    gap: 10,
  };
  const item = {
    fontFamily: "'Switzer', sans-serif",
    fontSize: 15,
    fontWeight: 400,
    color: "rgba(255,255,255,0.88)",
    lineHeight: 1.5,
    padding: "6px 0",
    display: "flex",
    gap: 12,
    alignItems: "baseline",
  };

  return (
    <div
      id={`role-panel-${job.id}`}
      role="region"
      aria-label={`${job.title} — details`}
      aria-hidden={!expanded}
      style={{
        maxHeight: expanded ? 3200 : 0,
        overflow: "hidden",
        transition: "max-height 0.7s cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    >
      <div
        style={{
          padding: "20px 0 64px",
          opacity: expanded ? 1 : 0,
          animation: expanded ? "voraFade 0.5s cubic-bezier(0.22,1,0.36,1)" : "none",
          transition: "opacity 0.4s ease 0.1s",
          display: "flex",
          flexDirection: "column",
          gap: 48,
        }}
      >
        {/* — BRIEFING — skipped for roles without an intro clip: a play
            button that plays nothing reads as broken. */}
        {job.videoUrl ? (
          <div>
            <p
              style={{
                margin: "0 0 18px",
                fontFamily: "'Switzer', sans-serif",
                fontSize: "clamp(14px, 1.5vw, 16px)",
                lineHeight: 1.45,
                letterSpacing: "-0.005em",
                maxWidth: 720,
              }}
            >
              <span style={{ color: "rgba(255,255,255,0.92)", fontWeight: 600 }}>
                {clipLabel(job)}:
              </span>{" "}
              <span style={{ color: "rgba(255,255,255,0.55)", fontWeight: 400 }}>
                what we're looking for.
              </span>
            </p>
            <VoraVideo
              src={job.videoUrl}
              poster={job.videoPoster || ""}
              aspect="16 / 9"
              fit="cover"
              accent={b}
              videoRef={clipRef}
              onEnded={handleVideoEnded}
              onLarger={openClip}
              style={{
                maxWidth: 880,
                borderRadius: 16,
                border: `1px solid rgba(${b.rgb},0.18)`,
                boxShadow: `0 24px 64px rgba(${b.rgb},0.12), 0 0 0 1px rgba(255,255,255,0.04)`,
              }}
            />
          </div>
        ) : null}

        {/* — DESCRIPTION · REQUIREMENTS | JOB DETAILS · APPLY — */}
        <div style={{ maxWidth: 880 }}>
          <p
            style={{
              fontFamily: "'Switzer', sans-serif",
              fontWeight: 400,
              fontSize: 16,
              lineHeight: 1.65,
              letterSpacing: 0,
              color: "rgba(255,255,255,0.88)",
              margin: 0,
              marginBottom: 32,
              maxWidth: 640,
            }}
          >
            {job.desc}
          </p>

          <div className="vora-role-grid">
            <div>
              <div style={eyebrow}>
                <span style={{ color: b.hex, fontSize: 13 }}>*</span>
                Requirements
              </div>
              {(job.reqs || []).map((r, i) => (
                <div key={i} style={item}>
                  <span style={{ color: b.hex, fontSize: 7 }}>●</span>
                  {r}
                </div>
              ))}
            </div>
            {details.length > 0 && (
              <div>
                <div style={eyebrow}>
                  <span style={{ color: b.hex, fontSize: 13 }}>*</span>
                  Job Details
                </div>
                {details.map((d, i) => (
                  <div key={i} style={item}>
                    <span style={{ color: b.hex, fontSize: 7 }}>●</span>
                    {d}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            ref={applyRef}
            type="button"
            className={`vora-apply-btn${applied ? " is-done" : ""}`}
            onClick={() => { if (!applied) setApplyOpen(true); }}
            disabled={applied}
            aria-haspopup="dialog"
            aria-expanded={applyOpen}
            style={{
              "--btn-rgb": b.rgb,
              appearance: "none",
              width: "100%",
              marginTop: 36,
              scrollMarginTop: 80,
              background: applied ? "rgba(34,197,94,1)" : b.hex,
              color: applied ? "#000" : job.color === "gold" ? "#000" : "#fff",
              border: "none",
              borderRadius: 10,
              padding: "17px 20px",
              fontFamily: "'Geist Mono', monospace",
              fontSize: 11.5,
              fontWeight: 600,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              cursor: applied ? "default" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {applied ? "Application received ✓" : `Apply for ${job.title}`}
          </button>
        </div>
      </div>

      {applyOpen && (
        <ApplyOverlay job={job} tier={tier} geo={geo} salaryShown={salaryShown} onClose={closeApply} />
      )}
      {clipPop && (
        <Stage2VideoPopout
          src={job.videoUrl}
          poster={job.videoPoster || ""}
          aspect="16 / 9"
          accent={b}
          startAt={clipRef.current ? clipRef.current.currentTime : 0}
          onClose={closeClip}
        />
      )}
    </div>
  );
}

/* ─── Apply overlay ───
   The application for a board role: a locked full-screen layer (the same shell
   as the Stage 1 processing screen) holding the form. × / Escape close it only
   while the form is still editable; from the moment Apply is pressed the layer
   is committed — Stage 1 processing takes over on top for assessment roles, and
   the plain "received" state offers Done for the others. */
function ApplyOverlay({ job, tier, geo, salaryShown, onClose }) {
  const b = BRAND[job.color];
  const [busy, setBusy] = useState(false);
  const innerRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Stable identity so the form's effects don't re-run every render.
  const finish = useRef(() => onCloseRef.current(true)).current;
  useEffect(() => lockBodyScroll(), []);
  useEffect(() => {
    if (busy) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onCloseRef.current(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy]);
  useEffect(() => {
    // Keyboard focus lands on the first field of the form.
    const el = innerRef.current && innerRef.current.querySelector("input, textarea, select");
    if (el) { try { el.focus({ preventScroll: true }); } catch { /* best effort */ } }
  }, []);

  const overlay = (
    <div
      className="vora-s1-lock vora-apply-lock"
      style={{ "--s1-accent": b.hex, "--s1-rgb": b.rgb }}
      role="dialog"
      aria-modal="true"
      aria-label={`Apply for ${job.title}`}
    >
      <div className="vora-apply-lock-inner" ref={innerRef}>
        <div className="vora-apply-lock-head">
          <VoraLogo height={22} />
          <span className="vora-apply-lock-title">
            <span aria-hidden style={{ color: b.hex, marginRight: 8 }}>*</span>
            Apply · {job.title}
          </span>
          {!busy && (
            <button
              type="button"
              className="vora-apply-lock-close"
              onClick={() => onCloseRef.current(false)}
              aria-label="Close without applying"
            >
              ×
            </button>
          )}
        </div>
        <ApplyForm
          job={job}
          tier={tier}
          geo={geo}
          salaryShown={salaryShown}
          embedded
          onBusy={setBusy}
          onFinished={finish}
        />
      </div>
      <style>{STAGE1_CSS}</style>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(overlay, document.body) : overlay;
}

/* Placeholder shown when a role doesn't have a videoUrl yet. Reads
   like a brand-tinted holding card, not a broken player. */
function VideoPlate({ job }) {
  const b = BRAND[job.color];
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        background: `linear-gradient(135deg, rgba(${b.rgb},0.18) 0%, rgba(0,0,0,0.85) 100%)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          width: "60%",
          height: "60%",
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(${b.rgb},0.22) 0%, transparent 65%)`,
          filter: "blur(28px)",
        }}
      />
      <div
        style={{
          width: 76,
          height: 76,
          borderRadius: "50%",
          background: `rgba(${b.rgb},0.18)`,
          border: `1.5px solid rgba(${b.rgb},0.65)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1,
          boxShadow: `0 0 28px rgba(${b.rgb},0.28)`,
        }}
      >
        <div
          style={{
            width: 0,
            height: 0,
            marginLeft: 6,
            borderTop: "11px solid transparent",
            borderBottom: "11px solid transparent",
            borderLeft: `17px solid ${b.hex}`,
          }}
        />
      </div>
      <div
        style={{
          fontFamily: "'Geist Mono', monospace",
          fontSize: 10,
          fontWeight: 500,
          color: "rgba(255,255,255,0.65)",
          letterSpacing: "0.28em",
          textTransform: "uppercase",
          zIndex: 1,
        }}
      >
        Briefing video · coming soon
      </div>
    </div>
  );
}


// Resolve the per-role apply-form config to the new questions[] shape,
// migrating the legacy single-customQuestion shape if needed. Falls
// back to a sensible single-question default when nothing's set.
// Per-slug question overrides. Makeup artist gets three extra
// questions (languages, English-skill 1–10 scale, WhatsApp) that
// aren't yet editable from the admin panel — defined inline here with
// bilingual labels so we can ship the LATAM Spanish experience without
// an admin-panel migration. When the admin panel learns to author
// select/multiselect/scale/whatsapp question types, these can move
// into KV and this override drops out.
//
// The OnlyFans-comfort question that used to live here was removed —
// James handles that conversation manually once he's vetted a
// candidate's portfolio, so asking it pre-application was just
// shedding good applicants.
const MAKEUP_ARTIST_EXTRA_QUESTIONS = [
  {
    id: "english_skill",
    type: "scale",
    required: true,
    min: 1,
    max: 10,
    label: { en: "Rate your English skill", es: "Califica tu nivel de inglés" },
    minLabel: { en: "Don't speak", es: "No hablo" },
    maxLabel: { en: "Fluent", es: "Fluido" },
  },
  {
    id: "spanish_skill",
    type: "scale",
    required: true,
    min: 1,
    max: 10,
    label: { en: "Rate your Spanish skill", es: "Califica tu nivel de español" },
    minLabel: { en: "Don't speak", es: "No hablo" },
    maxLabel: { en: "Fluent", es: "Fluido" },
  },
  {
    id: "whatsapp",
    type: "whatsapp",
    required: true,
    // This answer becomes the candidate's phone number in the ATS, so the
    // country code is spelled out in the label — without it the number is
    // unusable for the WhatsApp outreach this very question exists to enable.
    label: { en: "WhatsApp number (include country code)", es: "Número de WhatsApp (con código de país)" },
    placeholder: { en: "+63 917 123 4567", es: "+52 55 1234 5678" },
  },
  {
    id: "country",
    type: "text",
    required: true,
    label: { en: "Country you're from", es: "País de origen" },
    placeholder: { en: "Mexico", es: "México" },
    autoComplete: "country-name",
  },
  {
    id: "city",
    type: "text",
    required: false,
    label: { en: "City you live in (optional)", es: "Ciudad donde vives (opcional)" },
    placeholder: { en: "Mexico City", es: "Ciudad de México" },
    autoComplete: "address-level2",
  },
];

// Known English label/hint strings the portal seed serves for the
// standard apply form. The makeup artist page is bilingual, but the
// portal hasn't shipped admin support for {en, es} apply-form fields
// yet — so the API returns English-only `label`/`hint` strings that
// override the bilingual STANDARD_APPLY_FORM we'd otherwise use here.
// This map upgrades those known English strings to {en, es} objects
// at render time so `t(q.label, lang)` picks the right language.
// Once the portal admin gets bilingual field support, this becomes
// a no-op (unknown strings pass through unchanged).
const APPLY_FORM_EN_ES = {
  label: {
    "Relevant experience": { en: "Relevant experience", es: "Experiencia relevante" },
    "30–60 second selfie video": { en: "30–60 second selfie video", es: "Video selfie de 30–60 segundos" },
    "30-60 second selfie video": { en: "30–60 second selfie video", es: "Video selfie de 30–60 segundos" },
    "One-page paper": { en: "One-page paper", es: "Documento de una página" },
  },
  hint: {
    "Drag a few files in or click to browse":
      { en: "Drag a few files in or click to browse", es: "Arrastra unos archivos o haz clic para buscar" },
    "One short video file — talk to camera":
      { en: "One short video file — talk to camera", es: "Un video corto — habla a la cámara" },
    "One short video file - talk to camera":
      { en: "One short video file — talk to camera", es: "Un video corto — habla a la cámara" },
    "PDF / Word / plain text — single file":
      { en: "PDF / Word / plain text — single file", es: "PDF / Word / texto plano — un solo archivo" },
  },
  placeholder: {
    "Drop a few work samples":
      { en: "Drop a few work samples", es: "Adjunta algunas muestras de trabajo" },
    "Quick intro of who you are":
      { en: "Quick intro of who you are", es: "Una intro breve de quién eres" },
    "Drop work samples (optional)":
      { en: "Drop work samples (optional)", es: "Adjunta muestras de trabajo (opcional)" },
    "Single-page write-up of how you think":
      { en: "Single-page write-up of how you think", es: "Documento de una página sobre cómo piensas" },
  },
};

function bilingualize(value, kind) {
  if (!value || typeof value !== "string") return value;
  const map = APPLY_FORM_EN_ES[kind];
  if (!map) return value;
  return map[value] || value;
}

// `?nv=1` on any apply link = the no-intro-video variant (owner
// 2026-09-29): the same form with the selfie question removed. Minted per
// listing in the Talent Hub beside the regular link; everything else about
// the application, the listing attribution and Stage 2 is unchanged.
function noIntroVideoRequested() {
  try { return new URLSearchParams(window.location.search).get("nv") === "1"; } catch { return false; }
}
// `?nx=1` = no "Relevant experience" upload either — the standing video
// editor assessment link carries both (owner 2026-09-29).
function noExperienceUploadRequested() {
  try { return new URLSearchParams(window.location.search).get("nx") === "1"; } catch { return false; }
}
function resolveApplyForm(job) {
  const af = job.applyForm || {};
  const submitLabel = af.submitLabel || "Transmit application";
  let questions;
  if (Array.isArray(af.questions) && af.questions.length) {
    questions = [...af.questions];
  } else {
    // Legacy shape — single question.
    questions = [
      {
        id: "why",
        label: af.customQuestion || "Why Vora?",
        placeholder:
          af.customQuestionPlaceholder ||
          "Two or three lines on why you'd be great here...",
        type: "textarea",
        required: false,
      },
    ];
  }
  // Upgrade known English-only strings to {en, es} bilingual objects so
  // the bilingual makeup artist page renders Spanish without waiting on
  // the admin panel to gain bilingual apply-form support.
  questions = questions.map((q) => ({
    ...q,
    label: bilingualize(q.label, "label"),
    hint: bilingualize(q.hint, "hint"),
    placeholder: bilingualize(q.placeholder, "placeholder"),
  }));
  if (noIntroVideoRequested()) questions = questions.filter((q) => q.id !== "selfie");
  if (noExperienceUploadRequested()) questions = questions.filter((q) => q.id !== "experience");
  // Inject the makeup-artist-specific questions if they're not already
  // present in the admin-managed config (so when the admin panel does
  // gain support for them, the inline injection becomes a no-op).
  if (job.slug === "makeupartist") {
    const existingIds = new Set(questions.map((q) => q.id));
    for (const extra of MAKEUP_ARTIST_EXTRA_QUESTIONS) {
      if (!existingIds.has(extra.id)) questions.push(extra);
    }
  }
  return { questions, submitLabel };
}

// ── Application file uploads ─────────────────────────────────────────
// Applicant showreels routinely run 100 MB+, which is over Cloudflare's
// per-request body cap — one big POST dies at the edge before the
// upload endpoint ever runs, and the browser can only report it as an
// opaque network error. So anything over one part-size goes up in
// uniform chunks (size dictated by the server's ?phase=start response)
// via the endpoint's multipart phases, two parts in flight at a time.
// Each chunk retries independently with capped backoff; going offline
// PAUSES the retry clock until the browser reports connectivity again,
// so a wifi→cell handoff or a short signal gap costs seconds, not the
// submission. Files that finished uploading are cached for the session:
// tapping APPLY again after an error resumes instead of re-uploading.
// Every file outcome fires a telemetry beacon so upload failures in the
// field are diagnosable instead of anecdotal.
// XHR (not fetch) for the byte-carrying requests because XHR exposes
// upload progress events — fetch's request-streaming progress is
// patchy across browsers in 2026 still.

const UPLOAD_TAG = "u2"; // uploader build tag — telemetry segments by this
const UPLOAD_PART_BYTES = 8 * 1024 * 1024; // fallback part size + single-POST threshold; ?phase=start's partSize is authoritative
const UPLOAD_MAX_ATTEMPTS = 8;
// Backoff between attempts, capped — paired with the offline-pause this
// rides out a couple of minutes of dead air instead of burning every
// attempt inside ten seconds.
const UPLOAD_BACKOFF_MS = [1000, 2000, 3000, 5000, 8000, 13000, 21000];
const UPLOAD_STALL_BASE_MS = 120 * 1000; // no-bytes-moving watchdog; ×attempt, capped below
const UPLOAD_STALL_MAX_MS = 360 * 1000;
// Once every byte is handed to the network stack, carrier proxies can
// buffer the whole chunk and drain it slowly — the visible upload hits
// 100% early while the real transfer continues. Killing that wait kills
// healthy uploads on slow uplinks, so the response gets a long leash.
const UPLOAD_RESPONSE_WAIT_MS = 300 * 1000;
const UPLOAD_OFFLINE_WAIT_MS = 120 * 1000; // max pause while navigator.onLine === false
const UPLOAD_PART_CONCURRENCY = 2; // parallel streams recover packet loss better on lossy mobile links
const uploadedFileCache = new Map(); // name|size|lastModified|kind → server response

const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isRetryableStatus = (s) => s === 408 || s === 429 || s >= 500;
const backoffMs = (attempt) =>
  UPLOAD_BACKOFF_MS[Math.min(attempt - 1, UPLOAD_BACKOFF_MS.length - 1)] + Math.random() * 400;

// Resolves once the browser reports connectivity again (or after maxMs).
// No-op when already online — and webviews that always report online
// just make this a pass-through.
function waitForOnline(maxMs) {
  if (typeof navigator === "undefined" || navigator.onLine !== false) return Promise.resolve(true);
  return new Promise((resolve) => {
    let timer = null;
    const done = (ok) => {
      window.removeEventListener("online", onUp);
      if (timer) clearTimeout(timer);
      resolve(ok);
    };
    const onUp = () => done(true);
    window.addEventListener("online", onUp);
    timer = setTimeout(() => done(navigator.onLine !== false), maxMs);
  });
}

// Cancellation shared across concurrent part uploads — when one part
// fails terminally the sibling aborts instead of finishing doomed work.
function makeAbortToken() {
  const fns = new Set();
  return {
    aborted: false,
    abort() {
      this.aborted = true;
      for (const fn of fns) { try { fn(); } catch { /* */ } }
      fns.clear();
    },
    hook(fn) {
      if (this.aborted) { fn(); return () => {}; }
      fns.add(fn);
      return () => fns.delete(fn);
    },
  };
}

// Fire-and-forget diagnostics so "some applicants can't upload" stops
// being guesswork — one tiny beacon per file outcome. text/plain keeps
// sendBeacon inside CORS-safelisted content types (no preflight); the
// endpoint parses the body as JSON regardless. Must never throw into
// the upload path.
let uploadSessionId = "";
function uploadTelemetry(evt, fields) {
  try {
    if (!uploadSessionId) uploadSessionId = Math.random().toString(36).slice(2, 10);
    const conn = (typeof navigator !== "undefined" && navigator.connection) || {};
    const payload = JSON.stringify({
      evt,
      tag: UPLOAD_TAG,
      sid: uploadSessionId,
      online: typeof navigator === "undefined" ? null : navigator.onLine !== false,
      net: conn.effectiveType || "",
      downlink: Number.isFinite(conn.downlink) ? conn.downlink : null,
      rtt: Number.isFinite(conn.rtt) ? conn.rtt : null,
      ...fields,
    });
    const url = `${VORA_API}/api/vora/upload-telemetry`;
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(url, new Blob([payload], { type: "text/plain" }));
    } else {
      fetch(url, { method: "POST", body: payload, keepalive: true }).catch(() => { /* */ });
    }
  } catch { /* telemetry must never break an upload */ }
}

// Single XHR POST with progress + watchdogs. Two timing regimes: while
// bytes are moving, a stall watchdog (grows per attempt so slow links
// get more room); once the last byte is handed off, the long response
// leash (see UPLOAD_RESPONSE_WAIT_MS). An `offline` event aborts
// immediately — that socket is dead, and the retry loop pauses for
// `online` instead of burning attempts. Rejects with err.retryable set
// so the retry loop knows what's worth another shot.
function xhrPost({ url, headers, body, onProgress, attempt = 1, abortToken }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const stallLimit = Math.min(UPLOAD_STALL_BASE_MS * attempt, UPLOAD_STALL_MAX_MS);
    let draining = false;
    let killReason = null;
    let stallTimer = null;
    const arm = (ms) => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => kill("stall"), ms);
    };
    const kill = (reason) => {
      killReason = reason;
      try { xhr.abort(); } catch { /* */ }
    };
    const onOffline = () => kill("offline");
    if (typeof window !== "undefined") window.addEventListener("offline", onOffline);
    const unhook = abortToken ? abortToken.hook(() => kill("cancelled")) : null;
    const cleanup = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = null;
      if (typeof window !== "undefined") window.removeEventListener("offline", onOffline);
      if (unhook) unhook();
    };
    const fail = (message, retryable) => {
      cleanup();
      reject(Object.assign(new Error(message), { retryable }));
    };
    xhr.open("POST", url);
    for (const [k, v] of Object.entries(headers || {})) xhr.setRequestHeader(k, v);
    if (xhr.upload) {
      xhr.upload.addEventListener("progress", (evt) => {
        if (evt.lengthComputable && evt.loaded >= evt.total) {
          if (!draining) { draining = true; arm(UPLOAD_RESPONSE_WAIT_MS); }
        } else if (!draining) {
          arm(stallLimit);
        }
        if (evt.lengthComputable && typeof onProgress === "function") onProgress(evt.loaded, evt.total);
      });
    }
    xhr.onload = () => {
      cleanup();
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* */ }
      if (xhr.status >= 200 && xhr.status < 300 && data?.ok) {
        resolve(data);
      } else {
        reject(Object.assign(new Error(data?.error || `upload-${xhr.status}`), {
          retryable: isRetryableStatus(xhr.status),
          status: xhr.status,
          max: data?.max,
        }));
      }
    };
    xhr.onerror = () => fail("network", true);
    xhr.ontimeout = () => fail("network", true);
    xhr.onabort = () => fail(killReason === "cancelled" ? "cancelled" : "network", killReason !== "cancelled");
    arm(stallLimit);
    xhr.send(body);
  });
}

async function postWithRetry(args, { attempts = UPLOAD_MAX_ATTEMPTS, onStatus, abortToken } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (abortToken?.aborted) throw Object.assign(new Error("cancelled"), { retryable: false });
    if (attempt > 1 && typeof onStatus === "function") onStatus({ state: "reconnecting", attempt });
    await waitForOnline(UPLOAD_OFFLINE_WAIT_MS);
    try {
      return await xhrPost({ ...args, attempt, abortToken });
    } catch (err) {
      lastErr = err;
      if (!err.retryable || attempt === attempts || abortToken?.aborted) throw err;
      await sleepMs(backoffMs(attempt));
    }
  }
  throw lastErr;
}

// JSON control calls (start / finish) — small bodies, plain fetch, same
// offline-pause + capped backoff as the byte-carrying requests.
async function uploadControl(url, payload, { attempts = UPLOAD_MAX_ATTEMPTS, onStatus } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (attempt > 1 && typeof onStatus === "function") onStatus({ state: "reconnecting", attempt });
    await waitForOnline(UPLOAD_OFFLINE_WAIT_MS);
    try {
      const opts = {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload || {}),
      };
      if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
        opts.signal = AbortSignal.timeout(30 * 1000);
      }
      const resp = await fetch(url, opts);
      const data = await resp.json().catch(() => null);
      if (resp.ok && data?.ok) return data;
      throw Object.assign(new Error(data?.error || `upload-${resp.status}`), {
        retryable: isRetryableStatus(resp.status),
        status: resp.status,
        max: data?.max,
      });
    } catch (err) {
      const wrapped = (err instanceof TypeError || err?.name === "AbortError" || err?.name === "TimeoutError")
        ? Object.assign(new Error("network"), { retryable: true })
        : err;
      lastErr = wrapped;
      if (!wrapped.retryable || attempt === attempts) throw wrapped;
      await sleepMs(backoffMs(attempt));
    }
  }
  throw lastErr;
}

async function uploadFileMultipart({ file, url, kind, report, onStatus }) {
  const started = await uploadControl(`${url}?phase=start`, {
    filename: file.name || "file",
    contentType: file.type || "application/octet-stream",
    kind,
    size: file.size,
  }, { onStatus });
  const { key, uploadId } = started;
  const partSize = Number(started.partSize) || UPLOAD_PART_BYTES;
  const totalParts = Math.ceil(file.size / partSize);

  // Parts upload UPLOAD_PART_CONCURRENCY at a time. Progress = completed
  // bytes + per-part in-flight bytes; the per-file monotonic clamp in
  // uploadFileWithProgress smooths out retry resets.
  const partLoaded = new Map();
  let bytesDone = 0;
  const reportSum = () => {
    let inflight = 0;
    for (const v of partLoaded.values()) inflight += v;
    report(bytesDone + inflight);
  };
  const abortToken = makeAbortToken();
  const parts = new Array(totalParts);
  let nextIndex = 0;
  let failure = null;

  const worker = async () => {
    while (!failure && !abortToken.aborted) {
      const idx = nextIndex;
      if (idx >= totalParts) return;
      nextIndex += 1;
      const partNumber = idx + 1;
      const offset = idx * partSize;
      const chunk = file.slice(offset, Math.min(offset + partSize, file.size));
      const chunkSize = chunk.size;
      try {
        const res = await postWithRetry({
          url: `${url}?phase=part&key=${encodeURIComponent(key)}&uploadId=${encodeURIComponent(uploadId)}&part=${partNumber}`,
          headers: { "content-type": "application/octet-stream" },
          body: chunk,
          onProgress: (loaded) => {
            partLoaded.set(partNumber, Math.min(loaded, chunkSize));
            reportSum();
          },
        }, { onStatus, abortToken });
        partLoaded.delete(partNumber);
        bytesDone += chunkSize;
        reportSum();
        parts[idx] = { partNumber: res.partNumber || partNumber, etag: res.etag };
      } catch (err) {
        if (!failure) {
          err.part = partNumber;
          err.totalParts = totalParts;
          failure = err;
          abortToken.abort(); // stop the sibling lane's in-flight part
        }
        return;
      }
    }
  };

  try {
    const lanes = Math.max(1, Math.min(UPLOAD_PART_CONCURRENCY, totalParts));
    await Promise.all(Array.from({ length: lanes }, () => worker()));
    if (failure) throw failure;
    return await uploadControl(`${url}?phase=finish`, { key, uploadId, parts }, { onStatus });
  } catch (err) {
    // Free the orphaned parts server-side; fire-and-forget.
    fetch(`${url}?phase=abort`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, uploadId }),
      keepalive: true,
    }).catch(() => { /* */ });
    throw err;
  }
}

// Rendered inside `Couldn't upload your files (…). Try again.` at both
// call sites, so messages read as the parenthetical. The p<i>/<n> tag
// gives support screenshots a foothold without a wall of text.
function friendlyUploadError(err, file) {
  if (err?.code === "unreadable") return err;
  if (err?.message === "network" || err?.message === "aborted" || err?.message === "cancelled") {
    const at = err?.part ? ` (p${err.part}/${err.totalParts || "?"})` : "";
    return new Error(`connection dropped mid-upload${at}`);
  }
  if (err?.message === "file-too-large" || err?.status === 413) {
    const maxBytes = Number(err?.max) || 0;
    const gb = maxBytes / (1024 * 1024 * 1024);
    const limit = maxBytes
      ? (gb >= 1 ? `${Math.round(gb)} GB` : `${Math.round(maxBytes / (1024 * 1024))} MB`)
      : "size";
    return new Error(`"${file?.name || "file"}" is over the ${limit} upload limit`);
  }
  return err;
}

function uploadCacheKey(file, kind) {
  return [file.name, file.size, file.lastModified, kind].join("|");
}

// iOS hands over File objects whose bytes can be gone by submit time
// (iCloud-evicted videos, files deleted after picking). Reading the
// first 64 KB up front turns eight doomed retries + a misleading
// "connection dropped" into an immediate, actionable message.
function assertFileReadable(file) {
  return new Promise((resolve, reject) => {
    const bail = (cause) => reject(Object.assign(
      new Error(`we couldn't read "${file?.name || "your file"}" from this device — re-select it and try again`),
      { retryable: false, code: "unreadable", cause },
    ));
    try {
      if (!file || !file.size) return bail(new Error("empty"));
      const reader = new FileReader();
      reader.onload = () => (
        reader.result && reader.result.byteLength > 0 ? resolve(true) : bail(new Error("empty-read"))
      );
      reader.onerror = () => bail(reader.error || new Error("read-error"));
      reader.readAsArrayBuffer(file.slice(0, Math.min(65536, file.size)));
    } catch (err) {
      bail(err);
    }
  });
}

// Uploads one applicant file to the portal's R2-backed endpoint and
// resolves with { ok, url, key, name, size, kind }. Small files ride
// the original single POST; big files go multipart. onStatus (optional)
// receives {state: 'uploading'|'reconnecting'} for the progress UI.
async function uploadFileWithProgress({ file, url, kind, onProgress, onStatus }) {
  const cached = uploadedFileCache.get(uploadCacheKey(file, kind));
  if (cached) {
    if (typeof onProgress === "function") onProgress(file.size, file.size);
    uploadTelemetry("file-resume", { size: file.size, kind });
    return cached;
  }

  let lastState = "uploading";
  const emitStatus = (s) => {
    if (s.state === lastState) return;
    lastState = s.state;
    if (typeof onStatus === "function") onStatus(s);
  };
  let reconnects = 0;
  const status = (s) => {
    if (s.state === "reconnecting") reconnects += 1;
    emitStatus(s);
  };

  // Monotonic per-file progress — a retried chunk restarts its own
  // byte count, and the bar should pause there, not jump backwards.
  // Bytes moving forward is also the "we're unstuck" signal, so it
  // flips the status back from "reconnecting".
  let maxLoaded = 0;
  const report = (loaded) => {
    const next = Math.max(maxLoaded, Math.min(loaded, file.size));
    if (next > maxLoaded) {
      maxLoaded = next;
      emitStatus({ state: "uploading" });
    }
    if (typeof onProgress === "function") onProgress(maxLoaded, file.size);
  };

  const t0 = Date.now();
  try {
    await assertFileReadable(file);
    let data;
    if (file.size <= UPLOAD_PART_BYTES) {
      data = await postWithRetry({
        url,
        headers: {
          "content-type": file.type || "application/octet-stream",
          "x-filename": encodeURIComponent(file.name || "file"),
          "x-kind": kind,
        },
        body: file,
        onProgress: report,
      }, { onStatus: status });
    } else {
      data = await uploadFileMultipart({ file, url, kind, report, onStatus: status });
    }
    uploadedFileCache.set(uploadCacheKey(file, kind), data);
    report(file.size);
    uploadTelemetry("file-ok", {
      size: file.size,
      type: (file.type || "").slice(0, 60),
      kind,
      ms: Date.now() - t0,
      retries: reconnects,
    });
    return data;
  } catch (err) {
    uploadTelemetry("file-fail", {
      size: file.size,
      type: (file.type || "").slice(0, 60),
      kind,
      ms: Date.now() - t0,
      retries: reconnects,
      code: String(err?.message || err).slice(0, 140),
      part: err?.part || null,
      totalParts: err?.totalParts || null,
      loaded: maxLoaded,
    });
    throw friendlyUploadError(err, file);
  }
}

// Finalize call — /api/ashby-apply on the vora.biz origin. Retries only
// faults where the request plausibly never executed (network drop,
// gateway 502/503/504); the endpoint dedupes candidates server-side so
// a retry after a mid-flight success can't mint a duplicate.
async function postApplyWithRetry(payload) {
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const resp = await fetch("/api/ashby-apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if ((resp.status === 502 || resp.status === 503 || resp.status === 504) && attempt < 3) {
        await sleepMs(2000 * attempt);
        continue;
      }
      return resp;
    } catch (err) {
      lastErr = err;
      if (attempt < 3) {
        await waitForOnline(30 * 1000);
        await sleepMs(2000 * attempt);
      }
    }
  }
  throw lastErr;
}

// Dev-only hook so the upload pipeline is testable from the console /
// automation without driving the whole planet UI. Dead-code-eliminated
// from production builds (import.meta.env.DEV is compile-time false).
if (import.meta.env.DEV && typeof window !== "undefined") {
  window.__voraUploadTest = uploadFileWithProgress;
}

function formatBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Apply-form validation + link-fallback helpers ──────────────────
// GLOBAL phone check — Vora recruits worldwide, so this is deliberately
// country-agnostic: it never pattern-matches a country. It reduces the
// input to digits and accepts any plausible E.164 length (7–15 digits),
// which is the international standard spanning every country's numbers,
// written however the applicant likes (spaces, dashes, parens, leading
// "+"). It rejects only obvious junk — "12", "call me", empty. A stricter
// or country-aware regex would false-reject real foreign numbers and cost
// us candidates, so we err all the way toward accepting.
function isPhoneValid(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

// A pasted portfolio/file link just has to look like a real http(s) URL —
// we intentionally don't gate on host, so Google Drive, Loom, YouTube,
// Dropbox, WeTransfer, a personal site, etc. all pass. A scheme-less
// "drive.google.com/…" is accepted by prepending https:// before the test.
function isLikelyUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return false;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return !!u.hostname && u.hostname.includes(".");
  } catch { return false; }
}

// File-upload safety net (#5). Applicants send photos, videos, PDFs, docs,
// or zipped portfolios — never programs. Rather than police each field's
// (often broad / vague) accept list and risk false-rejecting a legitimate
// file, we reject ONLY clearly-executable / installer / script types by
// extension. Everything else is accepted regardless of the field, so a
// loosely-specced "any related files" question never over-blocks. The
// field's `accept` attribute still guides the native picker as a soft hint.
// Note: ".com" is intentionally NOT blocked — the DOS .com executable is
// extinct, and a file literally named like a bare domain ("studio.com") is
// a far likelier false-positive than a real threat.
const BLOCKED_FILE_EXTS = new Set([
  "exe", "msi", "bat", "cmd", "scr", "pif", "cpl", "hta", "wsf",
  "vbs", "vbe", "jar", "app", "dmg", "pkg", "deb", "rpm", "apk", "msix",
  "gadget", "dll", "sys", "reg",
]);
function isBlockedFileType(file) {
  const name = (file.name || "").toLowerCase();
  const dot = name.lastIndexOf(".");
  if (dot < 0) return false; // no extension → nothing to block on
  return BLOCKED_FILE_EXTS.has(name.slice(dot + 1));
}

function ApplyForm({ job, tier, geo, salaryShown, funnel = null, embedded = false, onBusy = null, onFinished = null }) {
  const b = BRAND[job.color];
  const applyForm = resolveApplyForm(job);
  const hidePortfolio = !!job.applyForm?.hidePortfolio;
  // Bilingual mode is currently scoped to the makeup artist page —
  // every other role stays English-only until there's an actual
  // translation pass. The hook reads geo + browser language + a
  // persisted manual choice; we only render the toggle for the
  // role that's been translated.
  const isBilingual = job.slug === "makeupartist";
  // The hook remembers a manual EN/ES choice (and leans Spanish for LATAM
  // visitors); only the translated makeup-artist page may act on it. Every
  // other role's form — file labels, drop-zone copy, hints — is English.
  const [langRaw, setLang] = useLanguage(geo?.code);
  const lang = isBilingual ? langRaw : "en";
  // Standard fields + per-question answers stored separately so admins
  // can add/remove questions without breaking form state. Phone is a
  // standard required field on every role — recruiters need a second
  // channel for fast scheduling / follow-up where email lag would
  // cost us strong candidates to faster-moving agencies.
  const [form, setForm] = useState({ name: "", email: "", phone: "", portfolio: "" });
  // Link-fallback escape hatch (#3): when an upload fails on a weak
  // connection we reveal a "paste a link instead" field under each file
  // question. A valid link satisfies the requirement and skips the doomed
  // upload, so the applicant gets through instead of bouncing. Keyed by
  // question id; only shown once showLinks flips true (after a failure).
  const [linkFallbacks, setLinkFallbacks] = useState({});
  const [showLinks, setShowLinks] = useState(false);
  const [answers, setAnswers] = useState(() =>
    Object.fromEntries(
      applyForm.questions
        .filter((q) => q.type !== "file")
        // multiselect answers are arrays; everything else starts as ""
        .map((q) => [q.id, q.type === "multiselect" ? [] : ""]),
    ),
  );
  // File-type questions store their FileList separately so we can
  // surface filenames in the email body and (later) attach to Ashby.
  const [files, setFiles] = useState(() =>
    Object.fromEntries(
      applyForm.questions
        .filter((q) => q.type === "file")
        .map((q) => [q.id, []]),
    ),
  );
  // status: "idle" | "submitting" | "ok" | "error"
  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");
  // Stage 2 handoff from the apply response — see stage2FromResponse().
  const [stage2, setStage2] = useState(null);
  // vora.biz roles with an assessment run the two-agent Stage 1 overlay from
  // the moment Apply is pressed; when it ends without a Stage 2 token
  // (already completed, or none issued) the applicant dismisses it here.
  const [stage1Done, setStage1Done] = useState(false);
  const stage1Eligible = !funnel && !!(job.assessment && stage2Ready(job.assessment));
  // Submit-time progress so candidates can SEE the upload happening.
  // {phase: 'idle'|'uploading'|'finalizing'|'ok'|'error',
  //  current: <int>, total: <int>,
  //  fileName: '<current filename>',
  //  fileLoaded: <bytes>, fileSize: <bytes>,
  //  overallPct: 0..100}
  const [progress, setProgress] = useState({ phase: "idle", current: 0, total: 0, fileName: "", fileLoaded: 0, fileSize: 0, overallPct: 0 });

  // Leaving mid-submit abandons the upload — warn (desktop browsers
  // honour this; in-app webviews mostly ignore it, no harm done).
  useEffect(() => {
    if (status !== "submitting") return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isFilled = (k) => form[k].trim().length > 0;
  const isEmailValid = isFilled("email") && EMAIL_RE.test(form.email.trim());
  const emailInvalid = isFilled("email") && !isEmailValid;
  // Phone format check (#4) — lenient international; only flags a FILLED
  // field whose digits don't form a plausible number. Mirrors email's
  // resting-border invalid treatment and is enforced again at submit.
  const phoneInvalid = isFilled("phone") && !isPhoneValid(form.phone);

  // Compute the resting border per field — blank (default), filled
  // (slight white accent), or invalid email/phone (subtle ember edge).
  const restingBorder = (k) => {
    if (k === "email" && emailInvalid) return "1px solid rgba(206,60,17,0.55)";
    if (k === "phone" && phoneInvalid) return "1px solid rgba(206,60,17,0.55)";
    if (isFilled(k)) return "1px solid rgba(255,255,255,0.22)";
    return "1px solid rgba(255,255,255,0.08)";
  };
  const restingBg = (k) =>
    isFilled(k) ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.025)";

  const inputBase = {
    width: "100%",
    padding: "14px 16px",
    borderRadius: 10,
    color: "#fff",
    fontFamily: "'Switzer', sans-serif",
    fontSize: 15,
    fontWeight: 400,
    letterSpacing: "-0.005em",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.2s, box-shadow 0.2s, background 0.2s",
  };
  const inputStyle = (k) => ({
    ...inputBase,
    border: restingBorder(k),
    background: restingBg(k),
  });

  const onFieldFocus = (e) => {
    e.target.style.borderColor = b.hex;
    e.target.style.boxShadow = `0 0 0 3px rgba(${b.rgb},0.15)`;
    e.target.style.background = "rgba(255,255,255,0.05)";
  };
  const onFieldBlur = (k) => (e) => {
    e.target.style.borderColor = restingBorder(k).replace("1px solid ", "");
    e.target.style.boxShadow = "none";
    e.target.style.background = restingBg(k);
  };

  // Submit to /api/ashby-apply, which routes the candidate into the
  // matching Ashby job posting (mapped per-role from the portal at
  // vora.biz/edit). Tier metadata — what offer the candidate saw —
  // travels alongside name/email so each Ashby application is
  // tagged with the precise salary string and tier they accepted
  // against. File uploads ride ahead of this call — each file goes to
  // the portal's R2-backed endpoint (chunked when big) and the
  // resulting URLs travel as attachments[].
  //
  // If the role hasn't been wired to Ashby yet (no ashbyJobPostingId
  // on the portal record), the endpoint returns no-ashby-mapping and
  // we fall back to the legacy mailto: bridge so the application
  // still routes somewhere.
  const submit = async () => {
    if (status === "submitting" || status === "ok") return;
    setErrorMsg("");

    // Makeup-artist page skips the standard phone field — WhatsApp from
    // the custom questions covers it. Every other role still requires
    // phone here as before.
    const phoneIsStandard = !isBilingual;
    if (
      !form.name.trim()
      || !form.email.trim()
      || (phoneIsStandard && !form.phone.trim())
    ) {
      setStatus("error");
      setErrorMsg(phoneIsStandard
        ? "Name, email, and phone number are required."
        : "Name and email are required.");
      return;
    }
    // #4 phone format — presence is enforced above; this rejects junk
    // (too few / too many digits) in an otherwise-filled phone field.
    if (phoneIsStandard && !isPhoneValid(form.phone)) {
      setStatus("error");
      setErrorMsg("Enter a valid phone number.");
      return;
    }
    // Required custom questions (text + file + multiselect)
    for (const q of applyForm.questions) {
      if (!q.required) continue;
      const qLabel = t(q.label, lang) || "Custom question";
      if (q.type === "file") {
        // A pasted link (#3) satisfies a required file question — the
        // applicant chose the escape hatch after a failed upload.
        const hasFiles = files[q.id] && files[q.id].length > 0;
        const hasLink = isLikelyUrl(linkFallbacks[q.id]);
        if (!hasFiles && !hasLink) {
          setStatus("error");
          setErrorMsg(`"${qLabel || "File upload"}" is required.`);
          return;
        }
      } else if (q.type === "multiselect") {
        const arr = Array.isArray(answers[q.id]) ? answers[q.id] : [];
        if (arr.length === 0) {
          setStatus("error");
          setErrorMsg(`"${qLabel}" is required — pick at least one option.`);
          return;
        }
      } else if (q.type === "scale") {
        const n = Number(answers[q.id]);
        if (!Number.isFinite(n) || n < (q.min || 1) || n > (q.max || 10)) {
          setStatus("error");
          setErrorMsg(`"${qLabel}" is required — pick a number on the scale.`);
          return;
        }
      } else if (!String(answers[q.id] || "").trim()) {
        setStatus("error");
        setErrorMsg(`"${qLabel}" is required.`);
        return;
      }
    }

    setStatus("submitting");

    const country = geo?.code || "";
    const offer = salaryShown || "";

    // Pre-compute the total upload work so the progress bar reflects
    // bytes-uploaded across ALL files, not per-file. A candidate
    // dropping a single 50MB video shouldn't see "Uploading 1/1" sit
    // at 100% for a long time then jump — they should see the bar
    // fill smoothly.
    const filesToUpload = [];
    for (const q of applyForm.questions) {
      if (q.type !== "file") continue;
      // A pasted link (#3) overrides the file upload for this question —
      // the applicant chose the escape hatch, so don't re-attempt it.
      if (isLikelyUrl(linkFallbacks[q.id])) continue;
      for (const f of files[q.id] || []) {
        filesToUpload.push({ q, f });
      }
    }
    const totalBytes = filesToUpload.reduce((acc, { f }) => acc + (f.size || 0), 0);
    let bytesAlreadyUploaded = 0;

    setProgress({
      phase: filesToUpload.length ? "uploading" : "finalizing",
      current: 0,
      total: filesToUpload.length,
      fileName: "",
      fileLoaded: 0,
      fileSize: 0,
      overallPct: 0,
    });

    // ── Step 1: upload each dropped file to the portal's R2-backed
    // upload endpoint. We use XHR (not fetch) because XHR exposes
    // upload progress events — fetch's request-streaming progress is
    // patchy across browsers in 2026 still. Each call returns a
    // public URL the apply endpoint attaches to the candidate as a
    // social link in Ashby. Failures here abort the submit so
    // candidates aren't fooled into thinking their files made it
    // through.
    const attachments = [];
    try {
      for (let idx = 0; idx < filesToUpload.length; idx += 1) {
        const { q, f } = filesToUpload[idx];
        setProgress((p) => ({
          ...p,
          phase: "uploading",
          netState: "uploading",
          current: idx + 1,
          total: filesToUpload.length,
          fileName: f.name || "file",
          fileLoaded: 0,
          fileSize: f.size || 0,
        }));

        const data = await uploadFileWithProgress({
          file: f,
          url: `${VORA_API}/api/vora/application-upload`,
          kind: String(q.kind || (f.type?.split("/")[0]) || "file"),
          onStatus: (s) => setProgress((p) => (p.netState === s.state ? p : { ...p, netState: s.state })),
          onProgress: (loaded, total) => {
            const fileSize = total || f.size || loaded;
            const overallBytes = bytesAlreadyUploaded + Math.min(loaded, fileSize);
            // Upload represents 90% of the visible bar — the remaining
            // 10% is reserved for the Ashby + portal record finalize
            // step. Previously the bar filled to 100% on upload-done
            // and then snapped BACKWARDS to 99% for finalize, which
            // made the whole flow feel broken ("did it fail?"). Now
            // the bar only ever moves forward.
            const rawPct = totalBytes > 0
              ? (overallBytes / totalBytes)
              : (filesToUpload.length > 0
                  ? ((idx + (fileSize ? loaded / fileSize : 0)) / filesToUpload.length)
                  : 0);
            const pct = Math.min(90, Math.round(rawPct * 90));
            setProgress((p) => ({
              ...p,
              fileLoaded: Math.min(loaded, fileSize),
              fileSize,
              overallPct: pct,
            }));
          },
        });
        bytesAlreadyUploaded += f.size || 0;
        attachments.push({
          label: q.label || "File",
          name: data.name || f.name || "file",
          url: data.url,
          size: data.size || f.size || 0,
          kind: data.kind || "file",
        });
      }
    } catch (err) {
      setStatus("error");
      setProgress((p) => ({ ...p, phase: "error" }));
      // Reveal the paste-a-link escape hatch (#3) so a doomed upload on a
      // weak connection doesn't dead-end the application.
      setShowLinks(true);
      setErrorMsg(`Couldn't upload your files (${String(err?.message || err)}). Try again, or paste a link to your files below instead.`);
      return;
    }

    // Link fallbacks (#3): any file question answered with a pasted link
    // (Drive/Loom/YouTube/…) attaches as a social link so reviewers get
    // the portfolio even when uploading was impossible on that connection.
    for (const q of applyForm.questions) {
      if (q.type !== "file") continue;
      const raw = String(linkFallbacks[q.id] || "").trim();
      if (!isLikelyUrl(raw)) continue;
      attachments.push({
        label: t(q.label, lang) || "Link",
        name: "Provided link",
        url: /^https?:\/\//i.test(raw) ? raw : `https://${raw}`,
        size: 0,
        kind: "link",
      });
    }

    // Enter finalize phase at 90 — the upload portion of the bar is
    // done. From here the bar slowly creeps from 90 → 98 over a few
    // seconds (see the finalize-creep interval below) while we wait
    // on Ashby + the portal record. On success we snap to 100; on
    // error we cancel the creep. The bar never moves backwards.
    setProgress((p) => ({ ...p, phase: "finalizing", overallPct: 90 }));
    const finalizeCreepStart = Date.now();
    const finalizeCreep = setInterval(() => {
      // Asymptotic ease toward 98 over ~6s so the bar feels alive
      // but never reaches the "done" zone until the server says so.
      const elapsed = (Date.now() - finalizeCreepStart) / 1000;
      const target = 90 + 8 * (1 - Math.exp(-elapsed / 2));
      setProgress((p) => p.phase === "finalizing"
        ? { ...p, overallPct: Math.max(p.overallPct, Math.round(target)) }
        : p);
    }, 200);

    // Flatten free-text custom answers into a single notes blob so
    // they reach Ashby even when no custom-field UUID is wired for
    // each question individually. File answers list filename + URL
    // so reviewers can click directly from candidate notes.
    const notesParts = [];
    applyForm.questions.forEach((q) => {
      const qLabel = t(q.label, lang);
      if (q.type === "file") {
        const fs = files[q.id] || [];
        const link = String(linkFallbacks[q.id] || "").trim();
        // Prefer the link when present — it wins the upload-skip too, so
        // the note must not list files that were never uploaded.
        if (isLikelyUrl(link)) {
          notesParts.push(`${qLabel}: ${link} (link — upload failed on applicant's connection)`);
        } else if (fs.length) {
          notesParts.push(`${qLabel}: ${fs.map((f) => f.name).join(", ")}`);
        }
      } else if (q.type === "multiselect") {
        const arr = Array.isArray(answers[q.id]) ? answers[q.id] : [];
        if (arr.length) {
          // Stringify selected option values; the readable English
          // label is preserved for human reviewers via the options
          // lookup so we don't have to guess from the value alone.
          const lookup = Object.fromEntries((q.options || []).map((o) => [o.value, t(o.label, "en")]));
          const human = arr.map((v) => lookup[v] || v).join(", ");
          notesParts.push(`${qLabel}: ${human}`);
        }
      } else if (q.type === "scale") {
        const n = Number(answers[q.id]);
        if (Number.isFinite(n) && n > 0) {
          // Reviewers see "Rate your English skill: 7/10 (don't
          // speak → fluent)" — the anchor labels disambiguate which
          // direction is good.
          const minL = t(q.minLabel || { en: q.min || 1 }, "en");
          const maxL = t(q.maxLabel || { en: q.max || 10 }, "en");
          notesParts.push(`${qLabel}: ${n}/${q.max || 10} (${minL} → ${maxL})`);
        }
      } else {
        const v = String(answers[q.id] || "").trim();
        if (v) {
          // For single-select, expand the value back to its English
          // label for human reviewers (avoids 'traditional-only' in
          // the email).
          if (q.type === "select" && Array.isArray(q.options)) {
            const opt = q.options.find((o) => o.value === v);
            notesParts.push(`${qLabel}: ${opt ? t(opt.label, "en") : v}`);
          } else {
            notesParts.push(`${qLabel}: ${v}`);
          }
        }
      }
    });

    // Campaign attribution — `window.__voraCampaignSource` is set up
    // by campaign-attribution.js on initial page load. Reads either
    // the explicit `?src=` query param or the standard utm_campaign /
    // utm_source pair, and persists across SPA navigation via
    // sessionStorage. Empty when the visitor arrived organically.
    const campaignSource =
      (typeof window !== "undefined" && typeof window.__voraCampaignSource === "function")
        ? (window.__voraCampaignSource() || "")
        : "";

    // Referral token — opaque base64url string captured from `?ref=<token>`
    // and persisted by campaign-attribution.js. Server decodes it to
    // pull the referrer's name + email, which surface in candidate
    // notes + as a `referred` Ashby tag so the team can see the
    // referral attribution immediately on the candidate profile.
    const referralToken =
      (typeof window !== "undefined" && typeof window.__voraReferralToken === "function")
        ? (window.__voraReferralToken() || "")
        : "";

    // For the bilingual makeup-artist page, the WhatsApp custom answer
    // doubles as the candidate's phone in Ashby (no separate phone
    // field collected). The country custom answer (free-text) wins
    // over the IP-geo country code so the ATS reflects what the
    // candidate said about themselves, not what Cloudflare geolocated.
    const whatsappAnswer = String(answers.whatsapp || "").trim();
    const countryAnswer = String(answers.country || "").trim();
    const phoneForAshby = isBilingual ? whatsappAnswer : form.phone.trim();
    const countryForAshby = countryAnswer
      ? countryAnswer.toUpperCase().slice(0, 8)
      : country;

    const payload = {
      jobId: job.id,
      ashbyJobId: job.ashbyJobId || job.ashbyJobPostingId || "",
      name: form.name.trim(),
      email: form.email.trim(),
      phone: phoneForAshby,
      portfolio: hidePortfolio ? "" : form.portfolio.trim(),
      tier: Number.isFinite(tier) ? tier : null,
      country: countryForAshby,
      salaryShown: offer,
      notes: notesParts.join("\n").slice(0, 4000),
      attachments,
      source: campaignSource,
      referralToken,
      // Roles with a Stage 2 assessment get a per-candidate token back.
      assessmentKey: job.assessment && job.assessment.key ? job.assessment.key : "",
      // Job-board funnel: which door + which ad. Overrides `source` above.
      ...(funnel ? {
        intake: "funnel",
        source: funnel.listing.source || "indeed",
        jobSlug: funnel.listing.jobSlug,
        listingId: funnel.listing.listingId,
        listingLabel: funnel.listing.listingLabel,
        accountName: funnel.listing.accountName,
        listingUrl: funnel.listing.listingUrl,
      } : {}),
    };

    try {
      const resp = await postApplyWithRetry(payload);
      const data = await resp.json().catch(() => ({}));
      clearInterval(finalizeCreep);

      if (resp.ok && data?.ok) {
        setStatus("ok");
        setStage2(stage2FromResponse(job, data));
        setProgress((p) => ({ ...p, phase: "ok", overallPct: 100 }));
        trackLead({
          role: job.title,
          source: campaignSource,
          kind: "application",
          userData: buildMetaUserData({
            name: form.name,
            email: form.email,
            phone: form.phone,
            country: answers?.country || geo?.code,
            city: answers?.city,
          }),
        });
        return;
      }

      // Role not wired to Ashby yet — fall back to mailto so we
      // never drop an application during the rollout.
      if (data?.error === "no-ashby-mapping") {
        fallbackToMailto();
        return;
      }

      uploadTelemetry("finalize-fail", { code: data?.error ? String(data.error).slice(0, 140) : `http-${resp.status}` });
      setStatus("error");
      setProgress((p) => ({ ...p, phase: "error" }));
      setErrorMsg(
        data?.error
          ? `Couldn't submit (${data.error}). Try again or email talent@voraagency.com directly.`
          : `Submit failed (HTTP ${resp.status}). Try again or email talent@voraagency.com directly.`,
      );
    } catch (err) {
      clearInterval(finalizeCreep);
      uploadTelemetry("finalize-fail", { code: String(err?.message || err).slice(0, 140) });
      setStatus("error");
      setProgress((p) => ({ ...p, phase: "error" }));
      setErrorMsg(`Network error — ${String(err?.message || err)}. Try again.`);
    }
  };

  // Legacy mailto: bridge — used as fallback only when a role hasn't
  // been wired to Ashby yet. Will retire once every role has an
  // ashbyJobPostingId set.
  const fallbackToMailto = () => {
    const tierLabel = tier ? `Tier ${tier}` : "—";
    const country = geo?.code || "—";
    const offer = salaryShown || "—";
    const subject = `Application — ${job.title} — ${form.name.trim()}`;
    const lines = [
      `Role: ${job.title}`,
      `Offer shown: ${offer}`,
      `Detected geo / tier: ${country} · ${tierLabel}`,
      ``,
      `Name: ${form.name.trim()}`,
      `Email: ${form.email.trim()}`,
      `Phone: ${form.phone.trim()}`,
    ];
    if (!hidePortfolio) {
      lines.push(`Portfolio: ${form.portfolio.trim() || "—"}`);
    }
    applyForm.questions.forEach((q) => {
      lines.push(``);
      lines.push(t(q.label, "en") || "Question");
      if (q.type === "file") {
        const fs = files[q.id] || [];
        if (!fs.length) {
          lines.push("(no files attached)");
        } else {
          fs.forEach((f) => {
            lines.push(`• ${f.name} (${formatBytes(f.size)})`);
          });
        }
      } else if (q.type === "multiselect") {
        const arr = Array.isArray(answers[q.id]) ? answers[q.id] : [];
        if (!arr.length) {
          lines.push("—");
        } else {
          const lookup = Object.fromEntries((q.options || []).map((o) => [o.value, t(o.label, "en")]));
          arr.forEach((v) => lines.push(`• ${lookup[v] || v}`));
        }
      } else if (q.type === "select") {
        const v = String(answers[q.id] || "").trim();
        if (!v) {
          lines.push("—");
        } else {
          const opt = (q.options || []).find((o) => o.value === v);
          lines.push(opt ? t(opt.label, "en") : v);
        }
      } else {
        lines.push(String(answers[q.id] || "").trim() || "—");
      }
    });
    lines.push(``, `— sent from vora.biz`);
    const body = lines.join("\n");
    const url = `mailto:talent@voraagency.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = url;
    setStatus("ok");
    trackLead({
      role: job.title,
      source: campaignSource,
      kind: "application",
      userData: buildMetaUserData({
        name: form.name,
        email: form.email,
        phone: form.phone,
        country: answers?.country || geo?.code,
        city: answers?.city,
      }),
    });
  };

  const submitted = status === "ok";
  const submitting = status === "submitting";
  const errored = status === "error";
  // Inside the apply overlay: report the committed state (no closing once
  // Apply is pressed) and hand the layer back once the applicant is done.
  useEffect(() => { if (onBusy) onBusy(submitting || submitted); }, [onBusy, submitting, submitted]);
  useEffect(() => { if (stage1Done && onFinished) onFinished(); }, [stage1Done, onFinished]);

  return (
    <div>
      {/* The eyebrow is the overlay header's job when the form is embedded —
          unless the EN/ES toggle lives here. */}
      {(!embedded || isBilingual) && (
      <div
        style={{
          fontFamily: "'Geist Mono', monospace",
          fontSize: 10,
          fontWeight: 500,
          color: "rgba(255,255,255,0.45)",
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          marginBottom: 18,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span style={{ color: b.hex, fontSize: 13 }}>*</span>
        {lang === "es" && isBilingual ? "Aplicar" : "Apply"}
        {/* EN/ES toggle — only renders for roles that have been
            translated (currently just makeup artist). Sits inline at
            the end of the eyebrow so it doesn't displace the layout
            for the other roles. */}
        {isBilingual && (
          <span
            style={{
              marginLeft: "auto",
              display: "inline-flex",
              gap: 2,
              padding: 2,
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 6,
            }}
          >
            {["en", "es"].map((code) => {
              const on = lang === code;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLang(code)}
                  aria-pressed={on}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 4,
                    border: "none",
                    background: on ? "rgba(255,255,255,0.14)" : "transparent",
                    color: on ? "#fff" : "rgba(255,255,255,0.55)",
                    fontFamily: "'Geist Mono', monospace",
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    cursor: on ? "default" : "pointer",
                  }}
                >
                  {code}
                </button>
              );
            })}
          </span>
        )}
      </div>
      )}

      {[
        {
          k: "name",
          l: lang === "es" && isBilingual ? "Nombre completo" : "Full name",
          ph: "Jane Doe", type: "text", autoComplete: "name",
        },
        {
          k: "email",
          l: lang === "es" && isBilingual ? "Correo electrónico" : "Email",
          ph: "jane@example.com", type: "email", autoComplete: "email",
        },
        // Standard phone field is omitted for the makeup-artist /
        // bilingual page — WhatsApp is collected separately in the
        // custom questions and reused as the candidate's phone. Every
        // other role still asks for phone here.
        // The country code is named in the LABEL, and the placeholder is
        // prefilled with the applicant's own detected dialling code. A number
        // submitted without it can't be texted or WhatsApp'd, and an inbound
        // reply from it can't be matched back to the application — so this
        // one missing detail costs us the candidate entirely.
        ...(isBilingual ? [] : [{
          k: "phone",
          // Job-board applicants are reached on WhatsApp first (the Google
          // Form this replaces asked for a "valid WhatsApp number").
          l: funnel
            ? "WhatsApp number (include country code)"
            : lang === "es" && isBilingual
              ? "Número de teléfono (con código de país)"
              : "Phone number (include country code)",
          ph: dialForGeo(geo) ? `${dialForGeo(geo)} 917 123 4567` : "+1 555 123 4567",
          type: "tel", autoComplete: "tel", inputMode: "tel",
        }]),
        ...(hidePortfolio ? [] : [{
          k: "portfolio",
          l: lang === "es" && isBilingual ? "Enlace de portafolio" : "Portfolio link",
          ph: "https://...", type: "url", autoComplete: "url",
        }]),
      ].map((f) => {
        const showEmailValid = f.k === "email" && isEmailValid;
        const showEmailInvalid = f.k === "email" && emailInvalid;
        const showPhoneInvalid = f.k === "phone" && phoneInvalid;
        return (
          <div key={f.k} style={{ marginBottom: 14 }}>
            <label
              htmlFor={`apply-${job.id}-${f.k}`}
              style={{
                fontFamily: "'Switzer', sans-serif",
                fontSize: 11,
                fontWeight: 500,
                color: "rgba(255,255,255,0.5)",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 7,
              }}
            >
              <span>{f.l}</span>
              {showEmailValid && (
                <span
                  aria-hidden
                  style={{
                    fontFamily: "'Geist Mono', monospace",
                    fontSize: 10,
                    color: "#22C55E",
                    letterSpacing: "0.04em",
                  }}
                >
                  ✓
                </span>
              )}
            </label>
            <input
              id={`apply-${job.id}-${f.k}`}
              type={f.type}
              autoComplete={f.autoComplete}
              inputMode={f.inputMode}
              placeholder={f.ph}
              value={form[f.k]}
              onChange={(e) => setForm({ ...form, [f.k]: e.target.value })}
              style={inputStyle(f.k)}
              onFocus={onFieldFocus}
              onBlur={onFieldBlur(f.k)}
              aria-invalid={showEmailInvalid || showPhoneInvalid || undefined}
            />
          </div>
        );
      })}

      {/* Custom intake questions — admin-controlled per role.
          Each question can be a textarea, short text, or URL field,
          with an optional "required" flag. Renders in the order the
          admin configured. Standard fields above (name/email/portfolio)
          are not editable from the admin — they're always required for
          basic applicant identification. */}
      {applyForm.questions.map((q) => {
        const qLabel = t(q.label, lang) || "Question";
        const qPlaceholder = t(q.placeholder, lang) || "";
        const qHint = t(q.hint, lang) || "";
        if (q.type === "file") {
          // File-type question — drag/drop zone (reuses NsfwUploadZone).
          return (
            <div key={q.id} style={{ marginBottom: 18 }}>
              <NsfwUploadZone
                accent={b}
                lang={lang}
                label={q.required ? `${qLabel || "Files"} *` : (qLabel || "Files")}
                hint={qHint || (lang === "es"
                  ? (q.multiple ? "Adjunta cualquier archivo relacionado." : "Adjunta tu archivo.")
                  : (q.multiple ? "Drag in any related files." : "Drag in your file."))}
                multiple={q.multiple !== false}
                accept={q.accept}
                files={files[q.id] || []}
                onChange={(next) => {
                  // #5 safety net: reject only executable/installer files;
                  // accept everything else regardless of this field's accept
                  // hint, so vague multi-type fields aren't over-policed and
                  // no genuine applicant file is lost.
                  const ok = [];
                  const blocked = [];
                  for (const f of next) (isBlockedFileType(f) ? blocked : ok).push(f);
                  if (blocked.length && status !== "submitting") {
                    const names = blocked.map((f) => f.name).join('", "');
                    setStatus("error");
                    setErrorMsg(`"${names}" can't be uploaded — program/installer files aren't accepted. Upload a photo, video, PDF, document, or a zipped portfolio.`);
                  }
                  setFiles({ ...files, [q.id]: ok });
                }}
              />
              {showLinks && (
                <div style={{ marginTop: 10 }}>
                  <label
                    htmlFor={`apply-${job.id}-${q.id}-link`}
                    style={{
                      display: "block",
                      fontFamily: "'Switzer', sans-serif",
                      fontSize: 11,
                      fontWeight: 500,
                      color: "rgba(255,255,255,0.5)",
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      marginBottom: 7,
                    }}
                  >
                    {lang === "es"
                      ? "¿No puedes subirlo? Pega un enlace (Google Drive, Loom, YouTube…)"
                      : "Can't upload? Paste a link instead (Google Drive, Loom, YouTube…)"}
                  </label>
                  <input
                    id={`apply-${job.id}-${q.id}-link`}
                    type="url"
                    inputMode="url"
                    autoComplete="url"
                    placeholder="https://drive.google.com/…"
                    value={linkFallbacks[q.id] || ""}
                    onChange={(e) => setLinkFallbacks({ ...linkFallbacks, [q.id]: e.target.value })}
                    style={{
                      ...inputBase,
                      border: isLikelyUrl(linkFallbacks[q.id])
                        ? "1px solid rgba(34,197,94,0.5)"
                        : "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.03)",
                    }}
                  />
                </div>
              )}
            </div>
          );
        }
        const rawVal = answers[q.id];
        const isFilledQ = Array.isArray(rawVal) ? rawVal.length > 0 : String(rawVal || "").trim().length > 0;
        const restingBorderQ = isFilledQ
          ? "1px solid rgba(255,255,255,0.22)"
          : "1px solid rgba(255,255,255,0.08)";
        const restingBgQ = isFilledQ
          ? "rgba(255,255,255,0.035)"
          : "rgba(255,255,255,0.025)";
        const styleQ = {
          ...inputBase,
          border: restingBorderQ,
          background: restingBgQ,
          ...(q.type === "textarea" ? { resize: "vertical" } : {}),
        };
        const onFocusQ = (e) => {
          e.target.style.borderColor = b.hex;
          e.target.style.boxShadow = `0 0 0 3px rgba(${b.rgb},0.15)`;
          e.target.style.background = "rgba(255,255,255,0.05)";
        };
        const onBlurQ = (e) => {
          e.target.style.borderColor = restingBorderQ.replace("1px solid ", "");
          e.target.style.boxShadow = "none";
          e.target.style.background = restingBgQ;
        };
        const inputId = `apply-${job.id}-${q.id}`;
        // Map question type → input attributes. Defaults to plain text.
        const typeAttrs = (() => {
          switch (q.type) {
            case "url":      return { type: "url" };
            case "phone":    return { type: "tel", inputMode: "tel", autoComplete: "tel" };
            case "whatsapp": return { type: "tel", inputMode: "tel", autoComplete: "tel" };
            case "country":  return { type: "text", autoComplete: "country-name" };
            default:         return { type: "text" };
          }
        })();
        const labelBlock = (
          <label
            htmlFor={q.type === "select" || q.type === "multiselect" ? undefined : inputId}
            style={{
              fontFamily: "'Switzer', sans-serif",
              fontSize: 11,
              fontWeight: 500,
              color: "rgba(255,255,255,0.5)",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 7,
            }}
          >
            <span>
              {qLabel}
              {q.required && (
                <span aria-hidden style={{ color: b.hex, marginLeft: 6 }}>*</span>
              )}
            </span>
          </label>
        );
        // ── Single-select (radio-style chips) ───────────────────────
        if (q.type === "select") {
          const current = String(answers[q.id] || "");
          return (
            <div key={q.id} style={{ marginBottom: 14 }} role="radiogroup" aria-label={qLabel}>
              {labelBlock}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(q.options || []).map((opt) => {
                  const isOn = current === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={isOn}
                      onClick={() => setAnswers({ ...answers, [q.id]: opt.value })}
                      style={{
                        textAlign: "left",
                        padding: "12px 14px",
                        borderRadius: 10,
                        border: isOn ? `1px solid ${b.hex}` : "1px solid rgba(255,255,255,0.12)",
                        background: isOn ? `rgba(${b.rgb},0.10)` : "rgba(255,255,255,0.025)",
                        color: "#fff",
                        fontFamily: "'Switzer', sans-serif",
                        fontSize: 14,
                        cursor: "pointer",
                        transition: "background 0.15s, border-color 0.15s",
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          display: "inline-block",
                          width: 14,
                          height: 14,
                          borderRadius: "50%",
                          border: isOn ? `4px solid ${b.hex}` : "1px solid rgba(255,255,255,0.4)",
                          marginRight: 10,
                          verticalAlign: "middle",
                        }}
                      />
                      {t(opt.label, lang)}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        }
        // ── Multi-select (checkbox-style chips) ─────────────────────
        if (q.type === "multiselect") {
          const current = Array.isArray(answers[q.id]) ? answers[q.id] : [];
          const toggle = (value) => {
            const next = current.includes(value)
              ? current.filter((v) => v !== value)
              : [...current, value];
            setAnswers({ ...answers, [q.id]: next });
          };
          return (
            <div key={q.id} style={{ marginBottom: 14 }} role="group" aria-label={qLabel}>
              {labelBlock}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {(q.options || []).map((opt) => {
                  const isOn = current.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="checkbox"
                      aria-checked={isOn}
                      onClick={() => toggle(opt.value)}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: isOn ? `1px solid ${b.hex}` : "1px solid rgba(255,255,255,0.12)",
                        background: isOn ? `rgba(${b.rgb},0.12)` : "rgba(255,255,255,0.025)",
                        color: "#fff",
                        fontFamily: "'Switzer', sans-serif",
                        fontSize: 14,
                        cursor: "pointer",
                        transition: "background 0.15s, border-color 0.15s",
                      }}
                    >
                      <span aria-hidden style={{ marginRight: 8, opacity: isOn ? 1 : 0.35 }}>
                        {isOn ? "✓" : "○"}
                      </span>
                      {t(opt.label, lang)}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        }
        // ── Scale (1–N numbered chips with a "strength meter" fill).
        //     Used by the makeup-artist English-skill question. Renders
        //     a row of clickable numbers with min/max anchor labels
        //     underneath. Every chip up to the selected number lights
        //     up so the rating reads as a filled bar at a glance,
        //     not a lone selection. — */
        if (q.type === "scale") {
          const min = Number(q.min) || 1;
          const max = Number(q.max) || 10;
          const current = Number(answers[q.id]) || 0;
          const steps = [];
          for (let n = min; n <= max; n += 1) steps.push(n);
          const minL = t(q.minLabel, lang);
          const maxL = t(q.maxLabel, lang);
          return (
            <div key={q.id} style={{ marginBottom: 18 }} role="radiogroup" aria-label={qLabel}>
              {labelBlock}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
                  gap: 6,
                }}
              >
                {steps.map((n) => {
                  const isFilled = current >= n;
                  const isSelected = current === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => setAnswers({ ...answers, [q.id]: n })}
                      style={{
                        appearance: "none",
                        padding: "12px 0",
                        minWidth: 0,
                        borderRadius: 8,
                        // Filled segments share a base blue tint; the
                        // selected number is brighter + outlined so the
                        // exact value the user picked is obvious at a
                        // glance even with the meter fill underneath.
                        border: isSelected
                          ? `1px solid ${b.hex}`
                          : isFilled
                          ? `1px solid rgba(${b.rgb},0.5)`
                          : "1px solid rgba(255,255,255,0.10)",
                        background: isSelected
                          ? `rgba(${b.rgb},0.22)`
                          : isFilled
                          ? `rgba(${b.rgb},0.10)`
                          : "rgba(255,255,255,0.025)",
                        color: isFilled ? "#fff" : "rgba(255,255,255,0.55)",
                        fontFamily: "'Geist Mono', monospace",
                        fontSize: 13,
                        fontWeight: isSelected ? 700 : 500,
                        letterSpacing: "0.02em",
                        cursor: "pointer",
                        transition: "background 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 0.12s ease",
                        transform: isSelected ? "translateY(-1px)" : "none",
                        boxShadow: isSelected ? `0 0 18px rgba(${b.rgb},0.35)` : "none",
                      }}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: 8,
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: 10,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.45)",
                }}
              >
                <span>
                  <span style={{ color: `rgba(${b.rgb},0.85)`, marginRight: 6 }}>
                    {min}
                  </span>
                  {minL}
                </span>
                <span style={{ textAlign: "right" }}>
                  {maxL}
                  <span style={{ color: `rgba(${b.rgb},0.85)`, marginLeft: 6 }}>
                    {max}
                  </span>
                </span>
              </div>
            </div>
          );
        }
        // ── Default: text / textarea / url / tel / whatsapp / country
        return (
          <div key={q.id} style={{ marginBottom: 14 }}>
            {labelBlock}
            {q.type === "textarea" ? (
              <textarea
                id={inputId}
                rows={3}
                placeholder={qPlaceholder}
                value={String(answers[q.id] || "")}
                onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                style={styleQ}
                onFocus={onFocusQ}
                onBlur={onBlurQ}
                aria-required={q.required || undefined}
              />
            ) : (
              <input
                id={inputId}
                {...typeAttrs}
                placeholder={qPlaceholder}
                value={String(answers[q.id] || "")}
                onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                style={styleQ}
                onFocus={onFocusQ}
                onBlur={onBlurQ}
                aria-required={q.required || undefined}
              />
            )}
          </div>
        );
      })}

      <div style={{ marginBottom: 8 }} />

      {/* Messaging consent, directly above the submit button.
          This is the opt-in that our A2P (10DLC) campaign registration
          claims: carriers vet it by opening this form and looking for
          notice that submitting may result in texts, plus a stated way
          out. It lives HERE rather than only in the slug-page footer
          because the main careers page is the bigger funnel and has no
          footer disclosure of its own. Don't remove it without pulling
          the messaging registration first. */}
      <p
        style={{
          margin: "0 0 12px",
          fontFamily: "'Switzer', sans-serif",
          fontSize: 11,
          lineHeight: 1.5,
          color: "rgba(255,255,255,0.42)",
          textAlign: "center",
        }}
      >
        {lang === "es" && isBilingual ? (
          <>
            Al enviar, aceptas nuestra{" "}
            <a href="/privacy" style={{ color: "rgba(255,255,255,0.66)" }}>Política de Privacidad</a> y{" "}
            <a href="/terms" style={{ color: "rgba(255,255,255,0.66)" }}>Términos</a>. Podemos contactarte
            por correo, mensaje de texto o WhatsApp sobre tu aplicación — responde STOP para darte de baja.
            Pueden aplicar tarifas de mensajes y datos.
          </>
        ) : funnel ? (
          <>
            By submitting, you agree that we may contact you by email, text, or WhatsApp about your
            application — reply STOP to opt out. Message and data rates may apply.
          </>
        ) : (
          <>
            By submitting, you agree to our{" "}
            <a href="/privacy" style={{ color: "rgba(255,255,255,0.66)" }}>Privacy Policy</a> and{" "}
            <a href="/terms" style={{ color: "rgba(255,255,255,0.66)" }}>Terms</a>. We may contact you by
            email, text, or WhatsApp about your application — reply STOP to opt out. Message and data
            rates may apply.
          </>
        )}
      </p>

      <button
        onClick={submit}
        disabled={submitted || submitting}
        style={{
          appearance: "none",
          width: "100%",
          background: submitted ? "rgba(34,197,94,1)" : b.hex,
          color: submitted ? "#000" : job.color === "gold" ? "#000" : "#fff",
          border: "none",
          borderRadius: 10,
          padding: "16px 20px",
          fontFamily: "'Geist Mono', monospace",
          fontSize: 11.5,
          fontWeight: 600,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          cursor: submitted || submitting ? "default" : "pointer",
          boxShadow: submitted
            ? "0 0 0 1px rgba(34,197,94,0.4) inset, 0 12px 32px rgba(34,197,94,0.18)"
            : `0 1px 0 rgba(255,255,255,0.08) inset, 0 12px 32px rgba(${b.rgb},0.2)`,
          transition: "transform 0.2s ease, background 0.3s ease, color 0.3s ease, box-shadow 0.3s ease",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          opacity: submitting ? 0.85 : 1,
        }}
      >
        <span style={{ fontSize: 14 }}>*</span>
        {(() => {
          if (submitted) {
            return lang === "es" && isBilingual ? "Aplicación enviada" : "Application transmitted";
          }
          if (submitting) {
            return lang === "es" && isBilingual ? "Enviando…" : "Transmitting…";
          }
          if (lang === "es" && isBilingual) return "Enviar aplicación";
          // The trailing arrow is rendered separately below — a label that
          // already ends in one ("Apply →") would otherwise show two.
          return String(applyForm.submitLabel || "Transmit application").replace(/\s*→\s*$/, "");
        })()}
        <span style={{ fontSize: 14 }}>
          {submitted ? "✓" : submitting ? "…" : "→"}
        </span>
      </button>

      {submitting && (progress.phase === "uploading" || progress.phase === "finalizing") && (
        <div
          role="status"
          aria-live="polite"
          style={{ marginTop: 14 }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              fontFamily: "'Geist Mono', monospace",
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.55)",
              marginBottom: 6,
              gap: 12,
            }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
              {progress.phase === "finalizing"
                ? (lang === "es" ? "Finalizando…" : "Finalizing…")
                : progress.total > 1
                  ? (lang === "es"
                      ? `Subiendo ${progress.current}/${progress.total} · ${progress.fileName}`
                      : `Uploading ${progress.current}/${progress.total} · ${progress.fileName}`)
                  : (lang === "es"
                      ? `Subiendo · ${progress.fileName}`
                      : `Uploading · ${progress.fileName}`)}
            </span>
            <span style={{ flexShrink: 0, color: b.hex, fontWeight: 700 }}>
              {progress.overallPct}%
            </span>
          </div>
          <div
            style={{
              height: 4,
              background: "rgba(255,255,255,0.08)",
              borderRadius: 999,
              overflow: "hidden",
              position: "relative",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progress.overallPct}%`,
                background: b.hex,
                borderRadius: 999,
                transition: "width 0.18s ease",
              }}
            />
          </div>
          {progress.fileSize > 0 && progress.phase === "uploading" && (
            <div
              style={{
                marginTop: 6,
                fontFamily: "'Geist Mono', monospace",
                fontSize: 10,
                color: progress.netState === "reconnecting" ? "rgba(235,179,6,0.8)" : "rgba(255,255,255,0.4)",
                letterSpacing: "0.04em",
              }}
            >
              {progress.netState === "reconnecting"
                ? (lang === "es" ? "reconectando…" : "reconnecting…")
                : <>{formatBytes(progress.fileLoaded)} / {formatBytes(progress.fileSize)}</>}
            </div>
          )}
        </div>
      )}

      {errored && (
        <p
          role="alert"
          aria-live="assertive"
          style={{
            marginTop: 12,
            fontFamily: "'Geist Mono', monospace",
            fontSize: 11,
            fontWeight: 500,
            color: "rgba(206,60,17,0.95)",
            letterSpacing: "0.04em",
            textAlign: "center",
            margin: "12px 0 0",
          }}
        >
          {errorMsg}
        </p>
      )}

      {/* Stage 2 roles: the received line is replaced by the Stage 1
          processing panel, which hands off to /stage-2/<token>. */}
      {/* Job-board funnel: the four-word scan covers the page from the
          moment they hit Apply and opens the assessment on its own. */}
      {funnel && (submitting || submitted) && (
        <FunnelScan
          progress={progress}
          submitted={submitted}
          stage2={stage2}
          files={files}
          linkFallbacks={linkFallbacks}
          onCleared={funnel.onCleared}
        />
      )}
      {stage1Eligible && (submitting || submitted) && !stage1Done && (
        <Stage1Processing
          job={job}
          files={files}
          linkFallbacks={linkFallbacks}
          progress={progress}
          submitted={submitted}
          stage2={stage2}
          onDone={() => setStage1Done(true)}
        />
      )}
      {!funnel && submitted && (!stage1Eligible || stage1Done) && (
        <p
          role="status"
          aria-live="polite"
          style={{
            marginTop: 12,
            fontFamily: "'Switzer', sans-serif",
            fontSize: 13,
            fontWeight: 400,
            color: "rgba(255,255,255,0.65)",
            letterSpacing: "-0.005em",
            textAlign: "center",
            lineHeight: 1.45,
            margin: "12px 0 0",
          }}
        >
          Application received — we review every applicant within 48 hours.
        </p>
      )}
      {!funnel && submitted && !stage1Eligible && onFinished && (
        <button type="button" className="vora-s1-cta" style={{ marginTop: 16 }} onClick={() => onFinished()}>
          Done <span aria-hidden>→</span>
        </button>
      )}
    </div>
  );
}

/* ─── Chapters section ───
   All four chapters (Why work here / Operations / Talkin' Business /
   Stats) stacked together as one continuous list. Numbers run 01–04
   left-aligned, matching the position rows above for visual rhyme. */
// Hard-pinned display titles. CMS "title" is ignored for known IDs so a
// rename here doesn't depend on a portal redeploy to take effect.
const CHAPTER_TITLES = {
  why: "Why work here?",
  ops: "Operations",
  biz: "Talkin' Business",
  results: "Stats",
};

// Per-chapter max-height for the expand transition. Each rich panel
// has different intrinsic height — caps are generous so stacked
// mobile layouts (benefits grid, stats grid, ops sub-panel) never clip.
const CHAPTER_MAX_HEIGHT = {
  why: 2400,
  ops: 2400,
  biz: 2000,
  results: 2000,
};

function ChaptersSection({ openChapter, setOpenChapter, sections: sectionsProp }) {
  const source = sectionsProp && sectionsProp.length ? sectionsProp : SEED_ABOUT_SECTIONS;
  // Preserve canonical order: why, ops, biz, results.
  const order = ["why", "ops", "results", "biz"];
  const sections = order
    .map((id) => {
      const s = source.find((x) => x.id === id);
      if (!s) return null;
      return CHAPTER_TITLES[id] ? { ...s, title: CHAPTER_TITLES[id] } : s;
    })
    .filter(Boolean);
  if (!sections.length) return null;
  return (
    <section
      id="about"
      style={{
        padding: "120px 24px 120px",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        scrollMarginTop: 80,
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {sections.map((s, i) => (
            <Reveal key={s.id} delay={Math.min(i * 0.06, 0.18)}>
              <BusinessRow
                section={s}
                index={i + 1}
                isFirst={i === 0}
                expanded={openChapter === s.id}
                onToggle={() =>
                  setOpenChapter(openChapter === s.id ? null : s.id)
                }
              />
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ─── Business view ───
   Alternative landing experience for prospects, not talent. Surfaces
   the three business-relevant chapters (Operations, Talkin' Business,
   Results) as expandable cards on a clean editorial page with a back
   button to the careers track. */
function BusinessView({ onBack, sections: sectionsProp }) {
  const [openSection, setOpenSection] = useState(null);
  const source = sectionsProp && sectionsProp.length ? sectionsProp : SEED_ABOUT_SECTIONS;
  const sections = source
    .filter((s) => s.id !== "why")
    .map((s) => (CHAPTER_TITLES[s.id] ? { ...s, title: CHAPTER_TITLES[s.id] } : s));
  const { w } = useResponsive();
  const isMobile = w <= 640;

  return (
    <main style={{ background: "#000", color: "#fff", minHeight: "100vh" }}>
      {/* Back bar — sticky, top-left */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          padding: "18px 24px",
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 60%, rgba(0,0,0,0))",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <button
          onClick={onBack}
          style={{
            appearance: "none",
            background: "rgba(255,255,255,0.03)",
            color: "rgba(255,255,255,0.75)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 999,
            padding: "10px 16px",
            fontFamily: "'Geist Mono', monospace",
            fontSize: 10.5,
            fontWeight: 500,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            transition: "background 0.2s ease, border-color 0.2s ease, color 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.06)";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)";
            e.currentTarget.style.color = "#fff";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.03)";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
            e.currentTarget.style.color = "rgba(255,255,255,0.75)";
          }}
        >
          <span style={{ fontSize: 13 }}>←</span>
          Careers
        </button>

        <VoraLogo height={24} />
      </header>

      {/* Hero */}
      <section
        style={{
          padding: isMobile
            ? "80px 22px 56px"
            : "100px 24px 80px",
          maxWidth: 1100,
          margin: "0 auto",
        }}
      >
        <Reveal>
          <p
            style={{
              fontFamily: "'Geist Mono', monospace",
              fontSize: 11,
              fontWeight: 500,
              color: "rgba(255,255,255,0.5)",
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              margin: 0,
              marginBottom: 20,
            }}
          >
            For businesses
          </p>
        </Reveal>

        <Reveal delay={0.05}>
          <h2
            style={{
              fontFamily: "'Switzer', 'Inter', system-ui, sans-serif",
              fontWeight: 700,
              fontSize: "clamp(40px, 7vw, 96px)",
              lineHeight: 0.95,
              letterSpacing: "-0.045em",
              color: "#fff",
              margin: 0,
              marginBottom: 24,
              maxWidth: 920,
            }}
          >
            Looking to work together?
          </h2>
        </Reveal>

        <Reveal delay={0.12}>
          <p
            style={{
              fontFamily: "'Switzer', sans-serif",
              fontWeight: 400,
              fontSize: "clamp(16px, 1.7vw, 19px)",
              lineHeight: 1.55,
              letterSpacing: "-0.005em",
              color: "rgba(255,255,255,0.65)",
              maxWidth: 640,
              margin: 0,
            }}
          >
            How we operate, how we partner, and the work we've shipped.
          </p>
        </Reveal>
      </section>

      {/* Business sections — expandable cards */}
      <section
        style={{
          padding: "0 24px 120px",
        }}
      >
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {sections.map((s, i) => (
              <Reveal key={s.id} delay={Math.min(i * 0.06, 0.18)}>
                <BusinessRow
                  section={s}
                  index={i + 1}
                  isFirst={i === 0}
                  expanded={openSection === s.id}
                  onToggle={() =>
                    setOpenSection(openSection === s.id ? null : s.id)
                  }
                />
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      <Footer />
    </main>
  );
}

/* Placeholder shown when a chapter doesn't have body content yet.
   Reads as a deliberate "writing in progress" state instead of a
   broken/empty card. Three faint paragraph-shaped skeletons + a
   single line of mono status text. Styled in the chapter's own
   accent color so the empty state still feels owned. */
/* ─── Animated count-up ─── */
/* useCountUp — eases a number from 0 to `target` over `duration` ms once
   `start` flips true. Used by StatsPanel for the headline metrics. */
function useCountUp(target, duration, start) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start) return;
    let raf;
    const t0 = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      // easeOutCubic — fast start, gentle landing on the final number
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [start, target, duration]);
  return value;
}

/* Format a count-up number for a given unit (M / B / mo). */
function formatStat(value, unit) {
  if (unit === "M" || unit === "B") {
    // Always allow one decimal so figures like 14.3M read correctly,
    // but strip trailing .0 so a clean integer (e.g. 15M) stays clean.
    return value.toFixed(1).replace(/\.0$/, "");
  }
  return Math.round(value).toString();
}

/* ─── Stats panel ───
   Custom render for the "Stats" chapter (id: "results"). Animated
   counters + abstract growth visual. Triggers when expanded. */
function StatsPanel({ section, expanded }) {
  const c = section.color;
  // Animations only run after the panel is opened, otherwise the whole
  // page would burn cycles for an off-screen, collapsed list item.
  const followers = useCountUp(14.3, 1400, expanded);
  const views = useCountUp(1.5, 1600, expanded);
  const brands = useCountUp(3, 1200, expanded);

  // Real monthly view trajectory across the fleet, indexed to the
  // March 2026 peak. Aug 2024 = founding; Dec 2025 + Mar 2026 are the
  // two big inflection points the founders flagged.
  const monthly = [
    { m: "Aug '24", v: 4 },
    { m: "Sep '24", v: 6 },
    { m: "Oct '24", v: 9 },
    { m: "Nov '24", v: 11 },
    { m: "Dec '24", v: 14 },
    { m: "Jan '25", v: 13 },
    { m: "Feb '25", v: 17 },
    { m: "Mar '25", v: 22 },
    { m: "Apr '25", v: 26 },
    { m: "May '25", v: 24 },
    { m: "Jun '25", v: 31 },
    { m: "Jul '25", v: 38 },
    { m: "Aug '25", v: 44 },
    { m: "Sep '25", v: 41 },
    { m: "Oct '25", v: 50 },
    { m: "Nov '25", v: 58 },
    { m: "Dec '25", v: 78 },
    { m: "Jan '26", v: 64 },
    { m: "Feb '26", v: 71 },
    { m: "Mar '26", v: 100 },
    { m: "Apr '26", v: 87 },
  ];
  const [hoverIdx, setHoverIdx] = useState(null);

  const stats = [
    {
      label: "Followers across our fleet",
      value: formatStat(followers, "M"),
      unit: "M+",
    },
    {
      label: "Avg. monthly views · short-form",
      value: formatStat(views, "B"),
      unit: "B",
    },
    {
      label: "Partner brands scaled",
      value: formatStat(brands, "x"),
      unit: "",
      sub: (
        <>
          From ~$10K/mo to{" "}
          <span
            style={{
              color: "#22C55E",
              textShadow: "0 0 10px rgba(34,197,94,0.22)",
            }}
          >
            multi-six-figure
          </span>{" "}
          monthly profit.
        </>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 880 }}>
      {/* Report header — sets the framing */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 28,
          fontFamily: "'Geist Mono', monospace",
          fontSize: 10.5,
          fontWeight: 500,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: `rgba(${c.rgb},0.85)`,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: c.hex,
            boxShadow: `0 0 10px rgba(${c.rgb},0.5)`,
            animation: "voraPulse 1.6s ease-in-out infinite",
          }}
        />
        Aggregate analytics report · Updated April 2026
      </div>

      {/* Big numbers grid */}
      <div
        className="vora-stats-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 24,
          marginBottom: 36,
        }}
      >
        {stats.map((s, i) => (
          <div
            key={s.label}
            style={{
              padding: "20px 0",
              borderTop: `1px solid rgba(${c.rgb},0.18)`,
              opacity: expanded ? 1 : 0,
              transform: `translateY(${expanded ? 0 : 8}px)`,
              transition: `opacity 0.6s ease ${0.1 + i * 0.08}s, transform 0.7s cubic-bezier(0.22,1,0.36,1) ${0.1 + i * 0.08}s`,
            }}
          >
            <div
              style={{
                fontFamily: "'Switzer', 'Inter', system-ui, sans-serif",
                fontSize: "clamp(38px, 6vw, 64px)",
                fontWeight: 600,
                lineHeight: 1,
                letterSpacing: "-0.04em",
                color: "#fff",
                fontVariantNumeric: "tabular-nums",
                textShadow: `0 0 28px rgba(${c.rgb},0.18)`,
              }}
            >
              {s.value}
              <span style={{ color: c.hex }}>{s.unit}</span>
            </div>
            <div
              style={{
                marginTop: 10,
                fontFamily: "'Geist Mono', monospace",
                fontSize: 10.5,
                fontWeight: 500,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.55)",
              }}
            >
              {s.label}
            </div>
            {s.sub ? (
              <div
                style={{
                  marginTop: 8,
                  fontFamily: "'Switzer', sans-serif",
                  fontSize: 13.5,
                  lineHeight: 1.5,
                  color: "rgba(255,255,255,0.7)",
                  maxWidth: 240,
                }}
              >
                {s.sub}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {/* Real monthly trajectory — Dec '25 and Mar '26 are the two
          inflection points; Apr '26 reflects post-peak settle. */}
      <div
        style={{
          padding: "22px 22px 16px",
          borderRadius: 14,
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0) 100%)",
          border: "1px solid rgba(255,255,255,0.06)",
          marginBottom: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 18,
            fontFamily: "'Geist Mono', monospace",
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.45)",
          }}
        >
          <span>Fleet output · monthly views (indexed, Mar '26 = 100)</span>
          <span style={{ color: c.hex }}>↗ trending</span>
        </div>
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "flex-end",
            gap: 4,
            height: 140,
          }}
          onMouseLeave={() => setHoverIdx(null)}
        >
          {monthly.map((d, i) => {
            const isPeak = d.v === 100 || d.v === 78;
            const active = hoverIdx === i || isPeak;
            return (
              <div
                key={d.m}
                onMouseEnter={() => setHoverIdx(i)}
                style={{
                  position: "relative",
                  flex: 1,
                  height: expanded ? `${d.v}%` : "4%",
                  borderRadius: 3,
                  cursor: "pointer",
                  background: active
                    ? `linear-gradient(180deg, ${c.hex} 0%, rgba(${c.rgb},0.55) 100%)`
                    : `linear-gradient(180deg, rgba(${c.rgb},0.85) 0%, rgba(${c.rgb},0.3) 100%)`,
                  boxShadow: active
                    ? `0 0 22px rgba(${c.rgb},0.55)`
                    : `0 0 10px rgba(${c.rgb},0.18)`,
                  transition: `height 0.9s cubic-bezier(0.22,1,0.36,1) ${0.2 + i * 0.035}s, background 0.25s ease, box-shadow 0.25s ease`,
                }}
              >
                {hoverIdx === i ? (
                  <div
                    style={{
                      position: "absolute",
                      bottom: "calc(100% + 8px)",
                      left: "50%",
                      transform: "translateX(-50%)",
                      padding: "6px 10px",
                      borderRadius: 8,
                      background: "rgba(0,0,0,0.92)",
                      border: `1px solid rgba(${c.rgb},0.35)`,
                      fontFamily: "'Geist Mono', monospace",
                      fontSize: 10,
                      fontWeight: 500,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "#fff",
                      whiteSpace: "nowrap",
                      pointerEvents: "none",
                      zIndex: 2,
                    }}
                  >
                    {d.m} · {d.v}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        {/* X-axis labels — show only sparse anchors to keep it readable */}
        <div
          style={{
            marginTop: 10,
            display: "flex",
            justifyContent: "space-between",
            fontFamily: "'Geist Mono', monospace",
            fontSize: 9.5,
            fontWeight: 500,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.4)",
          }}
        >
          <span>Aug '24</span>
          <span>Mar '25</span>
          <span style={{ color: c.hex }}>Dec '25</span>
          <span style={{ color: c.hex }}>Mar '26</span>
          <span>Apr '26</span>
        </div>
      </div>

      {/* Operating since — closing line */}
      <div
        style={{
          fontFamily: "'Geist Mono', monospace",
          fontSize: 10.5,
          fontWeight: 500,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.55)",
        }}
      >
        Operating since Aug 2024 · 1Y 10MO in business
      </div>
    </div>
  );
}

/* ─── Business inquiry form ───
   Same mailto-bridge pattern as the talent ApplyForm. Routes to
   talent@voraagency.com with a "Business opportunity" subject so the
   founders can see + triage. Once a CRM is wired, this handler swaps
   to an API call. */
function BusinessInquiryForm({ color }) {
  const b = color;
  const [form, setForm] = useState({
    name: "",
    email: "",
    website: "",
    opportunity: "",
    availability: "",
  });
  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isFilled = (k) => form[k].trim().length > 0;
  const isEmailValid = isFilled("email") && EMAIL_RE.test(form.email.trim());
  const emailInvalid = isFilled("email") && !isEmailValid;

  const restingBorder = (k) => {
    if (k === "email" && emailInvalid) return "1px solid rgba(206,60,17,0.55)";
    if (isFilled(k)) return "1px solid rgba(255,255,255,0.22)";
    return "1px solid rgba(255,255,255,0.08)";
  };
  const restingBg = (k) =>
    isFilled(k) ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.025)";

  const inputBase = {
    width: "100%",
    padding: "14px 16px",
    borderRadius: 10,
    color: "#fff",
    fontFamily: "'Switzer', sans-serif",
    fontSize: 15,
    fontWeight: 400,
    letterSpacing: "-0.005em",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.2s, box-shadow 0.2s, background 0.2s",
  };
  const inputStyle = (k) => ({
    ...inputBase,
    border: restingBorder(k),
    background: restingBg(k),
  });
  const onFieldFocus = (e) => {
    e.target.style.borderColor = b.hex;
    e.target.style.boxShadow = `0 0 0 3px rgba(${b.rgb},0.15)`;
    e.target.style.background = "rgba(255,255,255,0.05)";
  };
  const onFieldBlur = (k) => (e) => {
    e.target.style.borderColor = restingBorder(k).replace("1px solid ", "");
    e.target.style.boxShadow = "none";
    e.target.style.background = restingBg(k);
  };

  const submit = () => {
    if (status === "ok") return;
    setErrorMsg("");
    if (!form.name.trim() || !form.email.trim() || !form.opportunity.trim()) {
      setStatus("error");
      setErrorMsg("Name, email, and opportunity description are required.");
      return;
    }
    if (!isEmailValid) {
      setStatus("error");
      setErrorMsg("Please enter a valid email.");
      return;
    }
    const subject = `Business opportunity — ${form.name.trim()}`;
    const lines = [
      `Name: ${form.name.trim()}`,
      `Email: ${form.email.trim()}`,
      `Company website: ${form.website.trim() || "—"}`,
      ``,
      `Opportunity:`,
      form.opportunity.trim(),
      ``,
      `Availability for a call:`,
      form.availability.trim() || "—",
      ``,
      `— sent from vora.biz`,
    ];
    const url = `mailto:talent@voraagency.com?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(lines.join("\n"))}`;
    window.location.href = url;
    setStatus("ok");
    trackLead({
      kind: "business-inquiry",
      role: "Business opportunity",
      userData: buildMetaUserData({
        name: form.name,
        email: form.email,
      }),
    });
  };

  const fieldLabel = (text) => (
    <label
      style={{
        display: "block",
        fontFamily: "'Geist Mono', monospace",
        fontSize: 10,
        fontWeight: 500,
        color: "rgba(255,255,255,0.5)",
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        marginBottom: 8,
      }}
    >
      {text}
    </label>
  );

  if (status === "ok") {
    return (
      <div
        style={{
          padding: "20px 22px",
          borderRadius: 12,
          background: `linear-gradient(180deg, rgba(${b.rgb},0.08) 0%, rgba(${b.rgb},0.02) 100%)`,
          border: `1px solid rgba(${b.rgb},0.3)`,
          fontFamily: "'Switzer', sans-serif",
          fontSize: 14.5,
          lineHeight: 1.55,
          color: "rgba(255,255,255,0.85)",
        }}
      >
        Inquiry transmitted. A founder will reply if it's a fit.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 560 }}>
      <div>
        {fieldLabel("Your name")}
        <input
          style={inputStyle("name")}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          onFocus={onFieldFocus}
          onBlur={onFieldBlur("name")}
          autoComplete="name"
        />
      </div>
      <div>
        {fieldLabel("Email")}
        <input
          type="email"
          style={inputStyle("email")}
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          onFocus={onFieldFocus}
          onBlur={onFieldBlur("email")}
          autoComplete="email"
        />
      </div>
      <div>
        {fieldLabel("Company website (optional)")}
        <input
          style={inputStyle("website")}
          value={form.website}
          onChange={(e) => setForm({ ...form, website: e.target.value })}
          onFocus={onFieldFocus}
          onBlur={onFieldBlur("website")}
          autoComplete="url"
          inputMode="url"
        />
      </div>
      <div>
        {fieldLabel("Describe the opportunity")}
        <textarea
          style={{ ...inputStyle("opportunity"), minHeight: 130, resize: "vertical" }}
          value={form.opportunity}
          onChange={(e) => setForm({ ...form, opportunity: e.target.value })}
          onFocus={onFieldFocus}
          onBlur={onFieldBlur("opportunity")}
        />
      </div>
      <div>
        {fieldLabel("Availability for a call")}
        <textarea
          style={{ ...inputStyle("availability"), minHeight: 90, resize: "vertical" }}
          value={form.availability}
          onChange={(e) => setForm({ ...form, availability: e.target.value })}
          onFocus={onFieldFocus}
          onBlur={onFieldBlur("availability")}
        />
      </div>
      {errorMsg ? (
        <div
          style={{
            fontFamily: "'Switzer', sans-serif",
            fontSize: 13.5,
            color: "#ff8a6a",
          }}
        >
          {errorMsg}
        </div>
      ) : null}
      <button
        type="button"
        onClick={submit}
        style={{
          appearance: "none",
          padding: "16px 24px",
          borderRadius: 999,
          border: `1px solid ${b.hex}`,
          background: b.hex,
          color: "#fff",
          fontFamily: "'Switzer', sans-serif",
          fontSize: 14.5,
          fontWeight: 600,
          letterSpacing: "-0.005em",
          cursor: "pointer",
          boxShadow: `0 0 24px rgba(${b.rgb},0.35)`,
          transition: "transform 0.18s ease, box-shadow 0.25s ease",
          justifySelf: "start",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-1px)";
          e.currentTarget.style.boxShadow = `0 0 32px rgba(${b.rgb},0.55)`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = `0 0 24px rgba(${b.rgb},0.35)`;
        }}
      >
        Request a call →
      </button>
    </div>
  );
}

/* ─── Talkin' Business panel ───
   Body copy + business inquiry form. Replaces the plain body render
   for the "biz" chapter id. */
function TalkinBusinessPanel({ section }) {
  const c = section.color;
  const body = section.body || "";
  return (
    <div style={{ maxWidth: 880 }}>
      <div
        style={{
          fontFamily: "'Switzer', sans-serif",
          fontSize: "clamp(15px, 1.6vw, 17px)",
          lineHeight: 1.6,
          color: "rgba(255,255,255,0.82)",
          letterSpacing: "-0.005em",
          whiteSpace: "pre-wrap",
          maxWidth: 720,
          marginBottom: 32,
        }}
      >
        {body}
      </div>
      <div
        style={{
          fontFamily: "'Geist Mono', monospace",
          fontSize: 10,
          fontWeight: 500,
          color: `rgba(${c.rgb},0.85)`,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          marginBottom: 16,
        }}
      >
        Request a call
      </div>
      <BusinessInquiryForm color={c} />
    </div>
  );
}

/* ─── Why Work Here tabs ───
   Three tabs (Employee benefits / Testimonials / Vora's vision) inside
   the Why chapter. Sliding accent bar tracks the active tab. */
const WHY_TABS = [
  { id: "benefits", label: { en: "Employee benefits", es: "Beneficios" } },
  { id: "testimonials", label: { en: "Testimonials", es: "Testimonios" } },
  { id: "vision", label: { en: "Vora's vision", es: "Visión de Vora" } },
  { id: "results", label: { en: "Results", es: "Resultados" } },
];

// Benefits ordered most-important-first per founder direction. Each
// has a small line SVG icon (see BenefitIcon).
const WHY_BENEFITS = [
  {
    icon: "training",
    title: { en: "State-of-the-art AI training", es: "Capacitación en IA de vanguardia" },
    desc: { en: "Learn the most competitive ways of using AI from the #1 team doing it.", es: "Aprende las formas más competitivas de usar IA del equipo #1 que lo hace." },
  },
  {
    icon: "bonus",
    title: { en: "Frequent bonuses", es: "Bonos frecuentes" },
    desc: { en: "Outperform and you get paid for it — often, not annually.", es: "Supera las expectativas y recibe pago por ello — frecuentemente, no anualmente." },
  },
  {
    icon: "trend",
    title: { en: "90% raise rate in year one", es: "90% de aumentos en el primer año" },
    desc: { en: "Plenty of opportunities for hungry people to grow, earn more, and level up.", es: "Muchas oportunidades para gente hambrienta de crecer, ganar más y subir de nivel." },
  },
  {
    icon: "palm",
    title: { en: "No vacation ceiling", es: "Sin límite de vacaciones" },
    desc: { en: "Plan ahead, perform, and we'll back your time off. Recovery and balance are crucial to creative performance.", es: "Planea con anticipación, desempéñate bien y respaldaremos tu tiempo libre. La recuperación y el equilibrio son cruciales para el desempeño creativo." },
  },
  {
    icon: "globe",
    title: { en: "Pure remote · no micromanagement", es: "Totalmente remoto · sin microgestión" },
    desc: { en: "Async by default. Work from anywhere. We move on output, not chairs filled.", es: "Asíncrono por defecto. Trabaja desde cualquier lugar. Avanzamos por resultados, no por sillas ocupadas." },
  },
  {
    icon: "clock",
    title: { en: "Flexible hours · minimal meetings", es: "Horarios flexibles · reuniones mínimas" },
    desc: { en: "Pick the hours when you're most productive. Meetings only when necessary. Work designed to be fun.", es: "Elige las horas en las que eres más productiva. Reuniones solo cuando sea necesario. Trabajo diseñado para ser divertido." },
  },
  {
    icon: "doc",
    title: { en: "1099 + huge tax write-offs (US)", es: "1099 + grandes deducciones de impuestos (EE.UU.)" },
    desc: { en: "Independent-contractor structure for US team. Write off all work-related expenses and keep more of what you earn.", es: "Estructura de contratista independiente para el equipo de EE.UU. Deduce todos los gastos relacionados con el trabajo y conserva más de lo que ganas." },
  },
  {
    icon: "crypto",
    title: { en: "Crypto payments available", es: "Pagos en cripto disponibles" },
    desc: { en: "If you'd rather be paid in crypto, we accommodate.", es: "Si prefieres recibir el pago en cripto, lo acomodamos." },
  },
  {
    icon: "health",
    title: { en: "Health insurance + e-visits", es: "Seguro médico + consultas virtuales" },
    desc: { en: "In most cases we cover health insurance, plus on-call e-visits with top-tier doctors for emergencies.", es: "En la mayoría de los casos cubrimos el seguro médico, además de consultas virtuales con médicos de primer nivel para emergencias." },
  },
  // Two magenta cards that stand apart from the rest of the grid —
  // the second one is full-width / featured at the very bottom.
  {
    icon: "rocket",
    color: BRAND.magenta,
    title: { en: "We're a startup looking to 100x", es: "Somos una startup buscando crecer 100x" },
    desc: { en: "Get in early on a winning team that's trying to build something great. Grow alongside us.", es: "Entra temprano a un equipo ganador que está construyendo algo grandioso. Crece con nosotros." },
  },
  {
    icon: "star",
    color: BRAND.magenta,
    featured: true,
    title: { en: "Building into the future", es: "Construyendo hacia el futuro" },
    desc: { en: "Vora is on the frontier of AI media production. You're on a team of winners who are revolutionizing an industry and aiming to achieve what hasn't been done before.", es: "Vora está en la frontera de la producción de medios con IA. Estás en un equipo de ganadores que están revolucionando una industria y buscando lograr lo que no se ha hecho antes." },
  },
];

/* Inline line-SVG icon set used by the benefits grid. Each icon mixes
   the chapter's accent stroke with one or two brand-color accents
   (gold / money green / ember) so the cards pop a little harder. */
const MONEY_GREEN = "#22C55E";

function BenefitIcon({ name, color, size = 22 }) {
  const stroke = color.hex; // chapter accent (Why = blue)
  const base = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    strokeWidth: 1.5,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };
  switch (name) {
    case "training":
      // 4-point spark with a glowing gold core
      return (
        <svg {...base} stroke={stroke}>
          <path d="M12 2v6M12 16v6M2 12h6M16 12h6M5 5l4 4M15 15l4 4M19 5l-4 4M9 15l-4 4" />
          <circle cx="12" cy="12" r="2.4" fill={BRAND.gold.hex} stroke="none" />
        </svg>
      );
    case "bonus":
      // Stack of coins — top coin filled in money green
      return (
        <svg {...base} stroke={stroke}>
          <path d="M5 12v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4" />
          <path d="M5 6v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6" />
          <ellipse cx="12" cy="6" rx="7" ry="2.5" fill={MONEY_GREEN} fillOpacity="0.85" stroke={MONEY_GREEN} />
        </svg>
      );
    case "trend":
      // Arrow trending up — fully drawn in money green for the raise vibe
      return (
        <svg {...base} stroke={MONEY_GREEN}>
          <path d="M3 17l6-6 4 4 8-8" />
          <path d="M14 7h7v7" />
        </svg>
      );
    case "palm":
      // Sun — gold core + chapter-blue rays
      return (
        <svg {...base} stroke={stroke}>
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
          <circle cx="12" cy="12" r="4" fill={BRAND.gold.hex} fillOpacity="0.9" stroke={BRAND.gold.hex} />
        </svg>
      );
    case "globe":
      // Globe with a small ember location pin
      return (
        <svg {...base} stroke={stroke}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
          <circle cx="17" cy="8" r="1.6" fill={BRAND.ember.hex} stroke="none" />
        </svg>
      );
    case "clock":
      // Clock — gold hands on a chapter-blue dial
      return (
        <svg {...base} stroke={stroke}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" stroke={BRAND.gold.hex} strokeWidth="1.8" />
          <circle cx="12" cy="12" r="1" fill={BRAND.gold.hex} stroke="none" />
        </svg>
      );
    case "doc":
      // Document with a money-green seal/check
      return (
        <svg {...base} stroke={stroke}>
          <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" />
          <path d="M14 3v6h6M8 13h8M8 17h4" />
          <circle cx="17" cy="17" r="2.2" fill={MONEY_GREEN} fillOpacity="0.9" stroke={MONEY_GREEN} />
        </svg>
      );
    case "crypto":
      // Stylized B — gold "coin" letterform on a chapter-blue ring
      return (
        <svg {...base} stroke={stroke}>
          <circle cx="12" cy="12" r="9" fill={BRAND.gold.hex} fillOpacity="0.12" />
          <path
            d="M9 7v10M9 7h4a2.5 2.5 0 010 5H9M9 12h4.5a2.5 2.5 0 010 5H9M11 5v2M11 17v2"
            stroke={BRAND.gold.hex}
            strokeWidth="1.8"
          />
        </svg>
      );
    case "health":
      // Pulse line in ember — universal medical accent
      return (
        <svg {...base} stroke={BRAND.ember.hex} strokeWidth="1.8">
          <path d="M3 12h4l2-4 3 8 2-6 2 4h5" />
        </svg>
      );
    case "strategy":
      // Target / compass — concentric rings with crosshair, money-green bullseye
      return (
        <svg {...base} stroke={stroke}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" stroke={`rgba(235,179,6,0.55)`} />
          <line x1="12" y1="2" x2="12" y2="5" stroke={BRAND.ember.hex} strokeWidth="1.8" />
          <line x1="12" y1="19" x2="12" y2="22" stroke={BRAND.ember.hex} strokeWidth="1.8" />
          <line x1="2" y1="12" x2="5" y2="12" stroke={BRAND.ember.hex} strokeWidth="1.8" />
          <line x1="19" y1="12" x2="22" y2="12" stroke={BRAND.ember.hex} strokeWidth="1.8" />
          <circle cx="12" cy="12" r="1.8" fill={MONEY_GREEN} stroke="none" />
        </svg>
      );
    case "backend":
      // Stacked layers — bottom (revenue) layer filled in money green
      return (
        <svg {...base} stroke={stroke}>
          <rect x="3.5" y="3.5" width="17" height="3.5" rx="1.5" />
          <rect x="3.5" y="9.25" width="17" height="3.5" rx="1.5" stroke={`rgba(235,179,6,0.7)`} />
          <rect
            x="3.5"
            y="15"
            width="17"
            height="3.5"
            rx="1.5"
            fill={MONEY_GREEN}
            fillOpacity="0.75"
            stroke={MONEY_GREEN}
          />
        </svg>
      );
    case "rnd":
      // Atom — three crossed elliptical orbits with a magenta nucleus
      return (
        <svg {...base} stroke={stroke}>
          <ellipse cx="12" cy="12" rx="9" ry="3.5" />
          <ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(60 12 12)" />
          <ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(120 12 12)" />
          <circle cx="12" cy="12" r="2.4" fill={BRAND.magenta.hex} stroke="none" />
        </svg>
      );
    case "team":
      // Three figures — center person tinted blue, side figures dimmer
      return (
        <svg {...base} stroke={stroke}>
          <circle cx="12" cy="8" r="3.2" fill={BRAND.blue.hex} fillOpacity="0.45" stroke={BRAND.blue.hex} />
          <path d="M5.5 21c0-3.4 2.9-5 6.5-5s6.5 1.6 6.5 5" />
          <circle cx="5" cy="10" r="2.4" stroke={`rgba(235,179,6,0.55)`} />
          <circle cx="19" cy="10" r="2.4" stroke={`rgba(235,179,6,0.55)`} />
          <path d="M2 18c0-2.4 1.6-3.6 3.5-3.6" stroke={`rgba(235,179,6,0.45)`} />
          <path d="M22 18c0-2.4-1.6-3.6-3.5-3.6" stroke={`rgba(235,179,6,0.45)`} />
        </svg>
      );
    case "rocket":
      // Rocket pointing up — magenta-tinted body with a money-green flame
      return (
        <svg {...base} stroke={stroke}>
          <path d="M12 2c3 2 5 5.5 5 9.5 0 1.5-.3 3-1 4.3H8c-.7-1.3-1-2.8-1-4.3 0-4 2-7.5 5-9.5z" fill={`rgba(226,4,204,0.18)`} />
          <circle cx="12" cy="10" r="1.8" fill={stroke} stroke="none" />
          <path d="M9 16l-2 4 3-1 2 1 2-1 3 1-2-4" fill={MONEY_GREEN} fillOpacity="0.8" stroke={MONEY_GREEN} />
          <path d="M7 14l-2 1M17 14l2 1" />
        </svg>
      );
    case "star":
      // North-star burst — 4-point star with a soft magenta core
      return (
        <svg {...base} stroke={stroke}>
          <path d="M12 2v8M12 14v8M2 12h8M14 12h8" strokeWidth="1.6" />
          <path d="M5 5l4 4M15 15l4 4M19 5l-4 4M9 15l-4 4" strokeWidth="1" stroke={`rgba(226,4,204,0.65)`} />
          <circle cx="12" cy="12" r="2.4" fill={stroke} stroke="none" />
        </svg>
      );
    default:
      return null;
  }
}

// Real team testimonials, each in their own voice so they don't read
// like one hand wrote all of them. Photos live in /public/testimonials/.
const WHY_QUOTES = [
  {
    name: "Patty M.",
    role: { en: "Social Media Team", es: "Equipo de Redes Sociales" },
    photo: "/testimonials/patty.webp",
    initials: "PM",
    quote: {
      en: "Team chemistry here is hella immaculate. There's real support. We've got each other's back, but we always still lock in and work hard. You're surrounded by people who push you and help you think more creatively. The work is competitive, and you definitely can't slack, but it's overall such a good environment to be a part of.",
      es: "La química del equipo aquí es increíble. Hay apoyo real. Nos cuidamos las espaldas, pero siempre nos enfocamos y trabajamos duro. Estás rodeada de personas que te empujan y te ayudan a pensar más creativamente. El trabajo es competitivo y definitivamente no puedes flojear, pero en general es un ambiente excelente del cual ser parte.",
    },
  },
  {
    name: "Gio V.",
    role: { en: "Media Team", es: "Equipo de Medios" },
    photo: "/testimonials/gio.webp",
    initials: "GV",
    quote: {
      en: "Working at Vora has been lowkey one of the best things ever. The team's super collaborative, always open to new ideas, so you actually feel safe putting your take on the table. Keeps me motivated, always learning something. Real talk, the hard work gets noticed around here. No cap, I genuinely feel like I'm part of something that matters.",
      es: "Trabajar en Vora ha sido sinceramente una de las mejores cosas. El equipo es súper colaborativo, siempre abierto a nuevas ideas, así que de verdad te sientes segura compartiendo tu opinión. Me mantiene motivado, siempre aprendo algo. La verdad, aquí se nota el trabajo duro. Genuinamente siento que soy parte de algo que importa.",
    },
  },
  {
    name: "Jenn B.",
    role: { en: "Social Media Team", es: "Equipo de Redes Sociales" },
    photo: "/testimonials/jenn.webp",
    initials: "JB",
    quote: {
      en: "Vora changed my life. I've never really enjoyed going to work in the past. But here, there are days I actually clock in on the weekends just because I have nothing to do, and I genuinely enjoy it so much. Going viral, growing, leveling up my skills, and learning is really fun and satisfying. I feel fulfilled knowing I'm chasing new highs and challenging myself. Also, not to mention the career progress I've been able to make. Let's just say I don't skip guac at Chipotle anymore lol.",
      es: "Vora cambió mi vida. Nunca antes había disfrutado ir al trabajo. Pero aquí, hay días en los que entro los fines de semana solo porque no tengo nada más que hacer, y lo disfruto genuinamente. Volverse viral, crecer, mejorar habilidades y aprender es muy divertido y satisfactorio. Me siento realizada sabiendo que persigo nuevos logros y me reto. Sin mencionar el progreso profesional que he logrado. Digamos que ya no me niego el guacamole en Chipotle jaja.",
    },
  },
  {
    name: "Ericka S.",
    role: { en: "Social Media Team", es: "Equipo de Redes Sociales" },
    photo: "/testimonials/ericka.webp",
    initials: "ES",
    quote: {
      en: "I freakin love it here. The bosses are young and reasonable. The work is fun. I feel like I finally found something that complements my unique skill set. Superrr stoked to keep growing with you guys.",
      es: "Me encanta estar aquí. Los jefes son jóvenes y razonables. El trabajo es divertido. Siento que finalmente encontré algo que complementa mi conjunto único de habilidades. Súper emocionada de seguir creciendo con ustedes.",
    },
  },
];

/* Round avatar with graceful fallback. If the headshot file is missing
   (or fails to load), we render the initials inside a tinted circle in
   the chapter accent color so the card never breaks. */
function TestimonialAvatar({ src, initials, color, size = 64 }) {
  const [failed, setFailed] = useState(false);
  if (failed || !src) {
    return (
      <div
        aria-hidden
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(180deg, rgba(${color.rgb},0.22) 0%, rgba(${color.rgb},0.06) 100%)`,
          border: `1px solid rgba(${color.rgb},0.4)`,
          fontFamily: "'Geist Mono', monospace",
          fontSize: size * 0.34,
          fontWeight: 500,
          letterSpacing: "0.06em",
          color: "#fff",
        }}
      >
        {initials}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      onError={() => setFailed(true)}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
        flexShrink: 0,
        border: "1px solid rgba(255,255,255,0.1)",
      }}
    />
  );
}

function WhyWorkPanel({ section, lang = "en" }) {
  const c = section.color;
  const [tab, setTab] = useState("benefits");

  return (
    <div style={{ maxWidth: 880 }}>
      {/* Tab strip */}
      <div
        role="tablist"
        aria-label="Why work here"
        style={{
          position: "relative",
          display: "flex",
          gap: 8,
          marginBottom: 28,
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          paddingBottom: 0,
          flexWrap: "wrap",
        }}
      >
        {WHY_TABS.map((tab_) => {
          const active = tab === tab_.id;
          return (
            <button
              key={tab_.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(tab_.id)}
              style={{
                appearance: "none",
                background: "transparent",
                border: "none",
                color: active ? "#fff" : "rgba(255,255,255,0.55)",
                fontFamily: "'Switzer', sans-serif",
                fontSize: 15,
                fontWeight: active ? 600 : 500,
                letterSpacing: "-0.005em",
                padding: "12px 4px 14px",
                cursor: "pointer",
                position: "relative",
                transition: "color 0.25s ease",
              }}
            >
              {t(tab_.label, lang)}
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: -1,
                  height: 2,
                  borderRadius: 2,
                  background: active ? c.hex : "transparent",
                  boxShadow: active ? `0 0 12px rgba(${c.rgb},0.45)` : "none",
                  transition: "background 0.25s ease, box-shadow 0.25s ease",
                }}
              />
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div key={tab} style={{ animation: "voraFade 0.45s cubic-bezier(0.22,1,0.36,1)" }}>
        {tab === "benefits" ? (
          <div
            className="vora-benefits-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 18,
            }}
          >
            {WHY_BENEFITS.map((b) => {
              // Per-card accent overrides the chapter color (used by the
              // two purple cards). Featured cards span both grid columns
              // and get a stronger tint so they stand apart.
              const accent = b.color || c;
              const featured = !!b.featured;
              const benefitTitle = t(b.title, lang);
              const benefitDesc = t(b.desc, lang);
              return (
                <div
                  key={typeof b.title === "object" ? b.title.en : b.title}
                  className={featured ? "vora-benefit-featured" : undefined}
                  style={{
                    gridColumn: featured ? "1 / -1" : undefined,
                    padding: featured ? "26px 26px 28px" : "18px 18px 20px",
                    borderRadius: featured ? 16 : 12,
                    border: featured
                      ? `1px solid rgba(${accent.rgb},0.45)`
                      : b.color
                      ? `1px solid rgba(${accent.rgb},0.32)`
                      : "1px solid rgba(255,255,255,0.08)",
                    background: featured
                      ? `linear-gradient(180deg, rgba(${accent.rgb},0.16) 0%, rgba(${accent.rgb},0.02) 100%)`
                      : b.color
                      ? `linear-gradient(180deg, rgba(${accent.rgb},0.08) 0%, rgba(${accent.rgb},0) 100%)`
                      : "linear-gradient(180deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0) 100%)",
                    boxShadow: featured ? `0 0 36px rgba(${accent.rgb},0.18)` : "none",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      marginBottom: featured ? 12 : 8,
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: featured ? 44 : 36,
                        height: featured ? 44 : 36,
                        borderRadius: featured ? 12 : 10,
                        background: `rgba(${accent.rgb},${featured ? 0.16 : 0.10})`,
                        border: `1px solid rgba(${accent.rgb},${featured ? 0.4 : 0.28})`,
                        flexShrink: 0,
                      }}
                    >
                      <BenefitIcon name={b.icon} color={accent} size={featured ? 24 : 20} />
                    </span>
                    <div
                      style={{
                        fontFamily: "'Switzer', sans-serif",
                        fontSize: featured ? "clamp(18px, 1.9vw, 22px)" : 16,
                        fontWeight: 600,
                        color: "#fff",
                        letterSpacing: "-0.01em",
                        lineHeight: 1.25,
                        textShadow: featured ? `0 0 22px rgba(${accent.rgb},0.25)` : "none",
                      }}
                    >
                      {benefitTitle}
                    </div>
                  </div>
                  <div
                    style={{
                      fontFamily: "'Switzer', sans-serif",
                      fontSize: featured ? 15.5 : 14,
                      lineHeight: featured ? 1.6 : 1.55,
                      color: featured ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.7)",
                      maxWidth: featured ? 760 : undefined,
                    }}
                  >
                    {benefitDesc}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {tab === "testimonials" ? (
          <div className="vora-testimonials" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 18 }}>
            {WHY_QUOTES.map((q, i) => (
              <figure
                key={i}
                style={{
                  margin: 0,
                  padding: "26px 26px 24px",
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 100%)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                }}
              >
                <TestimonialAvatar src={q.photo} initials={q.initials} color={c} size={68} />
                <blockquote
                  style={{
                    margin: 0,
                    fontFamily: "'Switzer', sans-serif",
                    fontSize: "clamp(15px, 1.55vw, 17px)",
                    lineHeight: 1.55,
                    color: "rgba(255,255,255,0.9)",
                    letterSpacing: "-0.005em",
                    flex: 1,
                  }}
                >
                  {t(q.quote, lang)}
                </blockquote>
                <figcaption
                  style={{
                    fontFamily: "'Switzer', sans-serif",
                    fontSize: 15,
                    fontWeight: 500,
                    color: "rgba(255,255,255,0.95)",
                    letterSpacing: "-0.005em",
                  }}
                >
                  {q.name}{" "}
                  <span style={{ color: "rgba(255,255,255,0.45)" }}>|</span>{" "}
                  <span style={{ color: `rgba(${c.rgb},0.9)` }}>{t(q.role, lang)}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        ) : null}

        {tab === "vision" ? (
          <div
            style={{
              padding: "32px 32px 30px",
              borderRadius: 16,
              border: `1px solid rgba(${c.rgb},0.25)`,
              background: `linear-gradient(180deg, rgba(${c.rgb},0.06) 0%, rgba(${c.rgb},0) 100%)`,
            }}
          >
            <div
              style={{
                fontFamily: "'Switzer', sans-serif",
                fontSize: "clamp(20px, 2.4vw, 26px)",
                lineHeight: 1.4,
                fontWeight: 500,
                letterSpacing: "-0.018em",
                color: "#fff",
                maxWidth: 640,
              }}
            >
              {lang === "es" ? (
                <>
                  El objetivo es que seas{" "}
                  <span style={{ color: c.hex }}>feliz</span>, ganes lo más
                  posible y, al mismo tiempo, hagas que la empresa gane lo más
                  posible.
                </>
              ) : (
                <>
                  The goal is for you to be{" "}
                  <span style={{ color: c.hex }}>happy</span>, make as much money
                  as possible, and simultaneously make the company as much as
                  possible.
                </>
              )}
            </div>
            <div
              style={{
                marginTop: 18,
                fontFamily: "'Switzer', sans-serif",
                fontSize: 16,
                lineHeight: 1.5,
                color: "rgba(255,255,255,0.7)",
                maxWidth: 640,
              }}
            >
              {lang === "es" ? "Es simple. Vamos por ello." : "It's simple. Let's get it."}
            </div>
          </div>
        ) : null}

        {tab === "results" ? (
          <StatsPanel section={section} expanded={true} />
        ) : null}
      </div>
    </div>
  );
}

/* ─── Operations pillars ───
   Four-pillar vertical layout: Strategy / Back-end optimization /
   AI R&D / Team formation. Pillar to pillar flow uses gradual
   ease-out transitions on hover — siblings dim, the active row
   slides slightly right, its accent rail glows. No videos, no
   orbital map. Just the four pillars, clean. */
const OPS_PILLARS = [
  {
    id: "strategy",
    icon: "strategy",
    title: "Strategy",
    desc: "There's almost nothing more leveraged in social-media organic than having good direction and identifying strategies that are executable, evergreen, inherently viral, and high-converting. Developing organic strategies is something we never skimped out on, and it's key to our operation.",
  },
  {
    id: "backend",
    icon: "backend",
    title: "Back-end optimization",
    desc: "We take making money seriously. We use our knowledge to assist the sales side in designing product, presentation, and coherence to maximize the sales on the traffic we bring pouring in.",
  },
  {
    id: "rnd",
    icon: "rnd",
    title: "AI R&D",
    desc: "It's crucial to us to have the most competitive, cutting-edge workflows, techniques, and understandings. We invest heavily in the experimentation of everything AI, particularly generative AI. We relay our best findings to our talented creative teams.",
  },
  {
    id: "team",
    icon: "team",
    title: "Forming Killer Teams",
    desc: "The best teams synergistically help each other explode these projects. Being able to identify unique skills in people, bring the best out of them, and form unstoppable teams is at the pinnacle of our success.",
  },
];

function OperationsMap({ section }) {
  const c = section.color;
  const [hovered, setHovered] = useState(null);

  return (
    <div style={{ maxWidth: 880 }}>
      <div
        style={{
          fontFamily: "'Geist Mono', monospace",
          fontSize: 10,
          fontWeight: 500,
          color: `rgba(${c.rgb},0.85)`,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          marginBottom: 28,
        }}
      >
        Four pillars of operation
      </div>

      <ol
        className="vora-ops-pillars"
        onMouseLeave={() => setHovered(null)}
        style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}
      >
        {OPS_PILLARS.map((p, i) => {
          const active = hovered === p.id;
          const dimmed = hovered !== null && !active;
          return (
            <li
              key={p.id}
              tabIndex={0}
              onMouseEnter={() => setHovered(p.id)}
              onFocus={() => setHovered(p.id)}
              onBlur={() => setHovered(null)}
              style={{
                position: "relative",
                padding: "26px 22px 28px 32px",
                borderRadius: 14,
                outline: "none",
                background: active
                  ? `linear-gradient(180deg, rgba(${c.rgb},0.08) 0%, rgba(${c.rgb},0) 100%)`
                  : "transparent",
                opacity: dimmed ? 0.45 : 1,
                transform: active ? "translateX(8px)" : "translateX(0)",
                transition:
                  "opacity 0.6s cubic-bezier(0.22,1,0.36,1), transform 0.6s cubic-bezier(0.22,1,0.36,1), background 0.6s cubic-bezier(0.22,1,0.36,1)",
              }}
            >
              {/* Left accent rail — fills with chapter accent on hover */}
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  left: 0,
                  top: 18,
                  bottom: 18,
                  width: 2,
                  borderRadius: 2,
                  background: active
                    ? `linear-gradient(180deg, ${c.hex} 0%, rgba(${c.rgb},0.25) 100%)`
                    : `rgba(${c.rgb},0.22)`,
                  boxShadow: active ? `0 0 14px rgba(${c.rgb},0.6)` : "none",
                  transition: "background 0.55s ease, box-shadow 0.55s ease",
                }}
              />

              <div
                className="vora-ops-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr",
                  gap: 22,
                  alignItems: "start",
                }}
              >
                {/* Icon tile */}
                <div
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: 14,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: `1px solid rgba(${c.rgb},${active ? 0.6 : 0.22})`,
                    background: `rgba(${c.rgb},${active ? 0.16 : 0.06})`,
                    boxShadow: active ? `0 0 26px rgba(${c.rgb},0.28)` : "none",
                    transition:
                      "border-color 0.55s ease, background 0.55s ease, box-shadow 0.55s ease, transform 0.55s cubic-bezier(0.22,1,0.36,1)",
                    transform: active ? "scale(1.05)" : "scale(1)",
                    flexShrink: 0,
                  }}
                >
                  <BenefitIcon name={p.icon} color={c} size={28} />
                </div>

                <div>
                  <div
                    style={{
                      fontFamily: "'Geist Mono', monospace",
                      fontSize: 10,
                      fontWeight: 500,
                      letterSpacing: "0.22em",
                      textTransform: "uppercase",
                      color: `rgba(${c.rgb},${active ? 1 : 0.7})`,
                      marginBottom: 8,
                      transition: "color 0.55s ease",
                    }}
                  >
                    Pillar {String(i + 1).padStart(2, "0")}
                  </div>
                  <h4
                    style={{
                      margin: 0,
                      marginBottom: 10,
                      fontFamily: "'Switzer', 'Inter', system-ui, sans-serif",
                      fontSize: "clamp(22px, 2.6vw, 30px)",
                      fontWeight: 600,
                      letterSpacing: "-0.025em",
                      lineHeight: 1.1,
                      color: "#fff",
                      textShadow: active ? `0 0 22px rgba(${c.rgb},0.22)` : "none",
                      transition: "text-shadow 0.55s ease",
                    }}
                  >
                    {p.title}
                  </h4>
                  <p
                    style={{
                      margin: 0,
                      fontFamily: "'Switzer', sans-serif",
                      fontSize: "clamp(14.5px, 1.45vw, 16px)",
                      lineHeight: 1.6,
                      color: active ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.7)",
                      letterSpacing: "-0.005em",
                      maxWidth: 640,
                      transition: "color 0.55s ease",
                    }}
                  >
                    {p.desc}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ChapterEmpty({ section }) {
  const c = section.color;
  const bar = (w, opacity) => (
    <span
      style={{
        display: "block",
        width: w,
        maxWidth: "100%",
        height: 8,
        marginBottom: 10,
        borderRadius: 999,
        background: `rgba(${c.rgb},${opacity})`,
      }}
    />
  );
  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ marginBottom: 18, opacity: 0.55 }}>
        {bar("84%", 0.18)}
        {bar("96%", 0.13)}
        {bar("64%", 0.18)}
        {bar("72%", 0.13)}
      </div>
      <div
        style={{
          fontFamily: "'Geist Mono', monospace",
          fontSize: 10,
          fontWeight: 500,
          color: `rgba(${c.rgb},0.85)`,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 12px",
          borderRadius: 999,
          background: `rgba(${c.rgb},0.08)`,
          border: `1px solid rgba(${c.rgb},0.22)`,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: c.hex,
            boxShadow: `0 0 10px rgba(${c.rgb},0.5)`,
            animation: "voraPulse 1.6s ease-in-out infinite",
          }}
        />
        Writing in progress
      </div>
    </div>
  );
}

function BusinessRow({ section, index, expanded, onToggle, isFirst }) {
  const [hover, setHover] = useState(false);
  const accent = hover || expanded;
  return (
    <li
      style={{
        borderTop: isFirst ? "1px solid rgba(255,255,255,0.08)" : undefined,
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <button
        onClick={onToggle}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="vora-pos-row"
        aria-expanded={expanded}
        aria-controls={`chapter-panel-${section.id}`}
        aria-label={`${section.title} chapter. ${expanded ? "Collapse" : "Expand"}.`}
        style={{
          width: "100%",
          appearance: "none",
          background: "transparent",
          border: "none",
          color: "inherit",
          cursor: "pointer",
          padding: "30px 0",
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          alignItems: "baseline",
          gap: 24,
          textAlign: "left",
          minHeight: 88,
        }}
      >
        <span
          style={{
            fontFamily: "'Geist Mono', monospace",
            fontSize: 13,
            fontWeight: 500,
            color: accent ? section.color.hex : "rgba(255,255,255,0.4)",
            letterSpacing: "0.1em",
            minWidth: 28,
            transition: "color 0.3s ease",
          }}
        >
          {String(index).padStart(2, "0")}
        </span>

        <h3
          style={{
            margin: 0,
            fontFamily: "'Switzer', 'Inter', system-ui, sans-serif",
            fontWeight: 600,
            fontSize: "clamp(26px, 4.2vw, 50px)",
            lineHeight: 1,
            letterSpacing: "-0.038em",
            color: accent ? "#fff" : "rgba(255,255,255,0.86)",
            transition: "color 0.35s ease, transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)",
            transform: accent ? "translateX(8px)" : "translateX(0)",
            textShadow: accent ? `0 0 22px rgba(${section.color.rgb},0.22)` : "none",
          }}
        >
          <span
            aria-hidden
            style={{
              color: section.color.hex,
              marginRight: 14,
              transition: "color 0.3s ease",
            }}
          >
            *
          </span>
          {section.title}
        </h3>

        <span
          className="vora-pos-arrow"
          aria-hidden
          style={{
            fontFamily: "'Switzer', sans-serif",
            fontWeight: 400,
            fontSize: 22,
            color: accent ? section.color.hex : "rgba(255,255,255,0.4)",
            transition: "transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), color 0.3s ease",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            width: 16,
            textAlign: "center",
            lineHeight: 1,
            gridRow: "1 / span 2",
            alignSelf: "center",
          }}
        >
          →
        </span>
      </button>

      <div
        id={`chapter-panel-${section.id}`}
        role="region"
        aria-label={`${section.title} chapter content`}
        aria-hidden={!expanded}
        style={{
          // Each rich panel has its own height envelope. Generous caps
          // so mobile (where everything stacks) doesn't clip.
          maxHeight: expanded ? CHAPTER_MAX_HEIGHT[section.id] || 800 : 0,
          overflow: "hidden",
          transition: "max-height 0.7s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div
          style={{
            padding: "8px 0 48px",
            opacity: expanded ? 1 : 0,
            animation: expanded ? "voraFade 0.5s cubic-bezier(0.22,1,0.36,1)" : "none",
            transition: "opacity 0.4s ease 0.1s",
          }}
        >
          {section.id === "results" ? (
            <StatsPanel section={section} expanded={expanded} />
          ) : section.id === "biz" ? (
            <TalkinBusinessPanel section={section} />
          ) : section.id === "why" ? (
            <WhyWorkPanel section={section} />
          ) : section.id === "ops" ? (
            <OperationsMap section={section} />
          ) : section.body ? (
            <div
              style={{
                fontFamily: "'Switzer', sans-serif",
                fontWeight: 400,
                fontSize: "clamp(15px, 1.6vw, 17px)",
                lineHeight: 1.6,
                color: "rgba(255,255,255,0.78)",
                letterSpacing: "-0.005em",
                maxWidth: 720,
                whiteSpace: "pre-wrap",
              }}
            >
              {section.body}
            </div>
          ) : (
            <ChapterEmpty section={section} />
          )}
        </div>
      </div>
    </li>
  );
}

/* ─── Footer ─── */
function Footer() {
  return (
    <footer
      style={{
        padding: "80px 24px 56px",
        borderTop: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div
        className="vora-footer-row"
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
          flexWrap: "wrap",
        }}
      >
        <a href="#top" aria-label="Top" style={{ display: "inline-block", textDecoration: "none" }}>
          <VoraLogo height={30} />
        </a>
        <div
          style={{
            fontFamily: "'Geist Mono', monospace",
            fontSize: 10,
            fontWeight: 500,
            color: "rgba(255,255,255,0.4)",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
        >
          © {new Date().getFullYear()} v*ra · ai-native media ·{" "}
          <a
            href="/privacy"
            style={{
              color: "inherit",
              textDecoration: "none",
              borderBottom: "1px solid rgba(255,255,255,0.25)",
              paddingBottom: 1,
            }}
          >
            privacy
          </a>{" "}
          ·{" "}
          <a
            href="/terms"
            style={{
              color: "inherit",
              textDecoration: "none",
              borderBottom: "1px solid rgba(255,255,255,0.25)",
              paddingBottom: 1,
            }}
          >
            terms
          </a>
        </div>
        {/* Legal-entity disclosure — kept very small + muted so it
            reads as fine print rather than a brand element. */}
        <div
          style={{
            marginTop: 6,
            fontFamily: "'Geist Mono', monospace",
            fontSize: 9,
            fontWeight: 400,
            color: "rgba(255,255,255,0.25)",
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          Vora Agency LLC
        </div>
      </div>
    </footer>
  );
}

/* ─── NSFW artist application ───
   Branch funnel at /nsfw-artist-application. Not linked from anywhere
   on the main site — only reached via direct link share. Flow:
     1) 30-second position intro video at the top
     2) Application form (name / email / phone / location / income +
        skill-proof file uploads + 30-60s intro video)
     3) Why work here? panel below
   Form fields submit via the same mailto bridge as the talent apply
   form. Files (skill proof + intro video) are routed to a Dropbox file
   request pointing at: Vora Team Folder / Sales / Sales Team Video
   Applications. Drop a file request URL into NSFW_DROPBOX_REQUEST_URL
   below — until then submit gracefully tells the user the upload step
   is being set up. */
const NSFW_DROPBOX_REQUEST_URL = ""; // TODO: paste Dropbox file request URL

function NsfwUploadZone({ accent, label, hint, multiple, accept, files, onChange, lang = "en" }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const handleFiles = (incoming) => {
    if (!incoming) return;
    const list = Array.from(incoming);
    onChange(multiple ? [...files, ...list] : list.slice(0, 1));
  };
  // Drop-zone labels are bilingual via the same lang prop the rest of
  // the form uses — Spanish speakers were previously seeing "Drag &
  // drop or browse" in English no matter what the page toggle said.
  const dropLine = lang === "es" ? (
    <>Arrastra y suelta o <span style={{ color: accent.hex }}>elige un archivo</span></>
  ) : (
    <>Drag &amp; drop or <span style={{ color: accent.hex }}>browse</span></>
  );
  return (
    <div>
      <label
        style={{
          display: "block",
          fontFamily: "'Geist Mono', monospace",
          fontSize: 10,
          fontWeight: 500,
          color: "#fff",
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        {label}
      </label>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          handleFiles(e.dataTransfer.files);
        }}
        style={{
          padding: "22px 22px",
          borderRadius: 12,
          border: drag
            ? `1px dashed ${accent.hex}`
            : "1px dashed rgba(255,255,255,0.16)",
          background: drag
            ? `linear-gradient(180deg, rgba(${accent.rgb},0.10) 0%, rgba(${accent.rgb},0.02) 100%)`
            : "rgba(255,255,255,0.025)",
          cursor: "pointer",
          transition: "border-color 0.25s ease, background 0.25s ease",
        }}
      >
        <div
          style={{
            fontFamily: "'Switzer', sans-serif",
            fontSize: 14.5,
            color: "#fff",
            marginBottom: 4,
          }}
        >
          {dropLine}
        </div>
        <div
          style={{
            fontFamily: "'Switzer', sans-serif",
            fontSize: 13.5,
            color: "#fff",
          }}
        >
          {hint}
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple={multiple}
          accept={accept}
          onChange={(e) => handleFiles(e.target.files)}
          style={{ display: "none" }}
        />
      </div>
      {files && files.length ? (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: "10px 0 0 0",
            display: "grid",
            gap: 6,
          }}
        >
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                padding: "8px 12px",
                borderRadius: 8,
                background: `rgba(${accent.rgb},0.06)`,
                border: `1px solid rgba(${accent.rgb},0.22)`,
                fontFamily: "'Geist Mono', monospace",
                fontSize: 11.5,
                color: "#fff",
                letterSpacing: "0.04em",
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#fff" }}>
                {f.name}
              </span>
              {/* formatBytes, not hardcoded MB: a 17 KB résumé renders as
                  "0.0 MB" under one-decimal MB, which reads as a failed
                  upload and prompts people to re-attach or abandon. */}
              <span style={{ color: "rgba(255,255,255,0.85)" }}>
                {formatBytes(f.size)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ─── NSFW intro video player ───
   Autoplays muted with a poster while the candidate reads the page.
   Browsers allow muted autoplay everywhere (desktop + mobile). A big
   "Tap for sound" pill sits over the video — click anywhere to unmute
   and reveal native controls. Once unmuted, the pill hides for good
   on this visit. preload=metadata keeps the initial payload tiny;
   the actual video bytes only load once the user arrives at the page,
   and the file itself is a 7.2MB H.264/720p we compressed locally
   from the 115MB source. */
function NsfwIntroVideo({ accent }) {
  const videoRef = useRef(null);
  const [muted, setMuted] = useState(true);
  const [interacted, setInteracted] = useState(false);
  const [playing, setPlaying] = useState(false);

  const onUnmute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    v.volume = 1;
    setMuted(false);
    setInteracted(true);
    // Some browsers pause when toggling muted via keyboard on Safari;
    // calling play() defensively keeps it rolling.
    const p = v.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  };

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "16 / 9",
        borderRadius: 16,
        overflow: "hidden",
        border: `1px solid rgba(${accent.rgb},0.25)`,
        background: "#000",
        boxShadow: `0 0 64px rgba(${accent.rgb},0.18)`,
        marginBottom: 8,
        cursor: muted ? "pointer" : "default",
      }}
      onClick={muted ? onUnmute : undefined}
    >
      <video
        ref={videoRef}
        src="/nsfw-intro.mp4"
        poster="/nsfw-intro-poster.jpg"
        autoPlay
        muted
        playsInline
        loop
        preload="metadata"
        controls={interacted}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
          background: "#000",
        }}
      />

      {/* "Tap for sound" overlay — visible only while muted. Sits in
          the lower-left so it doesn't fight with native controls once
          they appear after the first interaction. */}
      {muted ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            padding: 22,
            background:
              "linear-gradient(180deg, rgba(0,0,0,0) 60%, rgba(0,0,0,0.45) 100%)",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 18px 10px 14px",
              borderRadius: 999,
              background: "rgba(0,0,0,0.62)",
              border: `1px solid rgba(${accent.rgb},0.45)`,
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              color: "#fff",
              fontFamily: "'Switzer', sans-serif",
              fontSize: 13.5,
              fontWeight: 500,
              letterSpacing: "-0.005em",
              boxShadow: `0 0 22px rgba(${accent.rgb},0.35)`,
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke={accent.hex}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              <path d="M16 9c1 1 1.5 2 1.5 3s-.5 2-1.5 3" />
              <path d="M19 6c2 2 3 4 3 6s-1 4-3 6" />
            </svg>
            Tap for sound
          </div>
        </div>
      ) : null}

      {/* Discreet bottom-right play/pause indicator after first
          interaction, only visible briefly while paused. */}
      {interacted && !playing ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); togglePlay(); }}
          aria-label="Play"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.35)",
            border: "none",
            cursor: "pointer",
          }}
        >
          <span
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: `rgba(${accent.rgb},0.92)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `0 0 32px rgba(${accent.rgb},0.55)`,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </button>
      ) : null}
    </div>
  );
}

// Fetch a single hidden listing from the portal by slug. Returns the
// normalized job or null while loading / on miss. Hidden roles are
// excluded from the default /api/vora/jobs response, so callers must
// query by slug to surface them.
function useHiddenJobBySlug(slug) {
  const [job, setJob] = useState(null);
  useEffect(() => {
    if (!slug) { setJob(null); return; }
    let cancelled = false;
    fetch(`${VORA_API}/api/vora/jobs?slug=${encodeURIComponent(slug)}&includeHidden=true`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((body) => {
        if (cancelled) return;
        const list = Array.isArray(body?.jobs) ? body.jobs : [];
        const match = list.find((j) => j && (j.slug || "").toLowerCase() === slug.toLowerCase());
        setJob(match ? normalizeJob(match) : null);
      });
    return () => { cancelled = true; };
  }, [slug]);
  return job;
}

function NsfwApplicationView() {
  // Brand accent for this page — blue, matching the Why Work Here
  // section so the funnel reads as one continuous experience.
  const accent = BRAND.blue;
  // Fire ViewContent for retargeting — Meta needs this to build
  // audiences of "saw the NSFW role landing page but didn't apply".
  useEffect(() => {
    trackViewContent({ role: "NSFW AI Artist", slug: "nsfw-artist-application" });
  }, []);
  // Fetch the NSFW AI Artist job by slug. The public jobs API hides
  // hidden listings by default — the slug param is the only way to
  // surface them — so we can't use useVoraData here. Until the fetch
  // resolves we still let the form render; the apply endpoint does
  // its own portal lookup as a backstop, so submissions never break
  // even if the in-flight fetch races.
  const nsfwJob = useHiddenJobBySlug("nsfw-artist-application");
  // This page used to submit `country: ""`, which is why applicants from here
  // arrived permanently unreachable: with no country hint AND a local-format
  // number, the portal can't build an international number, so it stores no
  // sendable address and can't match their own reply back to them.
  const geo = useGeo();
  const [form, setForm] = useState({
    name: "", email: "", phone: "", location: "", income: "",
  });
  const [skillFiles, setSkillFiles] = useState([]);
  const [introVideo, setIntroVideo] = useState([]);
  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");
  // Submit-time progress state — mirrors ApplyForm so the NSFW funnel
  // shows the same green progress bar while a 30-60s intro video
  // uploads to R2.
  const [progress, setProgress] = useState({ phase: "idle", current: 0, total: 0, fileName: "", fileLoaded: 0, fileSize: 0, overallPct: 0 });

  // Leaving mid-submit abandons the upload — warn (desktop browsers
  // honour this; in-app webviews mostly ignore it, no harm done).
  useEffect(() => {
    if (status !== "submitting") return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isFilled = (k) => form[k].trim().length > 0;
  const isEmailValid = isFilled("email") && EMAIL_RE.test(form.email.trim());
  const emailInvalid = isFilled("email") && !isEmailValid;

  const restingBorder = (k) => {
    if (k === "email" && emailInvalid) return "1px solid rgba(206,60,17,0.55)";
    if (isFilled(k)) return "1px solid rgba(255,255,255,0.22)";
    return "1px solid rgba(255,255,255,0.08)";
  };
  const restingBg = (k) =>
    isFilled(k) ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.025)";

  const inputBase = {
    width: "100%",
    padding: "14px 16px",
    borderRadius: 10,
    color: "#fff",
    fontFamily: "'Switzer', sans-serif",
    fontSize: 15,
    fontWeight: 400,
    letterSpacing: "-0.005em",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.2s, box-shadow 0.2s, background 0.2s",
  };
  const inputStyle = (k) => ({
    ...inputBase,
    border: restingBorder(k),
    background: restingBg(k),
  });
  const onFieldFocus = (e) => {
    e.target.style.borderColor = accent.hex;
    e.target.style.boxShadow = `0 0 0 3px rgba(${accent.rgb},0.15)`;
    e.target.style.background = "rgba(255,255,255,0.05)";
  };
  const onFieldBlur = (k) => (e) => {
    e.target.style.borderColor = restingBorder(k).replace("1px solid ", "");
    e.target.style.boxShadow = "none";
    e.target.style.background = restingBg(k);
  };

  const fieldLabel = (text) => (
    <label
      style={{
        display: "block",
        fontFamily: "'Geist Mono', monospace",
        fontSize: 10,
        fontWeight: 500,
        color: "#fff",
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        marginBottom: 8,
      }}
    >
      {text}
    </label>
  );

  const submit = async () => {
    if (status === "ok" || status === "submitting") return;
    setErrorMsg("");
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim() || !form.location.trim() || !form.income.trim()) {
      setStatus("error");
      setErrorMsg("All fields are required.");
      return;
    }
    if (!isEmailValid) {
      setStatus("error");
      setErrorMsg("Please enter a valid email.");
      return;
    }
    if (!introVideo.length) {
      setStatus("error");
      setErrorMsg("Please attach a 30 to 60 second intro video.");
      return;
    }
    setStatus("submitting");

    // Build the upload list — skill proof files + the required intro
    // video. Mirrors the standard ApplyForm pipeline so files reach
    // R2 (and from there, Ashby) instead of vanishing into a notes
    // string. Each file is tagged with the form question label so
    // reviewers can tell them apart on the candidate's Files tab.
    const filesToUpload = [
      ...skillFiles.map((f) => ({ kind: "image", label: "Skill proof", file: f })),
      ...introVideo.map((f) => ({ kind: "video", label: "Intro video", file: f })),
    ];
    const totalBytes = filesToUpload.reduce((acc, { file }) => acc + (file.size || 0), 0);
    let bytesAlreadyUploaded = 0;

    setProgress({
      phase: filesToUpload.length ? "uploading" : "finalizing",
      current: 0,
      total: filesToUpload.length,
      fileName: "",
      fileLoaded: 0,
      fileSize: 0,
      overallPct: 0,
    });

    const attachments = [];
    try {
      for (let idx = 0; idx < filesToUpload.length; idx += 1) {
        const { kind, label, file } = filesToUpload[idx];
        setProgress((p) => ({
          ...p,
          phase: "uploading",
          netState: "uploading",
          current: idx + 1,
          total: filesToUpload.length,
          fileName: file.name || "file",
          fileLoaded: 0,
          fileSize: file.size || 0,
        }));

        const data = await uploadFileWithProgress({
          file,
          url: `${VORA_API}/api/vora/application-upload`,
          kind,
          onStatus: (s) => setProgress((p) => (p.netState === s.state ? p : { ...p, netState: s.state })),
          onProgress: (loaded, total) => {
            const fileSize = total || file.size || loaded;
            const overallBytes = bytesAlreadyUploaded + Math.min(loaded, fileSize);
            const pct = totalBytes > 0
              ? Math.min(100, Math.round((overallBytes / totalBytes) * 100))
              : (filesToUpload.length > 0
                  ? Math.round(((idx + (fileSize ? loaded / fileSize : 0)) / filesToUpload.length) * 100)
                  : 0);
            setProgress((p) => ({
              ...p,
              fileLoaded: Math.min(loaded, fileSize),
              fileSize,
              overallPct: pct,
            }));
          },
        });
        bytesAlreadyUploaded += file.size || 0;
        attachments.push({
          label,
          name: data.name || file.name || "file",
          url: data.url,
          size: data.size || file.size || 0,
          kind: data.kind || kind,
        });
      }
    } catch (err) {
      setStatus("error");
      setProgress((p) => ({ ...p, phase: "error" }));
      setErrorMsg(`Couldn't upload your files (${String(err?.message || err)}). Try again.`);
      return;
    }

    setProgress((p) => ({ ...p, phase: "finalizing", overallPct: 99 }));

    // Notes block carries the bespoke NSFW fields (phone / location /
    // desired income) so reviewers see them inline on the candidate
    // page. Files are NOT in here — they ride as `attachments[]` and
    // get uploaded to Ashby's Files tab by the apply endpoint.
    const notes = [
      `Phone: ${form.phone.trim()}`,
      `Location: ${form.location.trim()}`,
      `Desired monthly income: ${form.income.trim()}`,
    ].join("\n");

    const payload = {
      jobId: nsfwJob?.id ?? 6,
      ashbyJobId: nsfwJob?.ashbyJobId || nsfwJob?.ashbyJobPostingId || "",
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      portfolio: "",
      tier: null,
      // A real ISO-2 code. It survives the 8-char truncation downstream
      // intact, so the portal can resolve a local-format number instead of
      // giving up with `no-country`.
      country: geo?.code || "",
      salaryShown: "",
      notes,
      attachments,
    };

    try {
      const resp = await postApplyWithRetry(payload);
      const data = await resp.json().catch(() => ({}));

      if (resp.ok && data?.ok) {
        setStatus("ok");
        setProgress((p) => ({ ...p, phase: "ok", overallPct: 100 }));
        trackLead({
          role: nsfwJob?.title || "NSFW AI Artist",
          kind: "application",
          userData: buildMetaUserData({
            name: form.name,
            email: form.email,
            phone: form.phone,
            city: form.location,
          }),
        });
        return;
      }

      // Role not wired to Ashby yet — fall back to mailto so submissions
      // never get lost during the rollout.
      if (data?.error === "no-ashby-mapping") {
        fallbackToMailto(notes);
        return;
      }

      uploadTelemetry("finalize-fail", { code: data?.error ? String(data.error).slice(0, 140) : `http-${resp.status}` });
      setStatus("error");
      setProgress((p) => ({ ...p, phase: "error" }));
      setErrorMsg(
        data?.error
          ? `Couldn't submit (${data.error}). Try again or email talent@voraagency.com directly.`
          : `Submit failed (HTTP ${resp.status}). Try again or email talent@voraagency.com directly.`,
      );
    } catch (err) {
      uploadTelemetry("finalize-fail", { code: String(err?.message || err).slice(0, 140) });
      setStatus("error");
      setProgress((p) => ({ ...p, phase: "error" }));
      setErrorMsg(`Network error — ${String(err?.message || err)}. Try again.`);
    }
  };

  // Mailto fallback — only triggers if the role hasn't been wired to
  // Ashby yet (no ashbyJobId on the portal record). Files have already
  // been uploaded to R2 at this point so we surface their public URLs
  // in the email body so talent@ can review them.
  const fallbackToMailto = (notesBlob) => {
    const subject = `NSFW AI Artist Application — ${form.name.trim()}`;
    const fileLine = (f) => `• ${f.name} (${formatBytes(f.size)})`;
    const lines = [
      `Application: NSFW AI Artist`,
      ``,
      `Name: ${form.name.trim()}`,
      `Email: ${form.email.trim()}`,
      `Phone: ${form.phone.trim()}`,
      `Location: ${form.location.trim()}`,
      `Desired monthly income: ${form.income.trim()}`,
      ``,
      `Skill / proof files:`,
      ...(skillFiles.length ? skillFiles.map(fileLine) : ["• (none)"]),
      ``,
      `Intro video:`,
      ...introVideo.map(fileLine),
      ``,
      `— sent from vora.biz/nsfw-artist-application (Ashby fallback)`,
    ];
    const mailto = `mailto:talent@voraagency.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
    window.location.href = mailto;
    setStatus("ok");
    setProgress((p) => ({ ...p, phase: "ok", overallPct: 100 }));
    trackLead({
      role: nsfwJob?.title || "NSFW AI Artist",
      kind: "application",
      userData: buildMetaUserData({
        name: form.name,
        email: form.email,
        phone: form.phone,
        city: form.location,
      }),
    });
  };

  // Build a synthetic "why" section so we can reuse WhyWorkPanel without
  // touching its internal state.
  const whySection = { id: "why", title: "Why work here?", color: BRAND.blue };

  return (
    <main style={{ background: "#000", color: "#fff", minHeight: "100vh" }}>
      <style>{`
        @keyframes voraFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes voraPulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.4); opacity: 0.55; } }
      `}</style>

      {/* Minimal top bar — logo only, no nav back to careers */}
      <header style={{ padding: "26px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <a href="/" aria-label="Top" style={{ display: "inline-block", textDecoration: "none" }}>
            <VoraLogo height={28} />
          </a>
          <span
            style={{
              fontFamily: "'Geist Mono', monospace",
              fontSize: 10,
              fontWeight: 500,
              color: `rgba(${accent.rgb},0.85)`,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
            }}
          >
            <span style={{
              display: "inline-block",
              width: 6, height: 6, borderRadius: "50%",
              background: accent.hex, boxShadow: `0 0 8px rgba(${accent.rgb},0.6)`,
              marginRight: 8, verticalAlign: 1,
            }} />
            Private application
          </span>
        </div>
      </header>

      {/* Position intro video */}
      <section style={{ padding: "60px 24px 20px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <Reveal>
            <h1
              style={{
                fontFamily: "'Switzer', 'Inter', system-ui, sans-serif",
                fontWeight: 700,
                fontSize: "clamp(36px, 6vw, 72px)",
                lineHeight: 0.95,
                letterSpacing: "-0.04em",
                color: "#fff",
                margin: 0,
                marginBottom: 32,
              }}
            >
              NSFW AI Artist Application:
            </h1>
          </Reveal>
          <Reveal delay={0.1}>
            <NsfwIntroVideo accent={accent} />
          </Reveal>
        </div>
      </section>

      {/* Application form */}
      <section style={{ padding: "60px 24px 80px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <Reveal>
            <h2
              style={{
                fontFamily: "'Switzer', 'Inter', system-ui, sans-serif",
                fontWeight: 700,
                fontSize: "clamp(32px, 5vw, 56px)",
                lineHeight: 0.95,
                letterSpacing: "-0.04em",
                color: "#fff",
                margin: 0,
                marginBottom: 36,
              }}
            >
              Application form.
            </h2>
          </Reveal>

          {status === "ok" ? (
            <div
              style={{
                padding: "22px 24px",
                borderRadius: 14,
                border: `1px solid rgba(${accent.rgb},0.45)`,
                background: `linear-gradient(180deg, rgba(${accent.rgb},0.10) 0%, rgba(${accent.rgb},0.02) 100%)`,
                fontFamily: "'Switzer', sans-serif",
                fontSize: 15,
                lineHeight: 1.6,
                color: "#fff",
              }}
            >
              Application transmitted — we review every applicant within 48 hours.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 18 }}>
              <div className="vora-nsfw-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  {fieldLabel("Name")}
                  <input
                    style={inputStyle("name")}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    onFocus={onFieldFocus}
                    onBlur={onFieldBlur("name")}
                    autoComplete="name"
                  />
                </div>
                <div>
                  {fieldLabel("Email")}
                  <input
                    type="email"
                    style={inputStyle("email")}
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    onFocus={onFieldFocus}
                    onBlur={onFieldBlur("email")}
                    autoComplete="email"
                  />
                </div>
                <div>
                  {/* The country code is asked for explicitly because
                      without it the number cannot be used at all — we can't
                      text or WhatsApp the applicant, and their reply can't
                      be matched back to their application. */}
                  {fieldLabel("Phone number (include country code)")}
                  <input
                    type="tel"
                    style={inputStyle("phone")}
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    onFocus={onFieldFocus}
                    onBlur={onFieldBlur("phone")}
                    autoComplete="tel"
                    inputMode="tel"
                    placeholder={dialForGeo(geo) ? `${dialForGeo(geo)} 917 123 4567` : "+63 917 123 4567"}
                  />
                  <div
                    style={{
                      marginTop: 6,
                      fontFamily: "'Geist Mono', monospace",
                      fontSize: 10,
                      color: "rgba(255,255,255,0.4)",
                      letterSpacing: "0.04em",
                    }}
                  >
                    Start with your country code, e.g. +44, +63, +84 — this is how we reach you.
                  </div>
                </div>
                <div>
                  {fieldLabel("Location")}
                  <input
                    style={inputStyle("location")}
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    onFocus={onFieldFocus}
                    onBlur={onFieldBlur("location")}
                    autoComplete="address-level2"
                  />
                </div>
              </div>
              <div>
                {fieldLabel("Desired monthly income (USD)")}
                <input
                  style={inputStyle("income")}
                  value={form.income}
                  onChange={(e) => setForm({ ...form, income: e.target.value })}
                  onFocus={onFieldFocus}
                  onBlur={onFieldBlur("income")}
                  inputMode="numeric"
                />
              </div>

              <NsfwUploadZone
                accent={accent}
                label="Skill proof"
                hint="Drop any files showing visual intelligence, excellence, or related skills."
                multiple
                accept="image/*,video/*,application/pdf,.zip"
                files={skillFiles}
                onChange={setSkillFiles}
              />

              <NsfwUploadZone
                accent={accent}
                label="Intro video (30–60 seconds, uncut)"
                hint="30 to 60 seconds about why you're a good fit for this position. Uncut, one take."
                multiple={false}
                accept="video/*"
                files={introVideo}
                onChange={setIntroVideo}
              />

              {errorMsg ? (
                <div style={{ fontFamily: "'Switzer', sans-serif", fontSize: 13.5, color: "#ff8a6a" }}>
                  {errorMsg}
                </div>
              ) : null}

              <button
                type="button"
                onClick={submit}
                disabled={status === "submitting"}
                style={{
                  appearance: "none",
                  padding: "16px 24px",
                  borderRadius: 999,
                  border: `1px solid ${accent.hex}`,
                  background: accent.hex,
                  color: "#fff",
                  fontFamily: "'Switzer', sans-serif",
                  fontSize: 14.5,
                  fontWeight: 600,
                  letterSpacing: "-0.005em",
                  cursor: status === "submitting" ? "wait" : "pointer",
                  opacity: status === "submitting" ? 0.7 : 1,
                  boxShadow: `0 0 24px rgba(${accent.rgb},0.35)`,
                  transition: "transform 0.18s ease, box-shadow 0.25s ease, opacity 0.2s ease",
                  justifySelf: "start",
                }}
                onMouseEnter={(e) => {
                  if (status === "submitting") return;
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow = `0 0 32px rgba(${accent.rgb},0.55)`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = `0 0 24px rgba(${accent.rgb},0.35)`;
                }}
              >
                {status === "submitting" ? "Sending…" : "Submit application →"}
              </button>

              {status === "submitting" && (progress.phase === "uploading" || progress.phase === "finalizing") && (
                <div role="status" aria-live="polite" style={{ marginTop: 4 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      fontFamily: "'Geist Mono', monospace",
                      fontSize: 10,
                      fontWeight: 500,
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      color: "rgba(255,255,255,0.55)",
                      marginBottom: 6,
                      gap: 12,
                    }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                      {progress.phase === "finalizing"
                        ? "Finalizing…"
                        : progress.total > 1
                          ? `Uploading ${progress.current}/${progress.total} · ${progress.fileName}`
                          : `Uploading · ${progress.fileName}`}
                    </span>
                    <span style={{ flexShrink: 0, color: accent.hex, fontWeight: 700 }}>
                      {progress.overallPct}%
                    </span>
                  </div>
                  <div
                    style={{
                      height: 4,
                      background: "rgba(255,255,255,0.08)",
                      borderRadius: 999,
                      overflow: "hidden",
                      position: "relative",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${progress.overallPct}%`,
                        background: accent.hex,
                        borderRadius: 999,
                        transition: "width 0.18s ease",
                      }}
                    />
                  </div>
                  {progress.fileSize > 0 && progress.phase === "uploading" && (
                    <div
                      style={{
                        marginTop: 6,
                        fontFamily: "'Geist Mono', monospace",
                        fontSize: 10,
                        color: progress.netState === "reconnecting" ? "rgba(235,179,6,0.8)" : "rgba(255,255,255,0.4)",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {progress.netState === "reconnecting"
                        ? "reconnecting…"
                        : <>{formatBytes(progress.fileLoaded)} / {formatBytes(progress.fileSize)}</>}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Why work here? — auto-open, no toggle. A sleek single-curve
          arrow sweeps from the title down to the card grid below. */}
      <section style={{ padding: "60px 24px 100px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 24,
              position: "relative",
              marginBottom: 12,
            }}
          >
            <h2
              style={{
                fontFamily: "'Switzer', 'Inter', system-ui, sans-serif",
                fontWeight: 700,
                fontSize: "clamp(48px, 8vw, 96px)",
                lineHeight: 0.95,
                letterSpacing: "-0.045em",
                color: "#fff",
                margin: 0,
                flexShrink: 0,
              }}
            >
              Why{" "}
              <span style={{ color: BRAND.blue.hex }}>work here?</span>
            </h2>
            {/* Sleek single-curve arrow sweeping from the title down to
                the card grid. Cubic bezier exits horizontally and lands
                vertical so the arrowhead points cleanly down at the
                cards. */}
            <span
              aria-hidden
              className="vora-why-arrow"
              style={{
                position: "relative",
                width: 220,
                height: 150,
                marginBottom: -6,
                color: BRAND.blue.hex,
              }}
            >
              <svg
                viewBox="0 0 220 150"
                width="220"
                height="150"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  filter: `drop-shadow(0 0 8px rgba(${BRAND.blue.rgb},0.4))`,
                }}
              >
                <path d="M 18 18 C 130 14, 200 56, 198 138" />
                <path d="M 198 138 L 188 124 M 198 138 L 210 126" />
              </svg>
            </span>
          </div>

          <div style={{ paddingTop: 12 }}>
            <WhyWorkPanel section={whySection} />
          </div>
        </div>
      </section>

      <Footer />

      <style>{`
        @media (max-width: 760px) {
          .vora-nsfw-grid {
            grid-template-columns: 1fr !important;
          }
          .vora-why-arrow {
            display: none !important;
          }
        }
      `}</style>
    </main>
  );
}

/* ═══════════ STAGE 2 ASSESSMENT ═══════════
   Velocity Editor + Marketing Team Lead applications don't end at
   "Application received". Once the submit lands, Stage1Processing runs a
   12–18s two-agent read of what they just sent and clears them for Stage
   2 — every applicant to these roles is cleared; this is the funnel's
   second step, not a filter, and nothing here fabricates a score. Then
   Stage2View (/stage-2/<token>) is the assessment itself: a word from the
   team, one viral clip, two questions.

   The portal owns the record and the rules (functions/api/vora/
   _assessment.js — the committed first answer is immutable there); this
   file only renders and posts events. Copy + media live in
   STAGE2_ASSESSMENT next to SEED_JOBS. */

const STAGE2_BY_KEY = { [STAGE2_ASSESSMENT.key]: STAGE2_ASSESSMENT };

// `?stage2=preview` turns the flow on for THIS browser before the viral
// clip is configured (sticks in localStorage; `?stage2=off` clears it).
function stage2PreviewFlag() {
  if (typeof window === "undefined") return false;
  try {
    const qs = new URLSearchParams(window.location.search);
    const flag = qs.get("stage2");
    if (flag === "preview") { window.localStorage.setItem("vora-stage2-preview", "1"); return true; }
    if (flag === "off") { window.localStorage.removeItem("vora-stage2-preview"); return false; }
    return window.localStorage.getItem("vora-stage2-preview") === "1";
  } catch {
    return false;
  }
}

function stage2Ready(cfg) {
  if (!cfg || !cfg.key || cfg.enabled === false) return false;
  if (cfg.viral && cfg.viral.videoUrl) return true;
  return stage2PreviewFlag();
}

// What the apply response means for the UI: null → plain "received" line;
// { token } → run Stage 1 processing; { token: "", status: "submitted" } →
// they've already done Stage 2 on an earlier application.
function stage2FromResponse(job, data) {
  if (!job || !job.assessment || !stage2Ready(job.assessment)) return null;
  const token = String((data && data.assessmentToken) || "");
  const status = String((data && data.assessmentStatus) || "");
  if (status === "submitted") return { token: "", status };
  return token ? { token, status } : null;
}

function goToStage2(token) {
  const url = `/stage-2/${encodeURIComponent(token)}`;
  try {
    window.history.pushState({}, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.scrollTo({ top: 0, behavior: "auto" });
  } catch {
    window.location.assign(url);
  }
}

// 48300000 → "48.3M", "212k" passes through untouched, "" stays "".
function fmtCompact(v) {
  if (v == null || v === "") return "";
  const n = typeof v === "number" ? v : Number(String(v).replace(/[,\s]/g, ""));
  if (!Number.isFinite(n)) return String(v);
  const trim = (x) => (x >= 100 ? String(Math.round(x)) : String(Math.round(x * 10) / 10));
  if (n >= 1e9) return `${trim(n / 1e9)}B`;
  if (n >= 1e6) return `${trim(n / 1e6)}M`;
  if (n >= 1e3) return `${trim(n / 1e3)}K`;
  return String(Math.round(n));
}

const stage2Words = (s) => (String(s || "").match(/[^\s]+/g) || []);

// Bag-of-words delta for the live "+12 −4 words" chip. The portal computes
// the real word diff for reviewers; this only has to feel right as you type.
function wordDelta(a, b) {
  const bag = new Map();
  for (const w of stage2Words(a)) bag.set(w, (bag.get(w) || 0) + 1);
  let added = 0;
  for (const w of stage2Words(b)) {
    const c = bag.get(w) || 0;
    if (c > 0) bag.set(w, c - 1);
    else added += 1;
  }
  let removed = 0;
  for (const c of bag.values()) removed += c;
  return { added, removed };
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => (
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false
  ));
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);
  return reduced;
}

async function stage2Get(token) {
  try {
    const r = await fetch(`${VORA_API}/api/vora/assessment?token=${encodeURIComponent(token)}`, { cache: "no-store" });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok && !!data.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

async function stage2Post(token, event) {
  try {
    const r = await fetch(`${VORA_API}/api/vora/assessment`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, ...event }),
    });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok && !!data.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

/* ─── Stage 1 processing ─── */

// The two agents' scripts. Step fractions are of each agent's OWN run. The
// presence agent has the longer script (video + audio) and lands last; the
// experience agent finishes about two thirds of the way through.
const STAGE1_AGENT_PLANS = {
  experience: { end: 0.7, steps: [0.3, 0.7, 0.98] },
  presence: { end: 0.92, steps: [0.36, 0.7, 0.98] },
  application: { end: 0.92, steps: [0.36, 0.7, 0.98] },
};

function fmtClock(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function fileList(arr) {
  return (Array.isArray(arr) ? arr : []).filter((f) => f && typeof f === "object" && typeof f.name === "string");
}
function shortName(name, max = 22) {
  const s = String(name || "");
  if (s.length <= max) return s;
  const dot = s.lastIndexOf(".");
  const ext = dot > 0 ? s.slice(dot) : "";
  return `${s.slice(0, Math.max(6, max - ext.length - 1))}…${ext}`;
}
function extOf(name) {
  const m = /\.([a-z0-9]{1,5})$/i.exec(String(name || ""));
  return m ? m[1].toUpperCase() : "FILE";
}
function domainOf(url) {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return String(url || "").slice(0, 24);
  }
}

function stage1Agents(job, exp, selfie, expLink, selfieLink) {
  const isLead = Number(job.id) === 8;
  const n = exp.length + (expLink ? 1 : 0);
  const names = exp.map((f) => shortName(f.name, 18));
  if (expLink) names.push(domainOf(expLink));
  const selfieName = selfie[0] ? shortName(selfie[0].name, 20) : selfieLink ? domainOf(selfieLink) : "";
  // Step 0 of each agent is the real upload; the planned read starts once
  // the application has landed. Nothing uploaded as experience → no
  // experience agent: the overlay only reads what the applicant sent.
  const agents = [];
  if (n > 0) {
    agents.push({
      id: "experience",
      name: "Experience agent",
      input: `${n} item${n === 1 ? "" : "s"}`,
      steps: [
        "Uploading files",
        n <= 2 ? `Opening ${names.join(" · ")}` : `Opening ${n} files`,
        isLead ? "Mapping to the lead role" : "Mapping to the role",
        "Writing interpretation",
      ],
    });
  }
  if (selfieName) {
    agents.push({
      id: "presence",
      name: "Presence agent",
      input: "selfie video",
      steps: [
        "Uploading selfie video",
        "Interpreting video",
        "Transcribing audio",
        isLead ? "Weighing the case for standing out" : "Weighing ambition & drive",
      ],
    });
  } else {
    // No video on file: the second agent reads the application itself.
    agents.push({
      id: "application",
      name: "Application agent",
      input: "details",
      steps: [
        "Sending application",
        "Reading your details",
        isLead ? "Reading why you stand out" : "Matching to the role",
        "Preparing Stage 2",
      ],
    });
  }
  return agents;
}

// A thumbnail for the applicant's own upload: images straight from the
// File, videos as a frame drawn to a canvas (with the duration), anything
// else falls back to an extension glyph. Everything stays in the browser.
function useFileThumb(file) {
  const [thumb, setThumb] = useState(null);
  useEffect(() => {
    if (!file || typeof file !== "object" || typeof file.type !== "string") { setThumb(null); return undefined; }
    let cancelled = false;
    let objectUrl = "";
    try { objectUrl = URL.createObjectURL(file); } catch { setThumb({ url: "", kind: "file" }); return undefined; }
    if (file.type.startsWith("image/")) {
      setThumb({ url: objectUrl, kind: "image" });
      return () => { URL.revokeObjectURL(objectUrl); };
    }
    if (file.type.startsWith("video/")) {
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.preload = "auto";
      const finish = () => {
        if (cancelled) return;
        let url = "";
        try {
          const c = document.createElement("canvas");
          const w = 240;
          const h = v.videoWidth && v.videoHeight ? Math.round((w * v.videoHeight) / v.videoWidth) : 426;
          c.width = w;
          c.height = h;
          c.getContext("2d").drawImage(v, 0, 0, w, h);
          url = c.toDataURL("image/jpeg", 0.82);
        } catch { url = ""; }
        setThumb({ url, kind: "video", duration: Number.isFinite(v.duration) ? v.duration : 0 });
        URL.revokeObjectURL(objectUrl);
      };
      v.addEventListener("loadeddata", () => {
        try { v.currentTime = Math.min(0.6, (v.duration || 1) / 4); } catch { finish(); }
      }, { once: true });
      v.addEventListener("seeked", finish, { once: true });
      v.addEventListener("error", () => { if (!cancelled) setThumb({ url: "", kind: "video", duration: 0 }); }, { once: true });
      v.src = objectUrl;
      return () => { cancelled = true; try { v.removeAttribute("src"); v.load(); } catch { /* */ } };
    }
    setThumb({ url: "", kind: "file" });
    return () => { URL.revokeObjectURL(objectUrl); };
  }, [file]);
  return thumb;
}

function Stage1Tile({ file, link, scanning, done, large }) {
  const thumb = useFileThumb(file);
  const name = file ? file.name : link ? domainOf(link) : "";
  const glyph = file ? (thumb && thumb.kind === "video" ? "▶" : extOf(file.name)) : "↗";
  return (
    <div className={`vora-s1-tile ${large ? "is-large" : ""} ${scanning ? "is-scanning" : ""} ${done ? "is-done" : ""}`} title={name}>
      {thumb && thumb.url ? <img src={thumb.url} alt="" /> : <span className="vora-s1-tile-glyph">{glyph}</span>}
      {scanning && <span className="vora-s1-tile-scan" aria-hidden />}
      {thumb && thumb.kind === "video" && thumb.duration > 0 && (
        <span className="vora-s1-tile-dur">{fmtClock(thumb.duration)}</span>
      )}
      {name && <span className="vora-s1-tile-name">{shortName(name, large ? 26 : 14)}</span>}
    </div>
  );
}

function Stage1AgentCard({ agent, plan, t, exp, expLink, selfie, selfieLink, uploading, uploadPct, uploadLabel }) {
  // This agent's own progress, eased so the counter lands rather than
  // stops, and its per-step state derived from the shared clock. During the
  // upload the first step is live (real bytes); the planned read follows.
  const raw = uploading ? 0 : Math.min(1, t / plan.end);
  const eased = 1 - Math.pow(1 - raw, 1.6);
  const pct = uploading ? Math.round(uploadPct * 0.3) : Math.round(30 + eased * 70);
  const done = !uploading && raw >= 1;
  let activeIdx = -1;
  const states = agent.steps.map((_, i) => {
    if (i === 0) return uploading ? "active" : "done";
    if (raw >= plan.steps[i - 1]) return "done";
    if (activeIdx === -1 && !uploading) { activeIdx = i; return "active"; }
    return "pending";
  });
  if (uploading) activeIdx = 0;
  const stepLabel = (label, i) => (i === 0 && uploading && uploadLabel ? `${label} · ${uploadLabel}` : label);

  let specimen = null;
  if (agent.id === "experience") {
    const items = [...exp.map((f) => ({ file: f })), ...(expLink ? [{ link: expLink }] : [])].slice(0, 4);
    const scanIdx = done || !items.length ? -1 : uploading ? 0 : Math.min(items.length - 1, Math.floor(raw * items.length));
    specimen = (
      <div className="vora-s1-specimen">
        {items.length ? items.map((it, i) => (
          <Stage1Tile key={it.file ? `${it.file.name}-${it.file.size}` : it.link} file={it.file} link={it.link} scanning={i === scanIdx} done={done || i < scanIdx} />
        )) : (
          <div className="vora-s1-doc" aria-hidden>
            {[92, 68, 84, 57].map((w, i) => <span key={i} className="vora-s1-line" style={{ width: `${w}%` }} />)}
            {!done && <span className="vora-s1-scan" />}
          </div>
        )}
      </div>
    );
  } else if (agent.id === "presence") {
    // Playhead runs across the real clip while the agent is interpreting
    // the picture and transcribing the audio (its first two planned steps).
    const s = plan.steps;
    const head = Math.max(0, Math.min(1, raw / Math.max(0.01, s[1])));
    const listening = activeIdx === 1 || activeIdx === 2;
    const selfieFile = selfie[0] || null;
    specimen = (
      <div className="vora-s1-specimen">
        {(selfieFile || selfieLink) ? (
          <Stage1Tile file={selfieFile} link={selfieFile ? "" : selfieLink} scanning={!done && activeIdx <= 4} done={done} large />
        ) : (
          <div className="vora-s1-tile is-large"><span className="vora-s1-tile-glyph">—</span></div>
        )}
        <div className="vora-s1-audio">
          <div className={`vora-s1-wave ${listening ? "" : "is-idle"}`} aria-hidden>
            {Array.from({ length: 14 }, (_, i) => <i key={i} style={{ animationDelay: `${(i % 7) * 0.11}s` }} />)}
          </div>
          <Stage1Clock file={selfieFile} head={head} done={done} />
        </div>
      </div>
    );
  } else {
    // The application itself — name, contact, role — read line by line.
    specimen = (
      <div className="vora-s1-specimen">
        <div className="vora-s1-doc" aria-hidden>
          {[92, 68, 84, 57].map((w, i) => <span key={i} className="vora-s1-line" style={{ width: `${w}%` }} />)}
          {!done && <span className="vora-s1-scan" />}
        </div>
      </div>
    );
  }

  return (
    <div className={`vora-s1-agent ${done ? "is-done" : ""}`}>
      <div className="vora-s1-agent-head">
        <span className="vora-s1-agent-name">{agent.name}</span>
        <span className="vora-s1-agent-input">{agent.input}</span>
        <span className="vora-s1-agent-pct">{pct}%</span>
      </div>
      {specimen}
      <ul className="vora-s1-steps">
        {agent.steps.map((label, i) => (
          <li key={label} className={`vora-s1-step is-${states[i]}`}>
            <span className="vora-s1-step-mark">
              {states[i] === "done" ? "●" : states[i] === "active" ? "◌" : "○"}
            </span>
            {stepLabel(label, i)}
          </li>
        ))}
      </ul>
    </div>
  );
}

// "0:12 / 0:47" — the playhead over the applicant's actual clip length.
function Stage1Clock({ file, head, done }) {
  const [duration, setDuration] = useState(0);
  useEffect(() => {
    if (!file || typeof file.type !== "string" || !file.type.startsWith("video/")) { setDuration(0); return undefined; }
    let url = "";
    try { url = URL.createObjectURL(file); } catch { return undefined; }
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    const onMeta = () => { if (Number.isFinite(v.duration)) setDuration(v.duration); URL.revokeObjectURL(url); };
    v.addEventListener("loadedmetadata", onMeta, { once: true });
    v.src = url;
    return () => { try { v.removeAttribute("src"); v.load(); } catch { /* */ } };
  }, [file]);
  if (!duration) return <span className="vora-s1-clock">{done ? "complete" : "listening"}</span>;
  return <span className="vora-s1-clock">{fmtClock(duration * (done ? 1 : head))} / {fmtClock(duration)}</span>;
}

/* Body scroll lock shared by every full-screen layer (apply overlay, Stage 1
   processing, the clip pop-out, the funnel scan). Reference-counted so nested
   layers unmounting in any order hand the page back exactly once. */
let bodyLockDepth = 0;
let bodyLockPrev = "";
function lockBodyScroll() {
  if (typeof document === "undefined") return () => {};
  if (bodyLockDepth++ === 0) {
    bodyLockPrev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    bodyLockDepth = Math.max(0, bodyLockDepth - 1);
    if (bodyLockDepth === 0) document.body.style.overflow = bodyLockPrev;
  };
}

const STAGE1_CSS = `
        .vora-s1-lock { position: fixed; inset: 0; z-index: 2147483000; background: #000; color: #fff; overflow-y: auto; -webkit-overflow-scrolling: touch; animation: voraS1In 0.45s ease; }
        .vora-s1-lock-inner { min-height: 100%; display: flex; align-items: center; justify-content: center; padding: 28px 20px 40px; box-sizing: border-box; }
        .vora-apply-lock-inner { max-width: 640px; margin: 0 auto; padding: 24px 20px calc(72px + env(safe-area-inset-bottom)); box-sizing: border-box; }
        .vora-apply-lock-head { display: flex; align-items: center; gap: 14px; margin-bottom: 28px; min-height: 36px; }
        .vora-apply-lock-title { flex: 1; min-width: 0; font-family: 'Geist Mono', monospace; font-size: 10px; font-weight: 500; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(255,255,255,0.6); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .vora-apply-lock-close { appearance: none; flex: none; width: 36px; height: 36px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.06); color: #fff; font: 400 22px/1 'Switzer', sans-serif; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: background 0.2s ease; }
        .vora-apply-lock-close:hover { background: rgba(255,255,255,0.12); }
        .vora-s1 { width: 100%; max-width: 780px; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 18px 18px 20px; background: rgba(255,255,255,0.02); box-sizing: border-box; }
        .vora-s1-brand { display: flex; margin-bottom: 14px; }
        .vora-s1-head { display: flex; align-items: center; gap: 10px; font-family: 'Geist Mono', monospace; font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(255,255,255,0.6); }
        .vora-s1-head-right { margin-left: auto; color: var(--s1-accent); font-variant-numeric: tabular-nums; flex: none; }
        .vora-s1-grader { display: flex; align-items: center; gap: 12px; font-family: 'Geist Mono', monospace; font-size: 11px; }
        .vora-s1-ai { width: 38px; height: 38px; flex: none; color: var(--s1-accent); transition: color 0.4s ease; }
        .vora-s1-ai.is-passed { color: #22C55E; }
        .vora-s1-ai.is-grading .vora-s1-ai-eye { animation: voraS1Wink 3s ease-in-out infinite; transform-origin: center; transform-box: fill-box; }
        .vora-s1-ai.is-grading .vora-s1-ai-ant, .vora-s1-ai.is-uploading .vora-s1-ai-ant { animation: voraS1Blink 1.1s ease-in-out infinite; }
        .vora-s1-grader-text { min-width: 0; flex: 1; }
        .vora-s1-grader-title { font-family: 'Switzer', sans-serif; font-size: 18px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.15; color: #fff; }
        .vora-s1-grader-sub { margin-top: 3px; font-family: 'Geist Mono', monospace; font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: rgba(255,255,255,0.5); font-variant-numeric: tabular-nums; }
        .vora-s1-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--s1-accent); animation: voraS1Blink 1.1s ease-in-out infinite; flex: none; }
        .vora-s1-dot.is-done { background: #22C55E; animation: none; }
        .vora-s1-agents { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; }
        .vora-s1-agents.is-single { grid-template-columns: 1fr; }
        .vora-s1-lock.is-done .vora-s1-lock-inner { padding-bottom: 170px; }
        .vora-s1-agent { border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px; background: #000; min-width: 0; }
        .vora-s1-agent-head { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
        .vora-s1-agent-name { font-family: 'Switzer', sans-serif; font-size: 14px; font-weight: 600; color: #fff; white-space: nowrap; }
        .vora-s1-agent-input { font-family: 'Geist Mono', monospace; font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255,255,255,0.4); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
        .vora-s1-agent-pct { margin-left: auto; font-family: 'Geist Mono', monospace; font-size: 11px; color: var(--s1-accent); font-variant-numeric: tabular-nums; flex: none; }
        .vora-s1-specimen { display: flex; gap: 10px; align-items: stretch; margin: 12px 0; min-height: 96px; }
        .vora-s1-tile { position: relative; width: 64px; height: 88px; border-radius: 8px; overflow: hidden; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); flex: none; display: flex; align-items: center; justify-content: center; transition: border-color 0.4s ease; }
        .vora-s1-tile.is-large { width: 112px; height: 188px; }
        .vora-s1-tile.is-scanning { border-color: rgba(var(--s1-rgb), 0.7); }
        .vora-s1-tile.is-done { border-color: rgba(var(--s1-rgb), 0.45); }
        .vora-s1-tile img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .vora-s1-tile-glyph { font-family: 'Geist Mono', monospace; font-size: 10px; letter-spacing: 0.12em; color: rgba(255,255,255,0.6); }
        .vora-s1-tile-scan { position: absolute; left: 0; right: 0; top: 0; height: 2px; background: var(--s1-accent); box-shadow: 0 0 0 0 transparent; animation: voraS1TileScan 1.5s linear infinite; }
        .vora-s1-tile-dur { position: absolute; top: 4px; right: 4px; padding: 1px 4px; border-radius: 3px; background: rgba(0,0,0,0.7); font-family: 'Geist Mono', monospace; font-size: 8.5px; color: rgba(255,255,255,0.85); font-variant-numeric: tabular-nums; }
        .vora-s1-tile-name { position: absolute; left: 0; right: 0; bottom: 0; padding: 3px 5px; background: rgba(0,0,0,0.7); font-family: 'Geist Mono', monospace; font-size: 7.5px; letter-spacing: 0.02em; color: rgba(255,255,255,0.8); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .vora-s1-audio { display: flex; flex-direction: column; justify-content: center; gap: 10px; min-width: 0; flex: 1; }
        .vora-s1-wave { display: flex; align-items: center; gap: 3px; height: 32px; }
        .vora-s1-wave i { display: block; width: 3px; height: 60%; border-radius: 2px; background: var(--s1-accent); animation: voraS1Wave 0.9s ease-in-out infinite; transform-origin: center; }
        .vora-s1-wave.is-idle i { animation: none; height: 14%; opacity: 0.45; }
        .vora-s1-clock { font-family: 'Geist Mono', monospace; font-size: 10.5px; letter-spacing: 0.06em; color: rgba(255,255,255,0.65); font-variant-numeric: tabular-nums; }
        .vora-s1-doc { position: relative; overflow: hidden; flex: 1; padding: 10px; border-radius: 8px; background: rgba(255,255,255,0.03); display: flex; flex-direction: column; gap: 6px; justify-content: center; }
        .vora-s1-line { display: block; height: 5px; border-radius: 3px; background: rgba(255,255,255,0.09); }
        .vora-s1-scan { position: absolute; left: 0; right: 0; top: 0; height: 2px; background: var(--s1-accent); animation: voraS1Scan 1.6s linear infinite; }
        .vora-s1-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
        .vora-s1-step { display: flex; align-items: center; gap: 8px; font-family: 'Geist Mono', monospace; font-size: 10.5px; letter-spacing: 0.02em; color: rgba(255,255,255,0.32); transition: color 0.3s ease; min-width: 0; }
        .vora-s1-step.is-active { color: rgba(255,255,255,0.9); }
        .vora-s1-step.is-done { color: rgba(255,255,255,0.6); }
        .vora-s1-step-mark { width: 12px; text-align: center; color: var(--s1-accent); flex: none; }
        .vora-s1-step.is-pending .vora-s1-step-mark { color: rgba(255,255,255,0.25); }
        .vora-s1-step.is-active .vora-s1-step-mark { display: inline-block; animation: voraS1Spin 0.9s linear infinite; }
        .vora-s1-track { display: flex; align-items: center; gap: 10px; margin-top: 16px; }
        .vora-s1-node { width: 22px; height: 22px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.18); display: flex; align-items: center; justify-content: center; font-family: 'Geist Mono', monospace; font-size: 10px; color: rgba(255,255,255,0.4); transition: border-color 0.4s ease, color 0.4s ease; flex: none; }
        .vora-s1-node.is-on { border-color: var(--s1-accent); color: var(--s1-accent); }
        .vora-s1-node.is-next { border-color: #22C55E; color: #22C55E; }
        .vora-s1-rail { flex: 1; height: 1px; background: rgba(255,255,255,0.12); position: relative; }
        .vora-s1-rail-fill { position: absolute; left: 0; top: 0; bottom: 0; background: #22C55E; transition: width 0.3s ease; }
        .vora-s1-result { margin-top: 16px; opacity: 0; transform: translateY(6px); transition: opacity 0.5s ease, transform 0.5s ease; }
        .vora-s1-result.is-visible { opacity: 1; transform: none; }
        .vora-s1-result-title { font-family: 'Switzer', sans-serif; font-size: 22px; font-weight: 600; letter-spacing: -0.02em; color: #fff; }
        .vora-s1-result-sub { margin-top: 4px; font-family: 'Switzer', sans-serif; font-size: 13.5px; color: rgba(255,255,255,0.6); }
        .vora-s1-sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 2; padding: 16px 20px calc(18px + env(safe-area-inset-bottom)); background: rgba(8,8,8,0.96); border-top: 1px solid rgba(255,255,255,0.1); box-sizing: border-box; animation: voraS1Up 0.45s cubic-bezier(0.22, 1, 0.36, 1); }
        .vora-s1-sheet.is-cleared { background: #22C55E; color: #000; border-top-color: transparent; }
        .vora-s1-sheet-btn, .vora-s1-sheet-body { width: 100%; max-width: 780px; margin: 0 auto; display: flex; flex-direction: column; align-items: flex-start; gap: 4px; box-sizing: border-box; }
        .vora-s1-sheet-btn { appearance: none; border: none; background: transparent; color: inherit; padding: 0; cursor: pointer; text-align: left; font: inherit; }
        .vora-s1-sheet-title { font-family: 'Switzer', sans-serif; font-size: 22px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.15; }
        .vora-s1-sheet-sub { font-family: 'Geist Mono', monospace; font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; opacity: 0.72; }
        .vora-s1-sheet-bar { display: block; width: 100%; height: 3px; margin-top: 10px; border-radius: 2px; background: rgba(0,0,0,0.16); overflow: hidden; }
        .vora-s1-sheet-fill { display: block; height: 100%; width: 100%; background: #000; transform-origin: left center; transform: scaleX(0); animation: voraS1Drain 2.8s linear forwards; }
        .vora-s1-sheet-body .vora-s1-cta { margin-top: 10px; }
        .vora-s1-cta { margin-top: 14px; width: 100%; appearance: none; border: none; border-radius: 10px; padding: 16px 20px; background: #22C55E; color: #000; font-family: 'Geist Mono', monospace; font-size: 11.5px; font-weight: 600; letter-spacing: 0.22em; text-transform: uppercase; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; }
        .vora-s1-cta:disabled { opacity: 0.35; cursor: default; }
        .vora-s1-foot { margin-top: 14px; text-align: center; font-family: 'Geist Mono', monospace; font-size: 9.5px; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(255,255,255,0.35); font-variant-numeric: tabular-nums; }
        @media (max-width: 620px) {
          .vora-s1-lock-inner { padding: 16px 12px 28px; align-items: flex-start; }
          .vora-s1 { padding: 14px 14px 18px; }
          .vora-s1-agents { grid-template-columns: 1fr; }
          .vora-s1-tile.is-large { width: 96px; height: 160px; }
        }
        @keyframes voraS1In { from { opacity: 0; } to { opacity: 1; } }
        @keyframes voraS1Blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
        @keyframes voraS1Scan { from { transform: translateY(0); } to { transform: translateY(72px); } }
        @keyframes voraS1TileScan { from { transform: translateY(-2px); } to { transform: translateY(190px); } }
        @keyframes voraS1Wave { 0%, 100% { transform: scaleY(0.35); } 50% { transform: scaleY(1); } }
        @keyframes voraS1Spin { to { transform: rotate(360deg); } }
        @keyframes voraS1Wink { 0%, 90%, 100% { transform: scaleY(1); } 95% { transform: scaleY(0.15); } }
        @keyframes voraS1Up { from { transform: translateY(100%); } to { transform: none; } }
        @keyframes voraS1Drain { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @media (prefers-reduced-motion: reduce) {
          .vora-s1-scan, .vora-s1-tile-scan, .vora-s1-dot, .vora-s1-wave i { animation: none; }
          .vora-s1-step.is-active .vora-s1-step-mark { animation: none; }
          .vora-s1-sheet { animation: none; }
          .vora-s1-sheet-fill { animation-duration: 1.9s; }
          .vora-s1-ai * { animation: none; }
        }
      `;

// A quiet robot mark for the grader: the eyes blink while it reads and the
// antenna pulses; it turns green on a pass.
function AiGlyph({ state = "grading" }) {
  return (
    <svg className={`vora-s1-ai is-${state}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="8" width="16" height="12" rx="4" />
      <path d="M12 8V5" />
      <circle className="vora-s1-ai-ant" cx="12" cy="3.6" r="1.2" fill="currentColor" stroke="none" />
      <circle className="vora-s1-ai-eye" cx="9" cy="14" r="1.4" fill="currentColor" stroke="none" />
      <circle className="vora-s1-ai-eye" cx="15" cy="14" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

function Stage1Processing({ job, files, linkFallbacks, progress = null, submitted = true, stage2 = null, onDone }) {
  const b = BRAND[job.color] || BRAND.blue;
  const token = stage2 && stage2.token ? stage2.token : "";
  const reduced = useReducedMotion();
  const exp = useMemo(() => fileList(files && files.experience), [files]);
  const selfie = useMemo(() => fileList(files && files.selfie), [files]);
  const expLink = isLikelyUrl(linkFallbacks && linkFallbacks.experience) ? String(linkFallbacks.experience).trim() : "";
  const selfieLink = isLikelyUrl(linkFallbacks && linkFallbacks.selfie) ? String(linkFallbacks.selfie).trim() : "";
  const agents = useMemo(() => stage1Agents(job, exp, selfie, expLink, selfieLink), [job, exp, selfie, expLink, selfieLink]);

  // The whole run is planned once: 9–12 s total (2 s under reduced
  // motion); the experience agent lands ~70% in, presence ~92%, and the
  // last stretch is the handoff to Stage 2.
  // Nothing uploaded → there is little to read: 5–6.5 s instead of 7–9.
  const light = exp.length === 0 && selfie.length === 0 && !expLink && !selfieLink;
  const plan = useMemo(() => {
    const total = reduced ? 2000 : light ? 5000 + Math.round(Math.random() * 1500) : 7000 + Math.round(Math.random() * 2000);
    const jitter = () => (reduced ? 0 : (Math.random() - 0.5) * 0.06);
    const j = (arr) => arr.map((f) => Math.min(1, Math.max(0.05, f + jitter())));
    return {
      total,
      agents: {
        experience: { end: STAGE1_AGENT_PLANS.experience.end, steps: j(STAGE1_AGENT_PLANS.experience.steps) },
        presence: { end: STAGE1_AGENT_PLANS.presence.end, steps: j(STAGE1_AGENT_PLANS.presence.steps) },
        application: { end: STAGE1_AGENT_PLANS.application.end, steps: j(STAGE1_AGENT_PLANS.application.steps) },
      },
    };
  }, [reduced, light]);

  // The clock starts when the application has landed (`submitted`); until
  // then the overlay shows the real upload.
  const [t0, setT0] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (submitted && t0 == null) setT0(Date.now()); }, [submitted, t0]);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 80);
    return () => window.clearInterval(id);
  }, []);
  const elapsed = t0 == null ? 0 : now - t0;
  const uploading = !submitted;
  const uploadPct = Math.max(0, Math.min(100, Math.round((progress && progress.overallPct) || 0)));
  const uploadLabel = progress && progress.phase === "finalizing" ? "almost there" : (uploadPct > 0 ? `${uploadPct}%` : "");

  // The page behind is locked while this is up; the overlay itself scrolls
  // on short screens. Restored when the applicant continues to Stage 2.
  useEffect(() => {
    return lockBodyScroll();
  }, []);

  const t = uploading ? 0 : Math.min(1, elapsed / plan.total);
  const done = !uploading && t >= 1;
  const handoff = Math.max(0, Math.min(1, (t - 0.9) / 0.1));
  const secondsLeft = Math.max(0, Math.ceil((plan.total - elapsed) / 1000));
  const cleared = done && !!token;
  // A pass moves on by itself: the sheet says so, then Stage 2 opens.
  useEffect(() => {
    if (!cleared) return undefined;
    const id = window.setTimeout(() => goToStage2(token), reduced ? 1900 : 2800);
    return () => window.clearTimeout(id);
  }, [cleared, token, reduced]);

  const overlay = (
    <div className={`vora-s1-lock${done ? " is-done" : ""}`} style={{ "--s1-accent": b.hex, "--s1-rgb": b.rgb }} role="dialog" aria-modal="true" aria-label="Application processing">
      <div className="vora-s1-lock-inner">
        <div className="vora-s1" role="status" aria-live="polite">
          <div className="vora-s1-brand"><VoraLogo height={22} /></div>
          <div className="vora-s1-grader">
            <AiGlyph state={uploading ? "uploading" : done ? (cleared ? "passed" : "done") : "grading"} />
            <div className="vora-s1-grader-text">
              <div className="vora-s1-grader-title">
                {uploading ? "Uploading your submission" : done ? (cleared ? "Passed." : "Received.") : "AI is grading your submission"}
              </div>
              <div className="vora-s1-grader-sub">
                {uploading ? "Stage 1 · keep this tab open" : done ? "Stage 1 complete" : `Stage 1 · keep this tab open · about ${secondsLeft}s`}
              </div>
            </div>
            {!done && (
              <span className="vora-s1-head-right">{`${uploading ? Math.round(uploadPct * 0.3) : Math.round(30 + t * 70)}%`}</span>
            )}
          </div>

          <div className={`vora-s1-agents${agents.length === 1 ? " is-single" : ""}`}>
            {agents.map((agent) => (
              <Stage1AgentCard
                key={agent.id}
                agent={agent}
                plan={plan.agents[agent.id]}
                t={t}
                exp={exp}
                expLink={expLink}
                selfie={selfie}
                selfieLink={selfieLink}
                uploading={uploading}
                uploadPct={uploadPct}
                uploadLabel={uploadLabel}
              />
            ))}
          </div>

          <div className="vora-s1-track" aria-hidden>
            <span className="vora-s1-node is-on">1</span>
            <span className="vora-s1-rail">
              <span className="vora-s1-rail-fill" style={{ width: `${Math.round((done ? 1 : handoff) * 100)}%` }} />
            </span>
            <span className={`vora-s1-node ${cleared ? "is-next" : ""}`}>2</span>
          </div>

        </div>
      </div>

      {/* The verdict is pinned to the bottom of the screen so it is seen
          without scrolling — on a phone the cards run past the fold. A pass
          is a tappable sheet that opens Stage 2 on its own. */}
      {done && (
        <div className={`vora-s1-sheet${cleared ? " is-cleared" : ""}`} role="status" aria-live="assertive">
          {cleared ? (
            <button type="button" className="vora-s1-sheet-btn" onClick={() => goToStage2(token)}>
              <span className="vora-s1-sheet-title">You passed Stage 1.</span>
              <span className="vora-s1-sheet-sub">Opening Stage 2</span>
              <span className="vora-s1-sheet-bar" aria-hidden><span className="vora-s1-sheet-fill" /></span>
            </button>
          ) : (
            <div className="vora-s1-sheet-body">
              <span className="vora-s1-sheet-title">Application received.</span>
              <span className="vora-s1-sheet-sub">We review every applicant within 48 hours</span>
              <button type="button" className="vora-s1-cta" onClick={() => { if (onDone) onDone(); }}>Done</button>
            </div>
          )}
        </div>
      )}

      <style>{STAGE1_CSS}</style>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(overlay, document.body) : overlay;
}

// Dev-only demo (see the /__stage1-demo route): the processing overlay with
// real files, so the thumbnail capture and the clock run for real.
function Stage1Demo() {
  const [files, setFiles] = useState(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/stage2-viral.mp4").then((r) => r.blob()),
      fetch("/stage2-viral-poster.jpg").then((r) => r.blob()),
    ]).then(([video, still]) => {
      if (cancelled) return;
      setFiles({
        experience: [
          new File([still], "portfolio-still.jpg", { type: "image/jpeg" }),
          new File([video], "showreel-2026.mp4", { type: "video/mp4" }),
        ],
        selfie: [new File([video], "selfie-intro.mp4", { type: "video/mp4" })],
      });
    }).catch(() => { if (!cancelled) setFiles({ experience: [], selfie: [] }); });
    return () => { cancelled = true; };
  }, []);
  const demoJob = SEED_JOBS.find((j) => j.id === 1);
  return (
    <main style={{ background: "#000", color: "#fff", minHeight: "100vh" }}>
      {files && <Stage1Processing job={demoJob} files={files} linkFallbacks={{}} progress={{ phase: "ok", overallPct: 100 }} submitted stage2={{ token: "demo-token-000000", status: "invited" }} />}
    </main>
  );
}

/* ─── Stage 2 page (/stage-2/<token>) ─── */

// Draft that survives a reload / a dropped connection mid-answer.
function useStage2Draft(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const saved = window.localStorage.getItem(key);
      return saved != null ? saved : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try { window.localStorage.setItem(key, value); } catch { /* private mode */ }
  }, [key, value]);
  return [value, setValue];
}

function AutoGrowTextarea({ value, onChange, placeholder, minRows = 5, mono = false, ariaLabel, onPaste }) {
  const ref = useRef(null);
  // Grow to fit without ever collapsing first. The usual trick (height =
  // "auto", read scrollHeight, set height) shrinks the box for the
  // measurement; the document gets shorter, and a phone scrolled down to
  // the box gets its scroll position clamped upward on EVERY keystroke —
  // the "it scrolls up on me" bug. Pinning the current height as a floor
  // during the measurement makes typing grow-only; a real re-measure
  // (allowing shrink) runs on blur, when no one is typing.
  const fit = (allowShrink) => {
    const el = ref.current;
    if (!el) return;
    const floor = allowShrink ? 0 : el.offsetHeight;
    el.style.minHeight = floor ? `${floor}px` : "";
    el.style.height = "auto";
    const next = el.scrollHeight + 2;
    el.style.minHeight = "";
    el.style.height = `${Math.max(next, floor)}px`;
  };
  useEffect(() => { fit(false); }, [value]);
  return (
    <textarea
      ref={ref}
      className={`vora-s2-ta ${mono ? "is-mono" : ""}`}
      rows={minRows}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => fit(true)}
      onPaste={onPaste}
      spellCheck="true"
    />
  );
}

function Stage2Progress({ step, total = 2 }) {
  return (
    <span className="vora-s2-prog" aria-label={`${total > 2 ? "Part" : "Question"} ${step} of ${total}`}>
      {Array.from({ length: total }, (_, i) => <span key={i} className={step >= i + 1 ? "is-on" : ""} />)}
    </span>
  );
}

// Watch-time from timeupdate deltas (seeks reset the baseline; a gap over
// 1.5 s between ticks is a jump, not watching). Shared by the inline
// player and the pop-out so both count toward the same total.
function useWatchTracker(statsRef) {
  const lastRef = useRef(null);
  const onTime = (e) => {
    const el = e.currentTarget;
    const now = el.currentTime;
    if (lastRef.current != null && !el.paused && now > lastRef.current) {
      const d = now - lastRef.current;
      if (d < 1.5) statsRef.current.watchMs += Math.round(d * 1000);
    }
    lastRef.current = now;
  };
  const onSeeking = () => { lastRef.current = null; };
  const onPlay = () => { statsRef.current.plays += 1; };
  return { onTime, onSeeking, onPlay };
}

/* ─── Site video player ───
   One quiet player for every clip on the site (the role briefings, the
   Stage 2 intro, the viral clip): no native chrome sitting over the picture.
   The poster waits under a "Tap for sound" pill; the first tap starts
   playback WITH sound (a real gesture, so autoplay policy is satisfied).
   After that a tap toggles pause, a thin line along the bottom shows and
   seeks progress, and "⤢ Larger" opens the centred pop-out — a happy medium,
   not the browser's take-over fullscreen. */
const VORA_VIDEO_CSS = `
  .vora-vid { position: relative; width: 100%; background: #000; overflow: hidden; -webkit-tap-highlight-color: transparent; }
  .vora-vid video { width: 100%; height: 100%; display: block; background: #000; }
  .vora-vid.is-cover video { object-fit: cover; }
  .vora-vid.is-contain video { object-fit: contain; }
  .vora-vid-hit { position: absolute; inset: 0; cursor: pointer; z-index: 1; }
  .vora-vid-hit:focus-visible { outline: 2px solid #fff; outline-offset: -3px; }
  .vora-vid-shade { position: absolute; inset: 0; display: flex; align-items: flex-end; justify-content: center; padding: 22px; background: linear-gradient(180deg, rgba(0,0,0,0) 60%, rgba(0,0,0,0.45) 100%); pointer-events: none; }
  .vora-vid-pill { display: inline-flex; align-items: center; gap: 10px; padding: 10px 18px 10px 14px; border-radius: 999px; background: rgba(0,0,0,0.62); border: 1px solid rgba(var(--vid-rgb), 0.45); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); color: #fff; font-family: 'Switzer', sans-serif; font-size: 13.5px; font-weight: 500; letter-spacing: -0.005em; box-shadow: 0 0 22px rgba(var(--vid-rgb), 0.35); }
  .vora-vid-paused { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
  .vora-vid-paused span { width: 56px; height: 56px; border-radius: 50%; background: rgba(0,0,0,0.55); border: 1px solid rgba(255,255,255,0.25); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 18px; padding-left: 4px; box-sizing: border-box; }
  .vora-vid-spin { width: 34px; height: 34px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.25); border-top-color: #fff; animation: voraVidSpin 0.8s linear infinite; }
  @keyframes voraVidSpin { to { transform: rotate(360deg); } }
  .vora-vid-bar { position: absolute; left: 0; right: 0; bottom: 0; height: 26px; display: flex; align-items: flex-end; cursor: pointer; z-index: 2; touch-action: none; }
  .vora-vid-line { position: relative; width: 100%; height: 3px; background: rgba(255,255,255,0.22); transition: height 0.15s ease; }
  .vora-vid-bar:hover .vora-vid-line, .vora-vid.is-scrubbing .vora-vid-line { height: 5px; }
  .vora-vid-fill { position: absolute; left: 0; top: 0; bottom: 0; background: var(--vid-accent); }
  .vora-vid.is-scrubbing .vora-vid-fill { transition: none; }
  .vora-vid-knob { position: absolute; top: 50%; width: 12px; height: 12px; margin-left: -6px; border-radius: 50%; background: #fff; transform: translateY(-50%) scale(0.6); opacity: 0; transition: opacity 0.15s ease, transform 0.15s ease; }
  .vora-vid-bar:hover .vora-vid-knob, .vora-vid.is-scrubbing .vora-vid-knob { opacity: 1; transform: translateY(-50%) scale(1); }
  @media (max-width: 760px) { .vora-vid-larger { display: none; } }
  .vora-vid-time { position: absolute; right: 10px; bottom: 10px; padding: 2px 6px; border-radius: 4px; background: rgba(0,0,0,0.55); font-family: 'Geist Mono', monospace; font-size: 10px; color: rgba(255,255,255,0.85); font-variant-numeric: tabular-nums; pointer-events: none; z-index: 2; }
  .vora-vid-larger { position: absolute; top: 8px; right: 8px; z-index: 3; appearance: none; border: 1px solid rgba(255,255,255,0.25); background: rgba(0,0,0,0.6); color: #fff; border-radius: 999px; padding: 6px 10px; font-family: 'Geist Mono', monospace; font-size: 9.5px; letter-spacing: 0.14em; text-transform: uppercase; cursor: pointer; }
  .vora-vid-larger:hover { background: rgba(0,0,0,0.8); }
  @media (prefers-reduced-motion: no-preference) { .vora-vid-fill { transition: width 0.2s linear; } }
`;
function VoraVideoStyle() {
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const id = "vora-video-css";
    if (document.getElementById(id)) return undefined;
    const el = document.createElement("style");
    el.id = id;
    el.textContent = VORA_VIDEO_CSS;
    document.head.appendChild(el);
    return undefined;
  }, []);
  return null;
}
function SoundGlyph({ color }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 5L6 9H2v6h4l5 4V5z" />
      <path d="M16 9c1 1 1.5 2 1.5 3s-.5 2-1.5 3" />
      <path d="M19 6c2 2 3 4 3 6s-1 4-3 6" />
    </svg>
  );
}
function VoraVideo({
  src, poster = "", aspect = "16 / 9", fit = "cover", accent = BRAND.blue,
  videoRef = null, track = null, startAt = 0, autoPlay = false, onEnded = null, onLarger = null,
  className = "", style = {},
}) {
  const innerRef = useRef(null);
  const ref = videoRef || innerRef;
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [remaining, setRemaining] = useState(0);
  // Stall recovery: a byte-range request that hangs at the CDN leaves the
  // element "waiting" indefinitely (seen on apply-vora.com, ~1 request in
  // a dozen). If playback hasn't moved for a few seconds, re-request from
  // the same spot — first with a tiny seek, then by reloading the source.
  const [buffering, setBuffering] = useState(false);
  const stallRef = useRef({ timer: 0, tries: 0, at: -1 });
  const resumeRef = useRef(null);
  const clearStall = () => {
    if (stallRef.current.timer) window.clearTimeout(stallRef.current.timer);
    stallRef.current.timer = 0;
  };
  const armStall = () => {
    clearStall();
    const v = ref.current;
    if (!v) return;
    stallRef.current.at = v.currentTime;
    stallRef.current.timer = window.setTimeout(() => {
      const el = ref.current;
      if (!el || el.paused || el.ended) return;
      if (el.currentTime > stallRef.current.at + 0.05) return;
      const t = el.currentTime;
      stallRef.current.tries += 1;
      if (stallRef.current.tries === 1) {
        try { el.currentTime = t + 0.01; } catch { /* */ }
      } else {
        resumeRef.current = t;
        try { el.load(); } catch { /* */ }
        const p = el.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      }
      armStall();
    }, 3500);
  };
  useEffect(() => () => clearStall(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const play = () => {
    const v = ref.current;
    if (!v) return;
    v.muted = false;
    v.volume = 1;
    const p = v.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  };
  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (!started) { setStarted(true); play(); return; }
    if (v.paused || v.ended) play(); else v.pause();
  };
  // The pop-out opens from a tap on "Larger", so it may start straight away.
  useEffect(() => {
    if (!autoPlay) return undefined;
    setStarted(true);
    play();
    return undefined;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // The line along the bottom scrubs: press or drag anywhere on it to move
  // back and forward. Pointer capture keeps a drag alive off the line.
  const barRef = useRef(null);
  const dragRef = useRef(false);
  const [scrubbing, setScrubbing] = useState(false);
  const seekTo = (clientX) => {
    const v = ref.current;
    const bar = barRef.current;
    if (!v || !bar || !v.duration) return;
    const r = bar.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - r.left) / Math.max(1, r.width)));
    try { v.currentTime = x * v.duration; } catch { /* */ }
    setProgress(x);
  };
  const onBarDown = (e) => {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = true;
    setScrubbing(true);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* */ }
    seekTo(e.clientX);
  };
  const onBarMove = (e) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    seekTo(e.clientX);
  };
  const onBarUp = (e) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    dragRef.current = false;
    setScrubbing(false);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* */ }
    if (!started) { setStarted(true); play(); }
  };
  const label = !started ? "Play with sound" : playing ? "Pause" : "Play";
  return (
    <div
      className={`vora-vid ${fit === "contain" ? "is-contain" : "is-cover"}${scrubbing ? " is-scrubbing" : ""} ${className}`}
      style={{ "--vid-accent": accent.hex, "--vid-rgb": accent.rgb, ...(aspect ? { aspectRatio: aspect } : {}), ...style }}
    >
      <VoraVideoStyle />
      <video
        ref={ref}
        src={src}
        poster={poster || undefined}
        playsInline
        preload="metadata"
        disablePictureInPicture
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          const resume = resumeRef.current;
          resumeRef.current = null;
          const at = resume != null ? resume : startAt;
          if (at > 0) { try { v.currentTime = at; } catch { /* */ } }
          if (v.duration > 0) setRemaining(v.duration - v.currentTime);
        }}
        // Only real progress on the timeline clears a stall: a nudge can make
        // the element report "playing" while the chunk it needs never arrives.
        onWaiting={() => { setBuffering(true); if (!stallRef.current.timer) armStall(); }}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          if (v.duration > 0) {
            if (!dragRef.current) setProgress(v.currentTime / v.duration);
            setRemaining(v.duration - v.currentTime);
          }
          if (stallRef.current.timer && v.currentTime > stallRef.current.at + 0.25) {
            clearStall();
            stallRef.current.tries = 0;
            setBuffering(false);
          }
          if (track) track.onTime(e);
        }}
        onPlay={(e) => { setPlaying(true); setStarted(true); if (track) track.onPlay(e); }}
        onPause={() => { setPlaying(false); setBuffering(false); clearStall(); }}
        onSeeking={(e) => { if (track) track.onSeeking(e); }}
        onEnded={(e) => { setPlaying(false); if (onEnded) onEnded(e); }}
      />
      <div
        className="vora-vid-hit"
        role="button"
        tabIndex={0}
        aria-label={label}
        onClick={toggle}
        onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); } }}
      >
        {!started && (
          <div className="vora-vid-shade" aria-hidden>
            <div className="vora-vid-pill"><SoundGlyph color={accent.hex} />Tap for sound</div>
          </div>
        )}
        {started && !playing && !buffering && (
          <div className="vora-vid-paused" aria-hidden><span>▶</span></div>
        )}
        {started && buffering && (
          <div className="vora-vid-paused" aria-hidden><i className="vora-vid-spin" /></div>
        )}
      </div>
      {started && (
        <div
          ref={barRef}
          className="vora-vid-bar"
          onPointerDown={onBarDown}
          onPointerMove={onBarMove}
          onPointerUp={onBarUp}
          onPointerCancel={onBarUp}
          onClick={(e) => e.stopPropagation()}
          aria-hidden
        >
          <div className="vora-vid-line">
            <div className="vora-vid-fill" style={{ width: `${Math.round(progress * 1000) / 10}%` }} />
            <span className="vora-vid-knob" style={{ left: `${Math.round(progress * 1000) / 10}%` }} />
          </div>
        </div>
      )}
      {started && playing && remaining > 0.5 && <span className="vora-vid-time" aria-hidden>{fmtClock(remaining)}</span>}
      {onLarger && (
        <button type="button" className="vora-vid-larger" onClick={(e) => { e.stopPropagation(); onLarger(); }} aria-label="Watch larger">
          ⤢ Larger
        </button>
      )}
    </div>
  );
}

// The pop-out's own styles, injected once wherever it first opens (the board,
// the Stage 2 landing or the viral clip) so it never depends on a page's sheet.
const VORA_POPOUT_CSS = `
  .vora-s2-pop { position: fixed; inset: 0; z-index: 9000; background: rgba(0,0,0,0.92); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 20px; }
.vora-s2-pop-inner { position: relative; height: min(84vh, calc(92vw * 16 / 9)); aspect-ratio: 9 / 16; max-width: 92vw; border-radius: 14px; overflow: hidden; background: #000; border: 1px solid rgba(255,255,255,0.12); }
.vora-s2-pop-inner video { width: 100%; height: 100%; object-fit: contain; display: block; background: #000; }
.vora-s2-pop-close { position: absolute; top: 10px; right: 10px; z-index: 4; width: 34px; height: 34px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.3); background: rgba(0,0,0,0.6); color: #fff; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.vora-s2-pop-stats { display: flex; gap: 18px; font-family: 'Geist Mono', monospace; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255,255,255,0.5); }
.vora-s2-pop-stats strong { color: #fff; font-family: 'Switzer', sans-serif; font-size: 14px; letter-spacing: -0.01em; text-transform: none; margin-right: 4px; }
`;
function VoraPopoutStyle() {
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const id = "vora-popout-css";
    if (document.getElementById(id)) return undefined;
    const el = document.createElement("style");
    el.id = id;
    el.textContent = VORA_POPOUT_CSS;
    document.head.appendChild(el);
    return undefined;
  }, []);
  return null;
}

// Enlarged player — a centered pop-out, not the browser's fullscreen (which
// takes the whole screen over). Picks up where the inline player was and
// hands the position back on close. Escape or the backdrop closes it.
function Stage2VideoPopout({ src, poster = "", aspect = "9 / 16", accent = BRAND.blue, stats = [], handle = "", platform = "", statsRef = null, startAt = 0, onClose }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const localStats = useRef({ watchMs: 0, plays: 0 });
  const track = useWatchTracker(statsRef || localStats);
  const close = () => closeRef.current(ref.current ? ref.current.currentTime : NaN);
  useEffect(() => {
    const unlock = lockBodyScroll();
    const onKey = (e) => { if (e.key === "Escape") closeRef.current(ref.current ? ref.current.currentTime : NaN); };
    window.addEventListener("keydown", onKey);
    return () => { unlock(); window.removeEventListener("keydown", onKey); };
  }, []);
  // Size the box to the clip's shape: tall clips fill the height, wide ones
  // the width, either way inside the viewport.
  const [aw, ah] = String(aspect).split("/").map((n) => parseFloat(n));
  const wide = Number.isFinite(aw) && Number.isFinite(ah) && aw >= ah;
  const box = wide
    ? { aspectRatio: aspect, width: `min(92vw, calc(84vh * ${aw} / ${ah}))`, height: "auto" }
    : { aspectRatio: aspect, height: `min(84vh, calc(92vw * ${ah} / ${aw}))` };
  const overlay = (
    <div className="vora-s2-pop" onClick={close} role="dialog" aria-modal="true" aria-label="Video">
      <VoraPopoutStyle />
      <div className="vora-s2-pop-inner" style={box} onClick={(e) => e.stopPropagation()}>
        <VoraVideo
          src={src}
          poster={poster}
          aspect={null}
          fit="contain"
          accent={accent}
          videoRef={ref}
          track={track}
          startAt={startAt}
          autoPlay
          style={{ width: "100%", height: "100%" }}
        />
        <button type="button" className="vora-s2-pop-close" onClick={close} aria-label="Close">✕</button>
      </div>
      {(stats.length > 0 || handle) && (
        <div className="vora-s2-pop-stats" onClick={(e) => e.stopPropagation()}>
          {stats.map((m) => <span key={m.label}><strong>{m.value}</strong> {m.label}</span>)}
          {handle && <span><strong>{handle}</strong> {platform}</span>}
        </div>
      )}
    </div>
  );
  return typeof document !== "undefined" ? createPortal(overlay, document.body) : overlay;
}

function ViralVideoCard({ cfg, statsRef }) {
  const v = cfg.viral || {};
  const videoRef = useRef(null);
  const cardRef = useRef(null);
  const track = useWatchTracker(statsRef);
  const [popped, setPopped] = useState(false);
  const [offscreen, setOffscreen] = useState(false);
  // On a phone the clip scrolls away while they type; a small pinned pill
  // brings it back in the pop-out without losing the answer.
  useEffect(() => {
    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver(([entry]) => setOffscreen(!entry.isIntersecting), { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const openPop = () => {
    try { if (videoRef.current) videoRef.current.pause(); } catch { /* */ }
    setPopped(true);
  };
  const closePop = (t) => {
    setPopped(false);
    if (videoRef.current && Number.isFinite(t)) {
      try { videoRef.current.currentTime = t; } catch { /* */ }
    }
  };
  const metrics = (Array.isArray(v.metrics) ? v.metrics : [])
    .map((m) => ({ label: String(m.label || ""), value: fmtCompact(m.value) }))
    .filter((m) => m.label && m.value);
  return (
    <>
      <div className="vora-s2-card vora-s2-videocard" ref={cardRef}>
        <div className="vora-s2-videobox">
          {v.videoUrl ? (
            <VoraVideo
              src={v.videoUrl}
              poster={v.poster || ""}
              aspect={null}
              fit="contain"
              videoRef={videoRef}
              track={track}
              onLarger={openPop}
              style={{ width: "100%", height: "100%" }}
            />
          ) : (
            <div className="vora-s2-plate">
              <span aria-hidden>▶</span>
              <small>Viral clip · coming soon</small>
            </div>
          )}
        </div>
        {(metrics.length > 0 || v.handle) && (
          <div className="vora-s2-stats">
            {metrics.map((m) => (
              <div key={m.label}><span className="vora-s2-stat-v">{m.value}</span><span className="vora-s2-stat-l">{m.label}</span></div>
            ))}
            {v.handle && (
              <div><span className="vora-s2-stat-v vora-s2-handle">{v.handle}</span><span className="vora-s2-stat-l">{v.platform || "account"}</span></div>
            )}
          </div>
        )}
      </div>
      {v.videoUrl && offscreen && !popped && (
        <button type="button" className="vora-s2-pill" onClick={openPop}>▶ Watch the clip</button>
      )}
      {popped && (
        <Stage2VideoPopout
          src={v.videoUrl}
          poster={v.poster || ""}
          aspect="9 / 16"
          stats={metrics}
          handle={v.handle || ""}
          platform={v.platform || ""}
          statsRef={statsRef}
          startAt={videoRef.current ? videoRef.current.currentTime : 0}
          onClose={closePop}
        />
      )}
    </>
  );
}

function Stage2Landing({ a, cfg, busy, err, onBegin, ctaLabel = "Begin Assessment", estimate = "" }) {
  const intro = cfg.intro || {};
  const introRef = useRef(null);
  const [introPop, setIntroPop] = useState(false);
  const openIntro = () => { try { if (introRef.current) introRef.current.pause(); } catch { /* */ } setIntroPop(true); };
  const closeIntro = (t) => {
    setIntroPop(false);
    if (introRef.current && Number.isFinite(t)) { try { introRef.current.currentTime = t; } catch { /* */ } }
  };
  return (
    <section className="vora-s2-landing">
      <h1 className="vora-s2-h1">Your Stage 1 application is approved. Stage 2:</h1>
      <p className="vora-s2-lede">
        {intro.videoUrl
          ? "Watch first:"
          : "One short viral clip and two questions: your read on why it worked, and your fix for the prompt that tries to recreate it."}
      </p>
      {intro.videoUrl && (
        <div className="vora-s2-intro" style={{ aspectRatio: intro.aspect || "16 / 9" }}>
          <VoraVideo
            src={intro.videoUrl}
            poster={intro.poster || ""}
            aspect={null}
            fit="contain"
            videoRef={introRef}
            onLarger={openIntro}
            style={{ width: "100%", height: "100%" }}
          />
        </div>
      )}
      {introPop && (
        <Stage2VideoPopout
          src={intro.videoUrl}
          poster={intro.poster || ""}
          aspect={intro.aspect || "16 / 9"}
          startAt={introRef.current ? introRef.current.currentTime : 0}
          onClose={closeIntro}
        />
      )}
      <button type="button" className="vora-s2-cta" onClick={onBegin} disabled={busy}>
        {busy ? "Starting…" : ctaLabel} <span aria-hidden>→</span>
      </button>
      <div className="vora-s2-cta-sub">{estimate || cfg.estimate}</div>
      {err && <p className="vora-s2-error" role="alert">{err}</p>}
    </section>
  );
}

function Stage2Q1({ cfg, token, busy, err, onSubmit, total = 2 }) {
  const q = cfg.q1;
  const [text, setText] = useStage2Draft(`vora-s2:${token}:q1`, "");
  const [paste, onPaste] = useStage2Pastes(`vora-s2:${token}:q1paste`);
  const chars = text.trim().length;
  const min = q.minChars || 40;
  const ready = chars >= min;
  return (
    <div className="vora-s2-card vora-s2-qcard">
      <div className="vora-s2-eyebrow-row">
        <span className="vora-s2-eyebrow">{total > 2 ? `Part 1 of ${total}` : "Question 1 of 2"}</span>
        <Stage2Progress step={1} total={total} />
      </div>
      <h2 className="vora-s2-h2">{q.title}</h2>
      <p className="vora-s2-prompt">{q.prompt}</p>
      <Stage2Example cfg={q.example} kind="q1" />
      <AutoGrowTextarea value={text} onChange={setText} minRows={7} ariaLabel="Your answer to question 1" onPaste={onPaste} />
      <div className="vora-s2-foot">
        <span className="vora-s2-count">
          {ready ? `${stage2Words(text).length} words` : `${chars} / ${min} characters`}
        </span>
        <button type="button" className="vora-s2-cta vora-s2-cta-sm" disabled={!ready || busy} onClick={() => onSubmit(text, paste)}>
          {busy ? "Submitting…" : "Submit answer 1"} <span aria-hidden>→</span>
        </button>
      </div>
      {err && <p className="vora-s2-error" role="alert">{err}</p>}
    </div>
  );
}

// Pastes into an answer box: how many and how much text. Reviewers see
// this beside the answer (it isn't a block — pasting a URL is fine). Kept
// in localStorage with the draft so a reload mid-answer doesn't reset it.
function useStage2Pastes(key) {
  const [paste, setPaste] = useStage2DraftJson(key, { pastes: 0, pastedChars: 0 });
  const onPaste = (e) => {
    let len = 0;
    try { len = (e.clipboardData && e.clipboardData.getData("text") || "").length; } catch { /* */ }
    setPaste((p) => ({ pastes: (p.pastes || 0) + 1, pastedChars: (p.pastedChars || 0) + len }));
  };
  return [paste, onPaste];
}

// Small JSON draft (format controls) that survives a reload.
function useStage2DraftJson(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const saved = window.localStorage.getItem(key);
      if (saved) { const parsed = JSON.parse(saved); if (parsed && typeof parsed === "object") return { ...initial, ...parsed }; }
    } catch { /* */ }
    return initial;
  });
  useEffect(() => {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
  }, [key, value]);
  return [value, setValue];
}

function Stage2Q2({ cfg, a, token, busy, err, onSubmit, onRevise, total = 2 }) {
  const q = cfg.q2;
  // The prompt and the control defaults the portal snapshotted at start win
  // over the site copy, so an edit to STAGE2_ASSESSMENT mid-attempt can't
  // change what "unchanged" means for this applicant.
  const original = (a.content && a.content.prompt) || q.draft;
  const defaults = (a.content && a.content.q2Defaults) || q.defaults || { aspect: "9:16", seconds: 20 };
  const [text, setText] = useStage2Draft(`vora-s2:${token}:q2`, original);
  const [paste, onPaste] = useStage2Pastes(`vora-s2:${token}:q2paste`);
  const [revPaste, onRevPaste] = useStage2Pastes(`vora-s2:${token}:q1revpaste`);
  // Aspect is pinned to 9:16 for everyone; a saved draft from the old control is overridden.
  const [fmtRaw, setFmtRaw] = useStage2DraftJson(`vora-s2:${token}:q2fmt`, { aspect: "9:16", seconds: String(defaults.seconds) });
  const fmt = { ...fmtRaw, aspect: "9:16" };
  const setFmt = (v) => setFmtRaw({ ...v, aspect: "9:16" });
  const delta = useMemo(() => wordDelta(original, text), [original, text]);
  const textChanged = text.trim() !== original.trim();
  const secondsNum = Number(fmt.seconds);
  const secondsOk = Number.isFinite(secondsNum) && secondsNum >= 1 && secondsNum <= 600;
  const fmtChanged = secondsOk && secondsNum !== Number(defaults.seconds);
  const changed = textChanged || fmtChanged;
  const chipParts = [];
  if (textChanged) chipParts.push(`+${delta.added} −${delta.removed} words`);
  if (secondsOk && secondsNum !== Number(defaults.seconds)) chipParts.push(`${secondsNum}s`);
  const reset = () => { setText(original); setFmt({ aspect: "9:16", seconds: String(defaults.seconds) }); };

  const committed = a.q1 ? a.q1.current : "";
  const [reviseOpen, setReviseOpen] = useState(false);
  const [rev, setRev] = useState(committed);
  const [revSaved, setRevSaved] = useState(false);
  useEffect(() => { setRev(committed); }, [committed]);
  const revDirty = rev.trim() !== committed.trim() && rev.trim().length > 0;

  return (
    <div className="vora-s2-card vora-s2-qcard">
      <div className="vora-s2-eyebrow-row">
        <span className="vora-s2-eyebrow">{total > 2 ? `Part 2 of ${total}` : "Question 2 of 2"}</span>
        <Stage2Progress step={2} total={total} />
      </div>
      <h2 className="vora-s2-h2">{q.title}</h2>
      <p className="vora-s2-prompt">{q.prompt}</p>
      <Stage2Example cfg={q.example} kind="q2" />

      {/* Format and length sit beside the prompt as controls, so the
          debugging of those two facts isn't buried in the prose. */}
      <div className="vora-s2-fmt">
        <span className="vora-s2-promptlabel">The prompt</span>
        <div className="vora-s2-fmt-controls">
          <label className="vora-s2-fmt-group">
            <span className="vora-s2-fmt-label">Length</span>
            <input
              className="vora-s2-secs"
              type="number"
              inputMode="numeric"
              min={1}
              max={600}
              value={fmt.seconds}
              onChange={(e) => setFmt({ ...fmt, seconds: e.target.value.replace(/[^0-9]/g, "").slice(0, 3) })}
              aria-label="Length in seconds"
            />
            <span className="vora-s2-fmt-unit">sec</span>
          </label>
        </div>
      </div>
      <AutoGrowTextarea value={text} onChange={setText} minRows={8} mono ariaLabel="The prompt to edit" onPaste={onPaste} />
      <div className="vora-s2-foot">
        <span className="vora-s2-count">
          {changed ? chipParts.join(" · ") : "Unchanged"}
          {changed && (
            <button type="button" className="vora-s2-link" onClick={reset}>Reset</button>
          )}
        </span>
        <button
          type="button"
          className="vora-s2-cta vora-s2-cta-sm"
          disabled={busy || !text.trim() || !secondsOk}
          title={!secondsOk ? "Set a length in seconds" : undefined}
          onClick={() => onSubmit(text, { aspect: fmt.aspect, seconds: secondsNum }, paste)}
        >
          {busy ? "Submitting…" : changed ? "Submit assessment" : "Submit unchanged"} <span aria-hidden>→</span>
        </button>
      </div>
      {err && <p className="vora-s2-error" role="alert">{err}</p>}

      <div className="vora-s2-revise">
        <button type="button" className="vora-s2-revise-toggle" onClick={() => setReviseOpen((o) => !o)} aria-expanded={reviseOpen}>
          <span aria-hidden>{reviseOpen ? "−" : "+"}</span>
          Your answer to question 1
          <small>· submitted{a.q1 && a.q1.revisions ? ` · revised ×${a.q1.revisions}` : ""}</small>
        </button>
        {reviseOpen && (
          <div className="vora-s2-revise-body">
            <AutoGrowTextarea value={rev} onChange={(v) => { setRev(v); setRevSaved(false); }} minRows={5} ariaLabel="Revise your answer to question 1" onPaste={onRevPaste} />
            <div className="vora-s2-foot">
              <span className="vora-s2-count">Your first version stays on record.</span>
              <button
                type="button"
                className="vora-s2-ghost"
                disabled={busy || !revDirty}
                onClick={async () => { const ok = await onRevise(rev, revPaste); if (ok) setRevSaved(true); }}
              >
                {revSaved && !revDirty ? "Saved" : "Save revision"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Collapsed learning aid beside a question: a worked example on another clip
// (q1) or a wrong → right prompt (q2). Renders nothing until its content is
// configured, so a half-finished example never reaches an applicant.
function Stage2Example({ cfg, kind }) {
  const [open, setOpen] = useState(false);
  if (!cfg) return null;
  const has = kind === "q1" ? !!(cfg.text && String(cfg.text).trim()) : !!(cfg.before && cfg.after);
  if (!has) return null;
  const metrics = (Array.isArray(cfg.metrics) ? cfg.metrics : [])
    .map((m) => ({ label: String(m.label || ""), value: fmtCompact(m.value) }))
    .filter((m) => m.label && m.value);
  return (
    <div className="vora-s2-example">
      <button type="button" className="vora-s2-revise-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span aria-hidden>{open ? "−" : "+"}</span>
        {kind === "q1" ? "See a worked example" : "See an example fix"}
        <small>· a different video</small>
      </button>
      {open && (
        <div className="vora-s2-example-body">
          {kind === "q1" ? (
            <>
              {cfg.videoUrl && (
                <div className="vora-s2-example-clip">
                  <VoraVideo src={cfg.videoUrl} poster={cfg.poster || ""} aspect={cfg.aspect || "9 / 16"} fit="contain" />
                  {(metrics.length > 0 || cfg.handle) && (
                    <div className="vora-s2-example-meta">
                      {metrics.map((m) => <span key={m.label}><strong>{m.value}</strong>{m.label}</span>)}
                      {cfg.handle && <span><strong>{cfg.handle}</strong>{cfg.platform || ""}</span>}
                    </div>
                  )}
                </div>
              )}
              <div className="vora-s2-example-text">{cfg.text}</div>
            </>
          ) : (
            <>
              <div className="vora-s2-example-label">Before</div>
              <pre className="vora-s2-example-pre">{cfg.before}</pre>
              <div className="vora-s2-example-label">After</div>
              <pre className="vora-s2-example-pre">{cfg.after}</pre>
              {cfg.note && <div className="vora-s2-example-text">{cfg.note}</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// The flawed prompt's real output, under the original clip on question 2.
function Stage2OutputCard({ out }) {
  if (!out || !out.videoUrl) return null;
  return (
    <div className="vora-s2-card vora-s2-outcard">
      <div className="vora-s2-example-label">{out.label || "What this prompt produced"}</div>
      <div className="vora-s2-outbox">
        <VoraVideo src={out.videoUrl} poster={out.poster || ""} aspect={out.aspect || "16 / 9"} fit="contain" />
      </div>
    </div>
  );
}

function Stage2Done({ a, cfg = null, copy = null, showHome = true, busy = false, onRevise = null }) {
  // The reveal: only AFTER the blind commit does the applicant see what the
  // flawed prompt actually produced. Revising here is optional; the committed
  // prompt is kept as the blind answer, the revision rides beside it.
  const out = cfg && cfg.q2 && cfg.q2.output;
  const reveal = !!(out && out.videoUrl && a && a.q2);
  const current = (a && a.q2 && (a.q2.current || a.q2.text)) || "";
  const [rev, setRev] = useState(current);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setRev(current); }, [current]);
  const dirty = rev.trim() !== current.trim() && rev.trim().length > 0;
  return (
    <section className="vora-s2-landing">
      <div className="vora-s2-check" aria-hidden>✓</div>
      <h1 className="vora-s2-h1">{(copy && copy.title) || "Assessment received."}</h1>
      <p className="vora-s2-lede">
        {(copy && copy.body) || `That's Stage 2 done${a.firstName ? `, ${a.firstName}` : ""}. We review every Stage 2 within 48 hours and follow up by email or WhatsApp.`}
      </p>
      {reveal && (
        <div className="vora-s2-reveal">
          <div className="vora-s2-example-label">{out.label || "What this prompt produced"}</div>
          <p className="vora-s2-reveal-lede">This is the video the prompt you were given actually made.</p>
          <div className="vora-s2-outbox">
            <VoraVideo src={out.videoUrl} poster={out.poster || ""} aspect={out.aspect || "16 / 9"} fit="contain" />
          </div>
          {onRevise && (
            <div className="vora-s2-revise">
              <button type="button" className="vora-s2-revise-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
                <span aria-hidden>{open ? "−" : "+"}</span>
                Change your prompt after seeing this
                <small>· optional{a.q2 && a.q2.revisions ? ` · revised ×${a.q2.revisions}` : ""}</small>
              </button>
              {open && (
                <div className="vora-s2-revise-body">
                  <AutoGrowTextarea value={rev} onChange={(v) => { setRev(v); setSaved(false); }} minRows={6} mono ariaLabel="Revise your prompt" />
                  <div className="vora-s2-foot">
                    <span className="vora-s2-count">{saved && !dirty ? "Saved" : ""}</span>
                    <button
                      type="button"
                      className="vora-s2-ghost"
                      disabled={busy || !dirty}
                      onClick={async () => { const ok = await onRevise(rev); if (ok) setSaved(true); }}
                    >
                      {saved && !dirty ? "Saved" : "Save revision"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {showHome && <a className="vora-s2-ghost" href="/">Back to vora.biz</a>}
    </section>
  );
}

/* ─── Stage 2 parts 3 + 4: Reasoning, Drive ─── */
// Shown after question 2 only when the portal attached them to the record
// (functions/api/vora/_parts.js). Reasoning runs on the SERVER's clock: the
// deadline comes back from reason-begin and offsetRef maps it onto this
// device's clock, so a reload or a wrong device clock can't buy time. Every
// pick is checkpointed, so a dropped connection at the buzzer loses nothing.

const S2_LETTERS = ["A", "B", "C", "D", "E", "F"];

// Time spent away from the page (another tab or app) while a part runs.
function useAwayTracker(active) {
  const ref = useRef({ count: 0, ms: 0, since: 0 });
  useEffect(() => {
    if (!active) return undefined;
    const r = ref.current;
    const leave = () => { if (!r.since) { r.count += 1; r.since = Date.now(); } };
    const back = () => { if (r.since) { r.ms += Date.now() - r.since; r.since = 0; } };
    const onVis = () => (document.visibilityState === "hidden" ? leave() : back());
    window.addEventListener("blur", leave);
    window.addEventListener("focus", back);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("blur", leave);
      window.removeEventListener("focus", back);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [active]);
  return useCallback(() => {
    const r = ref.current;
    return { count: r.count, ms: r.ms + (r.since ? Date.now() - r.since : 0) };
  }, []);
}

function Stage2Reason({ a, token, busy, err, offsetRef, onBegin, onSave, onFinish }) {
  const r = a.parts.reason;
  const items = r.items;
  const running = !!r.startedAt && !r.finishedAt;
  const fromServer = {};
  for (const [k, v] of Object.entries(r.answers || {})) if (v != null) fromServer[k] = v;
  const [answers, setAnswers] = useStage2DraftJson(`vora-s2:${token}:reason`, fromServer);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const [i, setI] = useState(0);
  const [note, setNote] = useState("");
  const [armedAt, setArmedAt] = useState(0);
  const away = useAwayTracker(running);
  const deadline = Date.parse(r.deadline || "") || 0;
  const remaining = useCallback(() => Math.max(0, deadline - (Date.now() + (offsetRef.current || 0))), [deadline, offsetRef]);
  const [left, setLeft] = useState(remaining);
  const finishing = useRef(false);

  const finish = useCallback(async () => {
    if (finishing.current) return;
    finishing.current = true;
    const ok = await onFinish(answersRef.current, away());
    if (!ok) finishing.current = false;
  }, [onFinish, away]);

  useEffect(() => {
    if (!running) return undefined;
    const tick = () => {
      const l = remaining();
      setLeft(l);
      if (l <= 0) finish();
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [running, remaining, finish]);

  const it = items[i];
  const last = i === items.length - 1;
  const open = items.filter((x) => answers[x.id] == null).length;
  const go = (j) => { setI(Math.min(items.length - 1, Math.max(0, j))); setArmedAt(0); setNote(""); };
  const pick = (oi) => {
    const next = { ...answersRef.current, [it.id]: oi };
    setAnswers(next);
    onSave(next, away());
  };
  const next = () => {
    if (!last) { go(i + 1); return; }
    if (open && Date.now() - armedAt > 4000) {
      setArmedAt(Date.now());
      setNote(`${open} unanswered. Tap Finish part again to move on.`);
      return;
    }
    finish();
  };
  const keyRef = useRef(null);
  keyRef.current = { pick, next, n: it ? it.opts.length : 0 };
  useEffect(() => {
    if (!running) return undefined;
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const map = { 1: 0, 2: 1, 3: 2, 4: 3, a: 0, b: 1, c: 2, d: 3 };
      const k = String(e.key || "").toLowerCase();
      if (Object.prototype.hasOwnProperty.call(map, k) && map[k] < keyRef.current.n) keyRef.current.pick(map[k]);
      else if (e.key === "Enter") { e.preventDefault(); keyRef.current.next(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running]);

  if (!r.startedAt) {
    const addedLater = !!(a.completedAt && a.parts.addedAt && Date.parse(a.parts.addedAt) > Date.parse(a.completedAt));
    return (
      <div className="vora-s2-card vora-s2-qcard">
        <div className="vora-s2-eyebrow-row">
          <span className="vora-s2-eyebrow">Part 3 of 4</span>
          <Stage2Progress step={3} total={4} />
        </div>
        <h2 className="vora-s2-h2">5-minute pop quiz</h2>
        {addedLater && (
          <p className="vora-s2-prompt">Two short parts were added since you took the quiz: a 5-minute pop quiz, then a few questions on how you like to work (about 2 minutes).</p>
        )}
        <p className="vora-s2-prompt">12 questions in 5 minutes. You can skip and come back. Most people don't finish, so keep moving.</p>
        <p className="vora-s2-prompt">The clock starts when you press Start and keeps running if you leave the page.</p>
        <button type="button" className="vora-s2-cta" onClick={onBegin} disabled={busy}>
          {busy ? "Starting…" : "Start"} <span aria-hidden>→</span>
        </button>
        {err && <p className="vora-s2-error" role="alert">{err}</p>}
      </div>
    );
  }

  const timeUp = left <= 0;
  return (
    <div className="vora-s2-card vora-s2-qcard">
      <div className="vora-s2-eyebrow-row">
        <span className="vora-s2-eyebrow">Part 3 of 4 · Pop quiz</span>
        <span className={`vora-s2-clock${left < 60000 ? " is-low" : ""}`} aria-label="Time left">{fmtClock(Math.ceil(left / 1000))}</span>
      </div>
      <div className="vora-s2-dots">
        {items.map((x, j) => (
          <button
            key={x.id}
            type="button"
            className={`vora-s2-dot${answers[x.id] != null ? " is-done" : ""}${j === i ? " is-cur" : ""}`}
            onClick={() => go(j)}
            aria-label={`Question ${j + 1}`}
          >
            {j + 1}
          </button>
        ))}
      </div>
      <p className="vora-s2-rq vora-s2-noselect">{it.q}</p>
      {it.sub && <div className="vora-s2-rsub vora-s2-noselect">{it.sub}</div>}
      <div className="vora-s2-opts">
        {it.opts.map((o, oi) => (
          <button key={o} type="button" className="vora-s2-opt" aria-pressed={answers[it.id] === oi} onClick={() => pick(oi)} disabled={timeUp}>
            <span className="vora-s2-optk">{S2_LETTERS[oi]}</span>
            <span className="vora-s2-noselect">{o}</span>
          </button>
        ))}
      </div>
      <p className="vora-s2-note" role="status">{timeUp ? "Time's up. Saving…" : note}</p>
      {err && <p className="vora-s2-error" role="alert">{err}</p>}
      <div className="vora-s2-foot">
        <button type="button" className="vora-s2-ghost" onClick={() => go(i - 1)} disabled={i === 0 || busy}>Back</button>
        <button type="button" className="vora-s2-ghost is-primary" onClick={next} disabled={busy || timeUp}>
          {busy ? "Saving…" : last ? "Finish part" : answers[it.id] == null ? "Skip" : "Next"}
        </button>
      </div>
    </div>
  );
}

function Stage2Drive({ a, token, busy, err, onFinish }) {
  const d = a.parts.drive;
  const [st, setSt] = useStage2DraftJson(`vora-s2:${token}:drive`, { screen: "main", earned: "", bonus: "" });
  const startRef = useRef(Date.now());
  // Functional update: two quick picks in one tick must both land.
  const set = (patch) => setSt((prev) => ({ ...prev, ...patch }));
  const choicesDone = d.choices.every((c) => st[c.id]);
  const earnedOk = String(st.earned || "").trim().length >= 2;
  const bonusWords = (String(st.bonus || "").match(/[^\s]+/g) || []).length;
  const submit = (taken) => onFinish({
    ...Object.fromEntries(d.choices.map((c) => [c.id, st[c.id] || null])),
    earned: st.earned || "",
    bonus: { taken, text: taken ? st.bonus || "" : "" },
  }, Date.now() - startRef.current);

  const head = (
    <div className="vora-s2-eyebrow-row">
      <span className="vora-s2-eyebrow">Part 4 of 4 · about 2 minutes</span>
      <Stage2Progress step={4} total={4} />
    </div>
  );

  if (st.screen === "main") {
    return (
      <div className="vora-s2-card vora-s2-qcard">
        {head}
        <h2 className="vora-s2-h2">How you like to work</h2>
        <p className="vora-s2-prompt">Quick picks. Go with your first instinct.</p>
        {d.choices.map((c) => (
          <fieldset key={c.id} className="vora-s2-dq">
            <legend className="vora-s2-dq-q">{c.q}</legend>
            {c.sub && <div className="vora-s2-dq-sub">{c.sub}</div>}
            <div className="vora-s2-opts">
              {c.opts.map((o) => (
                <button key={o.v} type="button" className="vora-s2-opt" aria-pressed={st[c.id] === o.v} onClick={() => set({ [c.id]: o.v })}>
                  <span className="vora-s2-optk is-round" />
                  <span>{o.t}</span>
                </button>
              ))}
            </div>
          </fieldset>
        ))}
        <div className="vora-s2-dq">
          <div className="vora-s2-dq-q">{d.earned.q}</div>
          <AutoGrowTextarea value={st.earned || ""} onChange={(v) => set({ earned: v })} placeholder={d.earned.placeholder} minRows={2} ariaLabel={d.earned.q} />
        </div>
        <div className="vora-s2-foot">
          <span className="vora-s2-count">{choicesDone && earnedOk ? "" : "Answer each one to continue"}</span>
          <button type="button" className="vora-s2-ghost is-primary" disabled={!choicesDone || !earnedOk} onClick={() => set({ screen: "bonus" })}>Continue</button>
        </div>
      </div>
    );
  }

  if (st.screen === "bonus") {
    return (
      <div className="vora-s2-card vora-s2-qcard">
        {head}
        <h2 className="vora-s2-h2">Almost done.</h2>
        <p className="vora-s2-prompt">{d.bonus.offer}</p>
        {err && <p className="vora-s2-error" role="alert">{err}</p>}
        <div className="vora-s2-foot">
          <button type="button" className="vora-s2-ghost" disabled={busy} onClick={() => submit(false)}>{busy ? "Submitting…" : "Skip and submit"}</button>
          <button type="button" className="vora-s2-ghost is-primary" disabled={busy} onClick={() => set({ screen: "bonus-q" })}>Answer it</button>
        </div>
      </div>
    );
  }

  return (
    <div className="vora-s2-card vora-s2-qcard">
      {head}
      <h2 className="vora-s2-h2">Bonus</h2>
      <p className="vora-s2-prompt">{d.bonus.q}</p>
      <AutoGrowTextarea value={st.bonus || ""} onChange={(v) => set({ bonus: v })} minRows={3} ariaLabel={d.bonus.q} />
      {err && <p className="vora-s2-error" role="alert">{err}</p>}
      <div className="vora-s2-foot">
        <button type="button" className="vora-s2-ghost" disabled={busy} onClick={() => submit(false)}>Skip and submit</button>
        <button type="button" className="vora-s2-ghost is-primary" disabled={busy || bonusWords < 1} onClick={() => submit(true)}>{busy ? "Submitting…" : "Submit"}</button>
      </div>
    </div>
  );
}

function Stage2View({ token, chrome = "vora", brand = null, doneCopy = null, ctaLabel = "Begin Assessment", estimate = "" }) {
  const [a, setA] = useState(null);
  const [load, setLoad] = useState({ status: "loading", error: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const statsRef = useRef({ watchMs: 0, plays: 0 });
  const qStartRef = useRef(Date.now());
  // Server time minus device time, from every response (Reasoning's clock).
  const offsetRef = useRef(0);
  const syncClock = (data) => {
    const t = Date.parse((data && data.serverNow) || "");
    if (t) offsetRef.current = t - Date.now();
  };

  const refresh = useCallback(async () => {
    setLoad({ status: "loading", error: "" });
    const r = await stage2Get(token);
    if (r.ok) {
      syncClock(r.data);
      setA(r.data.assessment);
      setLoad({ status: "ok", error: "" });
    } else {
      setLoad({
        status: "error",
        error: r.status === 404 || r.status === 400
          ? "This Stage 2 link isn't valid. Use the link from your application."
          : "Couldn't load your assessment. Check your connection and retry.",
      });
    }
  }, [token]);
  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (chrome !== "vora") return undefined;
    const prev = document.title;
    document.title = "Stage 2 · Vora";
    return () => { document.title = prev; };
  }, [chrome]);

  const cfg = (a && STAGE2_BY_KEY[a.key]) || STAGE2_ASSESSMENT;
  // Parts 3 + 4 exist only when the portal attached them; then the quiz is
  // four parts and "submitted" (question 2 in) leads on to them.
  const parts = a && a.parts;
  const total = parts ? 4 : 2;
  // With Parts 3–4 the landing says what's coming, and a timed CTA
  // ("Begin the 8-minute assessment") carries the longer total.
  const landingEstimate = parts ? "2 questions + a quick 5-minute pop quiz · about 15 minutes" : estimate;
  const landingCta = parts ? ctaLabel.replace(/\b\d+-minute\b/, "15-minute") : ctaLabel;
  const step = !a
    ? ""
    : a.status === "submitted"
      ? (parts && !parts.reason.finishedAt ? "reason" : parts && !parts.drive.finishedAt ? "drive" : "done")
      : a.status === "q1-submitted"
        ? "q2"
        : a.status === "started"
          ? "q1"
          : "landing";

  // Each question's clock starts when it appears.
  useEffect(() => {
    qStartRef.current = Date.now();
    if (step) window.scrollTo({ top: 0, behavior: "auto" });
  }, [step]);

  const send = async (event) => {
    setBusy(true);
    setErr("");
    const r = await stage2Post(token, {
      ...event,
      watchMs: statsRef.current.watchMs,
      plays: statsRef.current.plays,
    });
    setBusy(false);
    if (r.ok) {
      syncClock(r.data);
      setA(r.data.assessment);
      return true;
    }
    // A refused transition comes back with the server's view of the
    // record — adopt it, so a stale tab snaps to the real step.
    if (r.data && r.data.assessment) setA(r.data.assessment);
    setErr(r.status === 0
      ? "Network error — check your connection and try again."
      : `Couldn't save (${(r.data && r.data.error) || `HTTP ${r.status}`}). Try again.`);
    return false;
  };

  const contentSnapshot = () => ({
    version: cfg.version,
    q1: cfg.q1.prompt,
    q2: cfg.q2.prompt,
    prompt: cfg.q2.draft,
    q2Defaults: cfg.q2.defaults || null,
    // Learning aids on screen for this attempt (reviewers see what help they had).
    aids: {
      q1Example: !!(cfg.q1.example && cfg.q1.example.text),
      q2Output: (cfg.q2.output && cfg.q2.output.videoUrl) || "",
      q2Example: !!(cfg.q2.example && cfg.q2.example.before && cfg.q2.example.after),
    },
    viral: {
      platform: cfg.viral.platform || "",
      handle: cfg.viral.handle || "",
      metrics: (Array.isArray(cfg.viral.metrics) ? cfg.viral.metrics : [])
        .map((m) => ({ label: String(m.label || ""), value: fmtCompact(m.value) }))
        .filter((m) => m.label && m.value),
    },
  });

  return (
    <main className="vora-s2">
      <header className="vora-s2-top">
        {chrome === "vora" ? (
          <a href="/" aria-label="Vora"><VoraLogo height={24} /></a>
        ) : (
          <span className="vora-s2-brand">{(brand && brand.company) || ""}</span>
        )}
        <span className="vora-s2-eyebrow">Stage 2{(brand && brand.title) || (a && a.jobTitle) ? ` · ${(brand && brand.title) || a.jobTitle}` : ""}</span>
      </header>

      <div className="vora-s2-wrap">
        {load.status === "loading" && !a && <div className="vora-s2-muted">Loading…</div>}
        {load.status === "error" && !a && (
          <div className="vora-s2-landing">
            <p className="vora-s2-error" role="alert">{load.error}</p>
            <button type="button" className="vora-s2-ghost" onClick={refresh}>Retry</button>
          </div>
        )}

        {step === "landing" && (
          <Stage2Landing a={a} cfg={cfg} busy={busy} err={err} ctaLabel={landingCta} estimate={landingEstimate} onBegin={() => send({ event: "start", content: contentSnapshot() })} />
        )}

        {(step === "q1" || step === "q2") && (
          <section className="vora-s2-grid">
            <aside className="vora-s2-side">
              <ViralVideoCard cfg={cfg} statsRef={statsRef} />
            </aside>
            <div className="vora-s2-main">
              {step === "q1" ? (
                <Stage2Q1
                  cfg={cfg}
                  total={total}
                  token={token}
                  busy={busy}
                  err={err}
                  onSubmit={(text, paste) => send({ event: "q1-submit", text, ms: Date.now() - qStartRef.current, content: contentSnapshot(), ...paste })}
                />
              ) : (
                <Stage2Q2
                  cfg={cfg}
                  total={total}
                  a={a}
                  token={token}
                  busy={busy}
                  err={err}
                  onSubmit={(text, settings, paste) => send({ event: "q2-submit", text, ms: Date.now() - qStartRef.current, promptShown: cfg.q2.draft, settings, defaults: cfg.q2.defaults || null, ...paste })}
                  onRevise={(text, paste) => send({ event: "q1-revise", text, ...paste })}
                />
              )}
            </div>
          </section>
        )}

        {step === "reason" && (
          <section className="vora-s2-solo">
            <Stage2Reason
              a={a}
              token={token}
              busy={busy}
              err={err}
              offsetRef={offsetRef}
              onBegin={() => send({ event: "reason-begin" })}
              onSave={(answers, away) => { stage2Post(token, { event: "reason-save", answers, away }); }}
              onFinish={(answers, away) => send({ event: "reason-finish", answers, away })}
            />
          </section>
        )}

        {step === "drive" && (
          <section className="vora-s2-solo">
            <Stage2Drive a={a} token={token} busy={busy} err={err} onFinish={(answers, ms) => send({ event: "drive-finish", answers, ms })} />
          </section>
        )}

        {step === "done" && (
          <Stage2Done
            a={a}
            cfg={cfg}
            copy={doneCopy}
            showHome={chrome === "vora"}
            busy={busy}
            onRevise={(text) => send({ event: "q2-revise", text })}
          />
        )}
      </div>

      <style>{`
        .vora-s2 { background: #000; color: #fff; min-height: 100vh; font-family: 'Switzer', sans-serif; }
        .vora-s2-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 24px; border-bottom: 1px solid rgba(255,255,255,0.06); }
        .vora-s2-top a { display: inline-flex; color: #fff; }
        .vora-s2-eyebrow { font-family: 'Geist Mono', monospace; font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(255,255,255,0.5); }
        .vora-s2-wrap { max-width: 1040px; margin: 0 auto; padding: 40px 24px 96px; }
        .vora-s2-landing { max-width: 680px; margin: 0 auto; padding-top: 24px; }
        .vora-s2-h1 { font-weight: 700; font-size: clamp(30px, 5vw, 50px); line-height: 1.02; letter-spacing: -0.04em; margin: 0 0 16px; }
        .vora-s2-lede { font-size: clamp(15px, 1.7vw, 18px); line-height: 1.55; color: rgba(255,255,255,0.6); margin: 0 0 14px; max-width: 560px; }
        .vora-s2-intro { width: 100%; aspect-ratio: 16 / 9; border-radius: 14px; overflow: hidden; background: #000; border: 1px solid rgba(255,255,255,0.1); margin-bottom: 28px; }
        .vora-s2-intro video { width: 100%; height: 100%; display: block; object-fit: contain; background: #000; }
        .vora-s2-cta { appearance: none; border: none; border-radius: 10px; padding: 16px 22px; background: #0677D0; color: #fff; font-family: 'Geist Mono', monospace; font-size: 11.5px; font-weight: 600; letter-spacing: 0.22em; text-transform: uppercase; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 10px; width: 100%; }
        .vora-s2-cta:disabled { opacity: 0.45; cursor: default; }
        .vora-s2-cta-sm { width: auto; padding: 12px 18px; font-size: 10.5px; }
        .vora-s2-cta-sub { margin-top: 12px; text-align: center; font-family: 'Switzer', sans-serif; font-size: 14px; letter-spacing: -0.005em; color: #fff; }
        .vora-s2-grid { display: grid; grid-template-columns: minmax(0, 320px) minmax(0, 1fr); gap: 28px; align-items: start; }
        .vora-s2-side { position: sticky; top: 20px; min-width: 0; }
        .vora-s2-main { min-width: 0; }
        .vora-s2-card { border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; background: rgba(255,255,255,0.02); padding: 14px; min-width: 0; }
        .vora-s2-videobox { position: relative; border-radius: 10px; overflow: hidden; background: #000; aspect-ratio: 9 / 16; max-height: 70vh; display: flex; align-items: center; justify-content: center; }
        .vora-s2-enlarge { position: absolute; top: 8px; right: 8px; appearance: none; border: 1px solid rgba(255,255,255,0.25); background: rgba(0,0,0,0.6); color: #fff; border-radius: 999px; padding: 6px 10px; font-family: 'Geist Mono', monospace; font-size: 9.5px; letter-spacing: 0.14em; text-transform: uppercase; cursor: pointer; }
        .vora-s2-pill { position: fixed; bottom: calc(14px + env(safe-area-inset-bottom, 0px)); left: 50%; transform: translateX(-50%); z-index: 8000; appearance: none; border: 1px solid rgba(255,255,255,0.22); background: rgba(0,0,0,0.88); color: #fff; border-radius: 999px; padding: 10px 16px; font-family: 'Geist Mono', monospace; font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; cursor: pointer; }
        .vora-s2-fmt { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin: 0 0 8px; }
        .vora-s2-fmt .vora-s2-promptlabel { margin: 0; }
        .vora-s2-fmt-controls { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
        .vora-s2-fmt-group { display: inline-flex; align-items: center; gap: 6px; }
        .vora-s2-fmt-label { font-family: 'Geist Mono', monospace; font-size: 9.5px; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(255,255,255,0.45); margin-right: 2px; }
        .vora-s2-ar { appearance: none; display: inline-flex; align-items: center; gap: 7px; padding: 7px 11px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.7); font-family: 'Geist Mono', monospace; font-size: 11px; cursor: pointer; transition: border-color 0.15s, color 0.15s, background 0.15s; }
        .vora-s2-ar.is-on { border-color: #0677D0; color: #fff; background: rgba(6,119,208,0.18); }
        .vora-s2-ar-glyph { display: inline-block; border: 1.5px solid currentColor; border-radius: 2px; flex: none; }
        .vora-s2-secs { width: 60px; padding: 7px 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.03); color: #fff; font-family: 'Geist Mono', monospace; font-size: 12px; text-align: center; outline: none; -moz-appearance: textfield; }
        .vora-s2-secs:focus { border-color: #0677D0; }
        .vora-s2-secs::-webkit-outer-spin-button, .vora-s2-secs::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .vora-s2-fmt-unit { font-family: 'Geist Mono', monospace; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255,255,255,0.45); }
        .vora-s2-videobox video { width: 100%; height: 100%; object-fit: contain; display: block; background: #000; }
        .vora-s2-plate { display: flex; flex-direction: column; align-items: center; gap: 12px; color: rgba(255,255,255,0.45); font-family: 'Geist Mono', monospace; font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; }
        .vora-s2-plate span { width: 56px; height: 56px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.3); display: flex; align-items: center; justify-content: center; font-size: 16px; color: #fff; }
        .vora-s2-stats { display: flex; gap: 20px; margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.08); }
        .vora-s2-stats > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .vora-s2-stat-v { font-weight: 700; font-size: 20px; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
        .vora-s2-handle { font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .vora-s2-stat-l { font-family: 'Geist Mono', monospace; font-size: 9.5px; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(255,255,255,0.45); }
        .vora-s2-qcard { padding: 22px; }
        .vora-s2-eyebrow-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
        .vora-s2-prog { display: flex; gap: 4px; }
        .vora-s2-prog span { width: 22px; height: 2px; background: rgba(255,255,255,0.15); border-radius: 1px; }
        .vora-s2-prog span.is-on { background: #0677D0; }
        .vora-s2-h2 { font-weight: 700; font-size: clamp(24px, 3vw, 32px); letter-spacing: -0.03em; line-height: 1.05; margin: 0 0 10px; }
        .vora-s2-prompt { font-size: 15.5px; line-height: 1.55; color: rgba(255,255,255,0.78); margin: 0 0 18px; }
        .vora-s2-promptlabel { font-family: 'Geist Mono', monospace; font-size: 9.5px; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(255,255,255,0.45); margin-bottom: 6px; }
        .vora-s2-ta { width: 100%; box-sizing: border-box; resize: none; overflow: hidden; border-radius: 10px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.03); color: #fff; padding: 14px 16px; font-family: 'Switzer', sans-serif; font-size: 15px; line-height: 1.55; outline: none; transition: border-color 0.2s, background 0.2s; display: block; }
        .vora-s2-ta.is-mono { font-family: 'Geist Mono', monospace; font-size: 13px; line-height: 1.6; }
        .vora-s2-ta:focus { border-color: #0677D0; background: rgba(255,255,255,0.05); }
        .vora-s2-ta::placeholder { color: rgba(255,255,255,0.3); }
        .vora-s2-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; flex-wrap: wrap; }
        .vora-s2-count { font-family: 'Geist Mono', monospace; font-size: 10.5px; letter-spacing: 0.06em; color: rgba(255,255,255,0.5); display: inline-flex; align-items: center; gap: 12px; font-variant-numeric: tabular-nums; }
        .vora-s2-link { appearance: none; background: none; border: none; padding: 0; color: rgba(255,255,255,0.7); font: inherit; letter-spacing: inherit; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
        .vora-s2-error { margin: 12px 0 0; font-family: 'Geist Mono', monospace; font-size: 11px; line-height: 1.5; color: rgba(206,60,17,0.95); }
        .vora-s2-muted { color: rgba(255,255,255,0.5); font-family: 'Geist Mono', monospace; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; }
        .vora-s2-ghost { appearance: none; display: inline-flex; align-items: center; gap: 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.18); background: transparent; color: #fff; padding: 9px 14px; font-family: 'Geist Mono', monospace; font-size: 10.5px; letter-spacing: 0.16em; text-transform: uppercase; cursor: pointer; text-decoration: none; }
        .vora-s2-ghost:disabled { opacity: 0.4; cursor: default; }
        .vora-s2-revise { margin-top: 22px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.08); }
        .vora-s2-revise-toggle { appearance: none; background: none; border: none; padding: 0; color: rgba(255,255,255,0.75); font-family: 'Switzer', sans-serif; font-size: 13.5px; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
        .vora-s2-revise-toggle > span { width: 18px; height: 18px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.25); display: inline-flex; align-items: center; justify-content: center; font-family: 'Geist Mono', monospace; font-size: 12px; flex: none; }
        .vora-s2-revise-toggle small { font-family: 'Geist Mono', monospace; font-size: 9.5px; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255,255,255,0.4); }
        .vora-s2-revise-body { margin-top: 12px; }
        .vora-s2-example { margin: -6px 0 16px; }
        .vora-s2-example-body { margin-top: 10px; padding: 14px; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; background: rgba(255,255,255,0.02); display: grid; gap: 12px; }
        .vora-s2-example-clip { display: grid; gap: 8px; max-width: 260px; }
        .vora-s2-example-clip .vora-vid { border-radius: 10px; }
        .vora-s2-example-meta { display: flex; gap: 14px; flex-wrap: wrap; font-family: 'Geist Mono', monospace; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255,255,255,0.5); }
        .vora-s2-example-meta strong { color: #fff; font-family: 'Switzer', sans-serif; font-size: 13px; letter-spacing: -0.01em; text-transform: none; margin-right: 5px; }
        .vora-s2-example-text { font-size: 14.5px; line-height: 1.6; color: rgba(255,255,255,0.85); white-space: pre-wrap; }
        .vora-s2-example-label { font-family: 'Geist Mono', monospace; font-size: 9.5px; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(255,255,255,0.45); }
        .vora-s2-example-pre { margin: 0; white-space: pre-wrap; font-family: 'Geist Mono', monospace; font-size: 12px; line-height: 1.55; color: rgba(255,255,255,0.8); }
        .vora-s2-outcard { margin-top: 12px; display: grid; gap: 8px; }
        .vora-s2-reveal { margin: 8px 0 28px; padding: 16px; border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; background: rgba(255,255,255,0.02); display: grid; gap: 10px; }
        .vora-s2-reveal-lede { margin: 0; font-size: 14.5px; line-height: 1.5; color: rgba(255,255,255,0.7); }
        .vora-s2-reveal .vora-s2-revise { margin-top: 6px; padding-top: 12px; }
        .vora-s2-outbox { border-radius: 10px; overflow: hidden; background: #000; }
        .vora-s2-side { max-height: calc(100vh - 40px); overflow-y: auto; }
        .vora-s2-check { width: 44px; height: 44px; border-radius: 50%; background: #22C55E; color: #000; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 700; margin-bottom: 22px; }
        .vora-s2-solo { max-width: 680px; margin: 0 auto; }
        .vora-s2-clock { font-family: 'Geist Mono', monospace; font-size: 14px; letter-spacing: 0.06em; font-variant-numeric: tabular-nums; color: #fff; }
        .vora-s2-clock.is-low { color: #FF6B7D; }
        .vora-s2-dots { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 20px; }
        .vora-s2-dot { appearance: none; width: 30px; height: 30px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.14); background: transparent; color: rgba(255,255,255,0.55); font-family: 'Geist Mono', monospace; font-size: 11px; cursor: pointer; padding: 0; }
        .vora-s2-dot.is-done { background: rgba(6,119,208,0.18); border-color: rgba(6,119,208,0.6); color: #fff; }
        .vora-s2-dot.is-cur { border-color: #fff; color: #fff; }
        .vora-s2-rq { font-size: 18px; line-height: 1.5; letter-spacing: -0.01em; margin: 0 0 14px; color: #fff; }
        .vora-s2-rsub { font-family: 'Geist Mono', monospace; font-size: 16px; line-height: 1.5; padding: 12px 14px; border-radius: 10px; background: rgba(255,255,255,0.05); margin: 0 0 14px; overflow-wrap: anywhere; }
        .vora-s2-noselect { -webkit-user-select: none; user-select: none; }
        .vora-s2-opts { display: grid; gap: 8px; }
        .vora-s2-opt { appearance: none; box-sizing: border-box; display: flex; align-items: flex-start; gap: 12px; width: 100%; text-align: left; padding: 13px 14px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.03); color: #fff; font-family: 'Switzer', sans-serif; font-size: 15px; line-height: 1.4; cursor: pointer; }
        .vora-s2-opt:hover { border-color: rgba(255,255,255,0.28); }
        .vora-s2-opt:disabled { cursor: default; opacity: 0.6; }
        .vora-s2-opt[aria-pressed="true"] { border-color: #0677D0; background: rgba(6,119,208,0.16); }
        .vora-s2-optk { flex: none; width: 22px; height: 22px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.25); display: grid; place-items: center; font-family: 'Geist Mono', monospace; font-size: 11px; color: rgba(255,255,255,0.6); }
        .vora-s2-optk.is-round { border-radius: 50%; width: 18px; height: 18px; margin-top: 1px; }
        .vora-s2-opt[aria-pressed="true"] .vora-s2-optk { background: #0677D0; border-color: #0677D0; color: #fff; }
        .vora-s2-note { margin: 12px 0 0; min-height: 16px; font-family: 'Geist Mono', monospace; font-size: 11px; line-height: 1.5; color: rgba(255,255,255,0.55); }
        .vora-s2-ghost.is-primary { background: #0677D0; border-color: #0677D0; }
        .vora-s2-dq { border: 0; padding: 0; margin: 0 0 22px; min-width: 0; }
        .vora-s2-dq-q { display: block; padding: 0; font-size: 15.5px; line-height: 1.45; margin: 0 0 10px; color: #fff; }
        .vora-s2-dq-sub { font-family: 'Geist Mono', monospace; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.45); margin: -4px 0 10px; }
        @media (max-width: 899px) {
          .vora-s2-wrap { padding: 28px 16px 80px; }
          .vora-s2-grid { grid-template-columns: 1fr; gap: 16px; }
          .vora-s2-side { position: static; }
          .vora-s2-videobox { aspect-ratio: auto; height: 62vh; max-height: 62vh; }
          .vora-s2-qcard { padding: 18px 16px; }
        }
      `}</style>
    </main>
  );
}

/* ═══════════ /apply FUNNEL (job-board applicants, unbranded) ═══════════
   Indeed listings link here instead of a Google Form. The page collects
   the same application as vora.biz (name · email · phone · 30–60 s intro
   video · optional experience), runs the four-word scan on the video the
   moment they submit, and drops them straight into Stage 2. Nothing on
   these pages names Vora: the header carries the listing's company (if
   any) and the role, the favicon is cleared, and the consent line has no
   links. Records land on the portal with the listing attribution
   Analytics already groups by (jobSlug = role, listingId = the ad). */

function resolveFunnelListing(key, search) {
  const base = FUNNEL_LISTINGS[key] || null;
  const qs = new URLSearchParams(search || "");
  const pick = (name, fallback) => {
    const v = qs.get(name);
    return v != null && v.trim() ? v.trim().slice(0, 200) : fallback;
  };
  const listing = {
    listingId: key || pick("listing", ""),
    jobSlug: pick("job", base ? base.jobSlug : ""),
    title: pick("title", base ? base.title : ""),
    company: pick("company", base ? base.company : ""),
    listingLabel: pick("label", base ? base.listingLabel : ""),
    accountName: pick("account", base ? base.accountName : ""),
    listingUrl: pick("url", base ? base.listingUrl : ""),
    source: pick("src", base ? base.source : "indeed").toLowerCase(),
  };
  return listing.jobSlug ? listing : null;
}

// The browser tab must not carry the Vora mark either.
function useNeutralChrome(title) {
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const prevTitle = document.title;
    document.title = title;
    const removed = [];
    document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]').forEach((el) => {
      removed.push({ el, parent: el.parentNode, next: el.nextSibling });
      el.remove();
    });
    return () => {
      document.title = prevTitle;
      removed.forEach(({ el, parent, next }) => { try { parent.insertBefore(el, next); } catch { /* */ } });
    };
  }, [title]);
}

const FUNNEL_SCAN_STEPS = ["Uploading", "Scanning", "Deciding", "Judging"];

// The four-word scan. Covers the page from the moment they hit Apply:
// "Uploading" follows the real upload, then scanning → deciding → judging
// run on a clock (~13 s) once the application has landed, then the green
// hand-off and the assessment opens on its own.
function FunnelScan({ progress, submitted, stage2, files, linkFallbacks, onCleared }) {
  const reduced = useReducedMotion();
  const selfie = useMemo(() => fileList(files && files.selfie), [files]);
  const exp = useMemo(() => fileList(files && files.experience), [files]);
  const selfieLink = isLikelyUrl(linkFallbacks && linkFallbacks.selfie) ? String(linkFallbacks.selfie).trim() : "";
  const durs = useMemo(() => (reduced ? [700, 700, 700] : [5200, 4200, 4200]), [reduced]);
  const total = durs[0] + durs[1] + durs[2];
  const [t0, setT0] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (submitted && t0 == null) setT0(Date.now()); }, [submitted, t0]);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 80);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    return lockBodyScroll();
  }, []);

  const e = t0 == null ? 0 : now - t0;
  const stepIdx = !submitted ? 0 : e < durs[0] ? 1 : e < durs[0] + durs[1] ? 2 : e < total ? 3 : 4;
  const cleared = stepIdx === 4;
  const onClearedRef = useRef(onCleared);
  onClearedRef.current = onCleared;
  useEffect(() => {
    if (!cleared) return undefined;
    const id = window.setTimeout(() => { if (onClearedRef.current) onClearedRef.current(stage2); }, reduced ? 500 : 2600);
    return () => window.clearTimeout(id);
  }, [cleared, stage2, reduced]);

  const uploadPct = Math.max(0, Math.min(100, Math.round((progress && progress.overallPct) || 0)));
  const pct = cleared ? 100 : stepIdx === 0 ? Math.round(uploadPct * 0.4) : Math.round(40 + 60 * Math.min(1, e / total));
  const head = submitted ? Math.min(1, e / total) : 0;
  const listening = stepIdx >= 1 && stepIdx <= 3;
  const selfieFile = selfie[0] || null;
  const hasToken = !!(stage2 && stage2.token);
  const stepLabel = (i) => {
    if (i !== 0 || stepIdx !== 0) return FUNNEL_SCAN_STEPS[i];
    if (progress && progress.phase === "finalizing") return "Uploading · almost there";
    return uploadPct > 0 ? `Uploading · ${uploadPct}%` : "Uploading";
  };
  const expScan = exp.length ? Math.min(exp.length - 1, Math.floor(head * exp.length)) : -1;

  const overlay = (
    <div className="vora-s1-lock vora-fs" style={{ "--s1-accent": BRAND.blue.hex, "--s1-rgb": BRAND.blue.rgb }} role="dialog" aria-modal="true" aria-label="Processing your application">
      <div className="vora-s1-lock-inner">
        <div className="vora-s1" role="status" aria-live="polite">
          <div className="vora-s1-head">
            <span className={`vora-s1-dot ${cleared ? "is-done" : ""}`} aria-hidden />
            <span>{cleared ? "Stage 1 · complete" : `Stage 1 · ${FUNNEL_SCAN_STEPS[Math.min(stepIdx, 3)].toLowerCase()} your application`}</span>
            <span className="vora-s1-head-right">{cleared ? "cleared" : `${pct}%`}</span>
          </div>

          <div className="vora-s1-agent vora-fs-card">
            <div className="vora-s1-specimen">
              {(selfieFile || selfieLink) ? (
                <>
                  <Stage1Tile file={selfieFile} link={selfieFile ? "" : selfieLink} scanning={!cleared} done={cleared} large />
                  <div className="vora-s1-audio">
                    <div className={`vora-s1-wave ${listening ? "" : "is-idle"}`} aria-hidden>
                      {Array.from({ length: 14 }, (_, i) => <i key={i} style={{ animationDelay: `${(i % 7) * 0.11}s` }} />)}
                    </div>
                    <Stage1Clock file={selfieFile} head={head} done={cleared} />
                  </div>
                </>
              ) : (
                <div className="vora-s1-doc" aria-hidden>
                  {[92, 68, 84, 57].map((w, i) => <span key={i} className="vora-s1-line" style={{ width: `${w}%` }} />)}
                  {!cleared && <span className="vora-s1-scan" />}
                </div>
              )}
            </div>
            <ul className="vora-s1-steps vora-fs-steps">
              {FUNNEL_SCAN_STEPS.map((label, i) => {
                const st = cleared || i < stepIdx ? "done" : i === stepIdx ? "active" : "pending";
                return (
                  <li key={label} className={`vora-s1-step is-${st}`}>
                    <span className="vora-s1-step-mark">{st === "done" ? "●" : st === "active" ? "◌" : "○"}</span>
                    {stepLabel(i)}
                  </li>
                );
              })}
            </ul>
          </div>

          {exp.length > 0 && (
            <div className="vora-s1-agent vora-fs-exp">
              <div className="vora-s1-agent-head">
                <span className="vora-s1-agent-name">Experience</span>
                <span className="vora-s1-agent-input">{exp.length} file{exp.length === 1 ? "" : "s"}</span>
              </div>
              <div className="vora-s1-specimen">
                {exp.slice(0, 4).map((f, i) => (
                  <Stage1Tile key={`${f.name}-${f.size}`} file={f} scanning={!cleared && stepIdx >= 1 && i === expScan} done={cleared} />
                ))}
              </div>
            </div>
          )}

          <div className="vora-s1-track" aria-hidden>
            <span className="vora-s1-node is-on">1</span>
            <span className="vora-s1-rail">
              <span className="vora-s1-rail-fill" style={{ width: `${cleared ? 100 : stepIdx >= 3 ? 55 : 0}%` }} />
            </span>
            <span className={`vora-s1-node ${cleared ? "is-next" : ""}`}>2</span>
          </div>

          <div className={`vora-s1-result ${cleared ? "is-visible" : ""}`}>
            <div className="vora-s1-result-title">You're through to Stage 2.</div>
            <div className="vora-s1-result-sub">{hasToken ? "Opening your 8-minute assessment…" : "Your application is recorded."}</div>
            <button
              type="button"
              className="vora-s1-cta"
              onClick={() => { if (onClearedRef.current) onClearedRef.current(stage2); }}
              disabled={!cleared}
              tabIndex={cleared ? 0 : -1}
            >
              {hasToken ? "Open the assessment" : "Continue"} <span aria-hidden>→</span>
            </button>
          </div>
          {!cleared && <div className="vora-s1-foot">Keep this tab open</div>}
        </div>
      </div>
      <style>{STAGE1_CSS}</style>
      <style>{`
        .vora-fs .vora-s1 { max-width: 560px; }
        .vora-fs-card { margin-top: 14px; }
        .vora-fs-steps .vora-s1-step { font-size: 12px; }
        .vora-fs-exp { margin-top: 10px; }
        .vora-fs-exp .vora-s1-specimen { min-height: 0; margin: 10px 0 0; }
      `}</style>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(overlay, document.body) : overlay;
}

// Anything on a funnel host that isn't an application link.
function FunnelNotFound() {
  useNeutralChrome("Application");
  return (
    <div className="vora-funnel">
      <div className="vora-funnel-wrap">
        <p className="vora-s2-eyebrow" style={{ marginBottom: 14 }}>Application</p>
        <h1 className="vora-s2-h1">This link isn't valid.</h1>
        <p className="vora-s2-lede">Use the application link from the job listing.</p>
      </div>
      <style>{FUNNEL_CSS}</style>
    </div>
  );
}

// A minted link (Talent Hub › Indeed › New apply link) lives on the portal
// under its key; the seed table and query params remain the fallback, so a
// link works even if the lookup fails.
function useFunnelListing(listingKey) {
  const search = typeof window !== "undefined" ? window.location.search : "";
  const fallback = useMemo(() => resolveFunnelListing(listingKey, search), [listingKey, search]);
  const [state, setState] = useState({ status: listingKey ? "loading" : "done", listing: fallback });
  useEffect(() => {
    let cancelled = false;
    if (!listingKey) { setState({ status: "done", listing: fallback }); return undefined; }
    fetch(`${VORA_API}/api/vora/funnel-listing?key=${encodeURIComponent(listingKey)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((body) => {
        if (cancelled) return;
        const minted = body && body.ok && body.listing ? body.listing : null;
        if (minted) {
          // Query params still win for anything the link explicitly carries.
          const qs = new URLSearchParams(search);
          const pick = (name, v) => { const q = qs.get(name); return q != null && q.trim() ? q.trim().slice(0, 200) : v; };
          setState({
            status: "done",
            listing: {
              listingId: minted.listingId || listingKey,
              jobSlug: pick("job", minted.jobSlug || ""),
              title: pick("title", minted.title || ""),
              company: pick("company", minted.company || ""),
              listingLabel: pick("label", minted.listingLabel || ""),
              accountName: pick("account", minted.accountName || minted.company || ""),
              listingUrl: pick("url", minted.listingUrl || ""),
              source: pick("src", minted.source || "indeed").toLowerCase(),
            },
          });
        } else {
          setState({ status: "done", listing: fallback });
        }
      });
    return () => { cancelled = true; };
  }, [listingKey, search, fallback]);
  return state;
}

function FunnelApplyView({ listingKey }) {
  const { status: listingStatus, listing } = useFunnelListing(listingKey);
  const geo = useGeo();
  const tier = tierForCountry(geo.code);
  // A phone tab that gets killed mid-assessment comes back to it: the token
  // is kept per listing on this device.
  const resumeKey = `vora-funnel-s2:${listingKey}`;
  const [stage, setStage] = useState(() => {
    try {
      const token = window.localStorage.getItem(resumeKey);
      if (token) return { step: "assessment", token, status: "" };
    } catch { /* private mode */ }
    return { step: "form", token: "", status: "" };
  });
  const roleTitle = listing ? listing.title : "";
  useNeutralChrome(roleTitle ? `Application · ${roleTitle}` : "Application");

  if (listingStatus === "loading") {
    return (
      <div className="vora-funnel">
        <div className="vora-funnel-wrap"><div className="vora-s2-muted">Loading…</div></div>
        <style>{FUNNEL_CSS}</style>
      </div>
    );
  }
  if (!listing) {
    return (
      <div className="vora-funnel">
        <div className="vora-funnel-wrap">
          <p className="vora-s2-error" role="alert">This application link isn't valid.</p>
        </div>
        <style>{FUNNEL_CSS}</style>
      </div>
    );
  }

  const seed = SEED_JOBS.find((j) => j.slug === listing.jobSlug && j.kind !== "about") || SEED_JOBS.find((j) => j.id === 1);
  const job = {
    ...normalizeJob(seed),
    title: listing.title || seed.title,
    color: "blue",
    // Job-board applicants skip the video — except the lead role, which
    // still asks for it everywhere.
    applyForm: Number(seed.id) === 8 ? (seed.applyForm || STANDARD_APPLY_FORM) : withoutSelfie(seed.applyForm || STANDARD_APPLY_FORM),
    // Every job-board applicant takes Stage 2, whatever the role.
    assessment: STAGE2_ASSESSMENT,
    isOpen: true,
  };
  const brand = { company: listing.company || "", title: job.title };
  const fromIndeed = listing.source === "indeed";
  const doneCopy = fromIndeed
    ? { title: "Assessment recorded.", body: "That's everything we need here. If you already applied on Indeed, you're done; if not, please also submit the Indeed application so we have your CV. We review every assessment within 48 hours and follow up by email or WhatsApp." }
    : { title: "Assessment recorded.", body: "That's everything. We review every assessment within 48 hours and follow up by email or WhatsApp." };

  const onCleared = (s2) => {
    if (s2 && s2.token) { try { window.localStorage.setItem(resumeKey, s2.token); } catch { /* */ } }
    setStage(s2 && s2.token
      ? { step: "assessment", token: s2.token, status: s2.status || "" }
      : { step: "recorded", token: "", status: "" });
  };

  return (
    <div className="vora-funnel">
      {stage.step === "form" && (
        <>
          <header className="vora-s2-top">
            <span className="vora-s2-brand">{brand.company}</span>
            <span className="vora-s2-eyebrow">Application · {brand.title}</span>
          </header>
          <div className="vora-funnel-wrap">
            <h1 className="vora-s2-h1">{brand.title}</h1>
            <p className="vora-s2-lede">
              Your details, then an 8-minute assessment.
            </p>
            <ApplyForm job={job} tier={tier} geo={geo} salaryShown="" funnel={{ listing, onCleared }} />
          </div>
        </>
      )}
      {stage.step === "assessment" && (
        <Stage2View
          token={stage.token}
          chrome="plain"
          brand={brand}
          doneCopy={doneCopy}
          ctaLabel="Begin the 8-minute assessment"
          estimate="Takes up to 8 minutes"
        />
      )}
      {stage.step === "recorded" && (
        <>
          <header className="vora-s2-top">
            <span className="vora-s2-brand">{brand.company}</span>
            <span className="vora-s2-eyebrow">Application · {brand.title}</span>
          </header>
          <div className="vora-s2-wrap">
            <section className="vora-s2-landing">
              <div className="vora-s2-check" aria-hidden>✓</div>
              <h1 className="vora-s2-h1">Application recorded.</h1>
              <p className="vora-s2-lede">
                {fromIndeed
                  ? "That's everything we need here. If you already applied on Indeed, you're done; if not, please also submit the Indeed application so we have your CV. We review every application within 48 hours."
                  : "That's everything for now. We review every application within 48 hours."}
              </p>
            </section>
          </div>
        </>
      )}
      <style>{FUNNEL_CSS}</style>
    </div>
  );
}

const FUNNEL_CSS = `
  .vora-funnel { background: #000; color: #fff; min-height: 100vh; font-family: 'Switzer', sans-serif; }
  .vora-funnel .vora-s2-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 24px; border-bottom: 1px solid rgba(255,255,255,0.06); }
  .vora-funnel .vora-s2-eyebrow { font-family: 'Geist Mono', monospace; font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(255,255,255,0.5); }
  .vora-s2-brand { font-weight: 700; font-size: 14px; letter-spacing: -0.01em; color: #fff; }
  .vora-funnel-wrap { max-width: 620px; margin: 0 auto; padding: 40px 24px 96px; }
  .vora-funnel .vora-s2-h1 { font-weight: 700; font-size: clamp(30px, 5vw, 48px); line-height: 1; letter-spacing: -0.04em; margin: 0 0 14px; }
  .vora-funnel .vora-s2-lede { font-size: clamp(15px, 1.7vw, 17px); line-height: 1.55; color: rgba(255,255,255,0.7); margin: 0 0 32px; max-width: 560px; }
  .vora-funnel .vora-s2-wrap { max-width: 1040px; margin: 0 auto; padding: 40px 24px 96px; }
  .vora-funnel .vora-s2-landing { max-width: 680px; margin: 0 auto; padding-top: 24px; }
  .vora-funnel .vora-s2-check { width: 44px; height: 44px; border-radius: 50%; background: #22C55E; color: #000; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 700; margin-bottom: 22px; }
  .vora-funnel .vora-s2-error { margin: 12px 0 0; font-family: 'Geist Mono', monospace; font-size: 11px; line-height: 1.5; color: rgba(206,60,17,0.95); }
  .vora-funnel .vora-s2-muted { color: rgba(255,255,255,0.5); font-family: 'Geist Mono', monospace; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; }
  @media (max-width: 899px) { .vora-funnel-wrap { padding: 28px 16px 80px; } }
`;

/* ═══════════ MAIN ═══════════ */
export default function VoraOpportunityMap() {
  // Tiny path-based router. The careers track is the default; any
  // single-segment path that matches a hidden job's slug renders that
  // job's apply page. NSFW is its own bespoke view; everything else
  // hidden uses HiddenJobApplyView (the standard ApplyForm in a
  // minimal page chrome).
  const [pathname, setPathname] = useState(
    typeof window !== "undefined" ? window.location.pathname : "/"
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPop = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Single-video coordinator: when any <video> on the page starts
  // playing, every other video on the page is paused. Listens in the
  // capture phase because `play` doesn't bubble.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onPlay = (e) => {
      const target = e.target;
      if (!(target instanceof HTMLVideoElement)) return;
      document.querySelectorAll("video").forEach((v) => {
        if (v !== target && !v.paused) v.pause();
      });
    };
    document.addEventListener("play", onPlay, true);
    return () => document.removeEventListener("play", onPlay, true);
  }, []);

  // Job-board funnel domain: only /apply links (and a resumable Stage 2
  // link) exist there. Everything else is a neutral not-found — the board,
  // slug pages and legal pages must never render under that host.
  if (isFunnelHost()) {
    const fm = pathname.match(/^\/apply(?:\/([a-z0-9][a-z0-9-]{0,79}))?\/?$/i);
    if (fm) return <FunnelApplyView listingKey={(fm[1] || "").toLowerCase()} />;
    const sm = pathname.match(/^\/stage-2\/([A-Za-z0-9_-]{8,80})\/?$/);
    if (sm) return <Stage2View token={sm[1]} chrome="plain" />;
    return <FunnelNotFound />;
  }

  if (pathname === "/nsfw-artist-application") {
    return <NsfwApplicationView />;
  }

  // Dedicated privacy policy page. Linked from the footer on every
  // application page + the main careers footer. Required for Meta /
  // ad-platform compliance — they want a public, persistent URL that
  // explains what we collect and how to request deletion, not just an
  // inline footer blurb.
  if (pathname === "/privacy" || pathname === "/privacy/") {
    return <PrivacyPolicyView />;
  }

  // Messaging terms. Required alongside the privacy policy by the A2P
  // (10DLC) campaign registration that lets us text applicants at all —
  // carriers want a public terms URL, and reviewers do open it.
  if (pathname === "/terms" || pathname === "/terms/") {
    return <MessagingTermsView />;
  }

  // Single-segment slug-shaped path (e.g. /talented-makeup-artist)
  // — try to resolve to a hidden job. Anything that doesn't match
  // falls through to CareersApp.
  // Paid-campaign deep link: /jobs renders the normal careers page but
  // lands directly on the open-roles list (CareersApp detects the path) —
  // ad traffic is pre-briefed and skips the hero. Checked before the
  // hidden-job slug router so "jobs" is never treated as a job slug.
  if (/^\/jobs\/?$/i.test(pathname)) {
    return <CareersApp />;
  }

  // Dev-only: watch the Stage 1 processing panel without submitting a
  // real application. import.meta.env.DEV is compile-time false in prod,
  // so this route (like window.__voraUploadTest) never ships.
  if (import.meta.env.DEV && pathname === "/__stage1-demo") {
    return <Stage1Demo />;
  }

  // Job-board application funnel (unbranded): /apply/<listingId>. Checked
  // before the hidden-job slug router so "apply" never resolves as a job.
  const funnelMatch = pathname.match(/^\/apply(?:\/([a-z0-9][a-z0-9-]{0,79}))?\/?$/i);
  if (funnelMatch) {
    return <FunnelApplyView listingKey={(funnelMatch[1] || "").toLowerCase()} />;
  }

  // Stage 2 assessment page — reached from the Stage 1 processing panel
  // after an application lands (token minted by the portal per candidate).
  const stage2Match = pathname.match(/^\/stage-2\/([A-Za-z0-9_-]{8,80})\/?$/);
  if (stage2Match) {
    return <Stage2View token={stage2Match[1]} />;
  }

  const slugMatch = pathname.match(/^\/([a-z0-9][a-z0-9-]{1,79})\/?$/i);
  if (slugMatch) {
    return <HiddenJobRouter slug={slugMatch[1].toLowerCase()} />;
  }

  return <CareersApp />;
}

/* ─── Hidden-job router ───
   Looks up the slug directly against /api/vora/jobs?slug=…&includeHidden=true.
   The default public jobs endpoint filters out hidden listings, so the
   slug param is the only way to surface a hidden role on the public
   site. If no match, falls back to CareersApp so unrelated slugs
   don't break the site. */
function HiddenJobRouter({ slug }) {
  const [state, setState] = useState({ status: "loading", job: null });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading", job: null });
    // Fetch the board plus this slug's own record (the portal serves a
    // hidden role only by its slug; it no longer lists them all to a
    // browser), then match the slug AFTER running each record through
    // normalizeJob. This lets us treat slugs from SEED_JOBS as canonical
    // even when the portal KV record has no slug field set — slug is a
    // SEED_PINNED_FIELD.
    const jobsAt = (query) => fetch(`${VORA_API}/api/vora/jobs${query}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((body) => (Array.isArray(body?.jobs) ? body.jobs : []));
    Promise.all([jobsAt(""), jobsAt(`?slug=${encodeURIComponent(slug)}&includeHidden=true`)])
      .then(([board, bySlug]) => {
        if (cancelled) return;
        const byId = new Map();
        for (const j of [...board, ...bySlug]) if (j && j.id != null) byId.set(String(j.id), j);
        const list = [...byId.values()];
        const normalized = withDerivedSalaries(list.map((j) => normalizeJob(j)).filter(Boolean));
        // Archived roles keep their records but must not resolve to a live
        // apply page by URL — old ads and links fall through to the board.
        const match = normalized.find((j) => !j.archived && (j.slug || "").toLowerCase() === slug) || null;
        if (match) {
          setState({ status: "found", job: match });
          // Fire ViewContent the moment we resolve to a real role —
          // Meta uses these to build remarketing audiences (anyone
          // who landed on the role page but didn't submit).
          trackViewContent({ role: match.title, slug });
        } else {
          setState({ status: "missing", job: null });
        }
      });
    return () => { cancelled = true; };
  }, [slug]);

  if (state.status === "loading") {
    return <main style={{ background: "#000", color: "#fff", minHeight: "100vh" }} />;
  }
  if (state.status === "missing" || !state.job) {
    return <CareersApp />;
  }
  return <HiddenJobApplyView job={state.job} />;
}


/* ─── Sweep arrow ───
   Small inline SVG arrow that lives next to the section heading
   (after "video", before "Why work here?"). Two shape variants —
   "trail" curves from the title down at the next element (used after
   "video" so the eye lands on the embedded video below); "lead" curves
   from above-left into the title (used before "Why work here?" so it
   pulls the eye toward the heading). Sized via CSS so the curve scales
   sensibly across desktop / tablet / phone instead of overpowering
   small screens. */
function SweepArrow({ color, variant = "trail", placement = "after" }) {
  const accent = color || BRAND.blue;
  const stroke = accent.hex;
  const glow = `0 0 5px rgba(${accent.rgb},0.4)`;

  const paths = {
    // Horizontal swipe right, smooth corner, then a clean vertical drop
    // so the arrowhead can point straight down. Reads as "look here ↓"
    // without the V wandering off-axis from the tangent.
    trail: {
      d: "M 6 14 C 90 14, 152 30, 152 88",
      head: "M 138 72 L 152 94 L 166 72",
    },
    // Mirror of trail — left-sweep into a vertical drop. Used before
    // the title so the eye is led down into "Why work here?".
    lead: {
      d: "M 170 14 C 86 14, 24 30, 24 88",
      head: "M 10 72 L 24 94 L 38 72",
    },
  };
  const p = paths[variant] || paths.trail;

  return (
    <span
      aria-hidden
      className={`vora-sweep-arrow vora-sweep-${placement}`}
      style={{ color: stroke }}
    >
      <svg
        viewBox="0 0 176 100"
        preserveAspectRatio="xMidYMid meet"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: `drop-shadow(${glow})`, display: "block", width: "100%", height: "100%" }}
      >
        <path d={p.d} />
        <path d={p.head} />
      </svg>
    </span>
  );
}

/* ─── Privacy policy page ───
   Public, persistent URL at /privacy. Linked from the footer on the
   makeup-artist application page (and the main careers footer) so the
   Meta / TikTok ad pixel compliance checks have something to point to.
   Bilingual EN/ES via the same useLanguage hook the rest of the site
   uses, with a top-of-page toggle.

   Content is plain-English, plain-Spanish — no lawyer boilerplate.
   States exactly what's collected, why, how long, who has access,
   how to request deletion, and the contact email. */
function PrivacyPolicyView() {
  const geo = useGeo();
  const [lang, setLang] = useLanguage(geo?.code);
  const accent = BRAND.blue;

  const T = lang === "es"
    ? {
        kicker: "Política de privacidad",
        h1: "Política de privacidad",
        lastUpdated: "Última actualización: 29 de julio de 2026",
        intro: "Vora ('nosotros', 'nuestro') opera vora.biz y los formularios de aplicación que viven en este dominio. Esta página explica qué información recopilamos cuando aplicas a una posición o nos contactas, por qué la recopilamos, cuánto tiempo la guardamos y cómo puedes solicitar su eliminación.",
        sections: [
          {
            title: "1. Qué recopilamos",
            body: [
              "Información de contacto que tú nos proporcionas: nombre completo, correo electrónico, número de teléfono y/o WhatsApp.",
              "Información de aplicación: tu enlace de portafolio, archivos de muestra de trabajo (imágenes, videos, PDFs) y archivos de trabajo que decidas subir.",
              "Respuestas a las preguntas del formulario: idiomas que hablas, comodidad con ciertos tipos de contenido, etc.",
              "Datos técnicos automáticos: dirección IP aproximada (para detección de geolocalización a nivel de país), tipo de navegador y página de referencia. No usamos cookies de seguimiento entre sitios.",
            ],
          },
          {
            title: "2. Por qué la recopilamos",
            body: [
              "Para evaluar tu candidatura y decidir si pasar a la siguiente etapa.",
              "Para contactarte con respecto al estado de tu aplicación.",
              "Para cumplir con obligaciones legales / fiscales si te contratamos.",
            ],
          },
          {
            title: "3. Con quién la compartimos",
            body: "No vendemos ni alquilamos tus datos a terceros. Compartimos tu aplicación únicamente con miembros del equipo de Vora que participan en el proceso de contratación. Si te contratamos, podemos compartir tu información con proveedores de servicios necesarios (procesador de nómina, plataforma de pago, etc.) bajo acuerdos de confidencialidad.",
          },
          {
            title: "4. Mensajes de texto y WhatsApp",
            body: [
              "Si nos das un número de teléfono o WhatsApp, podemos contactarte ahí sobre tu aplicación: invitaciones a entrevistas, agendamiento, seguimiento y ofertas de trabajo.",
              "La frecuencia de los mensajes varía según el avance de tu aplicación. La mayoría de los aplicantes reciben menos de 10 mensajes en total.",
              "Pueden aplicar tarifas de mensajes y datos de tu operador.",
              "No vendemos, alquilamos ni compartimos números móviles con terceros con fines de marketing. Los números móviles se usan únicamente por el equipo de contratación de Vora y por los proveedores de mensajería que entregan nuestros mensajes.",
              "Responde STOP en cualquier momento para dejar de recibir mensajes de texto. Responde HELP para obtener ayuda, o escríbenos a privacy@vora.biz.",
            ],
          },
          {
            title: "5. Cuánto tiempo la guardamos",
            body: "Si no avanzamos contigo, eliminamos tus archivos y datos de aplicación dentro de los 12 meses posteriores a tu envío, a menos que solicites una retención más prolongada para futuras posiciones.",
          },
          {
            title: "6. Tus derechos",
            body: "Puedes solicitar acceso a, corrección de, o eliminación de tus datos en cualquier momento escribiendo a privacy@vora.biz. Procesaremos tu solicitud dentro de los 30 días.",
          },
          {
            title: "7. Contacto",
            body: "Preguntas sobre esta política: privacy@vora.biz",
          },
        ],
        back: "← Volver al inicio",
      }
    : {
        kicker: "Privacy policy",
        h1: "Privacy policy",
        lastUpdated: "Last updated: July 29, 2026",
        intro: "Vora ('we', 'our', 'us') operates vora.biz and the application forms that live on this domain. This page explains what information we collect when you apply to a position or contact us, why we collect it, how long we keep it, and how you can request deletion.",
        sections: [
          {
            title: "1. What we collect",
            body: [
              "Contact information you give us: full name, email, phone and/or WhatsApp number.",
              "Application information: your portfolio link, work-sample files (images, videos, PDFs), and work-sample files you choose to upload.",
              "Form-question answers: languages you speak, comfort with certain content types, etc.",
              "Automatic technical data: approximate IP address (used for country-level geolocation detection), browser type, and referring page. We do not use cross-site tracking cookies.",
            ],
          },
          {
            title: "2. Why we collect it",
            body: [
              "To evaluate your application and decide whether to move you to the next stage.",
              "To contact you about the status of your application.",
              "To comply with legal / tax obligations if we hire you.",
            ],
          },
          {
            title: "3. Who we share it with",
            body: "We do not sell or rent your data to third parties. We share your application only with Vora team members involved in hiring. If we hire you, we may share your information with necessary service providers (payroll processor, payment platform, etc.) under confidentiality agreements.",
          },
          // Mobile-specific disclosures. US carriers require all three of
          // these — non-sharing of mobile numbers, message frequency, and
          // the rates disclaimer — to be publicly stated before they will
          // approve an A2P messaging campaign, and reviewers open this page
          // to check. Don't remove or soften these without checking the
          // A2P registration first.
          {
            title: "4. Text messages and WhatsApp",
            body: [
              "If you give us a phone or WhatsApp number, we may contact you there about your application: interview invitations, scheduling, follow-ups, and job offers.",
              "Message frequency varies with the progress of your application. Most applicants receive fewer than 10 messages in total.",
              "Message and data rates may apply, depending on your carrier and plan.",
              "We do not sell, rent, or share mobile numbers with third parties for marketing purposes. Mobile numbers are used only by Vora's hiring team and by the messaging providers that deliver our messages.",
              "Reply STOP at any time to stop receiving text messages. Reply HELP for help, or email privacy@vora.biz.",
            ],
          },
          {
            title: "5. How long we keep it",
            body: "If we don't move forward with you, we delete your application files and data within 12 months of your submission, unless you request a longer retention for future positions.",
          },
          {
            title: "6. Your rights",
            body: "You can request access to, correction of, or deletion of your data at any time by emailing privacy@vora.biz. We will action requests within 30 days.",
          },
          {
            title: "7. Contact",
            body: "Questions about this policy: privacy@vora.biz",
          },
        ],
        back: "← Back to home",
      };

  return <LegalPageView lang={lang} setLang={setLang} T={T} accent={accent} />;
}

/* ─── Messaging terms of service ───
   Public, persistent URL at /terms. Exists because US carriers require a
   terms link alongside the privacy policy on an A2P messaging campaign
   registration — there was no terms page on this site before, which
   blocked the registration outright.

   Scope is deliberately narrow: these are the terms for the text/WhatsApp
   messages we send applicants, not site-wide terms of use. Anything about
   data handling lives in the privacy policy and is linked, not restated,
   so the two can't drift apart. */
function MessagingTermsView() {
  const geo = useGeo();
  const [lang, setLang] = useLanguage(geo?.code);
  const accent = BRAND.blue;

  const T = lang === "es"
    ? {
        kicker: "Términos de mensajería",
        h1: "Términos de mensajería",
        lastUpdated: "Última actualización: 29 de julio de 2026",
        intro: "Estos términos cubren los mensajes de texto y de WhatsApp que Vora envía a las personas que aplican a una posición en vora.biz. Al enviar una aplicación con tu número de teléfono o WhatsApp, aceptas estos términos.",
        sections: [
          {
            title: "1. A quién enviamos mensajes",
            body: "Solo enviamos mensajes a personas que han enviado una aplicación de trabajo a Vora y que nos proporcionaron voluntariamente su número en el formulario de aplicación. No compramos listas ni enviamos mensajes a personas que no han aplicado.",
          },
          {
            title: "2. Sobre qué enviamos mensajes",
            body: "Los mensajes se refieren únicamente a tu propia aplicación: invitaciones a entrevistas, agendamiento y recordatorios, solicitudes de información adicional, y ofertas de trabajo. No enviamos publicidad ni mensajes promocionales.",
          },
          {
            title: "3. Frecuencia y costos",
            body: "La frecuencia varía según el avance de tu aplicación; la mayoría de los aplicantes reciben menos de 10 mensajes en total. Pueden aplicar tarifas de mensajes y datos de tu operador. Vora no te cobra por estos mensajes.",
          },
          {
            title: "4. Cómo darte de baja",
            body: "Responde STOP a cualquier mensaje para dejar de recibirlos. Lo procesamos de inmediato y de forma automática. Seguirás pudiendo aplicar a posiciones y te contactaremos por correo electrónico. Responde HELP para obtener ayuda.",
          },
          {
            title: "5. Entrega",
            body: "La entrega de los mensajes depende de tu operador y no está garantizada. No somos responsables de mensajes retrasados o no entregados.",
          },
          {
            title: "6. Privacidad y contacto",
            body: "Cómo manejamos tus datos se explica en nuestra Política de Privacidad en vora.biz/privacy. Preguntas sobre estos términos: privacy@vora.biz",
          },
        ],
        back: "← Volver al inicio",
      }
    : {
        kicker: "Messaging terms",
        h1: "Messaging terms",
        lastUpdated: "Last updated: July 29, 2026",
        intro: "These terms cover the text and WhatsApp messages Vora sends to people who apply for a role at vora.biz. By submitting an application with your phone or WhatsApp number, you agree to these terms.",
        sections: [
          {
            title: "1. Who we message",
            body: "We only message people who have submitted a job application to Vora and voluntarily provided their number on the application form. We do not buy lists and we do not message people who have not applied.",
          },
          {
            title: "2. What we message about",
            body: "Messages relate solely to your own application: interview invitations, scheduling and reminders, requests for additional information, and job offers. We do not send advertising or promotional messages.",
          },
          {
            title: "3. Frequency and cost",
            body: "Frequency varies with the progress of your application; most applicants receive fewer than 10 messages in total. Message and data rates may apply, depending on your carrier and plan. Vora does not charge you for these messages.",
          },
          {
            title: "4. How to opt out",
            body: "Reply STOP to any message to stop receiving them. We action this immediately and automatically. You can still apply for roles and we will contact you by email instead. Reply HELP for help.",
          },
          {
            title: "5. Delivery",
            body: "Message delivery depends on your mobile carrier and is not guaranteed. We are not liable for delayed or undelivered messages.",
          },
          {
            title: "6. Privacy and contact",
            body: "How we handle your data is explained in our Privacy Policy at vora.biz/privacy. Questions about these terms: privacy@vora.biz",
          },
        ],
        back: "← Back to home",
      };

  return <LegalPageView lang={lang} setLang={setLang} T={T} accent={accent} />;
}

/* Shared chrome for the legal pages (/privacy and /terms). Both are the
   same object: logo header with EN/ES toggle, title block, numbered
   sections where a body is either a paragraph or a bullet list, footer.
   Only the content differs, so it lives in `T` and this renders it. */
function LegalPageView({ lang, setLang, T, accent }) {
  return (
    <main style={{ background: "#000", color: "#fff", minHeight: "100vh" }}>
      <header style={{ padding: "26px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <a href="/" aria-label="Top" style={{ display: "inline-block", textDecoration: "none" }}>
            <VoraLogo height={28} />
          </a>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 16 }}>
            <span
              style={{
                display: "inline-flex",
                gap: 2,
                padding: 3,
                border: "1px solid rgba(255,255,255,0.18)",
                borderRadius: 8,
                background: "rgba(255,255,255,0.04)",
              }}
            >
              {["en", "es"].map((code) => {
                const on = lang === code;
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setLang(code)}
                    aria-pressed={on}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 6,
                      border: "none",
                      background: on ? "rgba(255,255,255,0.18)" : "transparent",
                      color: on ? "#fff" : "rgba(255,255,255,0.6)",
                      fontFamily: "'Geist Mono', monospace",
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      cursor: on ? "default" : "pointer",
                    }}
                  >
                    {code}
                  </button>
                );
              })}
            </span>
          </div>
        </div>
      </header>

      <section style={{ padding: "60px 24px 80px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div
            style={{
              fontFamily: "'Geist Mono', monospace",
              fontSize: 10,
              fontWeight: 500,
              color: `rgba(${accent.rgb},0.9)`,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              marginBottom: 14,
            }}
          >
            <span style={{ color: accent.hex, marginRight: 6 }}>*</span>{T.kicker}
          </div>
          <h1
            style={{
              fontFamily: "'Switzer', 'Inter', system-ui, sans-serif",
              fontWeight: 700,
              fontSize: "clamp(40px, 6vw, 64px)",
              lineHeight: 1.0,
              letterSpacing: "-0.04em",
              color: "#fff",
              margin: 0,
              marginBottom: 12,
            }}
          >
            {T.h1}
          </h1>
          <div
            style={{
              fontFamily: "'Geist Mono', monospace",
              fontSize: 11,
              color: "rgba(255,255,255,0.5)",
              letterSpacing: "0.06em",
              marginBottom: 32,
            }}
          >
            {T.lastUpdated}
          </div>

          <p
            style={{
              fontFamily: "'Switzer', sans-serif",
              fontSize: 16,
              lineHeight: 1.65,
              color: "rgba(255,255,255,0.82)",
              marginBottom: 36,
            }}
          >
            {T.intro}
          </p>

          {T.sections.map((section, i) => (
            <div key={i} style={{ marginBottom: 28 }}>
              <h2
                style={{
                  fontFamily: "'Switzer', sans-serif",
                  fontSize: 18,
                  fontWeight: 600,
                  color: "#fff",
                  letterSpacing: "-0.01em",
                  margin: 0,
                  marginBottom: 10,
                }}
              >
                {section.title}
              </h2>
              {Array.isArray(section.body) ? (
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 22,
                    fontFamily: "'Switzer', sans-serif",
                    fontSize: 15,
                    lineHeight: 1.65,
                    color: "rgba(255,255,255,0.72)",
                  }}
                >
                  {section.body.map((line, j) => (
                    <li key={j} style={{ marginBottom: 6 }}>{line}</li>
                  ))}
                </ul>
              ) : (
                <p
                  style={{
                    fontFamily: "'Switzer', sans-serif",
                    fontSize: 15,
                    lineHeight: 1.65,
                    color: "rgba(255,255,255,0.72)",
                    margin: 0,
                  }}
                >
                  {section.body}
                </p>
              )}
            </div>
          ))}

          <div style={{ marginTop: 40 }}>
            <a
              href="/"
              style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: 11,
                fontWeight: 600,
                color: accent.hex,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                textDecoration: "none",
                borderBottom: `1px solid rgba(${accent.rgb},0.45)`,
                paddingBottom: 2,
              }}
            >
              {T.back}
            </a>
          </div>
        </div>
      </section>

      <footer
        style={{
          padding: "28px 24px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          background: "#000",
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            fontFamily: "'Geist Mono', monospace",
            fontSize: 10,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.32)",
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <span>© {new Date().getFullYear()} Vora · AI-native media</span>
          <span>privacy@vora.biz</span>
        </div>
      </footer>
    </main>
  );
}

/* ─── Hidden-job apply view ───
   Slug landing page used by every per-role URL (and the NSFW page).
   Order is deliberate: company hook (logo + intro video) → role
   nameplate → apply flow → optional context panels at the bottom.
   Salary is intentionally not shown — applicants don't shop by tier on
   a single-role landing page; the offer happens through the recruiter. */
function HiddenJobApplyView({ job: originalJob }) {
  // Slug landing pages always use the standard Vora blue. The
  // multi-color brand palette (gold / magenta / ember) is reserved for
  // the main careers map where the full logo + planet system is shown
  // — these single-role funnels signal trust by sticking to one color.
  // Force-cast the job's color to blue so every downstream component
  // (ApplyForm, WhyWorkPanel, etc.) inherits the same accent rather
  // than each picking up the job's native brand color independently.
  const job = useMemo(() => ({ ...originalJob, color: "blue" }), [originalJob]);
  const accent = BRAND.blue;
  const geo = useGeo();
  const tier = tierForCountry(geo.code);
  const eff = effectiveTier(job, tier);
  const salaryShown = (job.salaries && (job.salaries[eff] || job.salaries[1] || job.salaries[2])) || "";
  const [lang, setLang] = useLanguage(geo?.code);

  // Per-role overrides on the slug landing page.
  //   - Socials Manager + Makeup Artist omit the company-intro section at
  //     the top. Socials Manager's own role video carries the company
  //     pitch (so the company intro would be redundant). Makeup Artist
  //     has no role video yet, so the slug page leans on the placeholder
  //     "coming soon" plate where the role video would sit.
  //   - Socials Manager's role video uses a pre-trimmed file that starts
  //     ~13s into the original (the first 13s are cut from the file
  //     itself, not just seeked over, so viewers can't scrub back).
  const slug = String(job.slug || "").toLowerCase();
  const isSocialsManager = slug === "socials-manager";
  const isMakeupArtist = slug === "makeupartist";
  const showCompanyIntro = !isSocialsManager && !isMakeupArtist;
  // Bilingual video swap for the makeup-artist page — the English
  // intro for lang=en, the Spanish-dubbed version for lang=es. Both
  // files live in /public/ so they ship with the static build. The
  // <video> below uses `key={roleVideoSrc}` so React remounts the
  // element when the source changes and starts fresh from frame 0.
  const roleVideoSrc = isSocialsManager
    ? "/smm-intro-slug.mp4"
    : isMakeupArtist
      ? (lang === "es" ? "/makeupartist-es.mp4" : "/makeupartist-en.mp4")
      : (job.videoUrl || "");

  // Translation overrides for the makeup artist page. The job title +
  // type + reqs come from the KV-backed /api/vora/jobs feed, so we
  // can't edit them in this file directly — but we can pattern-match
  // and replace at render time. The official EN title is also updated
  // here to "Talented Makeup and Transformation Artist" per the
  // expanded scope of the role.
  //
  // The Spanish title intentionally reads as a full sentence with
  // "Aplicación" leading — Spanish word order puts the application
  // word first ("Aplicación para …"), not at the end like English.
  // The render path below detects ES + makeup-artist and rearranges
  // the layout so the colored "Aplicación" sits at the front instead
  // of trailing the role name.
  const translateMakeup = (value, kind) => {
    if (!isMakeupArtist || !value) return value;
    const norm = String(value).trim();
    const dict = {
      title: {
        "Talented Makeup Artist": {
          en: "Talented Makeup and Transformation Artist",
          es: "para maquilladora y artista de transformación facial talentosa",
        },
      },
      type: {
        "Full-time · 40–45 hrs/wk · Remote": {
          en: "Full-time · 40–45 hrs/wk · Remote",
          es: "Tiempo completo · 40–45 hrs/sem · Remoto",
        },
        "Full-time · 40-45 hrs/wk · Remote": {
          en: "Full-time · 40-45 hrs/wk · Remote",
          es: "Tiempo completo · 40-45 hrs/sem · Remoto",
        },
      },
      req: {
        "proof of exceptional makeup/aesthetic altering talent": {
          en: "Proof of exceptional makeup / aesthetic-altering talent",
          es: "Muestra de talento excepcional en maquillaje y alteración estética",
        },
      },
    };
    const map = dict[kind] || {};
    const entry = map[norm];
    if (entry) return lang === "es" ? entry.es : entry.en;
    return value;
  };

  // Page-level static labels with EN/ES translations.
  const T = {
    privateApplication: lang === "es" ? "Aplicación privada" : "Private application",
    applicationWord: lang === "es" ? "Aplicación" : "Application",
    requirements: lang === "es" ? "Requisitos" : "Requirements",
    whyWorkHere: { en: "work here?", es: "trabajar aquí?" },
    whyWord: lang === "es" ? "¿Por qué" : "Why",
    privacyLink: lang === "es" ? "Política de Privacidad" : "Privacy Policy",
    termsLink: lang === "es" ? "Términos" : "Terms",
    // The messaging sentence in the middle is what makes our A2P opt-in
    // claim verifiable: carriers vet the campaign by opening the apply
    // page and looking for notice that submitting the form may result in
    // texts, plus a stated way out. Removing it would invalidate the
    // registration, not just the wording.
    privacyLineParts: lang === "es"
      ? {
          pre: "Al enviar esta aplicación aceptas nuestra ",
          post: ". Recopilamos tu nombre, correo electrónico, número de teléfono/WhatsApp, enlace de portafolio y archivos enviados con el único propósito de evaluar tu candidatura. Podemos contactarte por correo electrónico, mensaje de texto o WhatsApp sobre tu aplicación — responde STOP en cualquier momento para dejar de recibir mensajes. Pueden aplicar tarifas de mensajes y datos. No vendemos ni compartimos tus datos con terceros. Para solicitar la eliminación de tu información, escribe a privacy@vora.biz.",
        }
      : {
          pre: "By submitting this application you agree to our ",
          post: ". We collect your name, email, phone/WhatsApp number, portfolio link, and submitted media for the sole purpose of evaluating your application. We may contact you by email, text message, or WhatsApp about your application — reply STOP at any time to opt out of messages. Message and data rates may apply. We do not sell or share your data with third parties. To request deletion of your data, email privacy@vora.biz.",
        },
  };

  // Top-of-page EN/ES toggle component — only renders on the bilingual
  // makeup artist page. Sits in the header next to the "Private
  // application" pill so the language switch is one of the very first
  // things a visitor sees.
  const TopLangToggle = isMakeupArtist ? (
    <span
      style={{
        display: "inline-flex",
        gap: 2,
        padding: 3,
        border: "1px solid rgba(255,255,255,0.18)",
        borderRadius: 8,
        background: "rgba(255,255,255,0.04)",
      }}
    >
      {["en", "es"].map((code) => {
        const on = lang === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLang(code)}
            aria-pressed={on}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "none",
              background: on ? "rgba(255,255,255,0.18)" : "transparent",
              color: on ? "#fff" : "rgba(255,255,255,0.6)",
              fontFamily: "'Geist Mono', monospace",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              cursor: on ? "default" : "pointer",
              transition: "background 0.15s ease, color 0.15s ease",
            }}
          >
            {code}
          </button>
        );
      })}
    </span>
  ) : null;

  return (
    <main style={{ background: "#000", color: "#fff", minHeight: "100vh" }}>
      <style>{`
        @keyframes voraFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <header style={{ padding: "26px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <a href="/" aria-label="Top" style={{ display: "inline-block", textDecoration: "none" }}>
            <VoraLogo height={28} />
          </a>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 16, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {/* EN/ES toggle is now the FIRST thing a Spanish-speaking
                visitor sees — previously buried in the Apply header,
                way below the fold. Renders only on bilingual pages. */}
            {TopLangToggle}
            <span
              style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: 10,
                fontWeight: 500,
                color: `rgba(${accent.rgb},0.85)`,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
              }}
            >
              <span style={{
                display: "inline-block",
                width: 6, height: 6, borderRadius: "50%",
                background: accent.hex, boxShadow: `0 0 8px rgba(${accent.rgb},0.6)`,
                marginRight: 8, verticalAlign: 1,
              }} />
              {T.privateApplication}
            </span>
          </div>
        </div>
      </header>

      {/* — COMPANY INTRO VIDEO — arrow inline after "video".
          Omitted for Socials Manager: that role's intro video already
          carries the company context, so the brand-pitch clip would be
          redundant. */}
      {showCompanyIntro && (
        <section style={{ padding: "60px 24px 20px" }}>
          <div style={{ maxWidth: 1180, margin: "0 auto" }}>
            <h2
              style={{
                fontFamily: "'Switzer', 'Inter', system-ui, sans-serif",
                fontWeight: 700,
                fontSize: "clamp(40px, 7vw, 84px)",
                lineHeight: 0.95,
                letterSpacing: "-0.045em",
                color: "#fff",
                margin: 0,
                marginBottom: 16,
              }}
            >
              Company{" "}
              <span style={{ whiteSpace: "nowrap" }}>
                <span style={{ color: accent.hex }}>intro</span>
                <SweepArrow color={accent} variant="trail" placement="after" />
              </span>
            </h2>
            <div style={{ paddingTop: 8 }}>
              <OpportunitiesIntro />
            </div>
          </div>
        </section>
      )}

      {/* — ROLE APPLICATION — white colon punctuation, no arrow */}
      <section
        style={{
          padding: "60px 24px 20px",
          borderTop: showCompanyIntro ? "1px solid rgba(255,255,255,0.06)" : "none",
        }}
      >
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <h2
            style={{
              fontFamily: "'Switzer', 'Inter', system-ui, sans-serif",
              fontWeight: 700,
              fontSize: "clamp(40px, 7vw, 84px)",
              lineHeight: 0.95,
              letterSpacing: "-0.045em",
              color: "#fff",
              margin: 0,
              marginBottom: 16,
            }}
          >
            {isMakeupArtist && lang === "es" ? (
              // Spanish layout for the makeup-artist title — leads
              // with the colored "Aplicación" word + the descriptive
              // role phrase, which is the natural Spanish ordering.
              // English keeps the original "Role · Application:"
              // layout below.
              <>
                <span style={{ color: accent.hex }}>{T.applicationWord}</span>{" "}
                {translateMakeup(job.title, "title")}
                <span style={{ color: "#fff" }}>:</span>
              </>
            ) : (
              <>
                {translateMakeup(job.title, "title")}{" "}
                <span style={{ color: accent.hex }}>{T.applicationWord}</span>
                <span style={{ color: "#fff" }}>:</span>
              </>
            )}
          </h2>
          <div style={{ maxWidth: 720, margin: "0 auto", paddingTop: 8 }}>
            <div
              style={{
                width: "100%",
                aspectRatio: "16 / 9",
                borderRadius: 16,
                overflow: "hidden",
                background: "#000",
                border: `1px solid rgba(${accent.rgb},0.25)`,
                boxShadow: `0 0 64px rgba(${accent.rgb},0.18)`,
                marginBottom: 22,
              }}
            >
              {roleVideoSrc ? (
                <video
                  // `key` forces a fresh <video> element whenever the
                  // source changes (e.g. EN→ES toggle on the makeup-
                  // artist page). Without it, the browser keeps the
                  // old src/track loaded and ignores the prop change.
                  key={roleVideoSrc}
                  src={roleVideoSrc}
                  poster={job.videoPoster || undefined}
                  controls
                  playsInline
                  preload="metadata"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                    background: "#000",
                  }}
                />
              ) : (
                <VideoPlate job={job} />
              )}
            </div>

            {job.type && (
              <div
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: 12,
                  fontWeight: 500,
                  color: accent.hex,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  marginBottom: 26,
                }}
              >
                {translateMakeup(job.type, "type")}
              </div>
            )}

            {/* Written description intentionally omitted — the role
                intro video above carries the pitch. */}

            {Array.isArray(job.reqs) && job.reqs.length > 0 && (
              <div style={{ marginBottom: 32 }}>
                <div
                  style={{
                    fontFamily: "'Geist Mono', monospace",
                    fontSize: 10,
                    fontWeight: 500,
                    color: "rgba(255,255,255,0.45)",
                    letterSpacing: "0.22em",
                    textTransform: "uppercase",
                    marginBottom: 14,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span style={{ color: accent.hex, fontSize: 13 }}>*</span>
                  {T.requirements}
                </div>
                {job.reqs.map((r, i) => (
                  <div
                    key={i}
                    style={{
                      fontFamily: "'Switzer', sans-serif",
                      fontSize: 14.5,
                      fontWeight: 400,
                      color: "rgba(255,255,255,0.72)",
                      lineHeight: 1.5,
                      padding: "6px 0",
                      display: "flex",
                      gap: 12,
                      alignItems: "baseline",
                    }}
                  >
                    <span style={{ color: accent.hex, fontSize: 7 }}>●</span>
                    {translateMakeup(r, "req")}
                  </div>
                ))}
              </div>
            )}

            <ApplyForm job={job} tier={tier} geo={geo} salaryShown={salaryShown} />
          </div>
        </div>
      </section>

      {/* — WHY WORK HERE — centered title with a small blue arrow to its left */}
      <section style={{ padding: "60px 24px 100px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <h2
            style={{
              fontFamily: "'Switzer', 'Inter', system-ui, sans-serif",
              fontWeight: 700,
              fontSize: "clamp(40px, 7vw, 84px)",
              lineHeight: 0.95,
              letterSpacing: "-0.045em",
              color: "#fff",
              margin: 0,
              marginBottom: 24,
              textAlign: "center",
            }}
          >
            <span style={{ whiteSpace: "nowrap" }}>
              <SweepArrow color={accent} variant="lead" placement="before" />
              {T.whyWord}
            </span>{" "}
            <span style={{ color: accent.hex }}>{t(T.whyWorkHere, lang)}</span>
          </h2>
          <div style={{ paddingTop: 12 }}>
            <WhyWorkPanel
              section={{ id: "why", title: t(T.whyWorkHere, lang), color: accent }}
              lang={lang}
            />
          </div>
        </div>
      </section>

      {/* — PRIVACY FOOTER — required for Meta / ad platform compliance.
          Concise statement of what we collect, why, that we don't sell
          data, and a contact for deletion requests. Renders in both
          languages on the bilingual makeup-artist page; English-only
          elsewhere. */}
      <footer
        style={{
          padding: "32px 24px 48px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          background: "#000",
        }}
      >
        <div
          style={{
            maxWidth: 880,
            margin: "0 auto",
            fontFamily: "'Switzer', sans-serif",
            fontSize: 12,
            lineHeight: 1.55,
            color: "rgba(255,255,255,0.52)",
            textAlign: "center",
          }}
        >
          <div style={{ marginBottom: 10 }}>
            {T.privacyLineParts.pre}
            <a
              href="/privacy"
              style={{
                color: "rgba(255,255,255,0.85)",
                textDecoration: "underline",
                textUnderlineOffset: 2,
                textDecorationColor: `rgba(${accent.rgb},0.65)`,
              }}
            >
              {T.privacyLink}
            </a>
            {T.privacyLineParts.post}
          </div>
          <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,0.32)" }}>
            © {new Date().getFullYear()} Vora · <a href="/privacy" style={{ color: "inherit", textDecoration: "none", borderBottom: "1px solid rgba(255,255,255,0.2)" }}>{T.privacyLink}</a> · <a href="/terms" style={{ color: "inherit", textDecoration: "none", borderBottom: "1px solid rgba(255,255,255,0.2)" }}>{T.termsLink}</a> · privacy@vora.biz
          </div>
        </div>
      </footer>

      <style>{`
        /* Inline arrow sits next to the heading at roughly cap height.
           "after" follows the last word with a small left margin;
           "before" precedes the heading with a right margin. */
        .vora-sweep-arrow {
          display: inline-block;
          vertical-align: -0.12em;
          width: clamp(56px, 5.6vw, 96px);
          height: clamp(34px, 3.4vw, 58px);
          line-height: 0;
        }
        .vora-sweep-after  { margin-left: clamp(8px, 1vw, 18px); }
        .vora-sweep-before { margin-right: clamp(8px, 1vw, 18px); }
        @media (max-width: 760px) {
          .vora-sweep-arrow {
            width: 56px;
            height: 34px;
          }
          .vora-benefits-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
          .vora-testimonials {
            grid-template-columns: 1fr !important;
            gap: 14px !important;
          }
          .vora-stats-grid {
            grid-template-columns: 1fr !important;
            gap: 18px !important;
          }
        }
        @media (max-width: 420px) {
          .vora-sweep-arrow {
            width: 44px;
            height: 28px;
          }
        }
      `}</style>

      <Footer />
    </main>
  );
}

/* ═══════════ CAREERS APP ═══════════ */
function CareersApp() {
  const [expanded, setExpanded] = useState(null);
  // Top-level audience track: "careers" (default) or "business" (the
  // separate page reached from the top bar's "For business" link).
  const [view, setView] = useState("careers");

  // Silent geo → tier. Device signals (timezone/locale) seed this
  // synchronously so the first paint is already right for the common
  // case; the edge lookup confirms or corrects it a moment later.
  const geo = useGeo();
  const tier = tierForCountry(geo.code);

  // Fetch CMS data from the External Website channel in the internal
  // portal. Falls back to inline seeds while the network is in flight
  // or if the API is unreachable, so the page never goes dark.
  const { jobs, sections, meta } = useVoraData();

  // One chapter open at a time across both careers sections (Why
  // work here + the three business chapters at the bottom). Lifted
  // up so opening one closes any other across the whole page.
  const [openChapter, setOpenChapter] = useState(null);

  // Deep-link support: portal links land here as
  // `vora.biz/#role-panel-<id>`. The bare browser anchor scroll
  // can't help — the role panel renders post-fetch and is
  // collapsed by default. Once jobs load, expand the matching
  // role and scroll its panel into view. Re-runs on hashchange
  // so a second click on the same hash still re-expands.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!Array.isArray(jobs) || jobs.length === 0) return;

    const applyHash = () => {
      const m = window.location.hash.match(/^#role-panel-(\d+)$/);
      if (!m) return;
      const id = Number(m[1]);
      if (!jobs.some((j) => Number(j.id) === id)) return;
      setView("careers");
      setExpanded(id);
      // Wait one frame for the panel's max-height transition
      // to begin, then scroll the row into view.
      requestAnimationFrame(() => {
        const el = document.getElementById(`role-panel-${id}`);
        if (el && typeof el.scrollIntoView === "function") {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    };

    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [jobs]);

  // Paid-campaign deep link: on /jobs, jump straight to the open-roles
  // list once it has rendered. Instant (not smooth) so ad visitors land
  // on the board rather than watching a scroll past the hero.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!/^\/jobs\/?$/i.test(window.location.pathname)) return;
    if (!Array.isArray(jobs) || jobs.length === 0) return;
    requestAnimationFrame(() => {
      const el = document.getElementById("positions");
      if (el && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ behavior: "auto", block: "start" });
      }
    });
  }, [jobs]);

  const goBusiness = () => {
    setView("business");
    setExpanded(null);
    setOpenChapter(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  };
  const goCareers = () => {
    setView("careers");
    setOpenChapter(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  };

  return (
    <main style={{ background: "#000", color: "#fff", minHeight: "100vh", overflowX: "clip" }}>
      <style>{`
        @import url('https://api.fontshare.com/v2/css?f[]=switzer@400,500,600,700&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Geist+Mono:wght@500&display=swap');
        body { background: #000; overflow-x: clip; }
        * { -webkit-tap-highlight-color: transparent; }
        ::selection { background: rgba(${BRAND.gold.rgb}, 0.4); color: #000; }
        @keyframes voraBob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(5px); }
        }
        @keyframes voraFade {
          0%   { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes voraPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.55; transform: scale(0.85); }
        }
        /* Slow ambient breath on the hero gold halo — barely
           perceptible but lifts the page from "static frame" to
           "alive". 14s cycle so it's never the thing you notice. */
        @keyframes voraBreath {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.06); opacity: 0.78; }
        }
        /* Expanded role card: Requirements | Job Details side by side with the
           Apply button spanning both; stacks on narrow phones. */
        .vora-role-grid { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 20px 40px; align-items: start; }
        @media (max-width: 480px) {
          .vora-role-grid { grid-template-columns: 1fr; gap: 28px; }
        }
        /* The card's Apply button: solid brand fill; hover tints a shade
           lighter and lifts, press settles, keyboard focus gets a ring. */
        .vora-apply-btn { box-shadow: 0 1px 0 rgba(255,255,255,0.08) inset, 0 12px 32px rgba(var(--btn-rgb), 0.2); transition: filter 0.2s ease, transform 0.2s ease, box-shadow 0.3s ease, background 0.3s ease, color 0.3s ease; }
        .vora-apply-btn:not(:disabled):hover { filter: brightness(1.2); transform: translateY(-1px); box-shadow: 0 1px 0 rgba(255,255,255,0.14) inset, 0 16px 36px rgba(var(--btn-rgb), 0.34); }
        .vora-apply-btn:not(:disabled):active { filter: brightness(0.95); transform: translateY(0); box-shadow: 0 1px 0 rgba(255,255,255,0.08) inset, 0 8px 20px rgba(var(--btn-rgb), 0.24); }
        .vora-apply-btn:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
        .vora-apply-btn.is-done { box-shadow: 0 0 0 1px rgba(34,197,94,0.4) inset, 0 12px 32px rgba(34,197,94,0.18); }
        @media (prefers-reduced-motion: reduce) {
          .vora-apply-btn { transition: none; }
          .vora-apply-btn:not(:disabled):hover { transform: none; }
        }

        /* MOBILE — bigger tap targets, tighter rhythm */
        @media (max-width: 760px) {
          .vora-pos-row {
            grid-template-columns: 1fr !important;
            row-gap: 8px !important;
            padding: 28px 0 !important;
            min-height: 92px !important;
          }
          .vora-pos-salary { grid-column: 1 / -1 !important; align-items: flex-start !important; }
          .vora-pos-arrow { display: none !important; }
          .vora-chapter {
            grid-template-columns: 1fr !important;
            gap: 14px !important;
            padding: 44px 0 !important;
          }
          .vora-stats-grid {
            grid-template-columns: 1fr !important;
            gap: 18px !important;
          }
          .vora-benefits-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
          .vora-testimonials {
            grid-template-columns: 1fr !important;
            gap: 14px !important;
          }
          .vora-biz-header {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 18px !important;
          }
          .vora-ops-row {
            grid-template-columns: 1fr !important;
            gap: 14px !important;
          }
          .vora-ops-pillars li {
            padding: 22px 18px 22px 24px !important;
          }
        }
        @media (max-width: 900px) {
          .vora-detail-grid {
            grid-template-columns: 1fr !important;
            gap: 36px !important;
          }
        }

        /* iOS form inputs — prevent zoom-on-focus */
        @media (max-width: 760px) {
          input, textarea { font-size: 16px !important; }
          .vora-video-ctas { flex-direction: column !important; }
          .vora-video-ctas > * { width: 100% !important; justify-content: center !important; }
          /* Chapter rows on mobile — keep title + teaser readable, slim the gap */
          .vora-chapter-row {
            padding: 24px 0 !important;
            min-height: 80px !important;
            column-gap: 18px !important;
          }
        }
      `}</style>

      {view === "careers" ? (
        <>
          <TopBar onBusinessClick={goBusiness} />
          <Hero meta={meta} />
          <OpportunitiesIntro />
          <PositionsSection
            expanded={expanded}
            setExpanded={setExpanded}
            tier={tier}
            geo={geo}
            jobs={jobs}
          />
          <ChaptersSection
            openChapter={openChapter}
            setOpenChapter={setOpenChapter}
            sections={sections}
          />
          <Footer />
        </>
      ) : (
        <BusinessView onBack={goCareers} sections={sections} />
      )}
    </main>
  );
}
