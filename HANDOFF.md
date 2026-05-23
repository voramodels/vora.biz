# Vora — Opportunity Map Handoff

This document is the full context for picking up the Vora hiring page. Read this before touching code.

---

## What this project is

**Vora** is an AI-powered media operation building short-form social content. This site is the **public hiring page / brand surface** — it's where someone clicking the Vora Instagram bio link lands. Primary audience is overseas creative talent (VAs in the Philippines, India, etc.) who will be hired as Video Editors, Copywriters, AI Tool R&D, Socials Managers, and Content Strategists. Secondary audience is potential business clients and the general "this is a real serious AI-native company" brand impression.

The page is a **pannable dark space canvas** with 6 glowing planets:
- 5 job planets (one per role) arranged around a central "Earth" 
- 1 "About Vora" planet south of Earth (the brand sphere)

Tap a planet → opens a fullscreen panel. Job planets show the role + salary + apply CTA. The Vora planet shows a 2×2 grid of company sub-pages (Why work here / Operations / Talkin' Business / Results — content TBD, currently placeholder).

The overall aesthetic: editorial/fashion-magazine meets sci-fi mission control. Premium, dark, deliberate. Inspired by Vercel/Linear/Apple product page polish, NOT typical SaaS recruiting pages.

---

## Tech stack

- **React 18** + **Vite** (already scaffolded in `vora-deploy/` folder)
- **Pure JSX, no TypeScript** — everything in inline-styled `<div>`s, no CSS modules, no styled-components, no Tailwind
- **Single file**: the entire app lives in `src/vora-opportunity-map.jsx` (~2700 lines)
- **No external state management, no router** — single page, single component tree
- **Fonts**: Google Fonts via `@import` in inline `<style>`. Currently loads:
  - `Instrument Serif` (regular + italic, weight 400)
  - `Geist Mono` (weights 300, 400, 500, 600)
- **Logo**: inline base64 PNG, embedded as `LOGO_SRC` constant near top of file. The PNG is the v*ra wordmark — italic-serif style with the asterisk replacing the "o", four brand colors (blue v, gold *, magenta r, ember a). About 87KB inline.

---

## Brand system

```
BLUE     #0677D0   rgb(6,119,208)
GOLD     #EBB306   rgb(235,179,6)
MAGENTA  #E204CC   rgb(226,4,204)
EMBER    #CE3C11   rgb(206,60,17)
```

Each job planet is keyed to ONE brand color. The Vora planet is the only place where all four appear together (in a conic-gradient rim around its body).

**Money color**: `#22C55E` (Tailwind green-500). Salaries display in green to read instantly as money. Always formatted as `$Xk-$Yk USD/mo` — never per-annum.

**Type system** (post-reset, current state):
- **Instrument Serif (regular, upright, weight 400)** — universal body font, planet titles, all readable text
- **Instrument Serif italic (weight 400)** — RESERVED for: pure decoration only (the giant Copywriter `*`, the opening sequence centerpiece `*`). User explicitly asked to remove italic from all readable text because it hurt legibility.
- **Geist Mono** — HUD/coordinate/system labels and salary numbers only

**Don't reintroduce italic on any text the user reads as text.** Don't add Instrument Sans or Geist Sans back. The user has been emphatic about this — Instrument Serif upright everywhere, Geist Mono for data.

---

## Architecture overview

### Canvas geometry
- Canvas is **3000 × 2800 px** (`CW`, `CH`)
- Earth at canvas-coord (1500, 1400) (`EARTH_X`, `EARTH_Y`)
- Camera tracked via `cam` state + `camRef` (top-left of viewport in canvas-coords)
- Camera transforms applied as `translate3d(${-cam.x}px, ${-cam.y}px, 0)` on a wrapper div

### Planet sizing & growth
- `REST_SIZE = 132` (default rest diameter)
- `MAX_SIZE = 360` (full-grown diameter)
- `GROW_RADIUS = 70` (canvas-px from viewport center where prox = 1.0)
- Each planet has a `restSize` field that defaults to `REST_SIZE`. The Vora "about" planet uses `restSize: 158` (1.2× larger as the parent body).
- **Per-planet rest distance** (`PLANET_REST_LIVE`) computed from each planet's distance from Earth, so all planets land at identical rest-size when camera is at Earth.
- **Mobile (`viewport <= 640px`)**: `effectiveMaxSize = 240` (capped to prevent overlap), `effectiveRestRadius = GROW_RADIUS + 50 = 120` (tight grow band so only the focused planet activates).

### Two-layer planet rendering (CRITICAL — don't break this)
Each planet is structured as:
1. **Outer wrapper** (`MAX_SIZE × MAX_SIZE` square, NEVER changes size). Anchors the planet at `(cx - MAX_SIZE/2, cy - MAX_SIZE/2)` so the visual layer never drifts.
2. **Visual layer** (sphere body with gradient/border/glow/shadow) drawn at `myRest` and scaled via `transform: scale(scale)` where `scale = size / myRest`.
3. **Content layer** (text, salary, blurb, CTA) — same scale + counter-scale on the inner div so text doesn't double-magnify.

Why fixed wrapper: animating `width`/`height` causes layout-shift and the planet pops sideways at growth boundaries. Animating `transform: scale()` pivots from center, never triggers layout, never drifts.

**Z-stacking on growth:** wrapper gets `zIndex: 10 + Math.round(prox * 50)` so growing planets always layer above resting neighbors.

### Mobile-specific layout
Each `JOB` has both `cx, cy` (desktop coords) and `cxM, cyM` (tighter mobile coords). On mount, viewport ≤ 640px sets `mobile = true`, and `JOBS_LIVE` derives the live coords. PLANET_REST recomputes accordingly.

Mobile cluster: planets ~213px from Earth (vs 335-461 on desktop). Vora planet at ~260px (vs 430). All 6 planets visible in a phone viewport without dragging.

### Drag mechanics
- `onMouseDown` / `onTouchStart` records initial pointer position + camera position
- `onMove` updates camera as `(initial cam) - (pointer delta)`
- `onUp` triggers rubber-band snap-back if camera has drifted too far from any planet
- **No glide/inertia** — user explicitly rejected it. Drag stops when finger lifts.
- **No custom cursor** — also rejected. System grab/grabbing on desktop, none on touch.
- Drag handler ignores mousedown that originates on `[data-no-drag="true"]` elements (UI chrome).

### Proximity calc & quantization
- For each planet: distance from viewport-center to planet, normalized by `restD`
- Quartic ease, deadzone < 0.12 (snaps to 0), quantized to 5% steps (prevents wobble at boundaries)
- All driven from `cam` state — purely React-rendered, no imperative animation needed

### Opening sequence
- 2.0 second choreographed reveal: black overlay → asterisk pulses in (450ms) → wordmark fades in (450ms) → wordmark fades, sparks scatter (550ms) → overlay fades, canvas reveals (550ms) → unmount at 2200ms.
- HUD chrome `loaded` flag fires at 1700ms so chrome staggers in during the reveal phase.

### Background layers (parallax)
3 separate fixed-position layers BEHIND the main canvas:
- Nebulae at 0.35× cam offset
- Tiny stars at 0.3× cam offset
- Mid stars at 0.6× cam offset

Bright stars + colored hints + grid + Earth + planets all stay locked to the 1.0× canvas. This gives genuine depth — distant elements barely move, foreground tracks 1:1 with finger.

### About panel structure
Vora "about" planet has `kind: "about"` field. JobPanel branches on this and delegates to `AboutPanel` component.

AboutPanel has internal state `section` (null = hub view, or one of `"why" | "ops" | "biz" | "results"`).
- Hub view: full-color v*ra logo + 2×2 grid of nav cards (each tinted to a brand color).
- Section view: title in big colored text + "coming soon" placeholder.
- Back button is context-aware: if in section, returns to hub; if at hub, closes panel.

**Content for the four sub-pages (Why work here / Operations / Talkin' Business / Results) is NOT YET WRITTEN.** All four currently show placeholder. Filling these in is one of the next major tasks.

---

## What the user has explicitly rejected (don't reintroduce)

1. **Drag inertia / glide** — built it twice, removed it twice. User dislikes the floaty coast.
2. **Custom mouse cursor** — built it, user dislikes it. System cursor only.
3. **Loading ring** (hold-to-apply mechanic) — completely removed. Tap-to-apply only.
4. **Italic text** anywhere readable — only on pure decoration.
5. **Per-planet unique shapes** — proposed, rejected after I argued against it (would break the scale architecture).
6. **The mobile auto-zoom feature** (zoomed-out establishing shot animating to Earth) — built it, broke on user's phone, ripped out. Don't try this again without an actually-working implementation tested on real device.
7. **Sound effects** — proposed, rejected.
8. **Per-tab pill row in About panel** — replaced with the 2×2 card grid.
9. **Detailed tag-lines or descriptions on the Vora planet body** — should be ONLY the logo + "About the company →" pill, nothing else.

---

## What the user has explicitly approved (preserve these)

1. **2-second opening sequence** with choreographed reveal
2. **The 6-planet layout** with Vora as the south anchor
3. **Tap to apply / Tap for more** as the only interaction model — no loading ring
4. **Mobile-tighter cluster** (the cxM/cyM override system)
5. **Green salary numbers** in monospace
6. **2×2 card grid** for About panel sections
7. **Logo top-left as a fixed corner badge**
8. **"J*b Map" + "DRAG TO EXPLORE" inside Earth's disc** as the dragging mental model
9. **Brand-quad rim treatment on the Vora planet** (conic gradient through all 4 colors)
10. **The proximity-grow mechanic** as the core spatial UX

---

## Known performance concerns (user opted not to fix yet)

User said "someone serious will wait." Don't aggressively optimize unless asked.

- **465 absolutely-positioned star divs** (could be canvas)
- **`backdrop-filter: blur(10px)`** on 6 elements — kills WebView perf
- **`mix-blend-mode: screen`** on Content Strategist grid — forces software compositing on Android
- **`willChange: transform`** on 30+ elements — eats GPU memory
- **Heavy box-shadow** with large blur radii on planets
- **35KB base64 logo** loaded inline 6+ times
- **Three Google Fonts** ~150KB

Performance forecast: 60fps on iPhone Safari, 50-55fps in IG/TikTok WebView on iPhone, 20-35fps on 2022 mid-range Android in WebView, 15-25fps on 2019 budget Android in WebView with possible backdrop-filter rendering issues.

If the user later wants Tier-1 perf work: cut star count by 60%, replace `backdrop-filter` with `rgba(0,0,0,0.75)`, remove `mix-blend-mode`, prune `willChange`. None of these are visible to a normal user.

---

## File layout

```
vora-deploy/
├── package.json
├── vite.config.js
├── index.html             (viewport meta, base CSS, theme color black)
├── src/
│   ├── main.jsx           (React entry, just renders <VoraOpportunityMap />)
│   └── vora-opportunity-map.jsx   (THE ENTIRE APP — ~2700 lines)
└── README.md              (deploy instructions)
```

---

## Deploy workflow (current)

User has been deploying via **Netlify Drop** (drag the built `dist/` folder onto netlify.com/drop). Each drop creates a new random URL. To preserve a stable URL across redeploys, sign up for a free Netlify account first, then claim the site.

Build command: `npm run build` → outputs to `dist/`.

For ongoing iteration, switching to **Vercel CLI** (`vercel --prod`) or hooking up GitHub auto-deploy would be more efficient — same URL across deploys, redeploys take ~30s.

Test flow: deploy → URL → DM URL to self on Instagram → tap from inside IG to test in IG's in-app browser (the actual production environment for the target audience).

---

## Active open tasks

1. **Fill in About-panel section content** (Why work here / Operations / Talkin' Business / Results) — currently placeholder. User has not yet provided copy.
2. **Lock in the company tagline copy** — currently uses "An AI-powered media operation building the next wave of social." User has been iterating on this.
3. **Set up persistent deployment** (Vercel + GitHub or Netlify with account) for stable URL across iterations.
4. **Set up the form submission backend** — the JobPanel "TAP TO APPLY" button currently has no backend wired up. Needs an endpoint or service (Formspree, Resend, Airtable, etc.) to actually capture applications.

---

## Design philosophy / UX principles the user has reinforced

1. **High quality and sleek** is the north star. No SaaS-utility feel; this is editorial.
2. **Don't add clutter that confuses people who are looking to work with us** (the most important function of this).
3. **Quiet over loud.** Removed the "// 5 positions open" filler text. Removed the bottom-right HUD's idle state. Less surface area = more confidence.
4. **The space metaphor must read on first frame.** Mobile users especially need to immediately understand "this is a map of jobs" without dragging.
5. **Logo and typography in the same family.** The user is invested in the Instrument Serif italic logo redesign; the rest of the system mirrors that voice.
6. **Don't suggest sound, fancy cursors, drag inertia, or other "designer flourishes" that have already been rejected.**

---

## When in doubt

- **Read the existing code before changing anything.** The two-layer planet architecture is delicate and several implementation details exist specifically because earlier naive approaches caused bugs (the mobile auto-zoom failure, the planet pop-sideways bug, etc).
- **Verify changes parse with Babel** before claiming they work: `node -e "require('@babel/parser').parse(require('fs').readFileSync('src/vora-opportunity-map.jsx','utf8'), {sourceType:'module', plugins:['jsx']})"`. The file has been broken mid-iteration before.
- **Test on the user's actual device.** Mobile bugs that look fine on desktop and in DevTools have shipped. Deploy and check the live URL on iPhone Safari + IG WebView.
- **Don't ship if you're not sure.** The user has been burned by half-broken iterations multiple times. If a change is risky and untested, leave the previous shipped version in `dist/` and flag the open issue clearly.

---

## Logo asset notes

The current `LOGO_SRC` is the second iteration of the wordmark (Instrument Serif italic styling, four brand colors, asterisk replacing the "o"). Original PNG was 4096×4096 JPEG with black background; ImageMagick processed it to a 600×197 PNG with transparent background, ~65KB on disk → ~87KB inline base64.

Trim/transparency command if a new logo needs same processing:
```
convert input.png -fuzz 12% -trim +repage -resize 600x -transparent black -strip output.png
```

---

That's the project. Read `src/vora-opportunity-map.jsx` top to bottom for the implementation. Most decisions are commented inline.
