# Make idëa Ready for Public GitHub

> Right now ModelArena is private code on Christian's machine. This campaign turns it into a project a stranger could land on, understand in 30 seconds, run on their own laptop, and trust. We fix the rough edges a real user would hit, write the welcome mat (README, license, contributor docs), set up the automatic checks that catch broken pull requests, and clean out anything personal before flipping the repo public.

## Scope

Take ModelArena from "private, working, single-author project" to "credible self-hostable single-operator LLM evaluation tool, runnable from a GitHub README in under 10 minutes." Two work streams converge here: (1) the 12 product-walkthrough findings from `audit-2026-05-23T18-00-00Z/punch-list.md` — 4 majors and 8 minors that would embarrass us if a stranger found them first; (2) the open-source readiness gaps from the earlier conversation — no LICENSE, an operator-flavored README, no CI, missing hygiene files, fuzzy repo identity, and demo data that includes personal/test artifacts. Done = a public GitHub repo that a small-team PM, content lead, or indie hacker can clone, point at a Postgres URL, and run their first blind evaluation against OpenRouter inside an evening. Not done = multi-tenant SaaS shape (out of scope), workspaces, RBAC, billing — that's a different campaign.

## Context (locked decisions)

- **Audience and shape: self-hostable single-operator tool.** Not multi-tenant SaaS. The auth model stays "exactly one operator per deployment"; the README and positioning lean into that.
- **Public face: ModelArena.** The product name is the public name. The `-dea.com` GitHub repo gets renamed (or replaced) so the GitHub URL says `modelarena` not a mangled diacritic.
- **License: Apache-2.0.** Source files already carry `SPDX-License-Identifier: Apache-2.0` headers (verified in `src/App.tsx`). The repo lacks the matching `LICENSE` file.
- **Branch: `public-prep` off `main`.** All work in this campaign lands on a single feature branch; merge to main only after Final review is APPROVED. The repo stays private until merge + flip in Step 5.2.
- **Audit fixes come before OSS hygiene.** A stranger judging the repo cares about "does it work" more than "does it have a CODE_OF_CONDUCT". Phases 2–3 ship first, Phase 4 ships in parallel where possible.
- **Secret hygiene gates the public flip.** No code goes public until git history is scanned and any leaked secret rotated (Step 5.1). This is non-negotiable.
- **Seed data ships with the repo, but de-personalized.** The Danish municipal-language demos and "Phase 2 smoke / Phase 3 demo / Sprogmodeller…" duplicates are personal/dev artifacts. Default seed becomes a small clean set ("English email writing", "Code review quality") that demonstrates the product without confusing strangers.
- **Internal docs split:** `docs/roadmap/` (vision + plans 01–06) is public-facing and stays. `docs/superpowers/`, `docs/ux-reports/`, `HANDOFF-NEXT-SESSION.md`, `PERF-PLAN*.md`, `MIGRATION-PLAN.md`, `PERF-INVESTIGATION.md`, `PERF-V2-BRIEF.md` move to an `.archive/` directory (gitignored or pruned).

## How prompts work in this campaign

Each step activates a skill or runs a command and pastes a short prompt. The prompt provides only what the agent cannot know on its own:

- **Scope** — the specific thing this run is about.
- **Required reading** — file paths the agent must read first.
- **Output target** — where the result goes.
- **Open questions** — what to surface, not assume.

`<UPPERCASE_TOKENS>` are user-fillable placeholders. The Campaigns app shows an editable bar in the prompt card for them; copies use the substituted text.

## Progress checklist

### Phase 1 — Lock positioning & repo identity

- [x] Step 1.1 — Grill the public-face decisions

### Phase 2 — Fix the audit majors

- [x] Step 2.1 — Participant routing dead-end + invalid-slug copy (F-001 + F-004)
- [x] Step 2.2 — Invalid campaign UUID 500/infinite-loading (F-002)
- [ ] Step 2.3 — Wizard demo-mode keyboard trap + duplicate detection (F-003 + F-011)
- [ ] Step 2.4 — Team activity feed grouping (F-008)

### Phase 3 — Polish the audit minors

- [ ] Step 3.1 — Operator surface polish batch (F-007 + F-009 + F-010 + F-012)
- [ ] Step 3.2 — Participant results polish (F-005 + F-006)

### Phase 4 — Welcome mat & continuous checks

