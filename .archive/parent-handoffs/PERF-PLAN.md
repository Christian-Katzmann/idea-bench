# ïdea.com / ModelArena — Performance Plan

**Goal:** Make the deployed site at `https://www.ïdea.com` (punycode
`www.xn--dea-yma.com`) fast on operator pages and the participant
voting flow. Frontend-first; backend changes are flagged but require
explicit authorization per the brief in `PERF-INVESTIGATION.md`.

Method: measure deployed site, profile the production bundle, read
the code paths the user complained about, then rank by ROI.

---

## 1. Executive summary

Three findings dominate. Two are perf, one is correctness:

1. **`vercel.json` has no SPA rewrite rule.** Every route except `/`
   returns **HTTP 404** from Vercel. Confirmed:
   `/dashboard`, `/login`, `/campaign/foo`, `/vote/foo`, `/models`,
   `/team-activity`, `/settings/api` all 404. Bookmarks, browser
   refresh, and **shared participant vote links** never load the SPA
   shell. This is not a perf bug — it is the most likely cause of the
   user-reported "slowness" for participants. **Sprint 1 must fix it
   first** or every other measurement is moot.
2. **Zero route code-splitting.** One 758 kB JS chunk (233 kB gzip)
   ships on every cold visit. Lighthouse reports **151 kB unused JS
   on `/login`** — 65 % of the bundle. Code-splitting cuts initial
   payload to ~80 kB gzip and Slow-4G LCP from 2.8 s → an estimated
   1.0–1.4 s.
3. **Cold Vercel Function TTFB is 1.0–1.9 s for a 401**, climbing to
   3.1 s for a 404. Each `/api/*` is a separate function and
   cold-starts independently the first time it's hit. Warm steady
   state is 270–310 ms. Adding `Cache-Control: s-maxage=…,
   stale-while-revalidate=…` on safe GETs lets the Vercel CDN absorb
   most operator reads — but this is backend work and is flagged for
   Sprint 2.

Estimated impact of Sprint 1 alone (the items requiring **only**
frontend + `vercel.json` changes): mobile Slow-4G LCP **2.8 s → ~1.2 s**,
mobile transferred bytes **349 kB → ~180 kB** on first paint, and
return-visit JS download eliminated entirely (immutable headers).

Estimated time for Sprint 1: **half a day** including verification.

---

## 2. Baseline measurements

All measurements taken **2026-04-19** against the live deploy.

### 2.1 Lighthouse — `/` (redirects to `/login`, the only SPA route that loads)

| Profile | Score | FCP | LCP | TBT | Speed Index | TTI |
|---|---:|---:|---:|---:|---:|---:|
| Mobile, Slow 4G (Lighthouse default) | **87** | 2.6 s | **2.8 s** | 0 ms | 5.7 s | 2.8 s |
| Mobile, fast network + 4× CPU | 100 | 0.5 s | 0.5 s | 30 ms | 1.1 s | 0.7 s |
| Desktop, no throttling | 100 | 0.5 s | 0.5 s | 0 ms | 0.6 s | 0.5 s |

**Reading these numbers:** the 2.3 s gap between the two mobile
profiles is purely network — the bundle download. CPU/JS execution
itself is well under a second on the throttled CPU. The fix is bytes,
not work. CLS is 0 across all profiles (good).

**Lighthouse coverage gap:** the operator pages
(`/dashboard`, `/campaign/:id`, `/models`, `/team-activity`,
`/settings/api`) and the participant pages (`/vote/:slug` and below)
**cannot be Lighthouse-tested externally** because (a) the SPA
routing 404 returns the wrong status, and (b) operator routes need an
auth cookie. Measurements for those pages will be possible after
Finding R1 is fixed and a test slug or operator session is provided.

### 2.2 TTFB on `/api/*` endpoints

`curl -w time_starttransfer` from a US-West client. Cold = first hit
after >15 min idle. Warm = 3 sequential calls.

