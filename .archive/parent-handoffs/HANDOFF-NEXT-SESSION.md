# ModelArena / ïdea.com — Handoff for Next Session

> Written 2026-04-20 by the prior session (Sessions 1, 4, 5, 6 of the
> [original audit plan](.claude/plans/please-look-into-dea-com-melodic-octopus.md)).
> The user wants the rest of the audit shipped. This brief is
> self-contained — read it cold, then start.

---

## What you're working on

**ModelArena** (live at https://www.ïdea.com — punycode `www.xn--dea-yma.com`)
is a React 19 + Vite + Vercel Functions app for running blind head-to-head
AI model evaluations. Operators create campaigns, pick models + prompts,
generate completions, and share a voting link. Participants vote which
model output they prefer. Bradley-Terry ratings + Fisher-info CIs are
computed live.

**Code:** `/Users/christiankatzmann/Dev/ïdea.com/modelarena/`

**Stack:** Vite SPA frontend, Vercel Functions (`api/*`) backend, Neon
Postgres + Drizzle ORM, TanStack Query for data fetching, base-ui +
Tailwind 4 + a custom warm "GitSlip-native" design system. **Operator
auth is currently password-only.** Anonymous participant cookies for
vote dedup. Vercel Runtime Cache for analytics snapshot.

**Design rules to know before touching UI:**
- Light mode default, dark mode toggleable. Both first-class.
- Primary CTA = dark ink pill (`<Button variant="default">`).
- Red is reserved for inline validation/errors only — **never on
  buttons**. Destructive actions use `<ConfirmDestructive>` with
  typed-name guard.
- 10 px uppercase labels on stat tiles / form labels.
- Monospace for any number (`font-mono tabular-nums`).
- Skeletons pulse — no shimmer.
- Every operator page uses `<AppShell>` + `<PageHeader>` +
  breadcrumbs.
- New components live under `src/components/{ui,layout,modals,…}`;
  reuse `Card`, `Badge`, `Skeleton`, `Button`, `Input`, `Textarea`,
  `Select*`, `Dialog`, `StatusBadge`, `EntityIcon`, `ConfirmDestructive`,
  `EditCampaignDialog` — don't redesign.

Full design language: [docs/design-system/DESIGN-SYSTEM.md](modelarena/docs/design-system/DESIGN-SYSTEM.md).

---

## What the prior sessions already shipped (don't redo)

| Session | What | Where |
|---|---|---|
| 1 | Prompts tab on CampaignDashboard now renders real prompts (collapsible context, tags) | [CampaignDashboard.tsx:387](modelarena/src/pages/CampaignDashboard.tsx#L387) + [detail.ts](modelarena/src/server/campaigns/detail.ts) + [api/campaigns/[id]/index.ts](modelarena/api/campaigns/[id]/index.ts) |
| 1 | Email field on ParticipantLanding: type=email + inputmode + autocomplete + format check + visible error + aria-invalid; form uses `noValidate` | [ParticipantLanding.tsx](modelarena/src/pages/ParticipantLanding.tsx) |
| 1 | PersonalResults responsive: stacked layout below 640 px with explicit labels, grid above | [PersonalResults.tsx](modelarena/src/pages/PersonalResults.tsx) |
| 1 | A/B vote buttons re-enable instantly: `submit.isPending \|\| nextQ.isFetching` instead of the blocking await | [VotingInterface.tsx](modelarena/src/pages/VotingInterface.tsx) |
| 1 | aria-live regions: SSE generation progress in CreateCampaign step 4, vote-submit feedback in VotingInterface | CreateCampaign.tsx, VotingInterface.tsx |
| 1 | Deleted dead code: `src/server/routes/vote/index.ts` (active handler is `api/vote/[slug]/index.ts`) | — |
| 4 | `deletedAt` column + composite index on `campaigns` | [schema.ts:106](modelarena/src/server/db/schema.ts#L106) + [drizzle/0003_lumpy_orphan.sql](modelarena/drizzle/0003_lumpy_orphan.sql) |
| 4 | Soft-delete filter `WHERE deletedAt IS NULL` applied at every read site (list, detail, library snapshot, vote landing, all mutation routes) | grep `deletedAt` to see |
| 4 | `PATCH /api/campaigns/:id` (name/description/categories with input validation) | [api/campaigns/[id]/index.ts](modelarena/api/campaigns/[id]/index.ts) |
| 4 | `DELETE /api/campaigns/:id` (soft-delete, idempotent) | same file |
| 4 | `/api/cron/purge-deleted` daily cron + vercel.json `crons` entry | [api/cron/purge-deleted.ts](modelarena/api/cron/purge-deleted.ts), [vercel.json](modelarena/vercel.json) |
| 4 | `EditCampaignDialog` modal | [src/components/modals/edit-campaign.tsx](modelarena/src/components/modals/edit-campaign.tsx) |
| 4 | Edit + Delete action rows under CampaignDashboard Settings tab | [CampaignDashboard.tsx](modelarena/src/pages/CampaignDashboard.tsx) |
| 5 | `/login.html` parallel-fetches `/index.html`, parses script/link tags, emits `modulepreload`/`preload` for SPA chunks | [public/login.html](modelarena/public/login.html) |
| 6 | TanStack Query polling: dashboard 5 s, campaign-detail 5 s, activity 10 s; pauses when tab hidden | OperatorDashboard.tsx, CampaignDashboard.tsx, TeamActivity.tsx |
| 6 | Live Leaderboard component (CI bars, stability chips, tabs, ticker, row-flash) — **was already shipped** before this audit; the prior agent mistakenly flagged it as missing. Verify before touching. | [src/components/dashboard/leaderboard/](modelarena/src/components/dashboard/leaderboard/) |

**Tests:** 28/28 passing (`npm run test:run`). **Lint:** clean (`npm run lint`).
**Migration state:** `0000–0003` applied locally and ready for prod.

---

## What's left — prioritized

### A. GitHub OAuth login provider · ~half-day · MEDIUM-HIGH priority

Currently the operator login at `/login` (and `/login.html` static page)
shows two disabled "GitHub" + "Email link" buttons with `title="Not
available yet"`. The user wants both implemented while keeping
password as a third option.

**Decisions already made by the user:**
- Implement BOTH GitHub OAuth (this session) and email magic link
  (Session B below). Keep password.
- Allowlist-based — this is single-team operator auth, not public
  signup. Add `OPERATOR_GITHUB_LOGINS=user1,user2` env var.

**Implementation outline:**

1. **Register a GitHub OAuth app.** Either via Vercel Marketplace's
   GitHub integration or hand-register at github.com/settings/developers.
   Set callback URL to `https://www.ïdea.com/api/auth/github/callback`
   (and `http://localhost:3000/api/auth/github/callback` for dev).
   Capture `GITHUB_OAUTH_CLIENT_ID` + `GITHUB_OAUTH_CLIENT_SECRET`.
2. **Add the env vars** to `.env.example` (with empty values) and to
   Vercel project settings (production + preview).
3. **Create `api/auth/github/start.ts`:** generate a 32-char random
   `state` value, store it in an HMAC-signed `oauth_state` cookie
   (5-min expiry, HttpOnly, SameSite=Lax), then 302 to
   `https://github.com/login/oauth/authorize?client_id=…&state=…&scope=read:user user:email`.
4. **Create `api/auth/github/callback.ts`:** validate `state` cookie
   matches query param, POST to `https://github.com/login/oauth/access_token`
   to exchange code, GET `https://api.github.com/user/emails` with the
   token, find the primary verified email. If it (or the GitHub login
   name) is in `OPERATOR_GITHUB_LOGINS` (comma-split), mint an
   operator session cookie via the existing helpers in
   [src/server/auth/cookies.ts](modelarena/src/server/auth/cookies.ts)
   and 302 to `/`. Otherwise return 403 with a clean error page.
5. **Wire the GitHub button** in [OperatorLogin.tsx:125-135](modelarena/src/pages/OperatorLogin.tsx#L125-L135) — change `disabled` + `title` to `onClick={() => window.location.href = '/api/auth/github/start'}`.
6. **Same wiring in `public/login.html`** — replace the two disabled
   buttons with anchors.

**Reuse:**
- `signCookie` / `verifyCookie` from
  [src/server/auth/cookies.ts](modelarena/src/server/auth/cookies.ts) —
  use these for both `oauth_state` and the resulting operator session.
- The existing operator session cookie format is in
  [src/server/auth/middleware.ts](modelarena/src/server/auth/middleware.ts);
  match it exactly so `withOperator` recognizes the new sessions.

**Watch out:**
- Don't introduce a new session format. Reuse the existing HMAC
  cookie scheme so `AUTH_SECRET` rotation still invalidates everything.
- GitHub's `state` cookie MUST be HttpOnly + SameSite=Lax so the OAuth
  callback (which is a redirect from github.com) reads it correctly.
- If `OPERATOR_GITHUB_LOGINS` env var is unset, default to **deny all**
  rather than allow all (security default).

**Verification:**
- `npm run test:run` — add unit tests for the allowlist parser +
  callback validation.
- Manual: hit `/login`, click GitHub, complete OAuth, verify redirect
  to `/` with operator session cookie set.

---

### B. Email magic-link login provider · ~half-day · MEDIUM priority

Same login surface as Session A, second alternative method. Decision:
use **Resend** (set up via Vercel Marketplace integration if available
— it provisions the env var automatically).

**Implementation outline:**

1. **Provision Resend** via Vercel Marketplace → Resend integration
   (or hand-set `RESEND_API_KEY` env var). Verify the sending domain
   (`noreply@ïdea.com` or similar — needs DNS records).
2. **Decide token storage.** Options:
   - **Runtime Cache** (preferred — already a dep, 15-min TTL via
     `cache.set('email-token:' + uuid, email, { ttl: 900 })`).
     [src/server/models/library.ts](modelarena/src/server/models/library.ts)
     shows the runtime-cache wiring pattern.
   - **New `auth_tokens` table** if Runtime Cache feels wrong for
     security boundaries. Adds a migration.
3. **Create `api/auth/email/start.ts`:** accept `{ email }` in JSON
   body, validate it's in `OPERATOR_EMAILS` allowlist, generate token,
   store under cache key, send Resend email containing
   `https://www.ïdea.com/api/auth/email/callback?token=…`. Always
   return 200 with the same body whether or not the email is in the
   allowlist (don't leak which emails are operators).
4. **Create `api/auth/email/callback.ts`:** look up token in cache,
   delete on first use (single-use), mint operator session cookie,
   302 to `/`. Show a clean error page if the token is expired/missing.
5. **Wire the Email button** in [OperatorLogin.tsx:136-147](modelarena/src/pages/OperatorLogin.tsx#L136-L147) — replace `disabled` block with an inline expander: clicking shows an `<Input type="email">` + Send button → on submit shows "Check your inbox at <email>" state.
6. **Mirror the wiring in `public/login.html`** — same inline-expander
   pattern but plain HTML/JS.

**Reuse:**
- Same cookie helpers as Session A.
- The existing `EMAIL_RE` regex in [ParticipantLanding.tsx:13](modelarena/src/pages/ParticipantLanding.tsx#L13) — extract to `src/lib/email.ts` once two consumers exist.

**Watch out:**
- Single-use tokens (delete from cache after consumption).
- Don't include the operator's allowlist status in any error response.
- Resend rate limits — for the 1-operator scenario this won't bite,
  but if you ever expand allowlist past 5 people add a per-IP cap.

**Verification:**
- Vitest with mocked Resend client + cache.
- Manual: send yourself a magic link, click it, verify redirect to `/`.

---

### C. Session 4 leftovers · ~1-2 hours · MEDIUM priority

Two small things that didn't fit the soft-delete session.

#### C.1 Retry-only-failed-slots in generation

Today's `/api/campaigns/:id/generate` re-runs every prompt × model
combination. If 1 of 12 slots failed, the operator must re-bill all 12.
The deferred-TODO comment is at
[src/server/routes/campaigns/generate.ts:44](modelarena/src/server/routes/campaigns/generate.ts#L44).

**Server change:** accept `?only=failed` (or `POST` body field
`onlyFailed: true`). Filter the (prompt, model) pairs to those where
the existing `generations` row has `output IS NULL` OR `error IS NOT NULL`.
Skip the rest entirely.

**UI change:** in [CreateCampaign.tsx:648](modelarena/src/pages/CreateCampaign.tsx#L648) `StepGenerate`, when the failure summary shows > 0
failed, render a second button "Retry failed (N)" alongside "Retry
all". Wire it to `handleGenerate({ onlyFailed: true })`.

**Watch out:** the existing `handleGenerate` in `CreateCampaign.tsx`
also creates the campaign on first run. The retry-failed flow needs
to skip the create call and just hit `/generate` on the existing
campaignId.

#### C.2 Login rate limiting

[src/server/routes/auth/login.ts:13](modelarena/src/server/routes/auth/login.ts#L13)
explicitly notes "Rate limiting is NOT implemented here. Acceptable for
single-operator MVP." Now that there will be 3 auth providers (password,
GitHub, email), a 5/15min IP cap is the right floor.

**Implementation:** middleware-level counter stored in Vercel Runtime
Cache. Key shape: `auth-attempts:${ip}`. On each auth attempt
(password / OAuth start / magic-link start), increment + check; over
5 returns 429 with `Retry-After` header.

Consider whether to count successful logins toward the limit (probably
not — only failed attempts).

**Reuse:** the same Runtime Cache wiring used by
`loadAnalyticsSnapshot`. Look at [src/server/models/library.ts](modelarena/src/server/models/library.ts) for the cache module + fallback pattern (it gracefully degrades when the cache is unavailable in local dev).

---

### D. R-V6 — drop tailwind-merge for ~16 kB bundle win · ~1 day · LOW-MEDIUM priority

Originally scoped at "1-line swap" but the prior session's audit
turned up pervasive size/shape overrides at component boundaries that
**genuinely depend on tw-merge's conflict resolution**. The 1-liner
breaks them. To recover the 16 kB win cleanly, refactor the
overrides into proper variants first, then drop tw-merge.

**Known conflicts (verified by grep):**
- `<Input className="h-9 …"/>` in
  [ModelLibrary.tsx:221](modelarena/src/pages/ModelLibrary.tsx#L221)
  overrides Input's default `h-10`.
- `<SelectTrigger className="h-9 …"/>` in
  [ModelLibrary.tsx:225, 237](modelarena/src/pages/ModelLibrary.tsx#L225)
  overrides default `h-10`.
- `<Button className="h-11 gap-2 md:h-8 md:px-3 md:text-[13px]">` in
  [VotingInterface.tsx:472](modelarena/src/pages/VotingInterface.tsx#L472) (TertiaryVoteButton) — responsive size override.
- `<Skeleton className="… rounded-{full,lg,md}">` ~25 call sites
  across [ModelLibrary.tsx](modelarena/src/pages/ModelLibrary.tsx),
  [CampaignDashboard.tsx](modelarena/src/pages/CampaignDashboard.tsx),
  [OperatorHome.tsx](modelarena/src/pages/OperatorHome.tsx),
  [OperatorDashboard.tsx](modelarena/src/pages/OperatorDashboard.tsx),
  [LeaderboardSkeleton.tsx](modelarena/src/components/dashboard/leaderboard/LeaderboardSkeleton.tsx) — override Skeleton's default `rounded-md`.

**Refactor plan:**
1. Add `size: 'default' | 'sm'` variant to Input ({ h-10, h-9 }).
   Update ModelLibrary call sites to use `size="sm"`.
2. Add `size: 'default' | 'sm'` variant to SelectTrigger (it already
   has `data-[size=sm]` but its default is h-8 — change to h-9 for
   consistency; verify nothing else uses h-8).
3. Add `shape: 'default' | 'pill' | 'lg' | 'md'` variant to Skeleton
   (or `radius: …`). Update all ~25 call sites.
4. TertiaryVoteButton: easiest is to drop the `<Button>` wrapper and
   render a styled `<button>` directly with the responsive classes.
   Or add a new compound variant to Button.
5. Run a fresh `grep` audit for any other `<Component className="…"`
   pattern where the className contains a class that overlaps with the
   primitive's defaults.
6. Then change [src/lib/utils.ts](modelarena/src/lib/utils.ts):
   `export const cn = clsx;` (remove the twMerge import + wrap).
7. `npm uninstall tailwind-merge`.
8. **Visual diff every page in preview** — screenshot before, refactor,
   screenshot after, compare. Tests won't catch visual regressions.
9. Measure: `npm run build`, target 16 kB gzip drop on `vendor-react`
   or wherever twMerge currently sits.

**Alternative if the refactor feels too risky:** keep tailwind-merge
but use `extendTailwindMerge` with a minimal config (only the
conflict groups we actually use: height, padding, text-size,
border-radius, bg-color). Estimated 6-10 kB savings instead of 16.
Lower risk, smaller win.

---

### E. Additional polish (nice-to-have, no urgency)

- **R-V8: lazy-split CreateCampaign** (954-line wizard, 19 kB chunk).
  PERF-PLAN-V2 marked this "marginal — defer indefinitely unless
  step 1 paint is measured to be slow." Don't touch unless the user
  asks.
- **Recently-deleted recovery surface.** We soft-delete with a 30-day
  grace window but there's no UI to undelete. Worth adding once the
  first accidental delete happens. Easy: `GET /api/campaigns?deleted=true`
  + a "Trash" link in the operator sidebar.
- **TS strict-mode TODO** in
  [src/server/routes/campaigns/generate.ts:10](modelarena/src/server/routes/campaigns/generate.ts#L10).
  Non-blocking; clean up when enabling strict mode project-wide.
- **SSE upgrade to polling.** Plan said "polling first, SSE only if
  the operator notices lag." After polling has been live for a week
  the user can decide.

---

## Critical files (most-touched across the work above)

| File | Sessions hitting it |
|---|---|
| [api/auth/](modelarena/api/auth/) (new files coming) | A, B, C.2 |
| [public/login.html](modelarena/public/login.html) | A, B (button wiring) |
| [src/pages/OperatorLogin.tsx](modelarena/src/pages/OperatorLogin.tsx) | A, B (button wiring) |
| [src/server/auth/cookies.ts](modelarena/src/server/auth/cookies.ts) | A, B (reuse helpers) |
| [src/server/auth/middleware.ts](modelarena/src/server/auth/middleware.ts) | A, B, C.2 |
| [src/server/routes/campaigns/generate.ts](modelarena/src/server/routes/campaigns/generate.ts) | C.1 (`?only=failed`) |
| [src/pages/CreateCampaign.tsx](modelarena/src/pages/CreateCampaign.tsx) | C.1 (Retry failed UI) |
| [src/components/ui/{input,select,button,skeleton}.tsx](modelarena/src/components/ui/) | D (variant refactor) |
| [src/lib/utils.ts](modelarena/src/lib/utils.ts) | D (cn → clsx) |

---

## Existing utilities to reuse — DO NOT re-implement

- **`apiFetch`** + `ApiError` in [src/lib/api.ts](modelarena/src/lib/api.ts) — all client API calls.
- **`signCookie` / `verifyCookie`** in [src/server/auth/cookies.ts](modelarena/src/server/auth/cookies.ts) — HMAC cookie helpers.
- **`withOperator` / `withParticipant`** in [src/server/auth/middleware.ts](modelarena/src/server/auth/middleware.ts) — auth wrappers for handlers.
- **`getDb`** in [src/server/db/client.ts](modelarena/src/server/db/client.ts) — memoized Drizzle client.
- **`toVercelHandler`** in [src/server/vercel-adapter.ts](modelarena/src/server/vercel-adapter.ts) — wraps Web-API handler for Vercel.
- **Runtime Cache pattern** — see how `loadAnalyticsSnapshot` /
  `invalidateAnalyticsSnapshot` in
  [src/server/models/library.ts](modelarena/src/server/models/library.ts)
  gracefully falls back when `@vercel/functions` cache is unavailable
  in local dev.
- **`ConfirmDestructive`** for any destructive mutation UI ([src/components/modals/confirm-destructive.tsx](modelarena/src/components/modals/confirm-destructive.tsx)).
- **`EditCampaignDialog`** — already exists, model for any edit-modal
  pattern ([src/components/modals/edit-campaign.tsx](modelarena/src/components/modals/edit-campaign.tsx)).
- **`mockFetch`** in [src/test/mockFetch.ts](modelarena/src/test/mockFetch.ts) — vitest fetch stub for SPA tests.
- **`installMockFetch`** test pattern — see [src/pages/__tests__/CampaignDashboard.test.tsx](modelarena/src/pages/__tests__/CampaignDashboard.test.tsx) for the canonical example.

---

## Environment + setup

**Required env vars (already documented in `.env.example`):**
- `DATABASE_URL` — Neon Postgres (auto-provisioned via Vercel Marketplace).
- `OPERATOR_PASSWORD` — single-operator login.
- `AUTH_SECRET` — HMAC secret (`openssl rand -hex 32`).
- `OPENROUTER_API_KEY` — model completions.
- `OPENROUTER_APP_URL` — optional, for OpenRouter analytics.
- `OPERATOR_GITHUB_LOGINS`, `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` — GitHub OAuth (shipped).
- `OPERATOR_EMAILS`, `RESEND_API_KEY` — email magic link (shipped).
- **`AI_ALLOWED_IDENTITIES`** — comma-separated subset of the login allowlist permitted to trigger AI-spending endpoints. See README "AI spend gate". Fail-closed; empty → 503. Must be set in Vercel prod/preview or AI stops working.

**Vercel-injected (no action needed):**
- `CRON_SECRET` — for cron endpoints (already consumed by purge-deleted).

**Local dev:**
```bash
cd modelarena
npm install
cp .env.example .env.local  # fill in DATABASE_URL, OPERATOR_PASSWORD, AUTH_SECRET
npm run db:migrate          # apply schema (0000-0003 currently)
npm run db:seed             # demo data (optional)
npm run dev                 # http://localhost:3000
```

The dev server is already running on port 3000 in this workspace; check with `mcp__Claude_Preview__preview_list`.

---

## How to verify what you ship

For UI work:
1. `npm run lint && npm run test:run` must be clean.
2. Use the `mcp__Claude_Preview__preview_*` tools — never use Bash for
   running the dev server, never use the "Claude in Chrome" MCP for
   verifying.
3. The headless preview reports `document.hidden = true` by default;
   if you're testing TanStack Query polling or anything that depends
   on `visibilitychange`, spoof visibility as in
   [Session 6's verification eval](.claude/plans/please-look-into-dea-com-melodic-octopus.md):

   ```js
   Object.defineProperty(document, 'visibilityState', {
     configurable: true, get: () => 'visible'
   });
   Object.defineProperty(document, 'hidden', {
     configurable: true, get: () => false
   });
   document.dispatchEvent(new Event('visibilitychange'));
   ```
4. Base-UI Tabs activate on `pointerdown`, NOT `click`. In tests use
   `fireEvent.click(...)` (it dispatches the right pointer events).
   In `preview_eval` dispatch `pointerdown` + `mousedown` + `mouseup` +
   `click` manually (see existing test patterns in
   [CampaignDashboard.test.tsx:105](modelarena/src/pages/__tests__/CampaignDashboard.test.tsx#L105)).

For backend work:
1. Add a vitest server test under `src/server/<area>/__tests__/`. The
   existing tests use raw module calls (no HTTP); see
   [export.test.ts](modelarena/src/server/campaigns/__tests__/export.test.ts).
2. Smoke-test live via `preview_eval`: `await fetch('/api/…')`.
3. Mutation endpoints should always invalidate the analytics snapshot
   via `invalidateAnalyticsSnapshot()` so the dashboard polling picks
   up changes.

---

## Gotchas the prior session learned the hard way

- **TanStack Query v5's `isPending` waits for awaited `onSuccess`.**
  If you `await qc.invalidateQueries(...)` inside `onSuccess`, the
  mutation stays pending through the next refetch — UI feels laggy.
  Don't await invalidations unless you specifically need to.
- **The headless preview sets `document.hidden = true`.** Polling
  with `refetchIntervalInBackground: false` won't fire — that's
  correct production behavior, but be aware when verifying.
- **`type="email"` triggers browser-native validation** that
  pre-empts custom handlers. Add `noValidate` to the form to keep
  control of the error UX.
- **Vite dev's `/index.html` references `/src/main.tsx` (no hash),**
  not the production `/assets/index-<hash>.js`. The login.html
  pre-fetch script silently no-ops in dev — verify against the built
  HTML to confirm production behavior.
- **The audit document I started from claimed the Live Leaderboard
  wasn't built. It IS built.** If the audit looks suspicious in any
  detail, verify by reading the actual file before believing it.
- **`api/operator/[kind].ts` consolidates dashboard/activity/models
  endpoints** behind one Vercel Function with Runtime Cache. Don't
  add new operator-read endpoints as separate functions; extend the
  consolidated handler.
- **`buildCampaignDetail` is the central read for operator detail.**
  It returns null for soft-deleted campaigns (intentional), so all
  callers (dashboard, export, recompute, preview) get 404 for free
  on deleted records.

---

## Open questions for the user before/during implementation

1. **GitHub OAuth allowlist key:** match by GitHub login username, by
   primary verified email, or both? The plan said "logins"; I'd
   recommend matching against verified email (more stable identity).
2. **Email magic link vs OAuth — share the operator session schema?**
   Probably yes (one cookie format, one `withOperator` middleware) but
   confirm before building.
3. **Resend domain.** Sending domain needs DNS records. If the user
   hasn't done this, the email-link work blocks until they do. Ask
   first thing.
4. **Rate limit thresholds.** 5 attempts / 15 min per IP is a guess.
   Confirm or adjust.
5. **R-V6 priority.** Bundle wins are real but the refactor is
   invasive. Confirm the user actually wants this before sinking a day.

---

## Scope discipline — what NOT to do this session

- **Don't migrate to Next.js / RSC.** Architectural change explicitly
  ruled out by PERF-PLAN-V2.
- **Don't introduce new design tokens or hues.** The palette is
  intentionally restrained (cream + dark ink + forest green + amber +
  red-for-validation-only).
- **Don't add SSE.** Polling is good enough until the user complains
  about latency.
- **Don't refactor for "cleanliness."** The codebase has consistent
  patterns; match them rather than improve them. Only refactor when
  it's the actual task (R-V6 is the one exception).
- **Don't enable React Compiler.** Documented incompatibility with
  TanStack Query (issue #9571).

---

## When you're done

1. All tests passing, lint clean.
2. Each shipped item verified end-to-end in the preview with a
   concrete proof (curl output, screenshot, or eval result captured
   in your reply).
3. Update [the original plan](.claude/plans/please-look-into-dea-com-melodic-octopus.md) status table to mark completed sessions.
4. If anything turned out bigger than expected, write a follow-up
   handoff (mirror of this file) for the next session — don't leave
   half-implemented work without a clear next step.

— Prior session, signing off.
