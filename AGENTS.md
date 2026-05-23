# vora.biz — agent rules

Read this before making any change. This repo is the public marketing site for Vora (live at https://vora.biz), and a sibling repo `voramodels/internal-portal` is edited by the same small team in parallel — so concurrent-edit safety is critical.

## Deploy pipeline

- Stack: Vite + React SPA, Vercel serverless functions in `api/`
- Vercel project: `vora-external`
- **Push to `main` = production deploy.** Vercel auto-builds from this repo.
- Never run `vercel deploy` from CLI. That ships state that doesn't exist in GitHub and causes the live site to diverge from the source. Always `git add → commit → git push origin main`.

## Commit identity

- Use the user's existing global git config (`user.name` + `user.email`). Don't override at the repo level, don't pass `--author`.
- The Update Log on teamvora.net (Report Bugs tab → Update Log card) attributes commits to specific devs by name. A shared identity breaks attribution and the "actively working" indicator.

## Concurrent-edit safety

Before any push to `main`:

1. `git fetch origin && git log origin/main --since="10 minutes ago" --format='%an: %s'`
2. If the output is non-empty AND the recent author isn't the current `git config user.name`, surface it to the user before pushing. Suggest they check the Update Log or ping the other dev on Slack.

If the user has mentioned someone else is working concurrently, default to checking before pushing even outside the 10-minute window.

## Commit messages

5–12 words, describing the user-visible change. Examples:
- `Tweak opportunity-map planet hover state`
- `Add fallback for Ashby network errors`
- `Update SMM intro video poster`

Avoid timestamps, internal codenames, or one-word subjects.

## What lives where

```
src/
  main.jsx                  React entry
  vora-opportunity-map.jsx  the pannable canvas + planets
  campaign-attribution.js   tracking helpers
api/
  apply.js                  generic apply endpoint
  ashby-apply.js            Ashby integration
  r/[code].js               short-link redirector (vora.biz/r/<code>)
public/                     static assets — intro videos, posters, manifest
vercel.json                 SPA rewrites + /r/* → /api/r/*
```

## Bigger context

For onboarding new devs and the full multi-repo workflow (this repo + `voramodels/internal-portal`), see `DEV_ONBOARDING.md` in the internal-portal repo.
