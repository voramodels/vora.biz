import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Local seed-job titles (the real function resolves them from the portal's
// jobs blob, which the local wrangler KV doesn't have).
const LOCAL_TITLES = { 1: "Velocity Editor", 8: "Marketing Team Lead", 3: "AI Tool R&D", 4: "Socials Manager" };

// Dev-only stand-in for the Vercel function api/ashby-apply.js, so the
// local board can complete an application against the local portal
// (wrangler pages dev on VITE_VORA_API) and hand off to Stage 2 for real.
// Same contract as the real function: the portal record is the hard gate,
// the response carries candidateId + assessmentToken. `apply: "serve"`
// keeps it out of every build; nothing here ships.
function localApplyStandIn() {
  return {
    name: "vora-local-apply",
    apply: "serve",
    configureServer(server) {
      const portal = (process.env.VITE_VORA_API || "http://127.0.0.1:8799").replace(/\/$/, "");
      const secret = process.env.APPLY_RECORD_SECRET || "";
      server.middlewares.use("/api/ashby-apply", async (req, res) => {
        res.setHeader("content-type", "application/json");
        if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
        if (req.method !== "POST") { res.statusCode = 405; return res.end(JSON.stringify({ error: "method-not-allowed" })); }
        let raw = "";
        for await (const chunk of req) raw += chunk;
        let body = {};
        try { body = JSON.parse(raw || "{}"); } catch { body = {}; }
        const answers = [];
        for (const line of String(body.notes || "").split("\n")) {
          const t = line.trim();
          const c = t.indexOf(":");
          if (c > 0) answers.push({ label: t.slice(0, c).trim(), value: t.slice(c + 1).trim() });
        }
        const minted = randomUUID();
        const recordBody = {
          candidateId: minted,
          name: body.name, email: body.email, phone: body.phone || "",
          jobTitle: LOCAL_TITLES[Number(body.jobId)] || "", jobId: body.jobId ?? "",
          tier: body.tier ?? null, country: body.country || "", salaryShown: body.salaryShown || "",
          portfolio: body.portfolio || "",
          attachments: Array.isArray(body.attachments) ? body.attachments : [],
          answers, source: body.source || "", referredBy: null,
          assessmentKey: body.assessmentKey || "",
          intake: body.intake || "", jobSlug: body.jobSlug || "", listingId: body.listingId || "",
          listingLabel: body.listingLabel || "", accountName: body.accountName || "", listingUrl: body.listingUrl || "",
          submittedAt: new Date().toISOString(),
        };
        try {
          const r = await fetch(`${portal}/api/vora/application-record`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-apply-secret": secret },
            body: JSON.stringify(recordBody),
          });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) {
            res.statusCode = 502;
            return res.end(JSON.stringify({ error: "portal-record-failed", detail: `record-http-${r.status}` }));
          }
          const candidateId = d.candidateId || minted;
          res.statusCode = 200;
          return res.end(JSON.stringify({
            ok: true, local: true, candidateId,
            reviewUrl: `${portal}/api/vora/review/${candidateId}`,
            jobId: body.jobId ?? null,
            assessmentToken: d.assessmentToken || "",
            assessmentStatus: d.assessmentStatus || "",
          }));
        } catch (err) {
          res.statusCode = 502;
          return res.end(JSON.stringify({ error: "portal-unreachable", detail: String(err?.message || err) }));
        }
      });
    },
  };
}

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), localApplyStandIn()],
  // Two HTML shells over one app: index.html for vora.biz, apply.html (no
  // brand, no pixel, no icons) for the job-board funnel domain — vercel.json
  // serves it by host.
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        apply: resolve(__dirname, "apply.html"),
      },
    },
  },
});
