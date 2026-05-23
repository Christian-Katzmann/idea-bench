# Walkthrough Punch List — ModelArena

**Run:** `2026-05-23T18-00-00Z`
**Walked by:** product-walkthrough-audit skill
**Surfaces planned:** 22 · **Surfaces visited:** 15 · **Coverage:** 68%
**Findings:** 12 (0 blockers, 4 major, 8 minor)
**AI budget mode:** `api-ai` (OpenRouter) · **AI spend:** $0.00 / $0.50 (no AI features exercised; budget held in reserve)

See `coverage-receipt.json` and `ai-budget.json` for the audit trail behind these numbers.

> **The headline:** Nothing is irretrievably broken. The product *works* — login,
> blind voting, ratings, exports, model library, persona library, campaign wizard,
> personal results. The 4 major findings are all in the unhappy paths: bad URLs,
> bad slugs, racy keyboard shortcuts, and a noisy feed. None block the core loop,
> all are fixable in less than a day each.

---

## 🛑 User-blocking

> Anyone hitting this surface cannot complete the obvious task. Fix first.

### F-001 · `/vote/:slug header` · major

- **User expectation:** A participant who clicks the header "Home" link from a voting page expects to return to the campaign landing or a public page — not be redirected into an operator login screen they have no credentials for.
- **Reality:** The header "Home" link points to `/`, which for an unauthenticated participant redirects to `/login`. Anonymous participants get dumped into a credential gate that doesn't apply to them.
- **Reproduces:**
  1. Open `http://localhost:3000/vote/this-slug-does-not-exist` as anonymous
  2. Observe the "Can't load this campaign · 404 campaign not found" state
  3. Click the "Home" link in the header
  4. Observe redirect to `/login`
- **Evidence:** [`evidence/participant-home-dead-ends-at-login-3d4e5f.png`](evidence/participant-home-dead-ends-at-login-3d4e5f.png)
- **Broken claim:** `CLM-007` — *"Participant auth: anonymous, HMAC-signed cookie for vote dedup."*
- **Console errors:** none
- **Fix hypothesis:** Remove the "Home" link from participant routes, or point it to a participant-friendly destination like the campaign landing.

### F-002 · `/campaign/<invalid-uuid>` · major

- **User expectation:** An operator who follows a stale link or mistypes a campaign ID expects an immediate, clear "campaign not found" state — not an infinite loading spinner.
- **Reality:** The page sits on "Loading…" indefinitely. GET `/api/campaigns/<bogus>` returns HTTP 500 (not 404) and React Query's default retry policy fires **7 retries** silently. No error state ever renders.
- **Reproduces:**
  1. Sign in as operator
  2. Navigate to `http://localhost:3000/campaign/not-a-real-campaign`
  3. Observe "Loading…" breadcrumb persisting beyond 10s
  4. Open Network panel; observe 7× GET `/api/campaigns/not-a-real-campaign` → 500
- **Evidence:** [`evidence/campaign-invalid-uuid-stuck-loading-a0b1c2.png`](evidence/campaign-invalid-uuid-stuck-loading-a0b1c2.png)
- **Broken claim:** undocumented
- **Network failures:** GET `/api/campaigns/not-a-real-campaign` → 500 (×7)
- **Console errors:** none (errors swallowed)
- **Fix hypothesis:** Server: distinguish "not found" (404) from genuine 500s in the campaign-by-id handler. Client: disable retry on 4xx, render a "Campaign not found" empty state on 404 and an error+Retry on 5xx.

---

## 🎭 Polished-but-lying

> UI looks complete, but the action doesn't work or doesn't match the copy.
> These are the most damaging to user trust.

### F-003 · `/campaign/new` (Step 2: Basics) · major

