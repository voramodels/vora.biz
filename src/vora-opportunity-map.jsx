import React, { useState, useEffect, useRef, useMemo } from "react";

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
const VORA_API =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_VORA_API) ||
  "https://vora-internal-portal.pages.dev";

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

   Approximate inaccuracy budget: 8–15% of traffic will see the wrong
   tier (VPN, mobile carrier IP weirdness, satellite, etc.). We accept
   that — the application form captures declared country at submit so
   any mispriced offer gets reviewed before being made formal. */
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
const tierForCountry = (code) => {
  if (!code) return 2; // default tier while detecting / on failure
  const c = String(code).toUpperCase();
  if (TIER_1.has(c)) return 1;
  if (TIER_3.has(c)) return 3;
  return 2;
};

/* useGeo — silent IP geolocation. Returns { code } once resolved.
   Cached per session. Failure is swallowed (default tier 2 applies). */
function useGeo() {
  const [geo, setGeo] = useState(() => {
    if (typeof window === "undefined") return { code: null };
    try {
      const cached = sessionStorage.getItem("vora-geo");
      return cached ? JSON.parse(cached) : { code: null };
    } catch {
      return { code: null };
    }
  });
  useEffect(() => {
    if (geo.code) return;
    let cancelled = false;
    fetch("https://ipapi.co/json/")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (cancelled || !d) return;
        const next = { code: d.country_code || null };
        setGeo(next);
        try {
          sessionStorage.setItem("vora-geo", JSON.stringify(next));
        } catch {}
      })
      .catch(() => { /* swallow — default tier applies */ });
    return () => { cancelled = true; };
  }, [geo.code]);
  return geo;
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
      label: "Relevant experience",
      hint: "Drop any work that shows your relevant experience.",
      multiple: true,
      accept: "image/*,video/*,application/pdf,.zip",
      required: false,
    },
    {
      id: "selfie",
      type: "file",
      label: "30–60 second selfie video",
      hint: "Talk about yourself and why you'd be a good fit. Uncut, one take.",
      multiple: false,
      accept: "video/*",
      required: true,
    },
  ],
};

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

const SEED_JOBS = [
  {
    id: 1,
    slug: "creative-video-editor",
    color: "blue",
    title: "Creative Video Editor",
    /* Per-tier offers — placeholders, edit in the admin tool when it ships. */
    salaries: {
      1: "$5.5k–$9k USD/mo",
      2: "$4k–$6.5k USD/mo",
      3: "$2.8k–$4.5k USD/mo",
    },
    type: "Full-time · 40–45 hrs/wk · Remote",
    blurb: "Master AI. Tell stories. Go viral.",
    desc:
      "Master our AI techniques. Become a creative storyteller and content creator, mixing your creativity with the power of AI to go viral to millions. Focusing on short-form content production.",
    bullets: ["AI-native production", "Short-form storyteller"],
    reqs: [
      "Naturally funny / witty",
      "High emotional intelligence",
      "Hungry to learn and grow",
    ],
    videoUrl: "/cve-intro.mp4",
    videoPoster: "/cve-intro-poster.jpg",
    videoDuration: 102,
    applyForm: STANDARD_APPLY_FORM,
    cx: 1150, cy: 1100, cxM: 1330, cyM: 1240,
  },
  {
    id: 3,
    slug: "ai-tool-research",
    color: "magenta",
    title: "AI Tool R&D",
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
      const normalizedJobs = SEED_JOBS
        .filter((s) => s.kind !== "about")
        .map((s) => normalizeJob(portalById[s.id] || s))
        .filter((j) => j && j.isOpen !== false);
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

function Hero({ onBusinessClick, meta }) {
  const { w } = useResponsive();
  const isMobile = w <= 640;
  const taglineBefore = meta?.taglineBefore || DEFAULT_TAGLINE_BEFORE;
  const taglineGreen = meta?.taglineGreen || DEFAULT_TAGLINE_GREEN;
  const taglineAfter = meta?.taglineAfter || DEFAULT_TAGLINE_AFTER;
  const primaryLabel = meta?.primaryButtonLabel || "Opportunities";
  const secondaryLabel = meta?.secondaryButtonLabel || "Businesses looking to connect";
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

      {/* Two CTAs — primary "Opportunities", secondary "Business is looking to connect" */}
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
              fontFamily: "'Geist Mono', monospace",
              fontSize: 11.5,
              fontWeight: 600,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
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
            <span style={{ fontSize: 13 }}>→</span>
          </a>

          <button
            onClick={onBusinessClick}
            style={{
              appearance: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
              padding: "13px 22px",
              background: "transparent",
              color: "rgba(255,255,255,0.75)",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.18)",
              fontFamily: "'Geist Mono', monospace",
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              cursor: "pointer",
              transition: "background 0.25s ease, border-color 0.25s ease, color 0.25s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.04)";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.32)";
              e.currentTarget.style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)";
              e.currentTarget.style.color = "rgba(255,255,255,0.75)";
            }}
          >
            {secondaryLabel}
            <span style={{ fontSize: 13 }}>→</span>
          </button>
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
  const source = jobsProp && jobsProp.length ? jobsProp : SEED_JOBS;
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
        aria-label={`Refer a creative friend, win $100. ${expanded ? "Collapse" : "Expand"} referral details.`}
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
          Know someone creative?
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
            We're hunting smart, creative people. If you know someone who'd
            thrive on the Vora team — refer them. If they're hired and stay
            for 30 days, we'll pay you <strong style={{ color: "#22C55E" }}>$100</strong>.
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
        aria-label={`${job.title}, ${salary}. ${expanded ? "Collapse" : "Expand"} role details.`}
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

