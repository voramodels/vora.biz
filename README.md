# vora.biz

Public marketing site for Vora. Live at [vora.biz](https://vora.biz).

The visual core is a pannable space canvas with interactive job planets (the opportunity map). Visitors can apply via embedded Ashby integration, and short links (`/r/<code>`) redirect through campaign attribution.

## Stack

- Vite + React (SPA)
- Vercel serverless functions in `api/` (apply, ashby-apply, r/[code])
- Deployed on Vercel (project: `vora-external`)
- GitHub repo: [`voramodels/vora.biz`](https://github.com/voramodels/vora.biz)

## Run locally

```bash
pnpm install
pnpm dev
```

Then open http://localhost:5173. Vite also prints a Network URL — open that on your phone (same Wi-Fi) to test the in-app browser flow.

## Deploy

**Push to `main`.** Vercel auto-deploys from this repo — never run `vercel deploy` from CLI, since it would ship a state that doesn't exist on GitHub.

```bash
git add -A
git commit -m "..."
git push origin main
```

## Commit conventions

The Update Log on teamvora.net (Report Bugs → Update Log) reads commits from this repo to surface who's pushing changes and when. A few small habits keep that signal clean:

- Commit with a real-name git identity (not "Vora Codex" or a generic bot name). Set it once globally on your machine:
  ```bash
  git config --global user.name "Your Real Name"
  git config --global user.email "you@vora.example"
  ```
- Write a 5–12 word subject describing what changed, then add detail in the body if useful. Example: `"Tweak opportunity-map planet hover state"`.
- One logical change per commit when possible. The Update Log shows each commit as its own row.

Any AI coding agent (Claude, Codex, Cursor, etc.) will honor your local git config — no agent-specific setup required.

## File structure

```
vora-deploy/
├── package.json
├── vite.config.js
├── index.html
├── src/
│   ├── main.jsx
│   ├── vora-opportunity-map.jsx   ← the canvas + planets
│   └── campaign-attribution.js
├── api/
│   ├── apply.js
│   ├── ashby-apply.js             ← Ashby integration
│   └── r/[code].js                ← short-link redirector
└── public/                         ← intro videos, posters, manifest
```

## Related

- [voramodels/internal-portal](https://github.com/voramodels/internal-portal) — internal team portal (teamvora.net)
