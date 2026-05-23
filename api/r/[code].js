// Short-link redirect for tracking campaigns.
//
//   GET /r/<code>
//     → POSTs a click to /api/track/click on the portal, which also
//       resolves the code to its registered destination in the same
//       round-trip.
//     → 302 to <destination>?src=<code>  (or /?src=<code> if unregistered)
//
// The portal's tracking-links registry stores `slug` + `board` per code
// — when `slug` is set the click resolves to `/<slug>`, dropping the
// applicant straight onto the right role's landing page. Codes without
// a slug fall back to the homepage. Unregistered codes still record a
// click but route to root (useful for "I posted a link somewhere and
// forgot to register it" — we'll see the count and reconcile later).

const PORTAL_BASE = process.env.VORA_PORTAL_BASE || 'https://vora-internal-portal.pages.dev';
const SITE_BASE = 'https://www.vora.biz';

function cleanCode(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

// Single trip: post the click and read back the resolved destination
// the portal has on file for this code. Returns the destination path
// (e.g. "/creative-video-editor") or null if unregistered / on error.
async function postClickAndResolve(code, request) {
  const referer = (request && request.headers
    ? (request.headers.referer || request.headers.Referer || request.headers['referer'])
    : null) || null;

  const url = `${PORTAL_BASE}/api/track/click`;
  const payload = JSON.stringify({ campaign: code, referrer: referer });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'vora-biz-tracking-redirect/1.0',
      },
      body: payload,
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`tracking beacon non-OK for "${code}": HTTP ${res.status} ${text.slice(0, 200)}`);
      return null;
    }
    const body = await res.json().catch(() => null);
    if (body && body.archived) {
      // Archived codes still count clicks but route to root (the campaign
      // is no longer "live", whatever the registered slug used to be).
      return null;
    }
    return (body && typeof body.destination === 'string' && body.destination) || null;
  } catch (err) {
    console.warn(`tracking beacon failed for "${code}":`, err?.message || String(err));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Build the final URL the visitor lands on. `destination` is either an
// absolute URL (rare — only set if someone typed one into the override
// field) or a same-origin path starting with `/`. `?src=<code>` is
// always appended so the campaign attribution script on the landing
// page can tag the application.
function buildLandingUrl(destination, code) {
  const dest = destination || '/';
  const isAbsolute = /^https?:\/\//i.test(dest);
  const base = isAbsolute ? dest : `${SITE_BASE}${dest.startsWith('/') ? dest : `/${dest}`}`;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}src=${encodeURIComponent(code)}`;
}

export default async function handler(req, res) {
  const code = cleanCode(req.query?.code || req.params?.code || '');
  if (!code) {
    res.statusCode = 302;
    res.setHeader('location', SITE_BASE);
    res.end();
    return;
  }

  const destination = await postClickAndResolve(code, req);
  res.statusCode = 302;
  res.setHeader('location', buildLandingUrl(destination, code));
  res.setHeader('cache-control', 'no-store');
  res.end();
}
