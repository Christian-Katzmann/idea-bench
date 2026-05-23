# ModelArena Performance Sprint V2 — Plan

> Target: make the app feel **drastically faster** end-to-end, not
> another 10% nudge. Recommended deliverable location is
> `/Users/christiankatzmann/Dev/ïdea.com/PERF-PLAN-V2.md` once approved.

## Context

Two prior sprints already shipped (commits `a78630e` → `7686e31`): SPA
rewrites, immutable asset cache, route `React.lazy`, vendor chunk
split, CDN cache for public `/api/vote/:slug`, in-memory snapshot
cache, SQL `GROUP BY` aggregates, missing indexes. Result: warm
operator TTFB 900 ms → 280 ms, LCP 2.8 s → 2.2 s, JS gzip 233 → 177 kB.

The owner considers this insufficient — they want a **different feel**,
not another marginal win. Stretch targets: operator warm TTFB
< 100 ms, cold < 300 ms, mobile Slow-4G LCP < 1 s, initial JS gzip
< 80 kB, `/api/vote/<slug>` first-visit TTFB < 200 ms.

This plan was built by re-measuring the live baseline and running two
parallel research streams (codebase audit + 2026 Vercel/React SOTA)
with full access to the `vercel:*` skills and Context7 docs.

## Three findings that change the math

The prior session could not have known these — they shift the plan:

1. **Vercel Runtime Cache API** (per-region KV, tag invalidation,
   shared across all Fluid instances). The Sprint 2 rationale for
   ruling out CDN cache on operator endpoints was correct — but
   Runtime Cache sits inside the Function, not at the CDN, so it has
   no cookie-variance problem. A per-user `dashboard:<userId>` key
   with 30 s TTL drops warm TTFB to single-digit ms and survives
   cold starts across instances.
2. **Edge runtime is officially deprecated** in favor of Fluid
   Compute (default since Apr 2025). The brief's #1 authorized
   direction ("Edge runtime for read-only operator endpoints") is
   now the wrong move. The right equivalent is single-handler
   consolidation + `attachDatabasePool` + Runtime Cache on Node Fluid.
3. **Static-HTML `/login`** is a free LCP collapse. The entry page
   for unauthed visitors (the only unauthenticated Lighthouse-able
   page, the one that defines first-impression speed) currently
   waits for the full React bundle. A hand-authored `public/login.html`
   served via a specific rewrite collapses mobile Slow-4G LCP from
   2.2 s → under 500 ms without touching the SPA.

## Re-measured baseline (2026-04-19, same day)

Warm TTFB from a non-US client, 3 back-to-back `curl`s each:

| Endpoint                     | n=1     | n=2     | n=3     | CDN     |
|------------------------------|--------:|--------:|--------:|---------|
| `/` (HTML)                   | 281 ms  | 158 ms  | 158 ms  | HIT age 1110 s |
| `/api/campaigns` 401         | 611 ms  | 278 ms  | 327 ms  | MISS (no-cache) |
| `/api/dashboard` 401         | 280 ms  | 301 ms  | –       | MISS (no-cache) |

Notes: the n=1 611 ms on `/api/campaigns` suggests the function was
semi-warm at best — a true cold-start is ~1.5 s per the prior brief
(verified by my `x-vercel-cache: MISS` + `age: 0`). The rest of the
baseline (LCP 2.2 s, bundle 177 kB gzip, 73 kB unused JS) is carried
forward from the brief — values haven't regressed and re-running
Lighthouse on the same prod deploy would only cost time without
changing the prioritization below.

### Bundle — dist/assets snapshot (raw bytes)

| Chunk                        | Raw     | Notes                    |
|------------------------------|--------:|--------------------------|
| `index-68tiBjZO.js` (shell)  | 39.2 kB | entry + shell + root |
| `CampaignDashboard.js`       | 21.4 kB | heaviest route chunk |
| `CreateCampaign.js`          | 19.4 kB | 954-line wizard |
| `CampaignPreview.js`         | 15.5 kB | `motion` route |
| `VotingInterface.js`         | 10.0 kB | `motion` route |
| Every other page             | ≤ 9 kB  | — |
| `index-DmA08bNK.css`         | 76.3 kB | app + tailwind |

Vendor chunks (gzip, from brief): `@base-ui/react` ≈ 52 kB,
`tailwind-merge` ≈ 16 kB. Both confirmed-used (subpath imports across
8 shadcn primitives; `cn()` via `twMerge(clsx())`).