- **User expectation:** When the operator clicks "DEMO ●", the tooltip "Press → to autofill each step" should actually do that — and on the very next step.
- **Reality:** On Step 2, the campaign-name textbox is auto-focused. ArrowRight is captured by the input as cursor-movement, so the autofill shortcut silently no-ops. The user has to click outside the input first — a non-obvious workaround. **The two duplicate "Sprogmodeller i sagsbehandling" drafts in the seed data look exactly like the failure mode of this trap.**
- **Reproduces:**
  1. Sign in as operator
  2. Click "New campaign"
  3. On Step 1, click "DEMO ●"
  4. Click "Next" → land on Step 2
  5. Observe campaign-name input is auto-focused
  6. Press → — nothing happens (cursor moves in empty input)
  7. Click elsewhere, press → again; form now autofills
- **Evidence:** [`evidence/campaign-new-demo-mode-e8f9a0.png`](evidence/campaign-new-demo-mode-e8f9a0.png)
- **Broken claim:** undocumented (in-product tooltip)
- **Console errors:** none
- **Fix hypothesis:** Rebind the autofill shortcut to `Shift+→` or `Cmd+→`, or add a visible "Autofill this step" button when demo mode is on.

### F-004 · `/vote/<invalid-slug>` · minor

- **User expectation:** When a participant follows an expired link, they expect a human-voice "this campaign isn't available" message — not a raw HTTP status code.
- **Reality:** The error reads "Can't load this campaign · 404 campaign not found". Mixing a human sentence with a literal "404" leaks implementation detail and reads like a developer error page. Combined with F-001, the participant has no path forward.
- **Reproduces:**
  1. Open `http://localhost:3000/vote/this-slug-does-not-exist`
  2. Read the error message
- **Evidence:** [`evidence/vote-invalid-slug-404-2c3d4e.png`](evidence/vote-invalid-slug-404-2c3d4e.png)
- **Broken claim:** `CLM-007`
- **Console errors:** none
- **Fix hypothesis:** Rewrite to "This voting link isn't available anymore — ask whoever sent it to share a new one." Drop "404".

### F-005 · `/vote/:slug/results` (zero-prompt grammar) · minor

- **User expectation:** After voting on 1 battle inside 1 prompt's tournament, the summary should say "Based on your 1 battle in 1 prompt (in progress)" — not "across 0 prompts".
- **Reality:** Reads "Based on your 1 battle across 0 prompts." Grammatically odd and confusing. Counts only fully-completed prompts.
- **Reproduces:**
  1. Open `/vote/P42Skm4IQyIVEq7q` anonymous
  2. Click "Vote as anonymous", vote on 1 battle, click "Quit early"
  3. Read the opening sentence of `/results`
- **Evidence:** [`evidence/vote-personal-results-c6d7e8.png`](evidence/vote-personal-results-c6d7e8.png)
- **Broken claim:** undocumented
- **Console errors:** none
- **Fix hypothesis:** Count prompts *touched* (≥1 battle), not prompts completed.

### F-006 · `/vote/:slug/results` (huge CI on tiny sample) · minor

- **User expectation:** When a confidence interval is wider than the rating itself (1461 ± 2438), a careful reader expects the numeric rating to be hidden — because the CI spans negative values the rating system doesn't support.
- **Reality:** Even with the "Your sample is small" disclaimer, the prominent monospace rating columns still print "1461 ± 2438" and "539 ± 2438", which look authoritative.
- **Reproduces:**
  1. Vote on 1 battle, quit early
  2. Observe the rating table
- **Evidence:** [`evidence/vote-personal-results-c6d7e8.png`](evidence/vote-personal-results-c6d7e8.png)
- **Broken claim:** undocumented
- **Console errors:** none
- **Fix hypothesis:** When votes < 5, hide the numeric rating column entirely; keep only win-rate + tier label.

### F-007 · Unknown route fallback · minor

