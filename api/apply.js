/* Vercel Serverless Function — POST /api/apply
 *
 * Receives an application submission from the public ApplyForm on
 * vora.biz, validates the required fields, and forwards a formatted
 * Slack message to the webhook configured in env.
 *
 * Required Vercel env var: SLACK_APPLICATIONS_WEBHOOK
 *   → Create an Incoming Webhook in your Slack workspace pointed at
 *     the channel where applications should land (e.g. #applications).
 *     Paste the webhook URL into Vercel project Settings → Environment
 *     Variables for both Production and Preview.
 *
 * Optional Vercel env var: VORA_PORTAL_APPLY
 *   → If set, the function ALSO best-effort POSTs the same payload to
 *     a portal endpoint (e.g. https://vora-internal-portal.pages.dev
 *     /api/vora/apply) for durable KV storage. Failures here are
 *     swallowed silently — Slack remains the primary capture path.
 */

const REQUIRED_FIELDS = ["name", "email", "jobTitle"];

const truthy = (s) => typeof s === "string" && s.trim().length > 0;

export default async function handler(req, res) {
  // CORS preflight (same-origin in production, but harmless to expose).
  if (req.method === "OPTIONS") {
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-methods", "POST, OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "method not allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  // Validate required fields.
  for (const key of REQUIRED_FIELDS) {
    if (!truthy(body[key])) {
      return res.status(400).json({ error: `missing-${key}` });
    }
  }

  // Lightweight email shape check — not RFC-strict, just catches typos.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
    return res.status(400).json({ error: "invalid-email" });
  }

  const submission = {
    jobTitle: body.jobTitle.trim().slice(0, 80),
    name: body.name.trim().slice(0, 120),
    email: body.email.trim().slice(0, 200),
    portfolio: (body.portfolio || "").trim().slice(0, 400),
    msg: (body.msg || "").trim().slice(0, 2000),
    country: (body.country || "").trim().slice(0, 80),
    tier: Number.isFinite(body.tier) ? body.tier : null,
    salaryShown: (body.salaryShown || "").trim().slice(0, 80),
    submittedAt: new Date().toISOString(),
    userAgent: (req.headers["user-agent"] || "").slice(0, 200),
  };

  const webhook = process.env.SLACK_APPLICATIONS_WEBHOOK;
  if (!webhook) {
    return res.status(500).json({
      error: "webhook-not-configured",
      hint:
        "Set SLACK_APPLICATIONS_WEBHOOK in Vercel project env vars to a Slack Incoming Webhook URL.",
    });
  }

  const tierLabel = submission.tier ? `T${submission.tier}` : "—";
  const slackPayload = {
    text: `New application — ${submission.jobTitle} (${submission.name})`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `📩  ${submission.jobTitle}`, emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Name*\n${submission.name}` },
          { type: "mrkdwn", text: `*Email*\n${submission.email}` },
          { type: "mrkdwn", text: `*Portfolio*\n${submission.portfolio || "—"}` },
          {
            type: "mrkdwn",
            text: `*Geo / Tier*\n${submission.country || "—"} · ${tierLabel}`,
          },
          { type: "mrkdwn", text: `*Offer shown*\n${submission.salaryShown || "—"}` },
          { type: "mrkdwn", text: `*When*\n${submission.submittedAt}` },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Why Vora?*\n${submission.msg || "_(blank)_"}`,
        },
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `\`vora.biz/api/apply\`  ·  ${submission.userAgent}` },
        ],
      },
    ],
  };

  try {
    const slackRes = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(slackPayload),
    });
    if (!slackRes.ok) {
      const text = await slackRes.text().catch(() => "");
      return res.status(502).json({
        error: "slack-failed",
        status: slackRes.status,
        detail: text.slice(0, 200),
      });
    }
  } catch (err) {
    return res.status(502).json({ error: "slack-network", detail: String(err).slice(0, 200) });
  }

  // Optional best-effort durable storage in the portal's KV. Failures
  // here don't affect the user-facing response — Slack already captured.
  const portalUrl = process.env.VORA_PORTAL_APPLY;
  if (portalUrl) {
    fetch(portalUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(submission),
    }).catch(() => { /* swallow */ });
  }

  return res.status(200).json({ ok: true });
}
