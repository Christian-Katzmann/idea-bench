# Plan 06 — System-Prompt Arena

**Status:** Approved
**Owner:** Christian
**Created:** 2026-04-28
**Canonical spec:** [`docs/roadmap/06-system-prompt-arena.md`](../../../docs/roadmap/06-system-prompt-arena.md)

---

# Part 1: Summary

## What This Plan Is

Operators test system-prompt variants (brand voice, agent personalities,
safety prefaces) across a suite of representative user prompts on a
fixed model. Voting defaults to Slider; persona panels default to ON
with cost transparency at launch. The leaderboard ships a heatmap
showing where each variant excels or breaks across the suite.

## Why This Is the Right Move

- **The wedge feature.** "Your target audience as judge, on your
  suite, against your variants" is unique in the eval space.
- **Heavy reuse, modest new work.** Plan 04 owns the schema; Plan 02
  owns personas + simulated runs. The new code is mostly UI.
- **High-leverage for the buyer.** VPs of Product / Heads of Content
  use system prompts to shape thousands of customer touchpoints.
  Picking the right one is high-value; picking it rigorously is
  rarely tooled.

## Before / After

| Before | After |
|---|---|
| System prompts tested informally — playgrounds + vibes | Rigorous suite-wide eval with confidence intervals |
| LLM-as-judge feels like a dev-tool toy | Persona panels reframe "your target audience as judge" |
| No way to see where a variant excels vs. breaks | Heatmap surfaces per-(variant, prompt) outcomes honestly |

## Timeline

| Milestone | Target | Status |
|---|---|---|
| Phase 0 Complete | TBD | Pending |
| Phase 1 Complete | TBD | Pending |
| Phase 2 Complete | TBD | Pending |

---

# Part 2: Specification

The canonical specification lives in
[`docs/roadmap/06-system-prompt-arena.md`](../../../docs/roadmap/06-system-prompt-arena.md).

This plan is a sequencing/task layer over that PRD. **Re-read the PRD
before starting Phase 0 — see P0-A's "before you implement" note.**

Phase-to-PRD mapping:

| Phase | PRD sections |
|---|---|
| Phase 0 | "What's reused vs. new" (verify); ramp-up review pass |
| Phase 1 | "User-Facing Behavior" → Operator + Voter; "Persona integration (the wedge)"; "Validation rules" |
| Phase 2 | "Leaderboard" → heatmap; "Risks" mitigations |
| Tests | "Surfaces touched" → Tests subsection |

## Cross-cutting decisions (already resolved in PRD)

- Single pinned model (V1). Cross-model fan-out as Coming-soon UI only.
- No templating. Variant = system message verbatim; suite items =
  user messages verbatim.
- Default voting mode: **Slider** (1–10). Multi-Axis suggested in copy.
- Suite minimum: 3 prompts (hard block). No upper-bound warning;
  confidence intervals on the leaderboard make sample-size thinness
  visible.
- Persona panel default: ON, voter count 10, pre-filtered by category
  tag overlap; no auto-checking — operator selects explicitly.
- Cost preview prominent at launch; soft-threshold confirmation above
  $5; existing `costCeilingUsd` enforces the hard stop at runtime.

## Scope boundaries

### In scope
- Suite step in CreateCampaign (inline test-prompt entry; future Plan 03
  Collections seam).
- System-prompt variant editors (tall, multi-line; 16,000-char limit).
- Pinned model picker, cross-model toggle (Coming soon).
- Persona suggestion card with pre-filter + cost preview.
- Heatmap leaderboard component + across-suite rollup.
- "based on N test prompts" badge with CI tooltip.

### Out of scope
- Plan 03 Collections suite picker (seam left in place).
- Cross-model fan-out (UI present, feature deferred).
- Multi-Axis with auto-suggested dimensions.
- LLM-driven variant rewriting suggestions.
- Variant lineage tracking.

## References

- [06 PRD](../../../docs/roadmap/06-system-prompt-arena.md) — spec
- [04 Plan](../04-arena-modes-foundation/) — required foundation
- [05 Plan](../05-prompt-arena/) — sibling kind, useful patterns
- [02 PRD](../../../docs/roadmap/02-simulated-runs.md) — personas + simulated runs (dependency)
- [Roadmap README](../../../docs/roadmap/README.md) — sequencing
