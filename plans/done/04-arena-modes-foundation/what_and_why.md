# Plan 04 — Arena Modes Foundation

**Status:** Approved
**Owner:** Christian
**Created:** 2026-04-28
**Canonical spec:** [`docs/roadmap/04-arena-modes-foundation.md`](../../../docs/roadmap/04-arena-modes-foundation.md)

---

# Part 1: Summary

## What This Plan Is

A schema generalization that turns ModelArena's campaign concept into a
kinded experiment (`model | prompt | system_prompt`). Adds a polymorphic
contestant column, a pinned generator model + snapshot, and an optional
held-constant system prompt. Ships nothing user-facing — unblocks Plans
05 (Prompt Arena) and 06 (System-Prompt Arena).

## Why This Is the Right Move

- **One generalization, three product features.** The same vary-X-hold-Y
  shape powers model arenas (today), prompt arenas (Plan 05), and
  system-prompt arenas (Plan 06). Building it once is much cheaper than
  three parallel stacks.
- **Reuse, not rebuild.** All voting modes, ratings, simulated runs,
  personas, exports, and voter UX work unchanged because every
  downstream concern operates on `generations`, not on what produced
  them.
- **Audit-safe registry edits.** Snapshotting the pinned model at
  launch (mirrors `simulated_runs.modelMix`) means future registry
  changes never retroactively rewrite a campaign's history.

## Before / After

| Before | After |
|---|---|
| Campaigns implicitly vary models across prompts | Campaigns declare a `kind` and vary the configured contestant |
| `campaign_models` holds only models | `campaign_models` is polymorphic; misnomer documented |
| Registry edits silently change historic campaign labels | Snapshot freezes registry state at launch |

## Timeline

| Milestone | Target | Status |
|---|---|---|
| Phase 0 Complete | TBD | Pending |
| Phase 1 Complete | TBD | Pending |
| Phase 2 Complete | TBD | Pending |

---

# Part 2: Specification

The canonical specification lives in
[`docs/roadmap/04-arena-modes-foundation.md`](../../../docs/roadmap/04-arena-modes-foundation.md).

This plan is a sequencing/task layer on top of that PRD. Do not duplicate
spec content here. When in doubt about *what* to build, defer to the PRD.
This document tracks *how* and *in what order*.

Phase-to-PRD mapping:

| Phase | PRD sections |
|---|---|
| Phase 0 | "What changes" → schema sections (`campaigns.kind`, polymorphic contestants, pinned generator model); "Migration" |
| Phase 1 | "What changes" → "Generation router"; "Surfaces touched" → API validation rows |
| Phase 2 | "What changes" → "Creation UX (operator)"; "Surfaces touched" → CreateCampaign, exports, dashboard rows |
| Tests | "Surfaces touched" → Tests subsection |

## Cross-cutting decisions (already resolved in PRD)

- `campaign_models` table is **not renamed**. Misnomer documented.
- Snapshot the pinned model at launch (`pinned_model_snapshot` jsonb).
  Backfilled onto existing model-arena rows in the same migration.
- Held-constant system prompt for prompt arenas
  (`pinned_system_prompt` text).
- API rejects `kind ∈ {prompt, system_prompt}` until Plans 05/06 flip
  their flags.

## Scope boundaries

### In scope (this plan)
- Schema + types for `campaign_kind`, polymorphic `campaign_models`,
  pinned-model snapshot, pinned-system-prompt.
- Migration including backfill of existing model-arena snapshots.
- Per-kind API validation + generation routing.
- Step 0 kind selector in CreateCampaign + per-kind labels.
- Per-kind export column headers + dashboard "kind pill."

### Out of scope
- Any user-reachable Prompt Arena behavior (Plan 05).
- Any user-reachable System-Prompt Arena behavior (Plan 06).
- Multi-model fan-out beyond the disabled "Coming soon" toggle.
- Renaming `campaign_models` or `campaign_model_id` FK columns.

## References

- [04 PRD](../../../docs/roadmap/04-arena-modes-foundation.md) — spec
- [05 PRD](../../../docs/roadmap/05-prompt-arena.md) — first dependent plan
- [06 PRD](../../../docs/roadmap/06-system-prompt-arena.md) — second dependent plan
- [Roadmap README](../../../docs/roadmap/README.md) — sequencing
- [`src/server/db/schema.ts`](../../../src/server/db/schema.ts) — current schema
- [`drizzle/`](../../../drizzle/) — migrations directory
