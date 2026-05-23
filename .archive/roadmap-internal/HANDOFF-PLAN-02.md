# Plan 02 Handoff — Simulated Runs + Personas

> Written 2026-04-20 by the session that shipped Plan 01 end-to-end.
> Read this brief cold; it's self-contained. Then open the full plan
> at [docs/roadmap/02-simulated-runs.md](./02-simulated-runs.md) before
> writing any code.

---

## What ModelArena is and what just shipped

ModelArena (live at https://www.ïdea.com, punycode `www.xn--dea-yma.com`)
is a React 19 + Vite + Vercel Functions + Neon Postgres + Drizzle ORM
app for running AI model evaluations. As of the most recent deploy
(`main` at `c244e88`, production aliased), it supports **six
evaluation modes** in any mixed-mode campaign:

1. **Tournament** — 5-battle bracket per prompt, Bradley-Terry ratings
2. **Slider** — per-model 1–N score
3. **Approve / reject** — per-model boolean, Wilson 95% CI
4. **Best-of-N** — all outputs shown at once, pick one; win-rate leaderboard
5. **Multi-axis** — per-dimension scores per model; per-dim leaderboards
6. **Qualitative** — free-text feedback; reader tab on dashboard

The operator side: campaign creation with per-prompt mode picker +
per-mode config editors, CSV exports (summary + responses + participants),
dashboard with mode-scoped scorecards + Comments tab. Voter side:
per-mode step views with a `ModeIndicator` pill so mode transitions are
visible.

**Everything above is in production. Do not redo it.**

---

## What this session is for

**Plan 02 — Simulated Runs.** Add automated evaluators that vote in any
of the six modes. Two flavors:

- **Generic panels** — calibrated cross-family judges focused on overall
  quality. Scale lever.
- **Persona panels** — judges instructed to evaluate from a specific
  point of view ("You are a Corporate Finance Manager evaluating
  outbound client emails…"). The product wedge.

Both ride on top of the Plan 01 step/submit infrastructure — a simulated
voter is just a participant whose responses come from an LLM call
instead of a keyboard. The plan at
[02-simulated-runs.md](./02-simulated-runs.md) has the full design:
schema, endpoints, phase breakdown, acceptance criteria, and risks.

---

## Key decisions already made (do not re-litigate)

1. **Self-preference bias is real.** Documented 5–10% effect
   (Panickssery et al. 2024, Zheng et al. 2023). The mitigation stack
   ships **together**, not in pieces:
   - Diverse panels (≥3 model families; no family >40% weight)
   - Cross-family exclusion (a Claude judge never votes on Claude
     outputs — enforced in the configurator, not optional)
   - Calibration loop against human votes
   - Rubric-based scoring over preference-based where applicable
   - Honest UI labeling of "simulated" vs "human" signal

   Do not ship a single-judge MVP "for speed." A biased dataset is
   worse than a late feature.

2. **Cost control is load-bearing.** Ship the hard cost ceiling + abort
   button in **Phase 1**, not Phase 3. A runaway loop is a $1000 bill.

3. **Persona quality is editorial craft.** The plan targets 15–20
   handcrafted starter personas. Budget real time — a day per persona
   reviewed by someone with domain knowledge. Do NOT generate them with
   an LLM and ship. That ruins the first-run experience.

4. **Multi-tenancy is not in scope here.** The Plan 02 doc assumes
   `orgs` exists (`personas.orgId`). It doesn't. For now, scope personas
   as single-operator-global — either make `orgId` nullable with a
   default or add a placeholder. When multi-tenancy lands later, a
   migration can associate existing personas with the single current org.
   Flag this in your design but do not block Plan 02 on shipping org
   auth.

5. **OpenRouter is already wired.** See `src/server/openrouter.ts`.
   Reuse it. Your judge calls go through the same provider path as
   generation. Add Vercel AI Gateway as a future fallback — it's on
   Plan 02's risk list but not blocking.

---

## Where to start

**Phase 1 (Generic panels) is the right entry point.** Validate the
base mechanism end-to-end before layering personas on top.

Sequencing inside Phase 1:

1. Schema + migration — `personas`, `simulated_runs`,
   `simulated_participants`. Nullable `simulated_participant_id` on
   every Plan 01 response table (slider_responses,
   approve_reject_responses, best_of_n_responses, multi_axis_responses,
   qualitative_responses, votes). Exactly one of
   `participant_id` / `simulated_participant_id` populated per response
   row — add a CHECK constraint.
2. `src/server/simulated-runs/` module:
   - `panel-assembly.ts` — cross-family exclusion logic + model mix
     validation
   - `judge-calls.ts` — mode-specific prompt templates (one file per
     mode under `prompts/`), OpenRouter call
   - `cost.ts` — cost estimator + hard ceiling
   - `durability.ts` — checkpoint + restart for mid-run failures
3. New endpoint: launch a generic simulated run on an active campaign
4. Operator UI: configurator (panel type, voter count, model mix,
   cost estimate) + progress view during run
5. Leaderboard extension: "Human / Simulated / Both" filter on the
   Ratings tab, driven by whether each `ratings` row aggregates from
   human or simulated responses

**Phase 2 adds personas on top.** Persona CRUD, starter library,
persona-segmented leaderboards.

**Phase 3 is polish** (cost transparency improvements, per-judge
latency tracking, persona-test preview runs).

---

## Engineering integration points

Read these before designing:

- `src/server/db/schema.ts` — Drizzle schema. Note the `promptModeEnum`
  pattern and how response tables share `(participant_id, prompt_id,
  campaign_model_id)` keys.
- `src/server/ratings.ts` — multi-mode aggregator. Already supports
  tournament / slider / approve_reject / best_of_n / multi_axis.
  Persona-segmented ratings will need a new category-prefix scheme
  (e.g., `slider:persona:corp-finance:overall`) or a dedicated
  `source` column — your call, but document it in the plan.
- `src/server/routes/vote/next.ts` — step dispatcher. Read to
  understand per-mode shapes; simulated voting REUSES the same
  response-table writes (just bypasses the voter UI).
- `src/server/routes/vote/submit-*.ts` — the five new per-mode
  submit handlers. For simulated runs, the judge calls should produce
  payloads in these exact shapes, then go through a separate internal
  path that writes without the cookie-auth gate.
- `src/server/openrouter.ts` — LLM call primitive. Reuse for judges.
- `src/lib/models.ts` — model catalog. **Add a `family` field** to
  every entry so `panel-assembly.ts` can enforce cross-family
  exclusion. Add a CI check that every entry has a family.

---

## Git state + branch strategy

- `main` is the production branch, currently at `c244e88`.
- Create a new branch off `main`: `git checkout -b simulated-runs`.
- `multi-mode-evaluation` is preserved on `origin` for history (Plan 01
  was merged to main via fast-forward).
- `mobile-ux-pass-1` is also preserved on `origin`.
- Feature branches merge to `main` via fast-forward when ready. The
  deploy pipeline is manual: `npx vercel build --prod && npx vercel
  deploy --prebuilt --prod`. The `buildCommand` in `vercel.json` runs
  `npm run deploy:check` (preflight vs migrations) before build, so
  any schema migration must be applied to prod DB **before** the build
  kicks off — see the Plan 01 Phase 3 deploy in session history for the
  pattern (`source .vercel/.env.production.local; npm run db:migrate`).

---

## Design rules (UI work)

- Light mode default, dark mode toggleable. Both first-class.
- Primary CTA = dark ink pill (`<Button variant="default">`).
- Red is reserved for inline validation/errors only — **never on
  buttons**. Destructive actions use `<ConfirmDestructive>` with
  typed-name guard.
- 10 px uppercase labels on stat tiles / form labels.
- Monospace for any number (`font-mono tabular-nums`).
- Skeletons pulse — no shimmer.
- Every operator page uses `<AppShell>` + `<PageHeader>` + breadcrumbs.
- Reuse `Card`, `Badge`, `Skeleton`, `Button`, `Input`, `Textarea`,
  `Select*`, `Dialog`, `StatusBadge`, `EntityIcon`,
  `ConfirmDestructive`, `EditCampaignDialog`. Don't redesign.
- For mode-related UI, match the `ModeIndicator` and `ModeBadge`
  vocabulary introduced in Plan 01 Phase 3 — keep "Generic" and
  "Persona" as first-class labels that complement "Tournament /
  Slider / …" rather than replace them.

Full design language: [docs/design-system/DESIGN-SYSTEM.md](../design-system/DESIGN-SYSTEM.md).

---

## Verification you should run before claiming done

Mirror the Plan 01 Phase 0 → Phase 3 pattern. At every phase boundary:

1. `npm run lint` — clean (tsc --noEmit)
2. `npm run test:run` — 72/72 baseline + your new tests pass
3. Against a seeded local campaign: launch a simulated run and verify
   - responses land in the right mode-specific table with
     `simulated_participant_id` populated (not `participant_id`)
   - leaderboard updates with the new aggregates
   - "Human / Simulated" filter shows the distinction
4. Failure injection: kill the server mid-run; restart; verify the run
   resumes from the last completed simulated participant
5. Cost sanity: estimated cost within 25% of actual `costActualUsd`
   on the `simulated_runs` row after completion
6. Bias check (dev toggle only): run the same campaign with and
   without cross-family exclusion; measurable difference in
   family-of-judge → family-of-winner correlation. Document the
   finding in the PR.

A phase is not done until all six checks pass. Shipping "half" of
bias mitigations or cost control is explicitly out.

---

## What NOT to do

- Do not ship a single-judge "LLM-as-judge" MVP. Panels + cross-family
  exclusion together, or not at all.
- Do not LLM-generate the starter persona library. Curate by hand.
- Do not defer cost ceiling to Phase 3. Ship it in Phase 1.
- Do not break the existing human voting flow. Every existing test
  must stay green.
- Do not invent new design primitives when reusing the `ModeBadge` /
  `ModeIndicator` / `ModeScorecard` pattern would do.
- Do not skip the plan doc. Open [02-simulated-runs.md](./02-simulated-runs.md)
  first.

---

## Quick pointers

- Plan doc: [docs/roadmap/02-simulated-runs.md](./02-simulated-runs.md)
- Roadmap index: [docs/roadmap/README.md](./README.md)
- Design system: [docs/design-system/DESIGN-SYSTEM.md](../design-system/DESIGN-SYSTEM.md)
- Code: `/Users/christiankatzmann/Dev/ïdea.com/modelarena/`
- Prod: https://www.ïdea.com
- Related references in Plan 02: Panickssery et al. 2024 ("LLM
  Evaluators Recognize and Favor Their Own Generations"), Zheng et al.
  2023 ("Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena").

Good luck. The foundation is solid — your job is to make it scale.
