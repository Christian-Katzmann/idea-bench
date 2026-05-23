# Phase 2 Context

Compressed context for AI agents working on Phase 2.

---

## What We're Building (This Phase)

The operator-facing scaffold for kinded campaigns: a kind picker at
Step 0, per-kind step labels, a kind pill on the dashboard, and
per-kind export column headers. Prompt and system-prompt kinds appear
in the picker as **disabled** ("Coming soon") — selecting them is
blocked. Plans 05 and 06 enable them when their feature flags flip.

---

## Key Decisions (PRD-resolved)

- Step 0 is the new step; the existing Basics/Prompts/Models/Generate/Launch
  steps shift to 1–5.
- Prompt and system-prompt kinds render in the picker but are disabled
  until 05/06 ship; operators see the upcoming surface area without
  being able to misuse it.
- The dashboard "kind pill" is operator-only; voters never see it.
- Voter UI is unchanged in this phase (and remains so).

---

## Dependencies from Earlier Phases

- Phase 0: schema columns (`kind`, `pinned_*`).
- Phase 1: API accepts/rejects per-kind payloads cleanly; feature flag
  works.

---

## File Patterns

| Pattern | Purpose |
|---|---|
| `src/pages/*.tsx` | Operator pages |
| `src/components/**/*.tsx` | Reusable UI |
| `src/server/campaigns/*.ts` | Server-side payload + export helpers |

---

## Constraints

- Only modify files listed in batch files.
- Do not regress the existing model-arena flow. Manual smoke test
  required before marking exit criteria.
- Use the existing shadcn/ui primitives in `src/components/ui/`.
  Do not introduce a new dependency.

---

## Verification

```bash
cd modelarena
npm run lint
npm run build
npx vitest run src/pages/__tests__
```

Manual smoke test:
- Create a model campaign end-to-end.
- Visit the dashboard for an existing campaign → kind pill reads
  "Model arena".
- Export CSV/XLSX → column headers unchanged for model arenas.

---

## Quick Reference

- **Canonical spec:** `docs/roadmap/04-arena-modes-foundation.md`
- **Phase README:** `batches/phase-2/README.md`
- **Helper:** `HELPER.md`