- [ ] Step 4.1 — Add LICENSE + CONTRIBUTING + SECURITY + CODE_OF_CONDUCT
- [ ] Step 4.2 — GitHub Actions CI (lint + test + build on PR)
- [ ] Step 4.3 — Rewrite README for strangers + docs triage + screenshots

### Phase 5 — Pre-publish safety & flip

- [ ] Step 5.1 — Secret-history audit, key rotation, demo-data cleanup
- [ ] Step 5.2 — Repo rename, settings, branch protection, flip public
- [ ] Final review

Each step heading is followed by a `Model:` line (recommended agent + thinking effort) and a `Parallel:` line (which sibling steps can run alongside it).

## Step 1.1 — Grill the public-face decisions

Model: Opus 4.7 · Extra High / GPT-5.5 · Extra High
Parallel: NO

Before any code or docs change, lock the soft decisions that the rest of the campaign depends on. Use `/grill-me` to stress-test: what is the public name (ModelArena alone, or "ModelArena — the idëa.com eval tool", or rename the GitHub URL too); who is the README written for (a PM at a 50-person startup? a solo founder evaluating LLMs for a side project? an open-source dev curious about Bradley-Terry?); what's the screenshot we lead with on the README; what stays in `docs/` and what gets archived. The output is a short decision memo that Phase 4 reads from.

```text
/grill-me

SCOPE: Stress-test the public-face decisions for the ModelArena open-source release. The audience and shape are locked (self-hostable single-operator). What's still soft: repo name on GitHub, README hero positioning, hero screenshot choice, docs/ triage.

REQUIRED READING:
1. modelarena/audit-2026-05-23T18-00-00Z/punch-list.md (the audit headline)
2. modelarena/README.md (current operator-flavored README)
3. modelarena/docs/roadmap/README.md (current vision section — is this the public pitch or an internal one?)
4. The earlier conversation's "self-hostable individual vs team product" exchange

OUTPUT: modelarena/.archive/public-prep-decisions.md — short decision memo with: (1) final GitHub repo name + whether to rename or fresh-create, (2) one-paragraph public positioning that goes in the README hero, (3) which existing screen we screenshot for the README hero (campaign dashboard with a leaderboard? the blind voting interface? the dashboard with stats?), (4) docs/ triage table — keep / archive / delete per file.

OPEN QUESTIONS:
- Does Christian want to keep the current GitHub URL (-dea.com) and just rename, or fresh-create a new repo and push? Renaming preserves stars/forks; fresh creates a clean URL.
- Should the README acknowledge idëa.com as the origin story, or treat ModelArena as a clean product?
- Is the "Configurable Human Evaluation for AI Products" pitch from the internal roadmap the right public pitch, or is it too B2B-flavored for a self-host audience?
- Do we want the README to mention OpenRouter prominently (lowers cognitive load — "use any model") or stay model-agnostic (less coupling)?
```

## Step 2.1 — Participant routing dead-end + invalid-slug copy (F-001 + F-004)

Model: Sonnet 4.6 · High / GPT-5.5 · High
Parallel: YES — with Step 2.2, Step 2.3, and Step 2.4

The header "Home" link on `/vote/:slug` and `/vote/:slug/play` and the 404 state dumps anonymous participants into `/login`. Same surfaces leak a literal "404" in the error copy. Both are participant-side, both are in the same header layout + landing/error component. Fix together so the same agent session reviews the whole participant-facing routing story.

```text
/health-implement

SCOPE: Fix F-001 (participant Home link dead-ends at operator /login) and F-004 (invalid-slug "404 campaign not found" copy leaks raw HTTP status) on the participant flow. Both fixes touch the participant-side header and the unknown-slug error state.

REQUIRED READING:
1. modelarena/audit-2026-05-23T18-00-00Z/punch-list.md (sections F-001 and F-004 — exact repro and fix hypotheses)
2. modelarena/src/pages/ParticipantLanding.tsx
3. modelarena/src/pages/VotingInterface.tsx
4. modelarena/src/pages/PersonalResults.tsx
5. modelarena/src/components/layout/ (the header component the participant pages share)

OUTPUT: A single commit on the `public-prep` branch that:
- Removes the "Home" link from the participant header, OR repoints it to the campaign landing (/vote/:slug). Pick whichever reads cleaner to a stranger landing on /vote/:slug/play with no context.
- Rewrites the unknown-slug error copy from "Can't load this campaign · 404 campaign not found" to "This voting link isn't available anymore — ask whoever sent it to share a new one." Drop the literal "404".
- Keeps existing tests passing; adds a small render test for the new error copy if one is easy.

OPEN QUESTIONS:
- Does the participant header serve any purpose if "Home" is removed? If only the dark-mode toggle remains, is the header worth keeping at all on /vote routes, or should the dark-mode toggle move into the page body?
- Should the new error state include a single "Get a new link from the sender" line as a CTA, or stay minimal?
```