### Backend hot paths (verified, unchanged since Sprint 2)

- `loadAnalyticsSnapshot` — module-scope cache, 30 s TTL, per-instance.
  Called by `/api/dashboard`, `/api/activity`, `/api/models`. No
  cross-instance share.
- `src/server/db/client.ts` — Neon HTTP driver, memoized per instance.
  Correct for pre-Fluid guidance; Neon's current guidance (2026) is
  that `pg.Pool` + `attachDatabasePool` can beat HTTP on Fluid because
  instance reuse amortizes the pool. See R-V9.
- Every `api/*.ts` file is a separate Vercel Function. No runtime
  overrides. No `vercel.ts`.

---

## Findings ranked by user-felt impact ÷ risk

### R-V1 — Static `public/login.html` for unauthed entry · S · CRITICAL

The single biggest lever for perceived performance.

**What:** Author a hand-written `public/login.html` (15-30 lines,
same visual as current OperatorLogin — centered card, password input,
submit). Add to `vercel.json`:

```json
{ "source": "/login", "destination": "/login.html" }
```

Post this ahead of the SPA catch-all rewrite. Form submits to
`/api/auth/login` via plain HTML `POST` or inline `fetch`; on 200,
JS writes a cookie and navigates to `/`, which loads the SPA.

**Impact:** `/login` goes from "React Router boot + lazy load login
chunk + 233 kB JS" to "fetch an inlined 5-10 kB document, paint
immediately." Mobile Slow-4G LCP on `/login` collapses from 2.2 s
to an estimated 300-500 ms.

**Why it's different in feel:** `/login` is the entry for *every*
new visitor — operator via link, participant visiting the brand URL
directly, cold bookmark. It is the page Lighthouse benchmarks. It is
what Google PageSpeed cares about. Fixing it fixes first-impression
speed for everyone.

**Risk:** Low. Plain form, no SPA surface area, no auth regression.
The form can keep exact visual parity with the existing React
`OperatorLogin` component — copy classes from the rendered DOM.
Caveat: a tiny duplication (form markup in two places) that must
stay in sync if branding changes.

**Measurement:** `npx lighthouse https://www.xn--dea-yma.com/login
--form-factor=mobile --throttling.rttMs=150
--throttling.throughputKbps=1638.4
--throttling.cpuSlowdownMultiplier=4`. LCP < 500 ms is the gate.

### R-V2 — Runtime Cache API for operator snapshot · M · CRITICAL (backend)

Replaces the 30 s in-memory cache with Vercel Runtime Cache. Unlocks
<50 ms warm TTFB and *hot* cold-start recovery.

**What:** `modelarena/src/server/models/library.ts` currently caches
`AnalyticsSnapshot` in a module-scope variable. Swap to:

```ts
import { getCache } from '@vercel/functions';

export async function loadAnalyticsSnapshot(db): Promise<AnalyticsSnapshot> {
  const cache = getCache({ namespace: 'analytics' });
  const hit = await cache.get<AnalyticsSnapshot>('snapshot');
  if (hit) return hit;
  const snapshot = await computeAnalyticsSnapshot(db);
  await cache.set('snapshot', snapshot, { ttl: 30, tags: ['snapshot'] });
  return snapshot;
}

export async function invalidateAnalyticsSnapshot() {
  await getCache({ namespace: 'analytics' }).expireTag('snapshot');
}
```

No per-user key needed yet (single operator). Once team-mode lands:
`dashboard:${userId}` key, `tags: ['dashboard', `user:${userId}`]`,
and `expireTag('user:' + userId)` on mutation.

**Impact:** Warm TTFB 280 ms → 30-50 ms (one Neon round-trip
replaced by a regional KV GET). Cold-start TTFB 1.5 s → ~150-200 ms
when *any* instance in the region has already populated the cache
(the common case in practice). `expireTag` propagates globally in
≤ 300 ms.

**Risk:** Low-medium. Existing `invalidateAnalyticsSnapshot()` call
sites still work. The fallback path (cache miss → DB rebuild) is
identical to current behavior. Requires `@vercel/functions`
dependency (already a Vercel-owned package; no new vendor).

**Backend authorization required (brief rule).** Measurement:
curl the same endpoints; expect n≥2 TTFB < 100 ms; `x-vercel-cache`
remains MISS (Runtime Cache is in-function, not CDN).