| Endpoint | Status | Cold TTFB | Warm TTFB (median of 3) |
|---|---:|---:|---:|
| `/api/campaigns` | 401 | **1.61 s** | 282 ms |
| `/api/dashboard` | 401 | **1.93 s** | 294 ms |
| `/api/models` | 401 | **1.82 s** | 277 ms (one outlier 1.15 s — second cold) |
| `/api/activity` | 401 | 1.53 s | not retested |
| `/api/settings/api` | 401 | 1.03 s | not retested |
| `/api/vote/<fake-slug>` | 404 | **3.12 s** | not retested |
| `/` (HTML root) | 200 | 144 ms | 150 ms (Vercel CDN HIT) |

The 1.0–1.9 s cold TTFB is for a 401 response — **the slowness is
entirely cold start, not query work**. Auth-rejected requests don't
even hit the database. Each function is independent, so the first
operator visit pays cold start ×N as TanStack Query fans out queries.

The 3.1 s on the vote slug 404 is unusually slow — worth confirming
when there's a real slug to test.

### 2.3 Bundle composition (production build, fresh `npm run build`)

```
JS  : 757.98 kB raw  /  232.68 kB gzip   (single chunk)
CSS :  76.34 kB raw  /   15.32 kB gzip   (deployed: 102 / 18 kB — slightly more)
```

Treemap from `rollup-plugin-visualizer` (installed dev-only, removed
before this report). Top vendors **by gzipped contribution**:

| Package | gzip kB | Share of bundle | Notes |
|---|---:|---:|---|
| `@base-ui/react` | 97.9 | 42 % | 189 files; floating-ui internals; bundled on every page |
| `react-dom` | 95.8 | 41 % | non-removable |
| `motion-dom` + `framer-motion` | 124.2 (combined) | 53 % | imported only by `VotingInterface` and `CampaignPreview` — **prime code-split target** |
| `react-router` | 20.0 | 9 % | — |
| `@tanstack/query-core` + `react-query` | 22.1 | 9 % | — |
| `lucide-react` | 16.6 | 7 % | 1 644 individual icons in tree but only 25 imported; tree-shaking is working |
| `tailwind-merge` | 16.0 | 7 % | one file, 97 kB raw — `cn()` is everywhere |
| `date-fns` | 14.3 | 6 % | only `formatDistanceToNow` is used; 14 kB is heavy for one helper |
| App `pages/` | 37.5 | 16 % | all 12 pages; ideal split target |
| App `components/` | 21.8 | 9 % | shell + UI primitives |

Per-package gzip sums add to ~516 kB because gzip headers are
counted per module; the **actual file is 232.68 kB gzip**. Use the
**share** column for relative weighting, not the absolute kB.

App code is ~62 kB gzip; vendors are ~170 kB gzip.

### 2.4 Font payload

`@import "@fontsource-variable/inter"` and
`@import "@fontsource-variable/jetbrains-mono"` in
[`src/index.css:4-5`](modelarena/src/index.css) emit **13 woff2
files** at build time, totaling ~313 kB raw. `font-display: swap`
is set; `unicode-range` is declared per file. Browsers fetch only
the ranges that match characters on the page — but:

| woff2 actually fetched on `/login` | Bytes |
|---|---:|
| `inter-latin-wght-normal` | 48.3 kB |
| `inter-latin-ext-wght-normal` | **~85 kB** ← triggered by `ï` in title `ïdea.com` |
| `jetbrains-mono-latin-wght-normal` | (lazy — not on /login) |

Lighthouse reports **2 font requests / 87 kB transferred** on
`/login`. The `latin-ext` subset would not be needed if the brand
text didn't contain `ï` (U+00EF). Either subset more aggressively or
override `unicode-range` in CSS to exclude latin-ext entirely (with
a fallback render — `ï` then displays in the system fallback font,
which is acceptable in title/meta).

### 2.5 Asset cache headers

```
GET /assets/index-Lunzrbrw.js → cache-control: public, max-age=0, must-revalidate
GET /assets/index-D3T1J-fb.css → cache-control: public, max-age=0, must-revalidate
```

These are **content-hashed** filenames — they should be `immutable,
max-age=31536000`. As shipped, every navigation triggers an
If-None-Match revalidation roundtrip even though the file is in the
browser cache. Vercel's CDN caches them (`x-vercel-cache: HIT`) so
the revalidation is fast, but it's still one round-trip per page
load that could be zero.

