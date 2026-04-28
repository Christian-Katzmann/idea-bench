# Phase 1 Context

Compressed context for AI agents working on Phase 1.

---

## What We're Building (This Phase)

The visible surface of prompt arenas. Two batches: the create wizard's
variants step (side-by-side editors with the advanced disclosure) and
the campaign dashboard's per-input drilldown + variant text panel.
Voter UX inherits Best-of-N from Plan 01.

---

## Key Decisions (PRD-resolved)

- Variants ≥ 2; inputs ≥ 0 (standalone allows 0).
- Variant `display_name` editable, default "Variant N", operator-only
  (voters never see).
- Always-visible (default-expanded) variant text panel on the
  leaderboard so operators can read winners, not just see "Variant 3
  won."
- Pinned system prompt is the held-constant system message; lives at
  the campaign level, NOT the variant level.

---

## Dependencies from Phase 0

- API accepts `kind='prompt'` payload.
- `renderTemplate` works correctly across substitution / append /
  standalone modes.
- Activate handler writes the snapshot.

---

## File Patterns

| Pattern | Purpose |
|---|---|
| `src/pages/CreateCampaign.tsx` | Wizard host (already has Step 0 from Plan 04) |
| `src/pages/CampaignDashboard.tsx` | Leaderboard host |
| `src/components/**/*.tsx` | Existing shadcn/ui primitives |
| `src/lib/api.ts` | Shared types between client + server |

---

## Constraints

- Only modify files listed in batch files.
- Use existing UI primitives (TipTap, shadcn). Do not introduce new
  dependencies.
- Voter must never see variant `display_name`. Audit the voting
  payload.
- Best-of-N default: if Plan 01's handler isn't live yet, fall back to
  Tournament with a clear note in the batch.

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

- **Canonical spec:** `docs/roadmap/05-prompt-arena.md`
- **Phase README:** `batches/phase-1/README.md`
- **Helper:** `HELPER.md`