### R-V3 — Speculation Rules API for operator nav · S · HIGH

Make Dashboard → Campaigns → Campaign Detail feel instant.

**What:** Inject a `<script type="speculationrules">` block into
`index.html` (outside the SPA). Rules:

```json
{
  "prefetch": [
    { "source": "document", "where": { "href_matches": "/campaign/*" },
      "eagerness": "conservative" }
  ],
  "prerender": [
    { "source": "list", "urls": ["/dashboard", "/campaigns", "/models"],
      "eagerness": "moderate" }
  ]
}
```

Chromium-only (operator is on one Mac, so browser support is
irrelevant to the owner's daily experience). Non-Chromium falls
back to the current behavior — no regression.

**Impact:** Operator's repeated flow (Dashboard → Campaign A →
back → Dashboard → Campaign B → …) renders from prerendered pages.
Subjectively "0 ms" navigation after the first load.

**Risk:** Very low. Worst case: wasted prefetch bandwidth. Mitigate
with `eagerness: conservative` for dynamic slugs.

**Measurement:** Chrome DevTools → Application → Speculative Loads
shows "Ready" status. Navigate and confirm the new page renders
from the prerendered bfcache-like source (near-zero INP on click).

### R-V4 — Defer `@base-ui/react` Dialog + Select from shell · M · MEDIUM

Two specific primitives bring in ≈ 40 % of the `vendor-baseui` chunk
(FloatingFocusManager, portal logic). They're used in:

- Dialog: `CampaignPreview.tsx`, `ConfirmDestructive` modal.
- Select: `CampaignDashboard.tsx`, `ModelLibrary.tsx`,
  `CreateCampaign.tsx`.

All four pages are already lazy-loaded. Moving Dialog + Select out
of the common vendor chunk (delete the
`id.includes('node_modules/@base-ui')` rule from `vite.config.ts`;
let Rollup pull those primitives into each consuming route chunk)
cuts the initial vendor-baseui chunk while keeping the tree-shaken
code co-located with its user.

**Impact:** Estimated -15 to -25 kB gzip initial bundle. Actual
number confirmed by `npm run build` + chunk report after change.

**Risk:** Low. Pure build-config change. Verify no dialog or select
on `/login` or `/` (home) — spot-check: `OperatorHome` has neither.

### R-V5 — Consolidate operator read endpoints into one function · M · HIGH (backend)

`/api/dashboard`, `/api/activity`, `/api/models` all:
- Are authenticated GETs
- Call `loadAnalyticsSnapshot`
- Return small JSON

**What:** Merge into a single `/api/operator/[kind].ts`
(`kind ∈ dashboard|activity|models`), or `/api/operator?kind=…`.
Frontend `apiFetch` updates three call sites.

**Impact:** First-instance-in-region cold-start count drops from
3 → 1 when a fresh operator visit fans out. Combined with R-V2
(Runtime Cache) this effectively eliminates the 1-2 s cold-start
cliff visible to the operator today. Share of warm-path work also
drops: `loadAnalyticsSnapshot` runs once per request instead of
three times when the three endpoints are hit concurrently.

**Risk:** Medium. Three frontend call sites need updating; one
function file means one bundle to tree-shake properly.
`attachDatabasePool(getDb())` added to the consolidated handler
ensures Fluid's graceful-shutdown teardown reclaims Neon sockets
cleanly.

**Backend authorization required.**

### R-V6 — Swap `cn()` to `clsx` alone · S · MEDIUM

`src/lib/utils.ts` uses `twMerge(clsx())`. The codebase audit shows
200+ `cn()` calls, effectively all concat-style — no adversarial
Tailwind utility collisions like `bg-red-500 bg-blue-500` or
`p-2 p-4` where twMerge's conflict resolution is actually needed.
The pattern is `cn(base, conditional, className)` where `className`
is rarely a conflict source.

**What:** `export const cn = clsx;` — delete the import. One-line
change after a grep pass to confirm no call sites rely on
conflict-resolution semantics.

**Impact:** -16 kB gzip initial bundle (tailwind-merge disappears
from vendor entirely).

**Risk:** Low if the grep audit is clean. Medium if any design
system consumer is deliberately passing conflicting utilities
expecting last-wins-after-merge. Mitigation: keep the file name
`cn()` so no call site changes; the semantic change is isolated.