### 2.6 Backend hot paths (read-only review — no measurements possible without auth)

Confirmed from the code:

- **`buildCampaignDetail`** — [src/server/campaigns/detail.ts:54-167](modelarena/src/server/campaigns/detail.ts) — 7 round-trips per request. `computeWinStats` does an unbounded `SELECT * FROM votes WHERE campaign_id = ?`. At current scale (~hundreds of votes per campaign) this is fine; at any meaningful scale it walls.
- **`loadAnalyticsSnapshot`** — [src/server/models/library.ts:421-497](modelarena/src/server/models/library.ts) — 7 parallel queries each running an effectively unfiltered `SELECT` on a major table (`campaigns`, `prompts`, `participants`, `campaignModels`, `generations`, `votes`, `ratings`). Materializes the whole DB into Function memory. Called by both `/api/dashboard` and `/api/models`. At scale this is the worst offender.
- **DB client** — [src/server/db/client.ts](modelarena/src/server/db/client.ts) — properly memoized; uses Neon HTTP driver (correct choice for Vercel). Cold-start surface is small. **Not a problem.**
- **Indexes** — [drizzle/0000_initial.sql](modelarena/drizzle/0000_initial.sql) — covers vote queries, prompt list, and the participant unique constraint. Missing: `campaigns(created_at desc)` for the list endpoint sort, and `participants(campaign_id, finished_at)` for the `WHERE finished_at IS NOT NULL` count in `buildCampaignDetail`. Modest impact at current scale.

---

## 3. Findings, ranked

S/M/L = small (under a half day) / medium (half to two days) / large
(multi-day refactor).

### R1 — SPA routing 404 on every non-`/` URL  ·  S  ·  CRITICAL  ·  CORRECTNESS

**What:** `vercel.json` is `{ "buildCommand": "..." }` only — no
`rewrites`. Vercel's static-output behavior 404s any URL that doesn't
map to a file. Confirmed: 8 of 9 SPA routes 404.

**Impact:** Every shared participant vote link (`/vote/:slug`) and
every operator deep-link or refresh fails before the SPA boots. This
is almost certainly part of what the user is seeing as "slow" — it's
not slow, it's broken.

**Fix:** Add to `vercel.json`:

```json
{
  "buildCommand": "npm run deploy:check && npm run build",
  "rewrites": [
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ]
}
```

The negative lookahead preserves `/api/*` routing to functions.
**Do this first; without it the rest of Sprint 1 can't be measured
on participant pages.**

**Spin-off candidate:** none — must fix as part of Sprint 1.

### R2 — Hashed assets served without `immutable`  ·  S  ·  HIGH

**What:** `/assets/index-*.js` and `/assets/index-*.css` ship with
`Cache-Control: public, max-age=0, must-revalidate`. Hashed filenames
should be `Cache-Control: public, max-age=31536000, immutable`.

**Impact:** Every return visit revalidates each asset (one
If-None-Match request per file). Costs ~1 round-trip per load —
~80–200 ms on mobile.

**Fix:** Add to `vercel.json`:

```json
"headers": [
  {
    "source": "/assets/(.*)",
    "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
  }
]
```

### R3 — No route code-splitting  ·  S  ·  HIGH

**What:** [src/App.tsx:6-21](modelarena/src/App.tsx) imports all 12
page components synchronously. Lighthouse reports **151 kB of unused
JS** on `/login` — the operator dashboard, voting interface,
`framer-motion` (124 kB combined), `CampaignPreview`, etc. ship to
every visitor.

**Impact:** Largest LCP lever. On Slow 4G mobile, the 233 kB gzip
chunk dominates the 2.3 s download window between paint and
interactive.

**Fix:**

```tsx
// src/App.tsx
import { lazy, Suspense } from 'react';

const OperatorHome      = lazy(() => import('./pages/OperatorHome'));
const OperatorDashboard = lazy(() => import('./pages/OperatorDashboard'));
const VotingInterface   = lazy(() => import('./pages/VotingInterface'));
// …all 12 pages

<Suspense fallback={<RouteFallback />}>
  <Routes>…</Routes>
</Suspense>
```

