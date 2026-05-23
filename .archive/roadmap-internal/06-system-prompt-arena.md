# Plan 06 — System-Prompt Arena

> Status: Drafted, not approved. Depends on Plan 04 (Arena Modes
> Foundation), Plan 01 (Multi-Mode Evaluation), and benefits substantially
> from Plan 02 (Simulated Runs).
> Last updated: 2026-04-28.
> See [roadmap README](./README.md) for cross-plan context.

## Context

A system prompt is sticky context — it shapes how a model responds to
every downstream user message. Brand voice instructions, agent
personalities, refusal styles, formatting rules, safety prefaces. Picking
the right system prompt has outsized leverage: it affects every customer
conversation, every email, every drafted document.

Despite the leverage, system prompts get tested informally. Engineers
write three candidates, paste them into a playground with two or three
sample messages, eyeball the outputs, ship the one that "feels right." If
the deployed system prompt drifts in production — a tone slip, a brand
inconsistency, a refusal that should have been a redirect — there's no
benchmark to compare against.

System-Prompt Arena is the same blind-evaluation loop run with the system
prompt as the contestant and a **suite** of representative user prompts
as the test cases. Operators can ask "which version of our brand voice
prompt holds up across the 30 user requests we actually see?" and get a
ranked answer with confidence intervals, optionally judged by personas
representing their target audience.

This is the natural marriage of three existing pieces: Plan 01 modes,
Plan 02 personas, and a tiny amount of new wiring. The output is the
single highest-leverage feature for the "VP Product / Head of Content /
Head of AI" buyer persona — the people whose job is shaping how a
deployed AI behaves at scale.

## User-Facing Behavior

### Operator (campaign creation)

After picking **System-Prompt Arena** at Step 0:

1. **Basics** — name, description, categories. Identical to other arenas.
2. **Test prompts (suite)** — at least 3 user prompts representing the
   range of real interactions. Operator pastes them inline; future Plan 03
   Collections integration will allow loading a saved suite.
3. **System prompt variants** — at least 2 system-prompt variants, full
   text in a tall multiline editor. Side-by-side compare available;
   "Diff with previous variant" toggle as in Prompt Arena.
4. **Pinned model** — single model picker, defaults to most-used. Behind
   **Advanced settings**:
   - `[ ] Run across multiple models` — disabled, badge **Coming soon**.
