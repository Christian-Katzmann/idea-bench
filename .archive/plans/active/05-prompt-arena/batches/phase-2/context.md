# Phase 2 Context

Compressed context for AI agents working on Phase 2.

---

## What We're Building (This Phase)

The hardening pass: activate-time validation, export label
verification, and confirming simulated runs work for prompt arenas
without code changes (the underlying kind is invisible to judges).

---

## Key Decisions (PRD-resolved)

- Validation is at activate-time, not at vote-time. Errors surface in
  the launch step.
- Templating mismatches:
  - Token-bearing variants + zero inputs → reject at activate.
  - Inputs present + no token in any variant → allow (PRD's "input is
    appended after a blank line" fallback).
- Per-kind export labels were set up in Plan 04 Phase 2; this phase
  verifies they render correctly for prompt arenas.

---

## Dependencies from Earlier Phases

- Phase 0: API gate open.
- Phase 1: prompt-arena create flow shipping.
- Plan 04 Phase 2: kind pill + per-kind export switch wiring.
- Plan 02 (Simulated Runs): personas + simulated-run pipeline live for
  the simulated-runs verification batch.

---

## File Patterns

| Pattern | Purpose |
|---|---|
| `src/server/routes/campaigns/activate.ts` | Activate-time validation |
| `src/server/campaigns/export.ts`, `export-xlsx.ts` | Export labels |
| `src/server/simulated-runs/*.ts` | Simulated-run smoke verification |

---

## Constraints

- Only modify files listed in batch files.
- Simulated runs should require **no code changes** for prompt arenas.
  If they do, that's a Plan 04 oversight — flag and fix in 04 with a
  follow-up batch.

---

## Verification

```bash
cd modelarena
npm run lint
npm run build
npx vitest run
```

---

## Quick Reference

- **Canonical spec:** `docs/roadmap/05-prompt-arena.md`
- **Phase README:** `batches/phase-2/README.md`
- **Helper:** `HELPER.md`