`<RouteFallback />` should match the page shell visually so there's
no layout shift while a route chunk loads. ThemeProvider, Toaster,
and the QueryClient stay at the root (already correct).

**Expected:** initial chunk drops to roughly 80 kB gzip (shell +
react + react-router + tanstack + lucide subset + login page).
`framer-motion` follows the voting flow into its own chunks.
LCP on Slow 4G mobile expected at 1.0–1.4 s.

### R4 — `vite.config.ts` has no `manualChunks`  ·  S  ·  MEDIUM (compounds with R3)

**What:** [vite.config.ts](modelarena/vite.config.ts) uses default
chunking. Even after R3, vendor and app code share chunks per route
— a one-line app code change invalidates a 95 kB vendor block in
every user's browser cache.

**Fix:** add `build.rollupOptions.output.manualChunks`:

```ts
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'react': ['react', 'react-dom', 'react-router-dom'],
        'base-ui': ['@base-ui/react'],
        'tanstack': ['@tanstack/react-query'],
        // motion stays inline with the routes that import it (R3)
      },
    },
  },
},
```

**Expected:** deploy-cache reuse across 80 % of bytes. Marginal first-visit
benefit; large benefit on rolling deploys.

### R5 — Bare `index.html` (no resource hints)  ·  S  ·  MEDIUM

**What:** [modelarena/index.html](modelarena/index.html) ships with
no `<link rel="preload">`, no `<link rel="modulepreload">`, no
`preconnect` or `dns-prefetch`. After Vite builds, the browser
discovers the JS chunk only after parsing HTML and CSS.

**Fix:** Vite injects `<script type="module" src="…">` at build time
but does not add modulepreload for the entry. Add:

```html
<link rel="preload" as="font" type="font/woff2" crossorigin
      href="/assets/inter-latin-wght-normal-Dx4kXJAl.woff2" />
```

Note the hashed font filename has to be templated — easiest done by
adding a small Vite plugin or using `vite-plugin-preload`. **Skip
this until R3+R4 are measured.** Resource hints only buy ~100–200 ms
of head-of-queue savings; they matter most after R3 has already
moved bytes off the critical path.

### R6 — Latin-ext font subset triggered by `ï` in brand  ·  S  ·  LOW

**What:** the `ï` (U+00EF) in `<title>ModelArena</title>` and meta
tags forces the browser to download `inter-latin-ext-wght-normal`
(~85 kB raw / ~50 kB on-wire). Latin alone is 48 kB.

**Options, in order of preference:**
1. Override the @fontsource `@font-face` `unicode-range` to exclude
   latin-ext (browser falls back to system font for `ï` in chrome —
   actually invisible to the user since the title bar is browser-styled).
2. Or: replace `ï` with `i` in the document title and meta description
   (the punycode `xn--dea-yma.com` is what users see in the URL bar
   anyway).
3. Or: switch from `@import "@fontsource-variable/inter"` to a
   subset entry — but the package's `wght.css` already only ships
   the wght axis; the subsetting that matters is unicode-range, not
   axis.

Option 1 or 2 is **S** effort. Saves ~50 kB on first paint.

### R7 — Cold function TTFB 1–2 s per endpoint  ·  M  ·  HIGH (backend)

**What:** measured 1.03–1.93 s cold TTFB on operator endpoints (all
returning 401). Each `/api/*.ts` file is a separate Vercel Function;
cold-start is per-function.

**Two fixes, in order:**
1. **`Cache-Control: public, s-maxage=30, stale-while-revalidate=60`**
   on safe GET responses (`/api/campaigns`, `/api/dashboard`,
   `/api/models`, `/api/activity`). Vercel CDN absorbs repeat reads
   so the function isn't even invoked. **S** effort, **massive**
   for repeat operator visits.
2. **Consolidate adjacent endpoints** into a single function where it
   makes sense. E.g. `/api/dashboard` and `/api/activity` are both
   read-only operator summaries — they could share a function. Fewer
   functions = fewer cold starts. **M** effort, careful refactor.

**Backend authorization required.** Flagged for Sprint 2. **Cannot
inline-fix during this round per the brief's guardrails.**