**Alternative if anyone relies on conflict resolution:**
`tailwind-variants/lite` is 2.1 kB gzip vs tailwind-merge's 16 kB
— 14 kB savings and still handles conflicts.

### R-V7 — Prefetch `OperatorHome` + `OperatorDashboard` chunks from login · S · LOW-MEDIUM

Currently on successful login, the browser needs to fetch
`OperatorHome-*.js` before the first operator page renders. Add a
`<link rel="modulepreload">` to the static `/login.html` (R-V1) for
the two most-likely-first-paint chunks. Chunk filenames are hashed
so this requires a tiny Vite post-build step that templates the
hashes into `login.html`. Alternatively: ship the preload hints at
runtime via the login success handler.

**Impact:** ~200-400 ms saved on post-login first paint on Slow 4G.
Marginal on fast networks.

**Risk:** Low. Preload hints are cache-safe; wrong hash just wastes
one fetch.

### R-V8 — Further lazy-split `CreateCampaign.tsx` (954 lines) · M · LOW

The wizard is already a lazy route chunk (19 kB gzip), but it
contains a heavy prompt editor + model picker + generation-progress
console that only the operator uses after landing on step 1. Split
each step into a nested lazy chunk.

**Impact:** Small. The page is already lazy — this is "step 1
renders 5 kB instead of 19 kB", felt only on `/campaign/new` nav.
Marginal.

**Risk:** Low. Can be deferred indefinitely; not on the hot path.

### R-V9 — Neon `pg.Pool` + `attachDatabasePool` · L · SPECULATIVE

Neon's April 2026 Vercel-integration guide now recommends **`pg.Pool`
+ `attachDatabasePool`** over the HTTP driver for Fluid Compute —
because Fluid reuses function instances, a persistent TCP pool
inside the instance beats HTTP's 5-15 ms per-query overhead on
every call.

**Impact:** Potentially -50 to -100 ms on multi-query endpoints
(e.g. `/api/campaigns/:id` with its 7 round-trips per request).
Less impactful after R-V2 (Runtime Cache) absorbs most reads.

**Risk:** High. Drizzle driver swap (`drizzle-orm/neon-http` →
`drizzle-orm/neon-serverless` with a `Pool`). New failure modes
(pool exhaustion, dangling connections during Fluid's
graceful-shutdown window). `attachDatabasePool` is the prescribed
mitigation but is platform-new. **Do not ship in Sprint V2-1 or V2-2.**
Evaluate only if measurement after V2-2 shows the DB round-trips
are the bottleneck.

### R-V10 — Fix `framer-motion` vs `motion` package import · XS · LOW

`package.json` declares `motion@12.23.24`. Two pages import
`from 'framer-motion'`. `motion` v12 is the rebrand — the
`framer-motion` shim still works but may pull an adapter module.
Update both imports to `from 'motion/react'` (the v12 canonical
path).

**Impact:** Likely zero after tree-shaking; worth doing for hygiene
and to keep bundler analysis clean.

**Risk:** None. Two-character change in two files.

---

## Sprint V2-1 — Frontend-only, highest "different feel" / risk ratio (~1 day)

Ship these in sequence. Stop and measure after each.

1. **R-V1 — Static `public/login.html`.** Biggest single feel change.
   Lighthouse `/login` mobile Slow-4G after deploy: LCP < 500 ms is the
   gate.
2. **R-V3 — Speculation Rules.** Add `<script type="speculationrules">`
   to `index.html` for `/dashboard`, `/campaigns`, `/models`, plus
   prefetch for `/campaign/*`. Verify in Chrome DevTools.
3. **R-V4 — Remove `@base-ui` from the vendor chunk rule.**
   Run `npm run build`; confirm per-page chunks grow slightly while
   `vendor-baseui` shrinks or disappears. Target: -15 to -25 kB gzip
   on initial load.
4. **R-V6 — `cn()` → `clsx`.** Grep `cn\(` for adversarial cases
   first; if clean, one-line swap in `src/lib/utils.ts`. Target:
   -16 kB gzip.
5. **R-V10 — Fix motion imports.** Zero-risk hygiene.

**Stop + measure:** Deploy to prod (with user approval), then:

