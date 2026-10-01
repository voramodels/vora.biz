/* Vercel Serverless Function — GET /api/geo
 *
 * Returns the visitor's country from Vercel's edge geo headers.
 *
 * Why this exists: the site used to resolve the visitor's country by
 * calling ipapi.co from the browser. That is a third-party request on
 * a tracker-shaped domain, so it gets blocked by content blockers,
 * carrier DNS filtering and mobile privacy modes, and its free tier is
 * rate-limited (~1k/day) — well under what an ad-driven careers page
 * sees. Every failure silently fell back to the middle salary tier,
 * which meant US/UK/EU candidates were shown a LOWER offer than they
 * should have been whenever the lookup got blocked.
 *
 * This endpoint is same-origin (vora.biz), so it can't be blocked as a
 * third party, is never rate-limited, and the country comes from the
 * edge that terminated the connection rather than a guess.
 *
 * `x-vercel-ip-country` is populated on every Vercel request. No
 * config needed. Response is deliberately uncacheable — it varies per
 * visitor and a cached copy would hand one visitor another's country.
 */

export default function handler(req, res) {
  const country = String(req.headers["x-vercel-ip-country"] || "").toUpperCase();
  const region = String(req.headers["x-vercel-ip-country-region"] || "").toUpperCase();

  res.setHeader("cache-control", "no-store, private");
  res.setHeader("access-control-allow-origin", "*");
  return res.status(200).json({
    ok: true,
    country: /^[A-Z]{2}$/.test(country) ? country : "",
    region: /^[A-Z0-9-]{1,6}$/.test(region) ? region : "",
    source: "vercel",
  });
}