- **User expectation:** Visiting an unknown URL should either render a "404 — page not found" or, if redirecting home, surface a toast acknowledging the original URL was bad.
- **Reality:** `/banana` silently redirects to `/`. The user may not notice the URL was bogus, which makes typo'd internal links hard to diagnose.
- **Reproduces:**
  1. Navigate to `http://localhost:3000/banana`
  2. Observe URL bar instantly changes to `/`, no toast or banner
- **Evidence:** [`evidence/operator-home-baseline-4e5f6a.png`](evidence/operator-home-baseline-4e5f6a.png)
- **Broken claim:** `CLM-014`
- **Console errors:** none
- **Fix hypothesis:** Replace the catch-all `<Navigate>` with a `<NotFound />` route, or fire a toast on home after redirect.

---

## 🚧 Half-built

> Surface is clearly partial and the user can tell — but nothing labels it as such.

### F-008 · `/team-activity` · major

- **User expectation:** A "Team Activity" feed should let an operator scan recent *meaningful* movement at a glance. System events should not crowd out human events.
- **Reality:** The feed is dominated by 25+ consecutive identical "RATINGS RECOMPUTED" entries from a single campaign. Operator-meaningful events (campaign created, participant finished) are buried. No grouping, collapsing, or filtering. "PARTICIPANT FINISHED" rows show no inline campaign name.
- **Reproduces:**
  1. Navigate to `/team-activity`
  2. Scroll
  3. Count consecutive same-type entries
- **Evidence:** [`evidence/team-activity-recompute-spam-7b8c9d.png`](evidence/team-activity-recompute-spam-7b8c9d.png)
- **Broken claim:** undocumented
- **Console errors:** none
- **Fix hypothesis:** Collapse consecutive same-type same-campaign events into one row ("Ratings recomputed 12 times in 20 minutes"). Inline campaign name in PARTICIPANT FINISHED rows.

### F-009 · `/dashboard` · minor

- **User expectation:** Loading the dashboard fires one network request for its data, not three.
- **Reality:** Single page load fires GET `/api/operator/dashboard` × 3. Two plausibly from React StrictMode dev double-mount; the third suggests over-fetching.
- **Reproduces:**
  1. Cold-load `/dashboard`
  2. Network → filter `dashboard` → count
- **Evidence:** [`evidence/dashboard-pulse-tab-6a7b8c.png`](evidence/dashboard-pulse-tab-6a7b8c.png)
- **Broken claim:** undocumented
- **Console errors:** none
- **Fix hypothesis:** Audit `useEffect`/`useQuery` hooks on OperatorDashboard. If duplicate subscription, hoist into one shared query.

### F-010 · Command palette (⌘K) · minor

- **User expectation:** The palette should jump to every section in the sidebar — including Personas.
- **Reality:** Sidebar has 6 nav items; the palette's NAVIGATION section lists 5. Personas is missing.
- **Reproduces:**
  1. From any page, press ⌘K
  2. Observe NAVIGATION list
- **Evidence:** [`evidence/operator-home-baseline-4e5f6a.png`](evidence/operator-home-baseline-4e5f6a.png)
- **Broken claim:** `CLM-014`
- **Console errors:** none
- **Fix hypothesis:** Add "Go to Personas" to the palette's hardcoded nav array.

### F-011 · `/` (Campaigns list) · minor

- **User expectation:** Two side-by-side cards with identical name/description/category should not silently coexist — either deduped, prompted-against-on-create, or visually labeled.
- **Reality:** Two "Sprogmodeller i sagsbehandling — Q2 evaluering" drafts. Two "Phase 2 smoke" drafts. The only differentiator is the UUID hidden in the link. Strong hypothesis: byproduct of F-003 (demo-mode autofill race).
- **Reproduces:**
  1. Open `/`
  2. Scroll the list, count visual duplicates
- **Evidence:** [`evidence/operator-home-baseline-4e5f6a.png`](evidence/operator-home-baseline-4e5f6a.png)
- **Broken claim:** undocumented
- **Console errors:** none
- **Fix hypothesis:** On create, if same-name campaign exists, prompt "duplicate or rename?" in the wizard's final step.