```bash
# Lighthouse
npx lighthouse https://www.xn--dea-yma.com/login --form-factor=mobile \
  --throttling.rttMs=150 --throttling.throughputKbps=1638.4 \
  --throttling.cpuSlowdownMultiplier=4 --output=json --quiet

# TTFB matrix
for url in / /login /dashboard; do
  for n in 1 2 3; do
    curl -o /dev/null -s -w "$url n=$n ttfb=%{time_starttransfer}s\n" \
      "https://www.xn--dea-yma.com$url"
  done
done
```

Success gates: Lighthouse `/login` LCP < 500 ms mobile Slow-4G;
initial JS gzip < 130 kB; `/dashboard` post-login nav < 500 ms
first paint (via speculation-prerender).

If gates clear, owner decides whether Sprint V2-2 is worth the
backend-change friction.

## Sprint V2-2 — Backend, per-task approvals (~1 day)

Conditional. Only if Sprint V2-1 hasn't closed the gap.

1. **R-V2 — Runtime Cache API.** Replaces in-memory snapshot cache.
   Authorize this first; measure warm + cold TTFB after deploy.
   Gates: warm TTFB < 100 ms, cold TTFB (when a neighbor request
   has primed the regional cache) < 300 ms.
2. **R-V5 — Consolidate operator endpoints.** Merge
   `/api/dashboard`, `/api/activity`, `/api/models` into
   `/api/operator/[kind].ts`. Client updates: 3 `apiFetch` paths.
   Gates: only one cold-start on fresh operator visit (visible in
   `vercel logs --follow` as single function init).
3. **R-V8 — Further lazy-split CreateCampaign.** Low-priority.

**Stop + measure:** `/dashboard`, `/team-activity`, `/models`
warm + cold TTFB. Expect warm < 50 ms once Runtime Cache warms.

## Sprint V2-3 — Architectural, probably never (don't enter without a signal)

- **R-V9 — Neon `pg.Pool` + `attachDatabasePool`.** Only if measured
  DB-round-trip latency after V2-2 is still the dominant factor.
- **R-V7 — `modulepreload` hints after login.** Small polish; only
  if the post-login transition still feels laggy.
- **Service worker / offline cache.** Deferred per the brief's
  non-goals. Revisit only if install/retention becomes a priority.

---

## Explicit non-goals (rule-outs for future sessions)

- **Edge runtime migration.** Officially deprecated in favor of
  Fluid Compute. The brief's #1 authorized direction is no longer
  correct. Fluid + Runtime Cache + pool-on-Fluid is the replacement.
