# Phase 1 Context

Compressed context for AI agents working on Phase 1.

---

## What We're Building (This Phase)

The visible surface of system-prompt arenas. Three batches: suite +
variants + pinned model in the create wizard; persona suggestion card
(default-on, pre-filtered, explicit selection); cost preview at the
launch step with soft-threshold confirmation.

---

## Key Decisions (PRD-resolved)

- Suite minimum 3, no upper warning. Confidence intervals on the
  leaderboard handle sample-size hygiene.
- Variants ≥ 2; variant text ≤ 16,000 chars.
- Persona panel default: ON. Voter count: 10. Selection: explicit
  (operator picks from pre-filtered list; no auto-checking).
- Cost preview is mandatory at launch. Soft threshold: $5 (tunable).
  Hard ceiling enforced by `simulated_runs.costCeilingUsd` at runtime.
- Slider is the default voting mode. Multi-Axis is suggested in copy
  ("Use Multi-Axis to score multiple dimensions").

---

## Dependencies from Phase 0

- API gate open for `kind='system_prompt'`.
- Drift findings reviewed — adjust this phase's batches if needed.

---

## Dependencies from Other Plans

- Plan 02: starter personas seeded, persona library shape stable.
- Plan 02: simulated-run launch endpoint accepts `panelType`,
  `voterCount`, `personaIds`, `costCeilingUsd`.
- Plan 02: `cost.ts` helper exists; may need a per-kind branch.

---

## File Patterns

| Pattern | Purpose |
|---|---|
| `src/pages/CreateCampaign.tsx` | Wizard host |
| `src/server/simulated-runs/*.ts` | Persona + cost helpers |
| `src/lib/api.ts` | Shared types |

---

## Constraints

- Only modify files listed in batch files.
- Use existing UI primitives (TipTap, shadcn).
- No auto-checking of personas — operator selects explicitly.
- Voter never sees variant text or `display_name`.

---

## Verification

```bash
cd modelarena
npm run lint
npm run build
npx vitest run
npm run dev
```

---

## Quick Reference

- **Canonical spec:** `docs/roadmap/06-system-prompt-arena.md`
- **Phase README:** `batches/phase-1/README.md`
- **Helper:** `HELPER.md`