## Step 2.2 — Invalid campaign UUID 500/infinite-loading (F-002)

Model: Opus 4.7 · Extra High / GPT-5.5 · Extra High
Parallel: YES — with Step 2.1, Step 2.3, and Step 2.4

This is the worst-feeling bug in the audit: an operator who mistypes a campaign UUID sits on "Loading…" forever while React Query silently fires 7 retries against a 500 server response. Two-layer fix: server returns 404 for not-found (not 500), client distinguishes 404 from 5xx and renders an actual empty state. Touches the campaign-by-id API handler and the CampaignDashboard data layer.

```text
/health-implement

SCOPE: Fix F-002 (invalid campaign UUID = 7× 500 retry storm + infinite "Loading…"). Server-side: distinguish "campaign not found" from genuine server errors. Client-side: stop retrying 4xx, render a real "Campaign not found" empty state.

REQUIRED READING:
1. modelarena/audit-2026-05-23T18-00-00Z/punch-list.md (section F-002 — exact repro and fix hypothesis)
2. modelarena/api/campaigns/ (find the by-id handler — look for the campaigns/[id].ts or equivalent dispatcher entry)
3. modelarena/src/pages/CampaignDashboard.tsx
4. modelarena/src/server/campaigns/ (the campaign-lookup function this handler calls)
5. modelarena/src/lib/ (where the React Query client and shared query helpers live — likely a queryClient.ts or similar)

OUTPUT: A single commit that:
- Server: campaign-by-id handler returns 404 with `{ error: 'campaign_not_found' }` when the lookup misses; keeps 500 only for genuine internal errors.
- Client: the campaign-detail query disables retry on 4xx (configure retry function on the useQuery call or the global queryClient defaults). On 404, renders a "Campaign not found · This campaign may have been deleted, or the URL is wrong" empty state with a "Back to campaigns" link. On 5xx, renders an error state with a "Retry" button.
- Verifies the fix manually: bogus UUID = single 404 (not 7× 500), shows the empty state.

OPEN QUESTIONS:
- Should bogus-UUID responses log to server-side telemetry, or stay silent? (Useful for detecting bad links being shared; unnecessary noise otherwise.)
- Is the React Query retry policy a global default in queryClient.ts, or set per-query? If global, changing it might affect other queries — confirm the blast radius before flipping.
```

## Step 2.3 — Wizard demo-mode keyboard trap + duplicate detection (F-003 + F-011)

Model: Sonnet 4.6 · High / GPT-5.5 · High
Parallel: YES — with Step 2.1, Step 2.2, and Step 2.4

The campaign wizard's demo-mode autofill ("Press → to autofill") is silently broken on Step 2 because the campaign-name input is auto-focused and eats the keystroke. The duplicate "Sprogmodeller i sagsbehandling" and "Phase 2 smoke" campaign cards in the seed data look exactly like the failure mode of this trap (someone enabled demo mode, pressed → expecting autofill, got empty cursor movement, hit Next, got a half-empty draft). Fix the shortcut AND add a soft duplicate-name nudge in the wizard's basics step.

```text
/health-implement

SCOPE: Fix F-003 (demo-mode → shortcut conflicts with input focus) and F-011 (duplicate-name campaign cards in the list). Both originate in the same surface: the campaign creation wizard. The duplicate cards in the seed are downstream evidence of F-003.

REQUIRED READING:
1. modelarena/audit-2026-05-23T18-00-00Z/punch-list.md (sections F-003 and F-011)
2. modelarena/src/pages/CreateCampaign.tsx
3. modelarena/src/components/ (find the demo-mode hook or keyboard handler — likely in a hook like useWizardDemoMode or in the CreateCampaign component itself)
4. modelarena/src/server/campaigns/ (find the campaigns-list query the duplicate check needs to compare against)

OUTPUT: A single commit that:
- Rebinds the demo-mode autofill shortcut from `ArrowRight` to `Shift+ArrowRight` (or `Cmd+ArrowRight` on Mac, `Ctrl+ArrowRight` elsewhere). Update the demo button's tooltip to match: "Demo mode ON — press Shift+→ to autofill each step."
- Adds a visible "Autofill this step" button when demo mode is on, so the keyboard shortcut is no longer the only path.
- On Step 2 (Basics), when the campaign-name input loses focus or the user hits Next, checks for an existing campaign with the exact same name. If found, shows an inline soft warning ("A campaign named X already exists — continue anyway or rename?") with two buttons. Not a hard block.

OPEN QUESTIONS:
- Should the duplicate-name check fire on every keystroke (debounced), or only on blur/Next? Blur is cheaper and less noisy.
- Should we also de-duplicate the demo-mode autofill payload — i.e., if "Sprogmodeller i sagsbehandling" already exists, demo mode generates a variant ("Sprogmodeller i sagsbehandling — alt") rather than the exact duplicate?
```