### R8 — Backend N+M query patterns at scale  ·  L  ·  CONDITIONAL (backend)

**What:** `loadAnalyticsSnapshot` loads 7 unfiltered tables;
`buildCampaignDetail` does 7 round-trips with an unbounded vote
scan. Both are fine at the current scale (curl warm TTFB 280 ms is
acceptable) but will not hold under growth.

**Fix space (do not implement now — needs an architectural decision):**
1. Cache snapshot in Vercel Functions memory with a 60 s TTL.
2. Move win-stats to a denormalized table updated on each vote.
3. Replace `loadAnalyticsSnapshot` aggregation with SQL `GROUP BY`
   queries that return only the aggregated rows.

Each of these is a separate conversation. Flag in Sprint 3 only if
TTFB measurements after Sprint 2 still show user-felt slowness.

### R9 — Missing indexes on hot sort/filter columns  ·  S  ·  LOW (backend)

**What:** [drizzle/0000_initial.sql](modelarena/drizzle/0000_initial.sql)
covers most query paths. Gaps:
- `campaigns(created_at desc)` — list endpoint sorts by it.
- `participants(campaign_id, finished_at)` — used in finishedParticipants count.

**Fix:** add a new `drizzle` migration. Modest impact (probably
<50 ms each at current scale). Cheap to do whenever Sprint 2 backend
work is happening.

`ratings(campaign_id)` was previously suspected but the existing
unique index `(campaign_id, campaign_model_id, category)` already
covers `(campaign_id, …)` lookups via leftmost prefix — no fix
needed there.

### R10 — TanStack Query setup (no fix needed — verified)

[src/main.tsx:7-25](modelarena/src/main.tsx) sets `staleTime:
30_000`, `refetchOnWindowFocus: false`, and a sensible retry policy.
`VotingInterface` deliberately overrides with `staleTime: 0,
gcTime: 0` — correct for the hot path. **Don't touch.** The "every
nav refetches" pathology does not apply here.

### R11 — Service worker / offline cache (NOT recommended now)

Not a Sprint 1/2 candidate. Adds operational complexity for a
return-visit win that R2 (immutable headers) covers most of.

---

## 4. Recommended execution order

### Sprint 1 — Frontend + `vercel.json`  (~half day)

In this exact order so each step is verifiable before the next:

1. **R1** — add SPA rewrites + R2 immutable headers in `vercel.json`.
   Deploy. Verify with `curl -o /dev/null -w '%{http_code}'` on
   `/dashboard`, `/vote/foo`, `/abcdef` → all should return 200, and
   `/api/healthz` (or any function) still routes to functions.
2. **R3** — route code-splitting via `React.lazy`. Verify: `npm run
   build` shows multiple chunks; main chunk drops below 100 kB gzip;
   Lighthouse "unused JavaScript" drops below 30 kB.
3. **R4** — `manualChunks` for `react`, `@base-ui`, `@tanstack`.
   Verify chunk file count.
4. **R6** — fix the `ï` latin-ext trigger (drop `ï` from title or
   override `unicode-range`).
5. **R5** — preload critical font + entry chunk in `index.html`.

**STOP. Re-measure on the deployed URL:** Lighthouse mobile/Slow 4G
on `/`, `/dashboard`, `/vote/<a-real-slug>`. Curl repeat-visit cache
behavior. Report deltas.

### Sprint 2 — Backend caching + indexes  (~1 day, requires backend authorization)

Conditional on Sprint 1 not closing the gap to user satisfaction.

1. **R7.1** — `Cache-Control` headers on safe GET endpoints. Test
   with curl that the second hit returns `x-vercel-cache: HIT`.
2. **R9** — index migration. Drizzle migration + `db:push`.

**STOP. Re-measure operator pages** (with a real session cookie, so
the dashboard/campaign-detail TTFB can be measured properly).

### Sprint 3 — Architectural backend  (only if needed)

1. **R7.2** — function consolidation.
2. **R8** — denormalized win stats / cached snapshot / SQL aggregation.

These are real conversations, not casual fixes. Don't enter Sprint 3
without an explicit ask.