---

## 📜 Stale-promise

> A documented claim is no longer true.

### F-012 · `/settings/api` · minor

- **User expectation:** The page promises "Read-only configuration health for the services this app depends on" — so a deployer expects to see GitHub OAuth and Resend status alongside the other secrets.
- **Reality:** Page lists 4 secrets (Database, Auth, Operator, OpenRouter). GitHub OAuth and Resend — both first-class auth methods per the README — are not surfaced.
- **Reproduces:**
  1. Navigate to `/settings/api`
  2. Read the Secret status section
- **Evidence:** [`evidence/api-settings-bfc0d1.png`](evidence/api-settings-bfc0d1.png)
- **Broken claim:** `CLM-005` — *"Three sign-in methods … anything unset stays hidden/disabled in the UI."*
- **Console errors:** none
- **Fix hypothesis:** Extend the secret-status response to include GitHub OAuth (all 3 vars present) and Resend (RESEND_API_KEY + OPERATOR_EMAILS). Each shows CONFIGURED / NOT CONFIGURED / PARTIAL.

---

## Surfaces visited with no findings

Surfaces that behaved as expected. Listed here so the receipt is complete and a re-run can spot regressions.

- `/login` — password / GitHub / Email-link visible; wrong password produces "invalid password" error (terse but functional); GitHub OAuth genuinely redirects to github.com with valid client_id.
- `/` (Campaigns list) — loads cleanly, sidebar nav and breadcrumbs correct, ⌘K command palette opens and searches campaigns. (See F-010 / F-011 for nits.)
- `/dashboard` — stat cards, campaign spotlight with Leaderboard / Matchups / Pulse tabs, "Needs attention" buckets, "Recent movement" feed. (See F-009 for over-fetch.)
- `/models` — 9 models, friendly names + provider IDs, win-rate / signal classification, enable/disable switches, Details modal with campaign footprint and "Mark as legacy".
- `/personas` — starter persona library, category filter, search; "New persona" modal with Preview-this-persona (live ~$0.001 judge call).
- `/campaign/:active-id` — Overview / Ratings / Prompts / Settings tabs all render; share-link visible with copy/open buttons; settings has many exports + close/delete with 30-day soft-delete grace.
- `/vote/:slug` (real, live) — clear landing, time/battles estimate, optional email or anonymous.
- `/vote/:slug/play` — blind tournament UI: prompt above, Model A vs Model B with token counts, A/B/Tie/Both-bad buttons, keyboard shortcuts hint, quit-early, no model identity leak in DOM or API response (verified via `/api/vote/:slug/next` JSON — only `generationA`/`generationB`, no provider IDs).
- `/vote/:slug/results` — model identities revealed, "Group alignment" score, sample-size disclaimers. (See F-005 / F-006 for copy nits.)

## Surfaces skipped

- `/campaign/new` Steps 3–6 (Prompts / Models / Generate / Launch) — reason: `out-of-scope` (would create real DB rows; demo-autofill trap already documented in F-003).
- `/campaign/:id/preview` — reason: `out-of-scope-for-this-pass` (not in the seeded URLs I visited; covered indirectly via the campaign Settings "Preview public page" button).
- AI generation features (`POST /api/campaigns/:id/generate`, persona test) — reason: `ai-skipped-intentionally`. Walkthrough discovered no AI-feature *failure*, so the $0.50 budget was held in reserve rather than spent for redundant verification. The Preview-persona modal exposes a "~$0.001 per call" feature for follow-up if needed.
- Email magic-link auth — reason: `requires-credentials` (no Resend API key visible to the audit; not in /settings/api as a configured secret).
- `/campaign/:id` for non-ACTIVE campaigns (DRAFT-state generate flow, CLOSED-state results-only view) — reason: `out-of-scope-for-this-pass`.