## Step 2.4 — Team activity feed grouping (F-008)

Model: Opus 4.7 · Extra High / GPT-5.5 · Extra High
Parallel: YES — with Step 2.1, Step 2.2, and Step 2.3

The `/team-activity` feed is dominated by 25+ consecutive identical "RATINGS RECOMPUTED" rows from one campaign. A stranger lands on this page and sees a wall of noise; human-meaningful events (campaign created, participant finished) are buried. Fix by collapsing consecutive same-type same-campaign events into a single row. Also surface the campaign name inline on "PARTICIPANT FINISHED" rows so the operator doesn't need to click-through to know which campaign moved.

```text
/health-implement

SCOPE: Fix F-008 (team activity feed crowded by ratings-recomputed spam). Collapse consecutive same-type same-campaign events, and inline the campaign name on participant-finished rows.

REQUIRED READING:
1. modelarena/audit-2026-05-23T18-00-00Z/punch-list.md (section F-008)
2. modelarena/src/pages/TeamActivity.tsx
3. modelarena/src/server/activity/ (or wherever the activity feed comes from server-side; check api/operator/team-activity or similar)
4. modelarena/audit-2026-05-23T18-00-00Z/evidence/team-activity-recompute-spam-7b8c9d.png (the visual we're fixing)

OUTPUT: A single commit that:
- Groups consecutive events with the same `event_type` and same `campaign_id` into one displayed row. Group label: "Ratings recomputed 12 times in 18 minutes" with the time-range of the group.
- Inlines the campaign name on `PARTICIPANT FINISHED` rows: "Email writing — a participant finished voting" rather than the current "A participant finished voting".
- Keep the underlying API response unchanged (still returns raw events) and do the grouping client-side, OR group server-side if the response is paginated and grouping needs to span pages. Pick the cleaner path; document the decision in the commit message.

OPEN QUESTIONS:
- Should the grouped row be expandable (click to see all 12 recomputes) or just a summary? Expandable is more honest; summary is cleaner.
- Are there activity-event types the operator would WANT to see un-grouped (e.g., participant-finished should probably stay un-grouped because each one is a person)?
```

## Step 3.1 — Operator surface polish batch (F-007 + F-009 + F-010 + F-012)

Model: Sonnet 4.6 · High / GPT-5.5 · High
Parallel: YES — with Step 3.2

Bundle four small operator-side polish fixes that don't share files with each other but are too small to be their own steps: unknown-route fallback (F-007), dashboard triple-fetch (F-009), command palette missing Personas (F-010), `/settings/api` missing GitHub/Resend status (F-012). Same agent session, four targeted edits, one review.

```text
/health-implement

SCOPE: Bundled polish on the operator-side surfaces. Four small fixes:
- F-007: replace catch-all <Navigate to="/" /> with a real /404 fallback that says what was wrong.
- F-009: investigate why /dashboard fires three GETs to /api/operator/dashboard; collapse to one (audit StrictMode + useQuery).
- F-010: add "Go to Personas" to the ⌘K command palette navigation list.
- F-012: extend /settings/api to surface GitHub OAuth and Resend secret status alongside the existing four.

REQUIRED READING:
1. modelarena/audit-2026-05-23T18-00-00Z/punch-list.md (sections F-007, F-009, F-010, F-012)
2. modelarena/src/App.tsx (catch-all route for F-007)
3. modelarena/src/pages/OperatorDashboard.tsx (for F-009)
4. modelarena/src/components/ (find the command palette — likely a CommandPalette.tsx or similar; for F-010)
5. modelarena/src/server/settings/apiHealth.ts and modelarena/src/pages/ApiSettings.tsx (for F-012)

OUTPUT: A single commit that delivers all four fixes. The 404 fallback gets a small new page; the dashboard fetch dedup picks one of (a) hoist into shared query, (b) gate effect with a ref, or (c) document why three is correct — pick what the code actually wants. The palette gets one new entry. The API settings response and UI both grow two rows.

OPEN QUESTIONS:
- For F-009: is the third fetch a legit refetch (e.g., on focus/reconnect) or a duplicate? If legit, no fix needed — document it in the commit message instead.
- For F-007: should the 404 page link back to /dashboard (operator) or /vote landing (participant)? Probably operator-default, since unknown URLs are likely operator typos.
- For F-012: do we want to show NOT CONFIGURED rows for GitHub/Resend, or only show them when at least one variable is set? Always-visible is more discoverable.
```

