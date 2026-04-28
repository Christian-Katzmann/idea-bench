# Phase 1 — Suite, Variants, Persona Suggestion, Cost Preview

**Status:** Pending

---

## Purpose

Build the operator-facing surface for system-prompt arenas: suite step
(inline prompt entry with a Plan 03 Collections seam), system-prompt
variant editors, persona suggestion card with category-tag pre-filter,
and cost preview at launch.

---

## Scope

**This phase DOES:**

- Adds the suite step to `CreateCampaign.tsx` (inline prompt entry,
  ≥3 minimum, future Collections-loader seam).
- Adds the system-prompt variant editors (tall multi-line, 16,000 char
  limit each, side-by-side compare).
- Adds the pinned-model picker with cross-model "Coming soon" toggle.
- Adds the persona suggestion card (default ON, voter count 10,
  pre-filtered by category tag overlap, explicit selection only).
- Adds the cost preview card at launch step with soft-threshold
  confirmation above $5.
- Wires Slider as the default voting mode for new system-prompt-arena
  prompts.

**This phase does NOT:**

- Build the heatmap leaderboard (Phase 2).
- Implement Plan 03 Collections (seam left in place).
- Build cross-model fan-out.

---

## Entry Criteria

- [ ] Phase 0 complete; `ALLOWED_KINDS` widened; drift review signed
- [ ] Plan 04 Phase 2 (kind picker) complete with system-prompt-arena
      option enabled

---

## Exit Criteria

- [ ] All P1 batches marked complete
- [ ] Operator can run a system-prompt arena end-to-end via UI
- [ ] Voter sees Slider UI by default
- [ ] Persona panel triggers on launch with selected personas
- [ ] Cost preview renders with accurate estimate
- [ ] `npm run lint && npm run build && npx vitest run` passes

---

## Batches

| Batch | File | Description | Status |
|---|---|---|---|
| P1-A | [P1-A-suite-and-variants.md](./P1-A-suite-and-variants.md) | Suite step + variants editors + pinned model | Pending |
| P1-B | [P1-B-persona-card.md](./P1-B-persona-card.md) | Persona suggestion card with pre-filter | Pending |
| P1-C | [P1-C-cost-preview.md](./P1-C-cost-preview.md) | Cost preview at launch step | Pending |

---

## Key Files

| File | Changes |
|---|---|
| `src/pages/CreateCampaign.tsx` | Suite step, variants step, persona card, cost preview |
| `src/server/simulated-runs/launch.ts` | Persona pre-filter helper |
| `src/server/simulated-runs/cost.ts` | Cost-preview helper (per-kind branch if needed) |
| `src/lib/api.ts` | Type extensions for system-prompt-arena payload |

---

## Reference

- PRD: `docs/roadmap/06-system-prompt-arena.md` →
  "Operator (campaign creation)" / "Persona integration"
