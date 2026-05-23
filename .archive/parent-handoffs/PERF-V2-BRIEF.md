# Performance Sprint V2 — Brief for a fresh session

> **How to use this file:** paste the body of this document into a new
> Claude Code session at the project root, OR open the new session and
> say "read `PERF-V2-BRIEF.md` and begin." Both work. The prompt is
> self-contained — the new session has none of the prior conversation's
> context.

---

## Your job

You are inheriting performance work on **ModelArena**, a React 19 + Vite
+ Vercel Functions (Node) + Neon serverless Postgres app, deployed to
`https://www.ïdea.com` (punycode `www.xn--dea-yma.com`). The owner has
been told the app is "a little faster" after two prior sprints and is
unsatisfied. They want it **drastically faster, end to end**.

Not "another 10 %." A different feel.

Concrete stretch targets (directional — beat them if you can):

| Metric (mobile, Slow 4G unless noted) | Now | Target |
|---|---:|---:|
| Operator page warm TTFB (`/api/dashboard` etc.) | 280–330 ms | **< 100 ms** |
| Operator endpoint cold TTFB | 1.6–1.8 s | **< 300 ms** |
| LCP on `/` | 2.2 s | **< 1 s** |
| Initial JS gzip transferred | 177 kB | **< 80 kB** |
| `/api/vote/<real-slug>` first-visit TTFB | 540–870 ms cold | **< 200 ms** |

If hitting these requires architectural changes the owner hasn't seen
considered, propose them. The owner is a senior engineer; they want
honest cost/benefit analysis, not flattery.

---

## What's already been done (read these before proposing)

Three brief documents at the repo root:

- [`PERF-INVESTIGATION.md`](PERF-INVESTIGATION.md) — original task
  framing, what the owner asked for in plain words.
- [`PERF-PLAN.md`](PERF-PLAN.md) — full investigation with measured
  baseline + ranked findings (R1–R11). Sprints 1 + 2 came from this.
- [`MIGRATION-PLAN.md`](MIGRATION-PLAN.md) — design system migration
  (not perf, but explains the architecture, brand decisions, and what
  is sacred vs. negotiable).

Recent commits on `main` (all pushed, all live on prod):

| Commit | What |
|---|---|
| `a78630e` | Sprint 1: SPA rewrites, immutable hashed-asset cache, route `React.lazy`, vendor chunk split |
| `67f0861` | Sprint 2: CDN cache for `/api/vote/:slug`, two missing DB indexes |
| `730b0c2` | Cleanup: removed dead `zustand` dep, replaced `date-fns/formatDistanceToNow` with `Intl.RelativeTimeFormat` |
| `98a901e` | In-memory cache (30 s TTL) on `loadAnalyticsSnapshot` with explicit invalidation on key mutations |
| `7686e31` | Replaced `SELECT * FROM votes/generations/participants` with SQL `GROUP BY` aggregates; participants narrowed to recent finished only |

**Measured deltas after all of the above (mobile / Slow 4G):**

```
Lighthouse on /          score 87 → 97  · LCP 2.8 s → 2.2 s · SI 5.7 s → 3.0 s
JS transferred           233 kB → 177 kB
Unused JS                151 kB → 73 kB
Operator endpoints warm  ~900 ms → ~280 ms (3-5×)
Operator endpoints cold  ~1.5 s → ~1.6 s (basically unchanged)
/api/activity payload    26 kB → 14 kB
/api/vote/:slug warm     540-870 ms → ~150 ms (CDN HIT for cookie-bearing requests)
SPA routes (was bug)     /dashboard, /vote/:slug, /login were all 404 → all 200 now
```

---

## What's been ruled out (don't re-explore)

The prior sessions investigated and rejected these. Don't waste turns
re-litigating unless you have new information.

- **TanStack Query staleTime tuning.** Already 30 s with sensible
  retry. The "every nav refetches" pathology does not apply.
- **Drizzle driver swap to WebSocket pool.** Neon HTTP is the right
  choice for Vercel Functions — no per-request connection cost, Neon
  pools upstream.
- **CDN-caching operator endpoints with `public, s-maxage=…`.**
  Vercel's CDN doesn't vary on cookie by default. Caching auth-gated
  responses publicly would let unauthed visitors hit cached operator
  data. Unsafe even with one operator (security model assumes future
  team members).
- **R6 `latin-ext` font fix.** The `ï` in the brand is in the `latin`
  unicode-range (U+0000-00FF), not latin-ext. The previous plan got
  this wrong. Lighthouse confirms only `inter-latin` + `jbm-latin` are
  fetched on `/login`.