## Step 3.2 — Participant results polish (F-005 + F-006)

Model: Sonnet 4.6 · High / GPT-5.5 · High
Parallel: YES — with Step 3.1

Two related copy-and-display fixes on `/vote/:slug/results`: the "across 0 prompts" grammar bug when a participant quits early (F-005), and the misleading "1461 ± 2438" rating display when sample size is too small for the number to mean anything (F-006). Both are PersonalResults.tsx.

```text
/health-implement

SCOPE: Fix F-005 (zero-prompt grammar after early quit) and F-006 (Bradley-Terry rating shown with confidence interval wider than the rating itself on tiny samples). Both touch the personal results page.

REQUIRED READING:
1. modelarena/audit-2026-05-23T18-00-00Z/punch-list.md (sections F-005 and F-006)
2. modelarena/src/pages/PersonalResults.tsx
3. modelarena/audit-2026-05-23T18-00-00Z/evidence/vote-personal-results-c6d7e8.png

OUTPUT: A single commit that:
- F-005: count prompts *touched* (≥1 battle voted), not prompts completed. Or render variant copy when count is 0: "Based on your 1 battle in 1 prompt (still in progress)." Pick the cleaner change.
- F-006: when total votes < 5 (or the existing DIRECTIONAL threshold, whichever is more consistent), hide the numeric rating column entirely. Keep only win-rate and the existing tier label. The Bradley-Terry math doesn't change — just don't print numbers that lie.

OPEN QUESTIONS:
- What's the right sample-size threshold for hiding the rating? Is there an existing constant (DIRECTIONAL / PRELIMINARY / STABLE thresholds) we should reuse?
- Should the personal results page show "± CI" at all when DIRECTIONAL, or just the rating? Confidence intervals on n=1 are misleading whether shown or not.
```

## Step 4.1 — Add LICENSE + CONTRIBUTING + SECURITY + CODE_OF_CONDUCT

Model: Sonnet 4.6 · High / GPT-5.5 · High
Parallel: YES — with Step 4.2 and Step 4.3

Add the four standard open-source hygiene files. Apache-2.0 is the locked license (matches the SPDX headers already in src/App.tsx). CONTRIBUTING explains how to set up a dev environment, run tests, and submit PRs. SECURITY explains how to report vulnerabilities privately. CODE_OF_CONDUCT picks a standard (Contributor Covenant 2.1) and adopts it.

```text
/health-implement

SCOPE: Add the four standard OSS hygiene files at repo root: LICENSE (Apache-2.0), CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md.

REQUIRED READING:
1. modelarena/src/App.tsx (confirm SPDX-License-Identifier: Apache-2.0 header is already there)
2. modelarena/README.md (existing setup instructions — the CONTRIBUTING file should reference these, not duplicate them)
3. modelarena/.archive/public-prep-decisions.md (decision memo from Step 1.1 — may shape what CONTRIBUTING says about scope/PR style)

OUTPUT: Four new files at modelarena/ root:
- LICENSE — full Apache-2.0 text, current year, "Christian Katzmann" as copyright holder.
- CONTRIBUTING.md — how to set up locally (point at README), how to run tests (npm run test:run, npm run lint), how to propose a change (issue first for non-trivial work), the project's scope (single-operator self-hostable; multi-tenancy is explicitly out of scope per the Vision doc).
- SECURITY.md — how to report vulnerabilities (an email or GitHub security advisory), what's in scope (the deployed app, the auth/AI-spend gates, the participant cookie HMAC), what's out of scope (test/seed data, demo flows).
- CODE_OF_CONDUCT.md — Contributor Covenant 2.1 verbatim, with the contact email filled in.

OPEN QUESTIONS:
- Email for security reports and code of conduct: Christian's public email, or a project-specific alias? Use whatever's in the existing git author config unless specified otherwise.
- Should CONTRIBUTING mention the ADX manifests in `.adx/` as "AI-agent-readable contracts" for contributors using Claude Code or Codex, or stay quiet about that? It's a real differentiator but might confuse newcomers.
```