---

## 5. Risks and non-goals

- **Lighthouse coverage gap.** Until R1 ships, deployed
  `/dashboard`, `/vote/:slug`, etc. cannot be Lighthouse-tested
  externally because they 404. Sprint 1's first deploy fixes this and
  enables proper measurement. Until then, all Lighthouse numbers are
  for the `/login` shell only.
- **R3 risks layout shift.** The `<Suspense>` fallback must
  visually match the route shell or users will see a flash of
  fallback. Use a skeleton matching the AppShell / TopBar layout, not
  a generic spinner.
- **R6 risks brand inconsistency.** Replacing `ï` with `i` in
  `<title>` is a pragmatic but visible call. Subletting via
  `unicode-range` override keeps the brand intact and is the
  preferred path.
- **R7 risks staleness.** `s-maxage=30` means an operator who closes
  a campaign sees the change in the dashboard up to 30 s late.
  Likely acceptable, but worth confirming. `stale-while-revalidate`
  hides the latency on the user-visible side.
- **R8 is a refactor disguised as perf.** Don't do it without a
  growth signal. At current row counts, `loadAnalyticsSnapshot` is
  fast.
- **What's NOT in scope:** edge runtime migration, service workers,
  TanStack Query reconfiguration, Drizzle driver swap, replacing
  `tailwind-merge`, replacing `date-fns/formatDistanceToNow` with
  `Intl.RelativeTimeFormat`. The last two are real but small wins
  (~14 kB and ~14 kB gzip respectively); deferred to a polish pass.

---

## 6. Spin-off items noticed during investigation

Per the brief's "flag, don't inline-fix" rule. None of these are
Sprint 1/2 work; each deserves its own session.

- **SPA 404 (R1)** is technically a routing bug, not perf. It's
  bundled into Sprint 1 because nothing else can be measured without
  it.
- **`/api/vote/<fake-slug>` cold = 3.1 s** — the 401 endpoints
  averaged 1.5 s cold. Why is the 404 path slower? Worth a
  ten-minute check; could be a query that runs before the
  not-found branch.
- **`tailwind-merge` is 16 kB gzip / 97 kB raw** for `cn()`. There
  are smaller alternatives (`clsx` alone, ~1 kB) if `cn()` isn't
  doing actual class-conflict resolution everywhere.
- **`date-fns` for one helper is 14 kB gzip.** `Intl.RelativeTimeFormat`
  is built into the platform. Could replace.
- **`zustand` is in `package.json` but not imported anywhere** in
  `src/`. Dead dep.
- **Existing dist/ on disk is from Apr 17 (Geist-era).** Stale build
  artifact; doesn't affect anything but confusing for future audits.

---

## 7. Critical files referenced

Frontend:
- [modelarena/src/App.tsx](modelarena/src/App.tsx) — R3
- [modelarena/src/main.tsx](modelarena/src/main.tsx) — R10 (verified)
- [modelarena/src/index.css](modelarena/src/index.css) — R6
- [modelarena/index.html](modelarena/index.html) — R5
- [modelarena/vite.config.ts](modelarena/vite.config.ts) — R4
- [modelarena/vercel.json](modelarena/vercel.json) — R1, R2, R7

Backend (do not modify in Sprint 1):
- [modelarena/src/server/campaigns/detail.ts](modelarena/src/server/campaigns/detail.ts) — R8
- [modelarena/src/server/models/library.ts](modelarena/src/server/models/library.ts) — R8 (`loadAnalyticsSnapshot`)
- [modelarena/src/server/dashboard/summary.ts](modelarena/src/server/dashboard/summary.ts) — R8
- [modelarena/src/server/db/client.ts](modelarena/src/server/db/client.ts) — verified, fine
- [modelarena/drizzle/0000_initial.sql](modelarena/drizzle/0000_initial.sql) — R9

---

## 8. Open question

**Recommendation: start with Sprint 1.** R1 is correctness-critical
and the rest of Sprint 1 is the highest-ROI perf work. Estimated
~half a day end-to-end including a re-measurement pass.

Approve Sprint 1?

_End of plan. Awaiting go-ahead before any changes to `modelarena/`._
