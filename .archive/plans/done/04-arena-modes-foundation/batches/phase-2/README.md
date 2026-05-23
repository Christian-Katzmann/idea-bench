# Phase 2 — Creation UX & Per-Kind Labels

**Status:** Complete

---

## Purpose

Add the kind-selection Step 0 to the creation wizard and switch labels
across the operator surfaces (dashboard pill, exports). Plans 05 and
06 build their kind-specific creation steps **on top of** this scaffold.

---

## Scope

**This phase DOES:**

- Adds Step 0 (Kind picker) to `CreateCampaign.tsx`. Only the `model`
  option is selectable at first; the `prompt` and `system_prompt`
  options render disabled with "Coming soon" hints.
- Adds per-kind step labels in the wizard (e.g., "Models" vs.
  "Variants" — text only; the actual variant editors land in Plans
  05/06).
- Adds the "kind pill" badge to the campaign dashboard header.
- Switches per-kind column headers in CSV/XLSX exports.
- Updates the per-kind dashboard payload in `detail.ts`.

**This phase does NOT:**

- Implement the variant editor for prompt/system-prompt kinds (Plans 05/06).
- Implement the heatmap leaderboard (Plan 06).
- Implement onboarding (separate session — see roadmap).

---

## Entry Criteria

- [ ] Phase 1 complete; API rejects non-model kinds cleanly
- [ ] All P1 batches marked `[x]`
- [ ] Existing model-arena flow regression-clean

---

## Exit Criteria

- [ ] All P2 batches marked complete
- [ ] `npm run lint && npm run build && npx vitest run` passes
- [ ] Operator can see Step 0 with disabled prompt/system-prompt
      options
- [ ] Existing model-arena create flow still works end to end
- [ ] Exports for existing campaigns unchanged in column structure

---

## Batches

| Batch | File | Description | Status |
|---|---|---|---|
| P2-A | [P2-A-creation-step-zero.md](./P2-A-creation-step-zero.md) | Step 0 kind picker + per-kind step labels | Complete |
| P2-B | [P2-B-dashboard-and-exports.md](./P2-B-dashboard-and-exports.md) | Kind pill on dashboard + per-kind export columns | Complete |

---

## Key Files

| File | Changes |
|---|---|
| `src/pages/CreateCampaign.tsx` | Step 0 + per-kind step labels |
| `src/pages/CampaignDashboard.tsx` | Kind pill in header |
| `src/server/campaigns/detail.ts` | Per-kind dashboard payload |
| `src/server/campaigns/export.ts` | Per-kind CSV column headers |
| `src/server/campaigns/export-xlsx.ts` | Per-kind XLSX column headers |

---

## Verification

```bash
cd modelarena
npm run lint
npm run build
npx vitest run
npm run dev
# Manual: visit /create → see Step 0; pick Model → existing flow works.
# Visit existing campaign dashboard → kind pill reads "Model arena".
```

---

## Reference

- PRD: `docs/roadmap/04-arena-modes-foundation.md` →
  "Creation UX (operator)" / "Surfaces touched"