function ExpandedDetail({ job, expanded, tier, geo, salaryShown }) {
  const b = BRAND[job.color];
  const applyRef = useRef(null);

  // When the briefing video ends, smooth-scroll the apply form into
  // view so the user lands directly on the form without thinking.
  // Uses block: "start" so the form anchor sits near the top of the
  // viewport (nice on phones where the form is taller than the
  // visible area).
  const handleVideoEnded = () => {
    if (applyRef.current) {
      applyRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div
      id={`role-panel-${job.id}`}
      role="region"
      aria-label={`${job.title} — details and apply form`}
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
          gap: 56,
        }}
      >
        {/* — BRIEFING — */}
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

          <div
            style={{
              width: "100%",
              maxWidth: 880,
              aspectRatio: "16 / 9",
              borderRadius: 16,
              overflow: "hidden",
              background: "#000",
              border: `1px solid rgba(${b.rgb},0.18)`,
              boxShadow: `0 24px 64px rgba(${b.rgb},0.12), 0 0 0 1px rgba(255,255,255,0.04)`,
            }}
          >
            {job.videoUrl ? (
              <video
                src={job.videoUrl}
                poster={job.videoPoster || undefined}
                controls
                playsInline
                preload="metadata"
                onEnded={handleVideoEnded}
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
        </div>

        {/* — DESCRIPTION & REQUIREMENTS — */}
        <div style={{ maxWidth: 720 }}>
          <p
            style={{
              fontFamily: "'Switzer', sans-serif",
              fontWeight: 400,
              fontSize: "clamp(15px, 1.6vw, 17px)",
              lineHeight: 1.6,
              letterSpacing: "-0.005em",
              color: "rgba(255,255,255,0.78)",
              margin: 0,
              marginBottom: 36,
            }}
          >
            {job.desc}
          </p>

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
            <span style={{ color: b.hex, fontSize: 13 }}>*</span>
            Requirements
          </div>
          {(job.reqs || []).map((r, i) => (
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
              <span style={{ color: b.hex, fontSize: 7 }}>●</span>
              {r}
            </div>
          ))}

          <div
            style={{
              marginTop: 24,
              fontFamily: "'Geist Mono', monospace",
              fontSize: 10,
              fontWeight: 500,
              color: "rgba(255,255,255,0.45)",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span style={{ color: b.hex, fontSize: 13 }}>*</span>
            {job.type}
          </div>
        </div>

        {/* — APPLY FORM (auto-scroll target) — */}
        <div ref={applyRef} style={{ maxWidth: 620, scrollMarginTop: 80 }}>
          <ApplyForm
            job={job}
            tier={tier}
            geo={geo}
            salaryShown={salaryShown}
          />
        </div>
      </div>
    </div>
  );
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
function resolveApplyForm(job) {
  const af = job.applyForm || {};
  const submitLabel = af.submitLabel || "Transmit application";
  if (Array.isArray(af.questions) && af.questions.length) {
    return { questions: af.questions, submitLabel };
  }
  // Legacy shape — single question.
  return {
    submitLabel,
    questions: [
      {
        id: "why",
        label: af.customQuestion || "Why Vora?",
        placeholder:
          af.customQuestionPlaceholder ||
          "Two or three lines on why you'd be great here...",
        type: "textarea",
        required: false,
      },
    ],
  };
}

// XHR wrapper that exposes upload progress events. Resolves with the
// JSON body on 2xx, rejects with a thrown Error on anything else.
// Used by ApplyForm so candidates see a real progress bar while a
// 30s+ video uploads to /api/vora/application-upload — fetch's
// upload-streaming progress is patchy across browsers in 2026.
function uploadFileWithProgress({ file, url, kind, onProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-filename", encodeURIComponent(file.name || "file"));
    xhr.setRequestHeader("x-kind", kind);
    if (xhr.upload && typeof onProgress === "function") {
      xhr.upload.addEventListener("progress", (evt) => {
        if (evt.lengthComputable) onProgress(evt.loaded, evt.total);
      });
    }
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* */ }
      if (xhr.status >= 200 && xhr.status < 300 && data?.ok) {
        resolve(data);
      } else {
        reject(new Error(data?.error || `upload-${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(file);
  });
}

function formatBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function ApplyForm({ job, tier, geo, salaryShown }) {
  const b = BRAND[job.color];
  const applyForm = resolveApplyForm(job);
  const hidePortfolio = !!job.applyForm?.hidePortfolio;
  // Standard fields + per-question answers stored separately so admins
  // can add/remove questions without breaking form state. Phone is a
  // standard required field on every role — recruiters need a second
  // channel for fast scheduling / follow-up where email lag would
  // cost us strong candidates to faster-moving agencies.
  const [form, setForm] = useState({ name: "", email: "", phone: "", portfolio: "" });
  const [answers, setAnswers] = useState(() =>
    Object.fromEntries(
      applyForm.questions
        .filter((q) => q.type !== "file")
        .map((q) => [q.id, ""]),
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
  // Submit-time progress so candidates can SEE the upload happening.
  // {phase: 'idle'|'uploading'|'finalizing'|'ok'|'error',
  //  current: <int>, total: <int>,
  //  fileName: '<current filename>',
  //  fileLoaded: <bytes>, fileSize: <bytes>,
  //  overallPct: 0..100}
  const [progress, setProgress] = useState({ phase: "idle", current: 0, total: 0, fileName: "", fileLoaded: 0, fileSize: 0, overallPct: 0 });

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isFilled = (k) => form[k].trim().length > 0;
  const isEmailValid = isFilled("email") && EMAIL_RE.test(form.email.trim());
  const emailInvalid = isFilled("email") && !isEmailValid;

  // Compute the resting border per field — blank (default), filled
  // (slight white accent), or invalid email (subtle ember edge).
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

  // Submit to /api/ashby-apply, which routes the candidate into the
  // matching Ashby job posting (mapped per-role from the portal at
  // vora.biz/edit). Tier metadata — what offer the candidate saw —
  // travels alongside name/email so each Ashby application is
  // tagged with the precise salary string and tier they accepted
  // against. File uploads are NOT attached here; the post-success
  // confirmation links candidates to a Dropbox file request URL.
  //
  // If the role hasn't been wired to Ashby yet (no ashbyJobPostingId
  // on the portal record), the endpoint returns no-ashby-mapping and
  // we fall back to the legacy mailto: bridge so the application
  // still routes somewhere.
  const submit = async () => {
    if (status === "submitting" || status === "ok") return;
    setErrorMsg("");

    if (!form.name.trim() || !form.email.trim() || !form.phone.trim()) {
      setStatus("error");
      setErrorMsg("Name, email, and phone number are required.");
      return;
    }
    // Required custom questions (text + file)
    for (const q of applyForm.questions) {
      if (!q.required) continue;
      if (q.type === "file") {
        if (!files[q.id] || files[q.id].length === 0) {
          setStatus("error");
          setErrorMsg(`"${q.label || "File upload"}" is required.`);
          return;
        }
      } else if (!(answers[q.id] || "").trim()) {
        setStatus("error");
        setErrorMsg(`"${q.label || "Custom question"}" is required.`);
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
      setErrorMsg(`Couldn't upload your files (${String(err?.message || err)}). Try again.`);
      return;
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
      if (q.type === "file") {
        const fs = files[q.id] || [];
        if (fs.length) {
          notesParts.push(`${q.label}: ${fs.map((f) => f.name).join(", ")}`);
        }
      } else {
        const v = (answers[q.id] || "").trim();
        if (v) notesParts.push(`${q.label}: ${v}`);
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

    const payload = {
      jobId: job.id,
      ashbyJobId: job.ashbyJobId || job.ashbyJobPostingId || "",
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      portfolio: hidePortfolio ? "" : form.portfolio.trim(),
      tier: Number.isFinite(tier) ? tier : null,
      country,
      salaryShown: offer,
      notes: notesParts.join("\n").slice(0, 4000),
      attachments,
      source: campaignSource,
      referralToken,
    };

    try {
      const resp = await fetch("/api/ashby-apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => ({}));
      clearInterval(finalizeCreep);

      if (resp.ok && data?.ok) {
        setStatus("ok");
        setProgress((p) => ({ ...p, phase: "ok", overallPct: 100 }));
        return;
      }

      // Role not wired to Ashby yet — fall back to mailto so we
      // never drop an application during the rollout.
      if (data?.error === "no-ashby-mapping") {
        fallbackToMailto();
        return;
      }

      setStatus("error");
      setProgress((p) => ({ ...p, phase: "error" }));
      setErrorMsg(
        data?.error
          ? `Couldn't submit (${data.error}). Try again or email talent@voraagency.com directly.`
          : `Submit failed (HTTP ${resp.status}). Try again or email talent@voraagency.com directly.`,
      );
    } catch (err) {
      clearInterval(finalizeCreep);
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
      lines.push(q.label || "Question");
      if (q.type === "file") {
        const fs = files[q.id] || [];
        if (!fs.length) {
          lines.push("(no files attached)");
        } else {
          fs.forEach((f) => {
            lines.push(`• ${f.name} (${(f.size / (1024 * 1024)).toFixed(1)} MB)`);
          });
        }
      } else {
        lines.push((answers[q.id] || "").trim() || "—");
      }
    });
    lines.push(``, `— sent from vora.biz`);
    const body = lines.join("\n");
    const url = `mailto:talent@voraagency.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = url;
    setStatus("ok");
  };

  const submitted = status === "ok";
  const submitting = status === "submitting";
  const errored = status === "error";

  return (
    <div>
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
        Apply
      </div>

      {[
        { k: "name", l: "Full name", ph: "Jane Doe", type: "text", autoComplete: "name" },
        { k: "email", l: "Email", ph: "jane@example.com", type: "email", autoComplete: "email" },
        { k: "phone", l: "Phone number", ph: "+1 555 123 4567", type: "tel", autoComplete: "tel", inputMode: "tel" },
        ...(hidePortfolio ? [] : [{ k: "portfolio", l: "Portfolio link", ph: "https://...", type: "url", autoComplete: "url" }]),
      ].map((f) => {
        const showEmailValid = f.k === "email" && isEmailValid;
        const showEmailInvalid = f.k === "email" && emailInvalid;
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
              aria-invalid={showEmailInvalid || undefined}
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
        if (q.type === "file") {
          // File-type question — drag/drop zone (reuses NsfwUploadZone).
          return (
            <div key={q.id} style={{ marginBottom: 18 }}>
              <NsfwUploadZone
                accent={b}
                label={
                  q.required
                    ? `${q.label || "Files"} *`
                    : q.label || "Files"
                }
                hint={q.hint || (q.multiple ? "Drag in any related files." : "Drag in your file.")}
                multiple={q.multiple !== false}
                accept={q.accept}
                files={files[q.id] || []}
                onChange={(next) => setFiles({ ...files, [q.id]: next })}
              />
            </div>
          );
        }
        const isFilledQ = (answers[q.id] || "").trim().length > 0;
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
            case "url":     return { type: "url" };
            case "phone":   return { type: "tel", inputMode: "tel", autoComplete: "tel" };
            case "country": return { type: "text", autoComplete: "country-name" };
            default:        return { type: "text" };
          }
        })();
        return (
          <div key={q.id} style={{ marginBottom: 14 }}>
            <label
              htmlFor={inputId}
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
                {q.label || "Question"}
                {q.required && (
                  <span
                    aria-hidden
                    style={{ color: b.hex, marginLeft: 6 }}
                  >
                    *
                  </span>
                )}
              </span>
            </label>
            {q.type === "textarea" ? (
              <textarea
                id={inputId}
                rows={3}
                placeholder={q.placeholder || ""}
                value={answers[q.id] || ""}
                onChange={(e) =>
                  setAnswers({ ...answers, [q.id]: e.target.value })
                }
                style={styleQ}
                onFocus={onFocusQ}
                onBlur={onBlurQ}
                aria-required={q.required || undefined}
              />
            ) : (
              <input
                id={inputId}
                {...typeAttrs}
                placeholder={q.placeholder || ""}
                value={answers[q.id] || ""}
                onChange={(e) =>
                  setAnswers({ ...answers, [q.id]: e.target.value })
                }
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
        {submitted
          ? "Application transmitted"
          : submitting
          ? "Transmitting…"
          : applyForm.submitLabel || "Transmit application"}
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
                ? "Finalizing…"
                : progress.total > 1
                  ? `Uploading ${progress.current}/${progress.total} · ${progress.fileName}`
                  : `Uploading · ${progress.fileName}`}
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
                color: "rgba(255,255,255,0.4)",
                letterSpacing: "0.04em",
              }}
            >
              {formatBytes(progress.fileLoaded)} / {formatBytes(progress.fileSize)}
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

      {submitted && (
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
  { id: "benefits", label: "Employee benefits" },
  { id: "testimonials", label: "Testimonials" },
  { id: "vision", label: "Vora's vision" },
  { id: "results", label: "Results" },
];

// Benefits ordered most-important-first per founder direction. Each
// has a small line SVG icon (see BenefitIcon).
const WHY_BENEFITS = [
  {
    icon: "training",
    title: "State-of-the-art AI training",
    desc: "Learn the most competitive ways of using AI from the #1 team doing it.",
  },
  {
    icon: "bonus",
    title: "Frequent bonuses",
    desc: "Outperform and you get paid for it — often, not annually.",
  },
  {
    icon: "trend",
    title: "90% raise rate in year one",
    desc: "Plenty of opportunities for hungry people to grow, earn more, and level up.",
  },
  {
    icon: "palm",
    title: "No vacation ceiling",
    desc: "Plan ahead, perform, and we'll back your time off. Recovery and balance are crucial to creative performance.",
  },
  {
    icon: "globe",
    title: "Pure remote · no micromanagement",
    desc: "Async by default. Work from anywhere. We move on output, not chairs filled.",
  },
  {
    icon: "clock",
    title: "Flexible hours · minimal meetings",
    desc: "Pick the hours when you're most productive. Meetings only when necessary. Work designed to be fun.",
  },
  {
    icon: "doc",
    title: "1099 + huge tax write-offs (US)",
    desc: "Independent-contractor structure for US team. Write off all work-related expenses and keep more of what you earn.",
  },
  {
    icon: "crypto",
    title: "Crypto payments available",
    desc: "If you'd rather be paid in crypto, we accommodate.",
  },
  {
    icon: "health",
    title: "Health insurance + e-visits",
    desc: "In most cases we cover health insurance, plus on-call e-visits with top-tier doctors for emergencies.",
  },
  // Two magenta cards that stand apart from the rest of the grid —
  // the second one is full-width / featured at the very bottom.
  {
    icon: "rocket",
    color: BRAND.magenta,
    title: "We're a startup looking to 100x",
    desc: "Get in early on a winning team that's trying to build something great. Grow alongside us.",
  },
  {
    icon: "star",
    color: BRAND.magenta,
    featured: true,
    title: "Building into the future",
    desc: "Vora is on the frontier of AI media production. You're on a team of winners who are revolutionizing an industry and aiming to achieve what hasn't been done before.",
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
    role: "Social Media Team",
    photo: "/testimonials/patty.webp",
    initials: "PM",
    quote:
      "Team chemistry here is hella immaculate. There's real support. We've got each other's back, but we always still lock in and work hard. You're surrounded by people who push you and help you think more creatively. The work is competitive, and you definitely can't slack, but it's overall such a good environment to be a part of.",
  },
  {
    name: "Gio V.",
    role: "Media Team",
    photo: "/testimonials/gio.webp",
    initials: "GV",
    quote:
      "Working at Vora has been lowkey one of the best things ever. The team's super collaborative, always open to new ideas, so you actually feel safe putting your take on the table. Keeps me motivated, always learning something. Real talk, the hard work gets noticed around here. No cap, I genuinely feel like I'm part of something that matters.",
  },
  {
    name: "Jenn B.",
    role: "Social Media Team",
    photo: "/testimonials/jenn.webp",
    initials: "JB",
    quote:
      "Vora changed my life. I've never really enjoyed going to work in the past. But here, there are days I actually clock in on the weekends just because I have nothing to do, and I genuinely enjoy it so much. Going viral, growing, leveling up my skills, and learning is really fun and satisfying. I feel fulfilled knowing I'm chasing new highs and challenging myself. Also, not to mention the career progress I've been able to make. Let's just say I don't skip guac at Chipotle anymore lol.",
  },
  {
    name: "Ericka S.",
    role: "Social Media Team",
    photo: "/testimonials/ericka.webp",
    initials: "ES",
    quote:
      "I freakin love it here. The bosses are young and reasonable. The work is fun. I feel like I finally found something that complements my unique skill set. Superrr stoked to keep growing with you guys.",
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

function WhyWorkPanel({ section }) {
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
        {WHY_TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
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
              {t.label}
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
              return (
                <div
                  key={b.title}
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
                      {b.title}
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
                    {b.desc}
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
                  {q.quote}
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
                  <span style={{ color: `rgba(${c.rgb},0.9)` }}>{q.role}</span>
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
              The goal is for you to be{" "}
              <span style={{ color: c.hex }}>happy</span>, make as much money
              as possible, and simultaneously make the company as much as
              possible.
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
              It's simple. Let's get it.
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
          © {new Date().getFullYear()} v*ra · ai-native media
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

function NsfwUploadZone({ accent, label, hint, multiple, accept, files, onChange }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const handleFiles = (incoming) => {
    if (!incoming) return;
    const list = Array.from(incoming);
    onChange(multiple ? [...files, ...list] : list.slice(0, 1));
  };
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
          Drag &amp; drop or <span style={{ color: accent.hex }}>browse</span>
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
              <span style={{ color: "rgba(255,255,255,0.85)" }}>
                {(f.size / (1024 * 1024)).toFixed(1)} MB
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
  // Fetch the NSFW AI Artist job by slug. The public jobs API hides
  // hidden listings by default — the slug param is the only way to
  // surface them — so we can't use useVoraData here. Until the fetch
  // resolves we still let the form render; the apply endpoint does
  // its own portal lookup as a backstop, so submissions never break
  // even if the in-flight fetch races.
  const nsfwJob = useHiddenJobBySlug("nsfw-artist-application");
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
      country: "",
      salaryShown: "",
      notes,
      attachments,
    };

    try {
      const resp = await fetch("/api/ashby-apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => ({}));

      if (resp.ok && data?.ok) {
        setStatus("ok");
        setProgress((p) => ({ ...p, phase: "ok", overallPct: 100 }));
        return;
      }

      // Role not wired to Ashby yet — fall back to mailto so submissions
      // never get lost during the rollout.
      if (data?.error === "no-ashby-mapping") {
        fallbackToMailto(notes);
        return;
      }

      setStatus("error");
      setProgress((p) => ({ ...p, phase: "error" }));
      setErrorMsg(
        data?.error
          ? `Couldn't submit (${data.error}). Try again or email talent@voraagency.com directly.`
          : `Submit failed (HTTP ${resp.status}). Try again or email talent@voraagency.com directly.`,
      );
    } catch (err) {
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
    const fileLine = (f) => `• ${f.name} (${(f.size / (1024 * 1024)).toFixed(1)} MB)`;
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
                  {fieldLabel("Phone number")}
                  <input
                    type="tel"
                    style={inputStyle("phone")}
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    onFocus={onFieldFocus}
                    onBlur={onFieldBlur("phone")}
                    autoComplete="tel"
                    inputMode="tel"
                  />
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
                        color: "rgba(255,255,255,0.4)",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {formatBytes(progress.fileLoaded)} / {formatBytes(progress.fileSize)}
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

  if (pathname === "/nsfw-artist-application") {
    return <NsfwApplicationView />;
  }

  // Single-segment slug-shaped path (e.g. /talented-makeup-artist)
  // — try to resolve to a hidden job. Anything that doesn't match
  // falls through to CareersApp.
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
    // Fetch the full list (includeHidden) and match the slug AFTER
    // running each record through normalizeJob. This lets us treat
    // slugs from SEED_JOBS as canonical even when the portal KV
    // record has no slug field set — slug is a SEED_PINNED_FIELD.
    fetch(`${VORA_API}/api/vora/jobs?includeHidden=true`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((body) => {
        if (cancelled) return;
        const list = Array.isArray(body?.jobs) ? body.jobs : [];
        const normalized = list.map((j) => normalizeJob(j)).filter(Boolean);
        const match = normalized.find((j) => (j.slug || "").toLowerCase() === slug) || null;
        if (match) {
          setState({ status: "found", job: match });
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
  const roleVideoSrc = isSocialsManager
    ? "/smm-intro-slug.mp4"
    : (job.videoUrl || "");

  return (
    <main style={{ background: "#000", color: "#fff", minHeight: "100vh" }}>
      <style>{`
        @keyframes voraFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

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
            {job.title} <span style={{ color: accent.hex }}>Application</span><span style={{ color: "#fff" }}>:</span>
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
                {job.type}
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
                  Requirements
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
                    {r}
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
              Why
            </span>{" "}
            <span style={{ color: accent.hex }}>work here?</span>
          </h2>
          <div style={{ paddingTop: 12 }}>
            <WhyWorkPanel section={{ id: "why", title: "Why work here?", color: accent }} />
          </div>
        </div>
      </section>

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
  // separate page reached via the "I'm a business looking to connect"
  // CTA in the hero).
  const [view, setView] = useState("careers");

  // Silent geo → tier. Tier 2 (the middle band) is used while the
  // detection is in flight so the UI never shows a stale tier.
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

        /* MOBILE — bigger tap targets, tighter rhythm */
        @media (max-width: 760px) {
          .vora-pos-row {
            grid-template-columns: 1fr !important;
            row-gap: 8px !important;
            padding: 28px 0 !important;
            min-height: 92px !important;
          }
          .vora-pos-salary { grid-column: 1 / -1 !important; }
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
          <Hero onBusinessClick={goBusiness} meta={meta} />
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
