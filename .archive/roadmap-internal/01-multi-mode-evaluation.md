# Plan 01 — Multi-Mode Evaluation

> Status: Approved, not started.
> Last updated: 2026-04-20.
> See [roadmap README](./README.md) for cross-plan context.

## Context

ModelArena today is a tournament-only voting platform. Every campaign is a
bracket: the participant sees two outputs side-by-side and picks A or B,
five battles deep per prompt. The Bradley-Terry ratings that come out are
rigorous, but the UX is fixed.

That constraint caps the product's reach. A content team rating marketing
copy doesn't need a bracket — they want a slider. A support ops lead
screening bot responses wants approve/reject. A creative director wants
"show me all four, pick the one you'd ship." A PM running customer research
wants qualitative comments. Today they can't run any of that in ModelArena,
so they run it in Google Forms.

**Multi-Mode Evaluation** generalizes the voting model. Each prompt within a
campaign gets its own evaluation mode. Tournament stays as one option; five
more ship alongside it. The same campaign can mix modes — a single run can
combine rigorous preference voting on ten prompts with slider ratings on
five and qualitative feedback on another three.

This is the change that turns ModelArena from "a voting tool" into "the
configurable evaluation platform." Every other feature on the roadmap
(Simulated Runs, Collections, Reports) gets multiplicatively more valuable
because modes exist.

## User-Facing Behavior

### Operator (campaign creation)

When the operator adds a prompt during campaign creation, a **Mode** picker
appears next to each prompt in the list. The first prompt defaults to
Tournament. Every subsequent prompt **defaults to whatever mode the previous
prompt used** — the operator only has to change it when switching modes, not
every time. Changing a mode shows an inline "mode settings" panel for
mode-specific config (scale labels, dimensions for multi-axis, N for
best-of-N, etc.).

### Voter (participating)

A campaign with mixed modes shows the participant one prompt at a time.
Each prompt renders with the UI for that prompt's mode. Transitions between
modes are clear ("This one's different — rate each response 1 to 10").
Completion is the same per-prompt experience as today; once all prompts are
done, the participant sees their personal results.

### The six modes

| Mode | Voter sees | Signal collected per prompt |
|---|---|---|
| **Tournament** (existing) | Two outputs, blind, pick A/B/tie/both_bad across 5 battles | Preference pairs → Bradley-Terry rating |
| **Slider** | Each model's output, one at a time, with a 1–10 slider | One score per (participant, prompt, model) |
| **Approve / Reject** | Each model's output, thumbs up / thumbs down | One boolean per (participant, prompt, model) |
| **Best-of-N** | All N outputs shown at once, voter picks the best | One chosen model_id per (participant, prompt) |
| **Multi-Axis** | Each model's output with multiple sliders (e.g., correctness, tone, brevity — configurable) | Per-dimension scores per (participant, prompt, model) |
| **Qualitative** | Each model's output with a free-text "why?" field | Free text per (participant, prompt, model) |

Qualitative is often stacked on top of other modes (operator can enable
"also collect qualitative feedback" on any mode). In V1 ship it as its own
mode; V2 can compose it.

### Leaderboard rendering

A campaign leaderboard must show results per mode, because different modes
produce different signals. Tournament prompts produce a B-T rating; slider
prompts produce a mean score; approve/reject produces a pass rate. The
campaign dashboard gets a mode filter: "Showing: Tournament prompts" /
"Slider prompts" / "All modes (combined view)". The combined view displays
each mode's leaderboard in a stacked layout — not fake cross-mode
aggregation.

Cross-mode aggregation ("overall model X rank across modes") is a V2
research question — probably a consensus rank or rank-sum test.
Deliberately out of scope for V1.

## Architecture

### Schema additions

```typescript
// New enum
export const promptModeEnum = pgEnum('prompt_mode', [
  'tournament',
  'slider',
  'approve_reject',
  'best_of_n',
  'multi_axis',
  'qualitative',
]);

// Extend prompts
ALTER TABLE prompts ADD COLUMN mode prompt_mode NOT NULL DEFAULT 'tournament';
ALTER TABLE prompts ADD COLUMN mode_config jsonb; // shape depends on mode
```