5. **Voting setup** — defaults:
   - **Default mode: Slider** (1–10, "How well does this match the
     intent?"). Rationale below.
   - **Persona panels default ON.** A first-class card on the launch
     step is checked by default, with a conservative voter count (10,
     not 30) and a pre-filtered persona library scoped to personas
     whose tags overlap the campaign's categories. Operator must
     explicitly select which personas to include from the pre-filtered
     list — no auto-checking. Free-text refine field surfaces the full
     library when the pre-filter is too narrow.
6. **Cost preview & launch** — final step renders the estimated total
   cost (generations + persona judging) prominently, immediately above
   the Launch button. If the estimate exceeds a soft threshold ($5 in
   V1; tunable), an explicit confirmation checkbox is required before
   Launch enables. The existing `costCeilingUsd` machinery on
   `simulated_runs` continues to enforce a hard stop at runtime.

The minimum-3 test prompts rule is firm — system-prompt evaluation is
meaningless on a single user prompt because the whole point is
across-suite robustness. No upper-bound warning is shown; the
leaderboard's confidence intervals make sample-size thinness visible
in the data itself, which we trust more than warning toasts that
operators learn to dismiss.

### Voter

For each test prompt, the voter sees outputs from each system-prompt
variant (anonymized). Voter UI is identical to Prompt Arena's; the
difference is invisible. Across N variants × M test prompts, a voter
sees up to N×M comparisons; in practice the campaign uses Slider or
Multi-Axis (one rating per output) to keep the load tractable.

### Leaderboard

Two views, switchable:

- **Across-suite rollup** (default): each variant's overall rating across
  all M test prompts, computed by Bradley-Terry (tournament/best-of-N) or
  mean+CI (slider/multi-axis).
- **Per-prompt drill-down**: heatmap-style table — rows are variants,
  columns are test prompts, cells are scores. Reveals where a variant
  excels or breaks. The most useful view for actual decisions.

Each variant row carries a **"based on N test prompts" badge** with a
tooltip explaining how confidence intervals widen with smaller suites.
This is the primary self-correcting nudge for thin suites — no toast,
no warning. Sample-size hygiene becomes a property of the data
display, not a popup.

The system-prompt text of each variant is displayed in a side panel,
collapsed by default (system prompts run long). Click to expand and
read in full.

### Default voting mode

**Slider** (1–10). Rationale:

- Suite evaluation needs absolute scores, not pairwise — the operator
  asks "is variant 3 actually good across the suite?" not "is variant 3
  better than variant 2 here." Slider answers the absolute question.
- Bradley-Terry over a 30-prompt × 4-variant grid is a lot of votes for
  a human to deliver; sliders are 1 click per (test prompt, variant).
- Multi-Axis is the strong V2 default for brand-voice work — split into
  "tone match," "clarity," "compliance." Surface this prominently in the
  mode picker copy: when an operator picks Slider on a system-prompt
  arena, suggest "Use Multi-Axis to score multiple dimensions."

Tournament works for 4 variants but is bracket-heavy on a 30-prompt
suite — strongly de-emphasized in copy for this kind.

### Persona integration (the wedge)

System-prompt arenas are where personas earn their keep. The flow:

1. Operator launches a system-prompt arena, picks Slider mode.
2. Launch step shows a persona-panel card, **checked by default**, with
   the persona picker pre-filtered by category-tag overlap. Voter
   count defaults to a conservative 10. The card sits next to a cost
   estimate so the operator sees both the value and the spend in one
   glance.
3. Operator confirms the selected personas (no auto-checking — the
   pre-filter ranks matches but the operator picks). Launches.
4. The existing simulated-runs pipeline (Plan 02) runs judges that
   score each (variant × test prompt) cell from each persona's
   perspective.
5. The leaderboard shows two layers: human votes (when present) and
   per-persona aggregates. The "By persona" cut on the existing
   ratings schema renders directly.

This is unique in the eval space. Competitors offer "LLM as judge."
ModelArena offers "your target audience as judge, on your suite, against
your variants." The product positioning leans on this aggressively.

The default-on choice is deliberate: persona panels are the wedge, and
making them an opt-in feature operators have to discover dilutes the
value to the majority who'd benefit. Org-level cost concerns are
addressed at the cost layer (visible estimate, soft-threshold
confirmation, hard ceiling on the run) rather than by hiding the
feature.

## What's reused vs. new

| Surface | Status |
|---|---|
| Database schema | Reuses Plan 04's foundation. No new tables. |
| Voting modes | All six work as-is; defaults change. |
| Bradley-Terry pipeline | Unchanged. |
| Simulated runs + personas | First-class fit. UI nudges operators toward this on every launch. |
| Exports | Column "Model" → "System Prompt Variant" per-kind. |
| Voter URL / dedup | Unchanged. |

New work, mostly UI:

- **Suite step** with inline test-prompt entry and a future "Load from
  Collection" hook.
- **Variants step** with tall editors for full system-prompt bodies.
- **Heatmap leaderboard** view for per-(variant, test-prompt) scores.
- **Launch-step persona suggestion card** with auto-selected starter
  personas based on campaign tags.
- **Onboarding copy** for `kind='system_prompt'`.

## Templating

None. The variant is the system message verbatim; the test prompt is
the user message verbatim. Templating in system prompts is a
capability-creep trap — operators who want it can use Prompt Arena
instead.

## Validation rules

- Variants ≥ 2.
- Test prompts ≥ 3.
- Variant text length ≤ 16,000 chars (system prompts run long; 2× the
  user-prompt limit).
- Test prompt length ≤ 8,000 chars.
- Pinned model required and selectable.

## Surfaces touched

| File / area | Change |
|---|---|
| `src/pages/CreateCampaign.tsx` | Suite step + variant editors |
| `src/pages/CampaignDashboard.tsx` | Heatmap leaderboard, persona-aware results panel |
| `src/server/routes/campaigns/generate.ts` | Per-kind call assembly (Plan 04) |
| `src/server/campaigns/detail.ts` | Heatmap payload shape |
| `src/server/simulated-runs/launch.ts` | Suggest-personas helper based on tags |
| `src/server/campaigns/export.ts` + `export-xlsx.ts` | Per-kind columns |

Tests:
- `src/server/__tests__/`: per-kind generate assembly with system
  message routing, persona auto-suggest helper, validation rules.
- `src/pages/__tests__/`: suite step, variant editors, heatmap render.

## V1 scope

- Single pinned model.
- Inline test-prompt entry (Plan 03 Collections deferred but seam left
  in place).
- Slider default mode; Multi-Axis suggested in copy.
- Heatmap drill-down + across-suite rollup.
- Persona panel suggestion on launch.
- Cross-model toggle wired but disabled (Coming soon).

## Deferred / out of scope

- Plan 03 Collections integration (suite picker). Lands when Plan 03
  ships; the seam in the suite step accepts a `collectionId` prop in
  V2.
- Cross-model fan-out (UI present, feature later).
- Variant lineage tracking ("v3 derived from v1"). Personas already
  have `derivedFromPersonaId`; mirror that pattern when needed.
- "Suggest tweaks" — LLM-driven suggestions for refining a system
  prompt based on weak per-prompt scores. Compelling but a separate
  feature surface.
- Multi-axis with auto-suggested dimensions (e.g., infer "tone, clarity,
  compliance" from the campaign's stated goal). V2.

## Risks

- **Suite drift: voters quit before scoring all M variants × N test
  prompts.** With M=4 and N=10, that's 40 sliders per voter — feasible
  but at the upper edge. Mitigation: voter-side per-test-prompt
  interleaving (already supported by the existing voting flow), plus
  honest copy on the landing page about expected time.
- **Personas mask real audience preferences.** Persona prompts are
  approximations. Mitigation: the existing Plan 02 calibration loop
  against real votes (when available) — show calibration delta in the
  leaderboard so operators understand what they're trusting.
- **System prompts contain sensitive content (proprietary brand voice,
  internal policy).** Operators may not want voters reading them.
  Mitigation: voters never see system-prompt text, only outputs. Side
  panel showing variants is operator-only (already the case via
  `withOperator`).
- **The "best variant" varies per prompt.** Realistic outcome — no
  variant wins everywhere. Mitigation: the heatmap surfaces this
  honestly. Don't manufacture a single winner if the data doesn't
  support one.

## Resolved decisions

Captured from the 2026-04-28 review pass; previously listed as open.

- **Minimum suite size**: hard block at 3, no upper-bound warning.
  Confidence intervals on the leaderboard surface sample-size
  thinness in the data; a "based on N test prompts" badge per variant
  reinforces it. Warnings get dismissed; CIs don't.
- **Persona panel default**: ON, with conservative voter count (10),
  prominent cost estimate, and a soft-threshold confirmation
  checkbox above $5. Org cost governance is addressed at the cost
  layer, not by making the wedge an opt-in.
- **Category-driven persona matching**: pre-filter the persona library
  by tag overlap with the campaign's categories — surface matches at
  the top, count of matches inline ("3 personas match"). Operator
  selects explicitly; nothing is auto-checked. Free-text refine field
  exposes the full library when the pre-filter is too narrow.
