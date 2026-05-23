# ModelArena / ïdea.com — Performance Investigation Handoff

## Brief

The user is the owner of ModelArena, a React 19 + Vite + Vercel Functions
+ Neon serverless Postgres app just deployed to **https://www.ïdea.com**
(punycode `www.xn--dea-yma.com`). Frontend migration from shadcn-default
to GitSlip design system is complete — see `MIGRATION-PLAN.md` for
background.

User report after first prod visit:

> "Loading the individual pages is pretty slow."

The vague phrasing matters. "Pages" is operator-facing routes
(Campaigns list, Dashboard, Campaign detail, Models, etc.) and the
participant voting flow. Without measurement we don't know whether
they mean first-paint, navigation, data fetches, or something else.

## Your task

**Investigate and plan. Do not implement yet.** Produce a plan document
(`PERF-PLAN.md` parallel to `MIGRATION-PLAN.md`) with:

1. **Baseline numbers** for the live site and local dev:
   - Lighthouse performance scores for 3–4 representative pages
   - Core Web Vitals (LCP, INP, CLS) on slow-3G emulation
   - Time-to-first-byte for Vercel Functions (cold + warm)
   - JS/CSS bundle sizes (main + largest chunks)
   - Font payload size
2. **Ranked findings** — each with: what's slow, by how much, why, and
   the fix cost (S/M/L). Don't just list issues; prioritize.
3. **A recommended execution order** with clear stop points where the
   user decides to continue.

Measure before proposing. "I think code-splitting would help" is
worthless without "LCP is 3.8s, 60% is the main chunk."

## What I already know (starting map — verify, don't trust blindly)

Ship artifacts that suggest likely culprits:

- **Main chunk is 757.98 kB (232.68 kB gzipped)** — `npm run build`
  flagged "Some chunks are larger than 500 kB after minification."
  No code-splitting anywhere; grep the repo for `React.lazy` and you'll
  find nothing.
- **Fonts loaded synchronously via CSS import**:
  ```css
  /* modelarena/src/index.css:4-5 */
  @import "@fontsource-variable/inter";
  @import "@fontsource-variable/jetbrains-mono";
  ```
  These probably block render. Check whether they're using
  `display: swap` and whether latin-only subsets are shipped.
- **Router prefetch**: React Router v7 `<Link>` supports `prefetch`
  but nothing in the codebase passes it. Every navigation waits for
  the route bundle cold (moot if not code-split, but relevant after).
- **Backend**: Vercel Functions run from `api/*` with a thin adapter
  (`src/server/vercel-adapter.ts`). `@neondatabase/serverless` driver.
  Each request builds a fresh Drizzle client via `src/server/db/client.ts`
  — check whether that's connection-pooling or creating a new client
  per request. Neon serverless cold starts are non-trivial.
- **`buildCampaignDetail`** in `src/server/campaigns/detail.ts` fires
  4 parallel queries + a 5th sequential `computeWinStats` which
  itself fires 2 more queries. That's the slowest-looking operator
  endpoint on paper.
- **TanStack Query defaults** — check whether `staleTime` is set
  anywhere. Default `staleTime: 0` means every navigation refetches,
  which feels slow even when data hasn't changed.
- **No service worker, no resource hints** (`<link rel="preload">`,
  `<link rel="modulepreload">`, DNS prefetch).
- **`Toaster`, `ThemeProvider`, `CommandPalette`**, and the full
  router are all imported at the root — nothing is lazy.

Things that are **probably fine** and shouldn't be your first stop:

- CSS is 102 kB (18 kB gzipped) — that's not the bottleneck.
- Images: the app barely uses any; brand mark is CSS + unicode "/".
- No heavy client-side animation libs beyond framer-motion (which
  is probably earning its size on the voting UI).

## How to measure

Do these first, before forming opinions:

- **Lighthouse, deployed**: `npx unlighthouse-cli --site https://www.xn--dea-yma.com`
  or just Chrome DevTools → Lighthouse → Analyze for the Home page,
  a campaign detail page, and `/vote/:slug` landing. Record the
  scores.
- **Lighthouse, local dev** is useless — Vite adds dev overhead that
  doesn't exist in prod. Use the deploy URL or `npm run build && npm run preview`.