## Step 4.2 — GitHub Actions CI (lint + test + build on PR)

Model: Sonnet 4.6 · High / GPT-5.5 · High
Parallel: YES — with Step 4.1 and Step 4.3

Set up `.github/workflows/ci.yml` that runs on every PR and push to main: install dependencies, run `npm run lint` (tsc --noEmit), run `npm run test:run` (vitest), run `npm run build`. No deploy, no DB — just the three checks that confirm the codebase still type-checks, passes tests, and builds. A stranger opening their first PR sees a green check or a real failure.

```text
/health-implement

SCOPE: Add a GitHub Actions CI workflow that runs lint + test + build on every PR and push to main.

REQUIRED READING:
1. modelarena/package.json (scripts: lint, test:run, build; engines/Node version)
2. modelarena/vitest.config.ts (does the test suite need any env or DB setup?)
3. modelarena/.env.example (what env vars do tests need, if any?)
4. modelarena/vite.config.ts (build pipeline — anything special?)

OUTPUT: A new file modelarena/.github/workflows/ci.yml that:
- Triggers on pull_request and push to main.
- Uses ubuntu-latest, Node 22 (LTS, matches Vercel's runtime).
- Caches npm.
- Runs: npm ci → npm run lint → npm run test:run → npm run build.
- Surfaces a clear status check name ("CI / lint+test+build") so branch protection in Step 5.2 can require it.

OPEN QUESTIONS:
- Do any tests require DATABASE_URL or other env vars? If yes, can we run them against a Postgres service in the workflow, or do we need to mock/skip integration tests in CI?
- Should the workflow build the dist/ artifact and store it (helps with deploy preview later), or just verify the build succeeds?
- Do we want a separate "format check" step using prettier, or is tsc --noEmit enough? (Don't add a formatter just for CI — only if one already exists in the repo.)
```

## Step 4.3 — Rewrite README for strangers + docs triage + screenshots

Model: Opus 4.7 · Extra High / GPT-5.5 · Extra High
Parallel: YES — with Step 4.1 and Step 4.2

This is the most important step of Phase 4. The current README reads like operator notes; we need a stranger's-eye README. Lead with the elevator pitch (the one paragraph locked in Step 1.1), a screenshot of the campaign dashboard or voting interface, a 60-second "what does this do" GIF if feasible, then quickstart with "any Postgres" (not just Vercel+Neon), then the auth/AI-spend story, then docs/runbook links. Concurrently, triage `docs/` per the Step 1.1 decision memo: keep `docs/roadmap/` and `docs/design-system/`, move internal-only stuff (`docs/superpowers/`, `docs/ux-reports/`, the PERF-PLAN markdowns at the project root) into a gitignored `.archive/` or delete.

```text
/health-implement

SCOPE: Rewrite README.md for a stranger landing on GitHub, take 1–2 hero screenshots, triage docs/ per the Step 1.1 decision memo.

REQUIRED READING:
1. modelarena/.archive/public-prep-decisions.md (the public positioning, hero screenshot choice, docs triage table from Step 1.1)
2. modelarena/README.md (current operator-flavored version — preserve the operational details, but move them below the fold)
3. modelarena/docs/roadmap/README.md (the Vision section — may want to lift one line for the README hero)
4. modelarena/audit-2026-05-23T18-00-00Z/evidence/ (screenshots already taken during the audit — reuse the cleanest ones rather than retaking)
5. The project root (`/Users/christiankatzmann/Dev/ïdea.com/`) — list of root-level handoff/PERF markdowns that need moving

OUTPUT:
- modelarena/README.md rewritten with this shape:
  1. Hero: title + one-paragraph pitch + 1 screenshot.
  2. "What it does" — 3 short bullets, plain language.
  3. Quickstart — clone → install → set DATABASE_URL → seed → run. Say "any Postgres" explicitly; mention Neon as one option, not the default.
  4. Auth modes table (preserved from current README, lightly edited).
  5. AI spend gate explanation (preserved).
  6. Architecture overview — 4 bullets, link to existing src/server/README.md.
  7. Roadmap link → docs/roadmap/
  8. License + contributing pointers.
- modelarena/screenshots/hero-leaderboard.png (or whatever Step 1.1 picked) committed to the repo, referenced from README.
- modelarena/docs/ triage applied: archive directory created (`modelarena/.archive/` with a .gitignore entry, or `modelarena/docs/archive/` if we want public history) and the agreed-internal docs moved into it. Root-level PERF*.md, MIGRATION-PLAN.md, HANDOFF-NEXT-SESSION.md move too.

OPEN QUESTIONS:
- Should `.archive/` be gitignored (clean public history, lose internal continuity) or committed (preserves history, slightly noisy)? The decision memo from 1.1 may already settle this.
- Are there existing GIFs/recordings we can reuse for the README, or does this step need to record one (e.g., Loom or QuickTime → optimized GIF)? If recording, that may be its own ~15 minutes inside this step.
- The current README has a ton of operator-auth detail. How much of that stays in the README vs. moves to docs/operator-auth.md to keep the README skimmable?
```