- **Service worker.** Discussed and deferred — operational complexity
  for a return-visit win that immutable headers already deliver most
  of. You may revisit if you find a clear case.

---

## What's authorized to consider (not exhaustive)

You may research and propose anything. Some directions the prior
session flagged but didn't implement:

- **Edge runtime for read-only operator endpoints.** Cold start ~50 ms
  vs ~300 ms Node. Drizzle + Neon HTTP work on Edge. Could move cold
  TTFB from 1.6 s → ~400 ms.
- **Function consolidation.** `/api/dashboard`, `/api/activity`, and
  `/api/models` all call `loadAnalyticsSnapshot`. Merging them into a
  single function reduces total cold-starts when navigating between
  operator pages.
- **External KV / Redis cache layer** (Vercel KV, Upstash) for the
  snapshot. Cross-instance invalidation. Eliminates cold rebuilds
  entirely. Adds infra + cost + complexity.
- **Bundle: `@base-ui/react` is 52 kB gzip / 151 kB raw** in a single
  vendor chunk. Audit which primitives we actually use; some pages
  may not need the heavy `Select` / `FloatingFocusManager` machinery.
  Radix UI (which @base-ui sits on top of) is comparable.
- **`tailwind-merge` is 16 kB gzip / 97 kB raw** for `cn()`. Smaller
  alternatives exist (`clsx` alone is ~1 kB if real class-conflict
  resolution isn't needed app-wide).
- **React Compiler.** Auto-memoization via the compiler plugin.
  Could remove a class of perf bugs and reduce re-renders.
- **View Transitions API** for navigation animations.
- **Speculation Rules API** to prefetch likely-next routes.
- **Response streaming / SSE** on heavy endpoints so the user sees
  progressive content rather than a 280 ms blank.
- **`use client` boundaries** if you migrate to RSC — though this
  would mean Next.js, a real architectural call.
- **`@neondatabase/serverless` connection caching tricks** — Neon has
  some headers that affect pool reuse.
- **Connection pre-warming** via a cron / scheduled function to keep
  Vercel Function instances hot.

That's the seed list. Don't stop there. **The question is: "What does
the absolute state of the art look like for this stack in early 2026,
and what would it take to get there?"**

---

## Constraints

- **Vercel Hobby plan.** No "Protection Bypass for Automation"
  feature, so preview URLs aren't Lighthouse-able from CI without
  promoting to prod. Cron jobs are limited (max 2, and on a daily
  cadence). Edge function CPU and bundle limits apply (~1 ms CPU
  on Hobby; check current limits). If a proposal needs Pro, **say
  so explicitly with the cost-benefit** — the owner can decide.
- **Single operator today, but security model assumes there could be
  more.** Don't introduce data-leak risks for "we have one user."
- **Brand is sacred.** Light theme default, dark ink primary CTA, red
  for errors only. Don't break MIGRATION-PLAN.md decisions.
- **DB is small now** (~6 campaigns, ~107 participants, ~834 votes).
  Solutions should still hold at 100× scale.
- **Domain has the `ï` character.** Don't propose changes that break
  this without flagging the brand cost.
- **Backend changes (`api/`, `src/server/`, `drizzle/`) require
  per-task user approval.** The prior session got "Sprint 2"
  authorization for two specific tasks, not a blanket. The owner
  trusts you to read code and propose; they reserve the right to
  approve each backend change explicitly.
- **No commits or pushes without asking.** Same for promote-to-prod
  and DB migrations.

---

## Recommended process (you choose, but here's a strong default)

1. **Read** `PERF-INVESTIGATION.md`, `PERF-PLAN.md`, and
   `MIGRATION-PLAN.md` first. Then skim the recent commits with
   `git log -p -5` to see what shape the code is in.

2. **Re-measure the current baseline yourself.** Don't trust the
   numbers above — they were taken at a moment in time and prod
   conditions may have shifted. Use:
   - `curl -w` for TTFB on `/`, `/api/dashboard`, `/api/models`,
     `/api/activity`, `/api/campaigns`, `/api/vote/<real-slug>`.
   - `npx lighthouse https://www.xn--dea-yma.com/ --form-factor=mobile
     --throttling.rttMs=150 --throttling.throughputKbps=1638.4
     --throttling.cpuSlowdownMultiplier=4` for `/` (the only
     unauthenticated page).
   - `vercel inspect <latest-prod>` for build/cache state.
   - To measure authed endpoints, login via
     `POST /api/auth/login` with `OPERATOR_PASSWORD` from
     `.env.local`, then curl with the returned cookie.

3. **Use parallel deep research.** This is exactly what the
   `ultrathink` skill is for — Coordinator + Architect + Research +
   Coder + Tester specialists. Trigger with
   `/ultrathink "make ModelArena drastically faster"` (use the same
   stretch targets as above; pass this brief as context).

   Other agents/skills worth considering:
   - **`vercel:performance-optimizer`** subagent — Vercel-native
     perf expertise, knows the platform's caching, Edge runtime, and
     Web Vitals tuning specifically.
   - **`vercel:vercel-functions`** skill — Edge runtime, streaming,
     Cron details.
   - **`vercel:vercel-storage`** skill — Vercel KV / Edge Config /
     Upstash for an external cache layer.
   - **`vercel:routing-middleware`** skill — request interception
     before cache.
   - **`engineering:system-design`** or **`engineering:architecture`**
     skill — for ADR-level decisions if architectural changes land
     on the recommendation list.
   - **`force-multiplier`** skill — strategic leverage analysis if
     you find yourself stuck choosing between many medium wins. Helps
     surface the "what would 5× what we already have?" question.
   - **`context7-docs-fetcher`** agent (or `Context7` MCP directly)
     — get *current* docs for any library/framework you want to
     evaluate. Don't assume training data is correct on platform
     features.
   - **`Explore`** agent — codebase questions in parallel.
   - **`Plan`** agent — design phase.
   - **`WebSearch`** — real-world benchmarks, blog posts, Vercel
     team writeups.

4. **Synthesize into a ranked plan.** The owner doesn't want a
   laundry list — they want prioritization. Effort sizing (S / M / L
   / XL), expected impact in concrete numbers, risk, and a clear
   stop-and-check-in cadence.

5. **Stop and check in** before implementing anything. The owner has
   been burned by a deploy that broke prod (cwd drift caused an
   empty-output build last sprint — now fixed, but they want to know
   about big changes before they ship).

---

## Deliverable

A new file at `/Users/christiankatzmann/Dev/ïdea.com/PERF-PLAN-V2.md`,
parallel to the existing `PERF-PLAN.md`. Structure:

1. **Executive summary** — three sentences. The single biggest win
   you found, the rough expected impact, and your recommendation for
   what to ship first.
2. **Re-measured baseline** — your numbers, not mine. Tables.
3. **Findings ranked by impact / effort.** Each entry: what's the
   win, what does it cost, what's the risk, what does measurement
   look like afterwards.
4. **Sprint plan** with explicit stop-and-check-in points. Order
   matters — the early items should be the ones with the highest
   ratio of "user-felt change" to "implementation risk."
5. **Honest non-goals** — things you considered and ruled out, with
   the reasoning. Future sessions need to know what was off the
   table and why.
6. **Closing question** — one specific approval ask, e.g. "Approve
   Sprint V2-1 (Edge runtime migration for read-only operator GETs)?"

---

## Hard "do not"s

- Do not commit or push without explicit user approval.
- Do not touch `api/`, `src/server/`, `drizzle/`, or run a DB
  migration without explicit per-task user approval.
- Do not promote a deploy to prod without explicit user approval.
- Do not assume the prior measurements are still accurate — re-measure.
- Do not skip the ultrathink / parallel-research phase. The owner
  specifically wants the deepest possible exploration before a plan.

---

## Useful starting facts (so you don't have to re-derive)

Working dir: `/Users/christiankatzmann/Dev/ïdea.com/modelarena`
Prod URL: `https://www.xn--dea-yma.com` (alias of `modelarena` Vercel
project under team `aistotles-projects`)
Vercel project ID: `prj_nEN6ftUWALqpwmktZvggPKcwvvfA`
Vercel team ID: `team_Kk9kyyceZuWr3NOnXWZDLgDy`
Operator login: `POST /api/auth/login` with body
`{ "password": "<from .env.local OPERATOR_PASSWORD>" }`
Real slugs (for measuring `/api/vote/:slug` properly):
```
twEt5fXsPTfiDEz0  (Wizard smoke test, active)
KTso6BhXoXKPGiYq  (Phase 3 demo, active)
P42Skm4IQyIVEq7q  (Danish citizen-letter drafting, active — biggest)
```

Dev preview launches via `npm --prefix modelarena run dev` on port 3000
(see `.claude/launch.json`). Use `preview_*` MCP tools for the dev
server, not Bash.

---

_End of brief. Begin with the read pass, then the re-measurement, then
the parallel research. Don't propose a plan until you have all three._