- **Network waterfall**: load the Home, watch the critical request
  chain. Which requests block paint?
- **Bundle analysis**: install `rollup-plugin-visualizer` temporarily
  and run `npm run build`. What's actually in the 758 kB chunk?
- **Cold start**: hit a Vercel Function after 15+ minutes idle,
  measure TTFB. Repeat warm. `vercel logs <url> --follow` shows
  function init times.
- **Database latency**: the operator uses `/api/campaigns`,
  `/api/campaigns/:id`, `/api/models`. Time each one cold and warm.
- **Mobile**: check a mid-tier phone on Fast-3G throttle via DevTools.
  Many voters will be on phones in poor networks.

Report baseline numbers in the plan doc. Make graphs if it helps;
otherwise just a table.

## Working directories

- `/Users/christiankatzmann/Dev/ïdea.com/modelarena` — the app
- `/Users/christiankatzmann/Dev/Projects/gitslip` — design reference,
  not relevant to perf
- `/Users/christiankatzmann/Dev/ïdea.com/MIGRATION-PLAN.md` — recent
  design migration; touch only if perf work conflicts with a design
  decision (rare)

Key files to read first:

- `modelarena/vite.config.ts` — build config, possibly chunking hints
- `modelarena/src/App.tsx` — route tree, entry point
- `modelarena/src/index.css` — fonts, tokens
- `modelarena/src/lib/api.ts` — `apiFetch` pattern, TanStack Query setup
- `modelarena/src/server/db/client.ts` — DB client lifecycle
- `modelarena/src/server/campaigns/detail.ts` — the heaviest operator query
- `modelarena/package.json` — dependencies + scripts

Preview dev server launch config: `.claude/launch.json` at the
ïdea.com root runs `npm --prefix modelarena run dev` on port 3000.
Use `preview_*` tools, not Bash, for the dev server.

## Guardrails

- **Investigate only — no implementation.** Exception: installing a
  dev-only bundle analyzer (`rollup-plugin-visualizer`) to measure.
  Remove it before committing.
- **Do not touch `/api/`, `src/server/`, or `drizzle/` during
  investigation.** If the best fix is backend (e.g. connection
  pooling, query batching), flag it in the plan with expected impact.
  The user authorizes backend work one task at a time.
- **Do not commit or push without asking.** This is a measure-and-plan
  session.
- The app defaults to **light theme** (Q3). Primary CTA is **dark ink
  pill** (Q5). Don't regress these while investigating. Red is for
  inline validation/errors only (Q4).

## Stuff already flagged worth spinning off (not your job)

Existing known issues from the migration work — noted so you don't
waste time re-discovering them or confuse them with perf:

- Dead code: `src/server/routes/vote/index.ts` duplicates
  `api/vote/[slug]/index.ts`.
- Hydration warning: `OperatorHome` renders a nested `<a>` inside a
  `<Link>` (opens-in-new-tab row detail). Separate fix.
- Voting page: A/B primary buttons stay disabled for ~200ms between
  battles due to AnimatePresence exit timing. Cosmetic, not a perf bug.
- `PersonalResults` table overflows at 375px. Layout, not perf.
- Prompts tab placeholder waiting on a decision to extend
  `buildCampaignDetail` (option A) or add a new endpoint (option B).

If you spot something worth spinning off during investigation, flag
it — don't inline-fix.

## Deliverable

A plan document at `PERF-INVESTIGATION.md` (this file) or
`PERF-PLAN.md` next to `MIGRATION-PLAN.md`, structured roughly like:

1. **Executive summary** — worst number, biggest win available, total
   estimated improvement.
2. **Baseline measurements** — table of Lighthouse scores, CWV, TTFB,
   bundle sizes, across 3–4 pages and both cold + warm.
3. **Findings, ranked** — each with measured impact, proposed fix,
   estimated effort, expected improvement.
4. **Execution order** — what to do first, where to stop and check in.
5. **Risks and non-goals** — things that look like wins but aren't,
   or things that require architectural changes the user should
   decide on separately.

Keep it measurement-heavy, opinion-light until you have numbers.

End with a specific question for the user, e.g. "I recommend starting
with route-based code-splitting (expected −40% LCP). Approve?"

---

**When you're done investigating, hand the plan back — don't start
implementing until the user says go.**
