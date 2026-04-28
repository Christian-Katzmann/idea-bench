# Plan 05 — Prompt Arena

**Status:** Approved
**Owner:** Christian
**Created:** 2026-04-28
**Canonical spec:** [`docs/roadmap/05-prompt-arena.md`](../../../docs/roadmap/05-prompt-arena.md)

---

# Part 1: Summary

## What This Plan Is

Operators iterate on prompt variants with the model held fixed. They
write 2+ candidate prompts (with optional `{{input}}` templating across
a suite of inputs), pick a pinned model, and run the existing
ModelArena evaluation loop. Outputs are voted blind in any of the
existing voting modes; default mode is Best-of-N. Persona panels and
simulated runs reuse the existing pipelines.

## Why This Is the Right Move

- **Doubles the use cases per buyer.** The same operators running model
  arenas iterate on prompts constantly — today in playgrounds and
  spreadsheets. This brings that loop into ModelArena.
- **Heavy reuse.** No new tables, no new voting machinery. Plan 04's
  foundation provides the polymorphic contestant; voting modes,
  ratings, simulated runs, and exports work unchanged.
- **Templating that matches reality.** A single `{{input}}` slot reflects
  how prompt engineers actually iterate; standalone-variant mode covers
  the case where each variant is fully formed.

## Before / After

| Before | After |
|---|---|
| Prompt iteration happens in playgrounds + Slack | Prompt iteration happens in ModelArena with rigorous votes |
| No way to compare prompt variants on the same input | Per-input drilldown shows where each variant wins/loses |
| Operators forget which prompt produced which output | Variant text panel always-visible on the leaderboard |

## Timeline

| Milestone | Target | Status |
|---|---|---|
| Phase 0 Complete | TBD | Pending |
| Phase 1 Complete | TBD | Pending |
| Phase 2 Complete | TBD | Pending |

---

# Part 2: Specification

The canonical specification lives in
[`docs/roadmap/05-prompt-arena.md`](../../../docs/roadmap/05-prompt-arena.md).

This plan is a sequencing/task layer over that PRD. When in doubt about
*what* to build, defer to the PRD.

Phase-to-PRD mapping:

| Phase | PRD sections |
|---|---|
| Phase 0 | "What's reused vs. new" foundation; this phase mostly verifies and flips the flag |
| Phase 1 | "User-Facing Behavior" → Operator + Voter + Leaderboard; "Templating and held-constant context"; "Validation rules" |
| Phase 2 | "What's reused vs. new" → simulated-runs + exports rows; "Risks" → variant text always-visible |
| Tests | "Surfaces touched" → Tests subsection |

## Cross-cutting decisions (already resolved in PRD)

- Single pinned model (V1). Cross-model fan-out wired in UI as
  Coming-soon, disabled at API.
- `{{input}}` single-token templating with no-token append fallback.
  Standalone-variants mode skips substitution.
- Default voting mode: **Best-of-N**.
- Variant naming: editable `display_name` defaulting to "Variant N",
  operator-only — voters never see names (preserves blinding).
- Per-input context lives on `prompts.context`; campaign-level system
  message lives on `campaigns.pinned_system_prompt` (added in Plan 04).
- Variants do NOT carry per-variant context or system messages.

## Scope boundaries

### In scope
- Variants step in CreateCampaign for `kind='prompt'`.
- Pinned model picker, advanced disclosure (pinned system prompt,
  standalone-variants toggle, cross-model "Coming soon").
- Per-input drilldown leaderboard + variant text panel.
- Best-of-N default mode wiring.
- Per-kind export labels ("Variant" instead of "Model").

### Out of scope
- Cross-model fan-out (UI present, feature deferred).
- Named-slot templating (`{{customer_email}}` etc.).
- Variant lineage / version history.
- LLM-driven auto-variant suggestions.
- N-way diff view across more than two variants.

## References

- [05 PRD](../../../docs/roadmap/05-prompt-arena.md) — spec
- [04 Plan](../04-arena-modes-foundation/) — required foundation
- [Roadmap README](../../../docs/roadmap/README.md) — sequencing
- [`src/pages/CreateCampaign.tsx`](../../../src/pages/CreateCampaign.tsx) — wizard
- [`src/pages/CampaignDashboard.tsx`](../../../src/pages/CampaignDashboard.tsx) — leaderboard host
