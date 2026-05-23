// Campaign attribution capture for vora.biz.
//
// Reads the campaign id from the URL on first load (`?src=<id>`, or
// the standard `utm_source` / `utm_campaign` UTM pair) and stashes it
// in sessionStorage so it survives client-side navigation between the
// landing page and the apply flow.
//
// Also fires a fire-and-forget POST to the portal's /api/track/click
// endpoint so we get an honest server-side click count instead of
// relying on adblock-vulnerable analytics. The beacon is debounced via
// sessionStorage — one ping per session per campaign — so a visitor
// who reloads the page mid-session doesn't inflate the counter.

const PORTAL_BASE = "https://vora-internal-portal.pages.dev";
const STORAGE_SRC_KEY = "vora_attrib_src_v1";
const STORAGE_BEACON_SENT_KEY = "vora_attrib_beacon_sent_v1";
// Referral tokens live in a separate sessionStorage slot from `src`
// because the slug normalizer for `src` aggressively lowercases — that
// destroys the case-sensitive base64url payload of a referral token.
// The dedicated `?ref=` channel is kept verbatim and surfaced to the
// apply payload as `referredBy` so the ATS shows the referrer cleanly.
const STORAGE_REF_KEY = "vora_attrib_ref_v1";

function safeCampaignId(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function readSrcFromUrl() {
  try {
    const params = new URL(window.location.href).searchParams;
    const direct = params.get("src");
    if (direct) return safeCampaignId(direct);
    // Fall back to UTM. `utm_campaign` is the more specific signal;
    // utm_source alone is fine when no campaign is set.
    const campaign = params.get("utm_campaign");
    if (campaign) return safeCampaignId(campaign);
    const source = params.get("utm_source");
    if (source) return safeCampaignId(source);
    return "";
  } catch {
    return "";
  }
}

// If the visitor lands directly on a slug page (e.g. typed
// vora.biz/creative-video-editor, found it via Google) we still want
// the application tagged with a meaningful source instead of empty.
// Returns `direct-<slug>` for any single-segment path that looks like
// a role slug, `direct` for the homepage. This is only used when no
// explicit `?src=` / UTM is present — explicit campaign codes always
// win.
function readDefaultSrcFromPath() {
  try {
    const path = window.location.pathname || "/";
    // Treat /r/<code> redirect targets specially — they'll be
    // accompanied by ?src=<code> already, so this branch is just
    // defensive in case the query string was stripped.
    if (path === "/" || path === "") return "direct";
    const slugMatch = path.match(/^\/([a-z0-9][a-z0-9-]{1,79})\/?$/i);
    if (slugMatch) {
      const slug = slugMatch[1].toLowerCase();
      if (slug === "r" || slug.startsWith("r/")) return "direct";
      return safeCampaignId(`direct-${slug}`);
    }
    return "direct";
  } catch {
    return "";
  }
}

function getStoredSrc() {
  try { return window.sessionStorage.getItem(STORAGE_SRC_KEY) || ""; }
  catch { return ""; }
}

function setStoredSrc(value) {
  try {
    if (value) window.sessionStorage.setItem(STORAGE_SRC_KEY, value);
  } catch { /* sessionStorage may be blocked in private mode */ }
}

function getCampaignSource() {
  return getStoredSrc() || readSrcFromUrl() || readDefaultSrcFromPath();
}

// Read & persist a referral token (`?ref=<base64url>`) without touching
// the slug normalizer that handles regular campaign sources. The token
// is opaque to this layer — the apply endpoint decodes it back into
// the referrer's name + email when it forwards the submission to Ashby.
function readRefFromUrl() {
  try {
    const params = new URL(window.location.href).searchParams;
    const raw = params.get("ref") || "";
    // Strict char allowlist for base64url (no slashes/plus signs,
    // capped length so a malicious query string can't blow storage).
    const cleaned = raw.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 600);
    return cleaned;
  } catch {
    return "";
  }
}
function getStoredRef() {
  try { return window.sessionStorage.getItem(STORAGE_REF_KEY) || ""; }
  catch { return ""; }
}
function setStoredRef(value) {
  try {
    if (value) window.sessionStorage.setItem(STORAGE_REF_KEY, value);
  } catch {}
}
function getReferralToken() {
  return getStoredRef() || readRefFromUrl();
}

function sendClickBeacon(campaign) {
  if (!campaign) return;
  let alreadySent = "";
  try { alreadySent = window.sessionStorage.getItem(STORAGE_BEACON_SENT_KEY) || ""; } catch {}
  if (alreadySent === campaign) return; // de-dupe within a session

  const payload = JSON.stringify({
    campaign,
    referrer: document.referrer || null,
  });

  // sendBeacon is preferred — survives navigation, runs in idle time.
  // Falls back to fetch with keepalive when unavailable.
  let dispatched = false;
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([payload], { type: "application/json" });
      dispatched = navigator.sendBeacon(`${PORTAL_BASE}/api/track/click`, blob);
    }
  } catch { /* fall through */ }
  if (!dispatched) {
    try {
      fetch(`${PORTAL_BASE}/api/track/click`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
        keepalive: true,
        mode: "cors",
      }).catch(() => {});
    } catch { /* nothing more to do */ }
  }

  try { window.sessionStorage.setItem(STORAGE_BEACON_SENT_KEY, campaign); } catch {}
}

// Run capture immediately on script eval (before React mounts) so the
// source is recorded even if the visitor closes the tab before the
// React tree finishes painting.
(function captureOnLoad() {
  const fromUrl = readSrcFromUrl();
  if (fromUrl) {
    setStoredSrc(fromUrl);
    sendClickBeacon(fromUrl);
  } else {
    const stored = getStoredSrc();
    if (stored) {
      sendClickBeacon(stored);
    } else {
      // Organic landing — no explicit campaign tag. Store a path-derived
      // default (e.g. "direct-creative-video-editor") so the application
      // is still attributable. We deliberately skip the click beacon for
      // these — counting all homepage visits as "direct" campaign
      // clicks would drown the legitimate paid-channel counters.
      const fallback = readDefaultSrcFromPath();
      if (fallback) setStoredSrc(fallback);
    }
  }
  const refFromUrl = readRefFromUrl();
  if (refFromUrl) setStoredRef(refFromUrl);
})();

// Public accessors the apply form uses to attach attribution metadata
// to the submission. Exposing on window keeps the surface minimal —
// no need to import this module from the React tree.
if (typeof window !== "undefined") {
  window.__voraCampaignSource = getCampaignSource;
  window.__voraReferralToken = getReferralToken;
}

export { getCampaignSource, getReferralToken };