`mode_config` shape per mode:
- Tournament: `null` (no config)
- Slider: `{ min: 1, max: 10, minLabel?: string, maxLabel?: string }`
- Approve/Reject: `{ approveLabel?: string, rejectLabel?: string }`
- Best-of-N: `{}` (N equals campaign's model count)
- Multi-Axis: `{ dimensions: [{ key: string, label: string, min: 1, max: 5 }, ...] }`
- Qualitative: `{ prompt?: string, required: boolean }`

### Response storage — mode-specific tables

**Decision: separate tables per mode, not one generic `responses` table with
JSONB.** Reasons: (1) ratings pipeline queries heavily per-mode; specific
schemas make indexes trivial; (2) type safety at the Drizzle layer; (3) each
mode has natural uniqueness constraints that are easier to enforce per
table; (4) tournament stays untouched — the existing `tournaments` +
`votes` stack continues to handle tournament-mode prompts unchanged.

Non-tournament modes get new tables, all keyed by
`(participant_id, prompt_id, campaign_model_id)` where relevant:

```typescript
slider_responses: { participant_id, prompt_id, campaign_model_id, score }
approve_reject_responses: { participant_id, prompt_id, campaign_model_id, approved }
best_of_n_responses: { participant_id, prompt_id, chosen_campaign_model_id }
multi_axis_responses: { participant_id, prompt_id, campaign_model_id, scores jsonb }
qualitative_responses: { participant_id, prompt_id, campaign_model_id, text }
```

Unique indexes prevent double-submission per (participant, prompt, model)
where applicable.

### Participant loop generalization

Today: `GET /api/vote/:slug` returns the next tournament battle. Tournament
is hardcoded.

Change: `GET /api/vote/:slug/next` returns the next *step*. The response
describes what to render:

```json
{
  "step_type": "tournament_battle" | "slider" | "approve_reject" | "best_of_n" | "multi_axis" | "qualitative",
  "prompt": { ... },
  "mode_config": { ... },
  "payload": { ... mode-specific, e.g. tournament battle metadata or the
  array of generations to rate }
}
```

`POST /api/vote/:slug/next` accepts mode-specific submission payloads.
The server dispatches to a mode-specific handler that writes to the right
response table and advances the participant's position.

### Ratings pipeline

Today: `ratings.ts` computes B-T strength from `votes` table.

Change: `ratings.ts` becomes a dispatcher. Per mode, compute a different
aggregate:
- Tournament → existing B-T (unchanged)
- Slider → mean + variance, display as score card
- Approve/Reject → pass rate + Wilson confidence interval
- Best-of-N → win rate + binomial CI
- Multi-Axis → per-dimension mean + variance
- Qualitative → no aggregate; text list with optional later NLP

Rating cache table stays as-is but picks up a `mode` column so per-mode
aggregates coexist without conflict. `ratings.category` already plays this
role for per-category ratings within tournament mode — extend the pattern,
don't reinvent.

### UI

Voter shell refactor in `src/pages/VotingInterface.tsx`:
- Extract a `<TournamentBattle>` component from the current file (what's
  there today stays, just moves)
- Add `<SliderStep>`, `<ApproveRejectStep>`, `<BestOfNStep>`,
  `<MultiAxisStep>`, `<QualitativeStep>` siblings
- A thin dispatcher selects the component based on `step_type` from the
  API

Operator UI in `src/pages/CreateCampaign.tsx`:
- Prompt row gains a Mode select; default = last-used mode
- Mode-specific settings drawer opens when mode is non-tournament
- Validate at submission that `mode_config` matches the chosen mode's
  schema

Campaign dashboard leaderboard in `src/components/dashboard/leaderboard/`:
- Add a mode filter tab row (auto-hidden when campaign uses only one mode)
- Each mode renders its own leaderboard component (shared chrome, distinct
  data shape)

## Implementation Phases

Phase boundaries are pickup points — a session can complete a phase and
hand off. Do not skip phase 0.

### Phase 0 — Schema + API framing (prerequisite)

- Add `prompt_mode` enum + `prompts.mode` + `prompts.mode_config` columns
- Create empty response tables for the 5 new modes (no handlers yet)
- Rename `/api/vote/:slug/{next,advance}` endpoints to a polymorphic
  `step_type`-based shape (tournament keeps working; returns
  `step_type: "tournament_battle"`)
- Ship this behind no-op feature flag; existing tournament campaigns
  unaffected

Exit: all existing tests pass, new tables exist, endpoint shape is
generalized but still only serves tournament steps.

### Phase 1 — Slider + Approve/Reject (Modes Wave 1)

- Operator can select Slider or Approve/Reject on any new prompt
- Voter UI renders the new step types
- Ratings pipeline computes mean score / pass rate
- Leaderboard shows the new mode results
- Unit tests for each mode's signal processor
- Happy-path integration test: create campaign with mixed modes → generate
  → vote → see results

Exit: a VP Product can run a mixed tournament + slider campaign end-to-end.

### Phase 2 — Best-of-N + Multi-Axis + Qualitative (Modes Wave 2)

- Remaining three modes added
- Multi-axis needs a dimension editor in the operator UI (add/remove/name
  dimensions per prompt)
- Qualitative needs a "show all responses" reader UI for the operator
- Extend leaderboard components with the new aggregates

Exit: all six modes shippable in one campaign.

### Phase 3 — Polish

- Combined-view leaderboard layout (stacked per-mode)
- Personal results page handles mixed-mode campaigns
- CSV export handles all modes (one row per response, mode column)
- Mode-specific copy/instructions in the voter UI ("This one's different")

Exit: feature feels native, not bolted on.

## Acceptance Criteria

- [ ] Operator can select a per-prompt mode; next prompt defaults to the
  previous prompt's mode
- [ ] All six modes have distinct voter UIs that render correctly on
  mobile + desktop
- [ ] All six modes store responses in the right tables, with uniqueness
  enforced where relevant
- [ ] Leaderboard renders correct aggregates for each mode
- [ ] Mixed-mode campaigns complete end-to-end for a participant without
  errors
- [ ] CSV export includes all mode responses in a queryable format
- [ ] Existing tournament-only campaigns behave identically (regression
  check)
- [ ] 28/28 existing tests still pass; new tests for each mode's
  signal processor pass

## Risks & Watchouts

1. **Don't break tournaments.** Existing `tournaments` + `votes` + B-T
   pipeline stays exactly as-is. Tournament-mode prompts continue through
   that path unchanged. New tables are additive.

2. **`ratings` table is load-bearing.** Current per-category index is
   `(campaign_id, campaign_model_id, category)`. When extending for modes,
   prefer widening the category key semantically
   (e.g., `category='slider:overall'`) over adding a `mode` column, unless
   query patterns genuinely demand the second axis. Keep the schema change
   minimal.

3. **Don't over-normalize.** Resist the urge to build a generic
   `evaluations` parent table. Mode-specific tables are cleaner for the
   query patterns ratings.ts needs and easier to reason about when writing
   handlers. The cost of five small tables is lower than the cost of one
   clever one.

4. **Qualitative mode has scale risk.** Text responses grow linearly with
   (participants × prompts). Don't ship an unbounded "all comments" UI
   without pagination.

5. **Operator complexity.** Six modes is a lot to present. Design the mode
   picker so the operator isn't overwhelmed — tournament is the obvious
   default, the other five are behind a "More evaluation modes" group with
   a one-line description each.

6. **Cross-mode aggregation is a product question.** V1 does NOT
   aggregate across modes. Resist requests to compute "overall model X
   rating" from mixed signal until the team has decided what that should
   mean.

## Critical Files

- `src/server/db/schema.ts` — enum + prompt extensions + 5 new tables
- `src/server/tournament.ts` — rename to `evaluation.ts`, dispatch by mode
- `src/server/ratings.ts` — generalize to mode-specific aggregators
- `src/server/campaigns/detail.ts` — leaderboard data query by mode
- `api/vote/[slug]/index.ts` + `api/vote/[slug]/[action].ts` — polymorphic
  step/submission handlers
- `src/pages/VotingInterface.tsx` — voter shell refactor; split per-mode
  components
- `src/pages/CreateCampaign.tsx` — mode picker + mode-config editors per
  prompt row
- `src/pages/CampaignDashboard.tsx` — mode filter on leaderboard
- `src/components/dashboard/leaderboard/` — mode-specific leaderboard
  components
- `src/pages/PersonalResults.tsx` — render per-mode personal results
- `drizzle/000X_multi_mode.sql` — new migration
- `scripts/seed.ts` — seed at least one mixed-mode demo campaign

## Verification

End-to-end check list for a session that thinks it's done:

1. `npm run db:migrate` — new migration applies cleanly to a fresh DB
2. `npm run db:seed` — demo data includes a mixed-mode campaign
3. `npm run test:run` — all tests pass, including new mode-specific tests
4. `npm run dev` — operator flow: create a campaign, add four prompts with
   four different modes, generate, launch
5. Participant flow: open `/vote/<slug>` in incognito, complete all four
   prompts, reach personal results
6. Operator dashboard: leaderboard shows per-mode results correctly; mode
   filter works
7. CSV export: all four modes' responses appear in the export with
   consistent schema
8. Regression: an existing tournament-only campaign seeded before the
   migration renders and accepts votes unchanged

Any failure in 1–8 means the feature isn't done. Don't ship otherwise.