## Step 5.1 — Secret-history audit, key rotation, demo-data cleanup

Model: Opus 4.7 · Extra High / GPT-5.5 · Extra High
Parallel: NO

The most important step in the campaign. Before the repo flips public, every commit in git history must be scanned for accidentally-committed secrets. Any key that has ever touched the repo (even in a deleted commit) is considered compromised and gets rotated. Also: prune the duplicate "Sprogmodeller / Phase 2 smoke / Phase 3 demo" entries from the default seed script so a stranger who runs `npm run db:seed` gets a clean, intentional demo (1–2 example campaigns that showcase the product without confusing them).

```text
/health-implement

SCOPE: Pre-publish safety pass. Three sub-tasks:
1. Scan full git history for committed secrets using gitleaks (or trufflehog if gitleaks isn't installable).
2. Rotate any key that has ever touched the repo, even in deleted commits — OPENROUTER_API_KEY, AUTH_SECRET, OPERATOR_PASSWORD, GITHUB_OAUTH_CLIENT_SECRET, RESEND_API_KEY, DATABASE_URL credentials. Update Christian's local .env.local and Vercel production env. Do NOT print rotated values back; just confirm rotation done.
3. Prune the duplicate / personal-test campaigns from the seed script. Default seed becomes a small clean set that demonstrates the product without leaking personal demo content.

REQUIRED READING:
1. modelarena/.env.example (canonical list of every variable name; everything here that ever held a real value gets rotated)
2. modelarena/scripts/seed.ts (current seed contents — find the duplicate Sprogmodeller / Phase 2 smoke / Phase 3 demo entries flagged in audit F-011)
3. modelarena/audit-2026-05-23T18-00-00Z/punch-list.md (F-011 — the duplicates are downstream evidence of the F-003 trap; the fix in 2.3 prevents new ones, this step removes old ones)
4. modelarena/.gitignore (confirm .env, .env.local, .env.production.local are all blocked; add anything missing)

OUTPUT:
- A scan report at modelarena/.archive/secret-scan-report.md listing every potential hit gitleaks/trufflehog found, classified as (a) genuine secret to rotate, (b) false positive, (c) test fixture safe to keep.
- A list of rotated keys in modelarena/.archive/rotation-log.md (key name + "rotated YYYY-MM-DD" — no values).
- modelarena/scripts/seed.ts pruned to a small clean default set: keep 2–3 illustrative campaigns ("Email writing", "Code review quality") in English, drop duplicates, drop Danish municipal-language demos. Move the pruned Danish/personal demos to modelarena/scripts/seed.personal.ts (gitignored or in .archive/) so Christian still has them locally.
- modelarena/.gitignore updated if anything is missing.

OPEN QUESTIONS:
- Does gitleaks / trufflehog run cleanly in this repo, or do we need a different scanner? Pick what works; document the choice.
- The seed script currently includes the duplicate "Sprogmodeller i sagsbehandling — Q2 evaluering" entries — were those manually created via the wizard demo-mode trap (F-003), or are they in seed.ts? If seed.ts, this step prunes them; if database-only, the seed is already clean and we just note it.
- Rotation in practice: who does the actual rotating (Christian via the provider dashboards) vs. the agent (updating .env.local references)? The agent can't authenticate to OpenRouter / Resend / GitHub to rotate; this step prepares the list and Christian executes the rotations. The output is the audit trail, not the actual key change.
```