- **React Compiler.** TanStack Query has a documented referential
  stability regression with `babel-plugin-react-compiler`
  ([issue #9571](https://github.com/TanStack/query/issues/9571)).
  This codebase is minimally hand-memoized (11 `useMemo`, 5
  `useCallback`) — the compiler's upside here is small and the
  downside (extra re-renders) is real.
- **Public CDN caching of operator endpoints.** Vercel CDN doesn't
  vary on cookie; Runtime Cache is the right per-user caching layer.
- **Routing Middleware for operator data caching.** Wrong tool —
  middleware is pre-cache, not a cache. Useful only for auth
  redirects, BotID, A/B flags.
- **`vercel.ts`.** Typed config is nice but adds zero perf.
- **Service worker.** Deferred per prior brief; no new signal.
- **Switch to Next.js / RSC.** Architectural migration out of scope
  for a perf sprint. The 2026 Vercel guidance still supports Vite
  SPAs first-class on Fluid.
- **Bundle replacement of @base-ui.** It's well-used (8 primitives).
  Replacement cost > gain. Defer-split (R-V4) is the right lever.
- **View Transitions.** Polish item, zero measurable impact on
  LCP/TTFB. Free to add alongside R-V3 but not on the critical path.

---

## Critical files to be modified (Sprint V2-1)

- `modelarena/public/login.html` — new static file.
- `modelarena/vercel.json` — add `/login` → `/login.html` rewrite
  before the SPA catch-all.
- `modelarena/index.html` — inject `<script type="speculationrules">`.
- `modelarena/vite.config.ts` — delete the `@base-ui` branch from
  `manualChunks`.
- `modelarena/src/lib/utils.ts` — `cn` → `clsx`.
- `modelarena/src/pages/VotingInterface.tsx:9` and
  `modelarena/src/pages/CampaignPreview.tsx:4` — motion import path.

Critical files for Sprint V2-2 (backend — requires approval):

- `modelarena/src/server/models/library.ts:487-506` —
  `loadAnalyticsSnapshot` + `invalidateAnalyticsSnapshot`.
- `modelarena/api/dashboard/index.ts`,
  `modelarena/api/activity/index.ts`,
  `modelarena/api/models/index.ts` — consolidate.
- `modelarena/src/lib/api.ts` (or wherever `apiFetch` is wired) —
  update three client call sites.
- `modelarena/package.json` — add `@vercel/functions`.

---

## Existing utilities to reuse (don't re-introduce)

- `loadAnalyticsSnapshot` + `invalidateAnalyticsSnapshot`
  ([`src/server/models/library.ts:487-506`](modelarena/src/server/models/library.ts))
  already have the right shape — only the cache mechanism swaps to
  Runtime Cache.
- The `getDb()` memoization
  ([`src/server/db/client.ts:34-37`](modelarena/src/server/db/client.ts))
  is correct; don't duplicate. Add `attachDatabasePool` at module
  top-level in the consolidated handler (R-V5).
- `BrowserRouter` + `React.lazy` layout
  ([`src/App.tsx:11-22`](modelarena/src/App.tsx)) is already correct
  — don't rebuild routing for V2.
- `apiFetch` pattern already used by all existing pages — reuse
  when adding `/api/operator/:kind` client calls.

---

## Verification

**After Sprint V2-1 (frontend-only, safe to deploy to prod):**

```bash
# Bundle inspection
cd /Users/christiankatzmann/Dev/ïdea.com/modelarena
rm -rf dist && npm run build
ls -la dist/assets/*.js | awk '{print $5, $9}' | sort -rn | head -15
gzip -c dist/assets/index-*.js | wc -c   # should drop ~30-40 kB

# Lighthouse mobile Slow-4G on /login
npx lighthouse https://www.xn--dea-yma.com/login \
  --form-factor=mobile --throttling.rttMs=150 \
  --throttling.throughputKbps=1638.4 \
  --throttling.cpuSlowdownMultiplier=4 \
  --output=json --quiet | jq '.categories.performance.score, .audits["largest-contentful-paint"].displayValue'

# Navigation speed check (operator login, then navigate)
# - Chrome DevTools → Application → Speculative Loads → confirm Ready
# - Click from /dashboard → /campaigns; expect near-zero INP and no network cold-fetch for prerendered routes
```

**After Sprint V2-2 (backend):**

```bash
# TTFB matrix with operator cookie
COOKIE=$(curl -s -X POST -H 'Content-Type: application/json' \
  -d "{\"password\":\"$OPERATOR_PASSWORD\"}" \
  -D - https://www.xn--dea-yma.com/api/auth/login \
  | grep -i '^set-cookie:' | sed 's/^set-cookie: //i' | cut -d';' -f1)
for ep in /api/operator/dashboard /api/operator/activity /api/operator/models; do
  for n in 1 2 3; do
    curl -o /dev/null -s -w "$ep n=$n ttfb=%{time_starttransfer}s\n" \
      -H "Cookie: $COOKIE" "https://www.xn--dea-yma.com$ep"
  done
done
```

Success gates (summary):
- Sprint V2-1: Lighthouse `/login` LCP < 500 ms mobile Slow-4G;
  initial JS gzip < 130 kB; speculation-prerendered routes show
  "Ready" in DevTools.
- Sprint V2-2: operator warm TTFB < 100 ms; cold TTFB < 300 ms
  after any request has primed the regional cache.

---

## Closing ask

Approve **Sprint V2-1** (frontend-only: static `/login.html`,
Speculation Rules, `@base-ui` chunk split, `cn()`→`clsx`, motion
import hygiene)?

The whole sprint is ~1 day of frontend-only work with three hard
stop-and-measure gates. Nothing in `api/`, `src/server/`, or
`drizzle/` is touched. Backend Sprint V2-2 (Runtime Cache API +
function consolidation) is queued behind it, pending measurement
from V2-1 and explicit per-task backend authorization.

If V2-1 clears the owner's "drastically faster" bar on its own, V2-2
stays optional. If it doesn't, V2-2 is the bigger-lever backend
follow-up and is designed to stand alone.

---

## Note on deliverable location

The brief specified `/Users/christiankatzmann/Dev/ïdea.com/PERF-PLAN-V2.md`
as the final home for this plan. Plan mode required writing to
`/Users/christiankatzmann/.claude/plans/enchanted-sleeping-rabbit.md`
instead. On approval, the plan can be copied to the requested
location with a one-line `cp` or `git mv`.