## Step 5.2 — Repo rename, settings, branch protection, flip public

Model: Sonnet 4.6 · High / GPT-5.5 · High
Parallel: NO

The flip. Merge `public-prep` to `main`, rename the GitHub repo (per Step 1.1 decision), configure GitHub repo settings (description, topics, default branch, branch protection requiring the CI workflow from Step 4.2), and flip visibility to public. Verify the final state by visiting the public URL in an incognito window and reading the README as a stranger.

```text
/ship-domain

SCOPE: Final flip. Merge public-prep to main, configure GitHub repo for public, flip visibility, smoke-test as an anonymous visitor.

REQUIRED READING:
1. modelarena/.archive/public-prep-decisions.md (the final repo name and positioning from Step 1.1)
2. modelarena/audit-2026-05-23T18-00-00Z/punch-list.md (sanity-check that none of the major findings reopened)
3. modelarena/.archive/secret-scan-report.md (confirm clean from Step 5.1)
4. modelarena/.archive/rotation-log.md (confirm all rotations done)

OUTPUT:
- public-prep branch merged to main (PR with CI green; squash or merge per the decision memo's preference).
- GitHub repo renamed per Step 1.1 decision (e.g., from `-dea.com` to `modelarena`). Old URL set up as a redirect via GitHub's automatic rename behavior.
- GitHub repo settings:
  - Description: one-liner from the README hero.
  - Topics: `llm`, `evaluation`, `ai`, `react`, `postgres`, `self-hostable`, `openrouter` (or whatever the decision memo settled).
  - Default branch: main.
  - Branch protection on main: require CI workflow + 1 review (or self-review until contributors arrive).
- Repository visibility: Public.
- Smoke-test: open the public URL in an incognito window, read the README, click 3 internal links, confirm no 404s and no broken images.

OPEN QUESTIONS:
- Does Christian want to announce the repo (X, HN, Reddit) as part of this step, or stay quiet for a soft launch?
- Should we delete the `public-prep` branch after merge, or keep it for archeology? Convention is delete; keep only if there's a specific reason.
- If renaming, anyone with the old clone URL needs to update their remote. Does this affect anything beyond Christian's own machine?
```

## Final review

A campaign-level final review catches **cross-phase shortcuts** — a primitive set up in one phase silently bypassed by another, intent claimed in one step but not delivered when read across the whole campaign. Run it once every phase is complete. The user copies the prompt below, opens a fresh Codex or Claude Code session in the repo, and pastes:

```text
Run a final review on the "Make idëa Ready for Public GitHub" campaign.

Plan: /Users/christiankatzmann/Dev/ïdea.com/modelarena/campaigns/public-github-prep.md
Campaign: campaigns/public-github-prep.md

Read every `## Step N.M — name` heading in the campaign markdown. For each, locate the acceptance criteria in its prompt body, and verify against the cumulative git diff that the criteria actually landed. Don't trust step receipts — read the diff.

Catch cross-step shortcuts: a primitive set up in one step silently bypassed by another, intent claimed in early steps but undermined by later ones, dead code left behind, regressions in unrelated areas. Pay special attention to:
- Step 2.2's React Query retry policy change — did it inadvertently affect other queries the audit didn't test?
- Step 4.3's README rewrite — does it still match what Step 5.1 actually shipped (e.g., if seed data changed in 5.1, does the README's quickstart still work)?
- Step 5.1's secret rotation — is there any reference to a now-rotated key still hardcoded somewhere?

Be honest. Lean. APPROVED if every step's acceptance criteria landed and there are no cross-step regressions. NEEDS WORK if any step cut corners or a primitive was bypassed.

Don't pad with future improvements. Just verdict the work.

Run with either:
- Codex: GPT-5.5 with Extra High reasoning effort
- Claude Code: Opus 4.7 with Extra High thinking
(Your call — both are acceptable for this kind of cross-file review.)
```

**Verdict-to-action mapping:**

- **APPROVED** → tick the `Final review` checkbox at the end of the progress checklist (or click "Close campaign"). Campaign is done. Step 5.2 has already flipped the repo public; this is the last formal sign-off.
- **NEEDS WORK** → reopen the named steps, close the gaps, re-run the final review. Don't tick the checkbox until APPROVED. If 5.2 already shipped, the gaps land as follow-up commits on main.
