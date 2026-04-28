# Phase 1 — Variants Creation Step & Per-Input Drilldown

**Status:** Complete

---

## Purpose

Build the operator-facing surface for prompt arenas: variants step in
the create wizard, pinned model picker with advanced disclosure, and
per-input drilldown on the campaign dashboard.

---

## Scope

**This phase DOES:**

- Adds the variants step in `CreateCampaign.tsx` (side-by-side editors
  for `kind='prompt'`).
- Adds the inputs step (replaces "Prompts" label per Plan 04 Phase 2).
- Adds the pinned-model picker with Advanced disclosure:
  - `pinnedSystemPrompt` field (optional)
  - Standalone-variants toggle
  - Cross-model toggle (disabled, "Coming soon")
- Adds per-input drilldown to `CampaignDashboard.tsx`.
- Adds the always-visible variant text panel on the dashboard.
- Wires Best-of-N as the default voting mode for new prompt-arena prompts.

**This phase does NOT:**

- Reflow any model-arena UI.
- Build cross-model fan-out (UI present, disabled).
- Build the heatmap (Plan 06).

---

## Entry Criteria

- [ ] Phase 0 complete; API accepts `kind='prompt'`
- [ ] Plan 04 Phase 2 complete (Step 0 kind picker exists, but
      prompt-arena option was disabled)

---

## Exit Criteria

- [ ] All P1 batches marked complete
- [ ] Operator can complete a prompt-arena campaign end-to-end via UI
- [ ] Voter sees Best-of-N UI (or fallback Tournament if Plan 01 Best-of-N
      not yet live — flagged in P1-A)
- [ ] Dashboard renders per-input drilldown + variant text panel
- [ ] `npm run lint && npm run build && npx vitest run` passes

---

## Batches

| Batch | File | Description | Status |
|---|---|---|---|
| P1-A | [P1-A-variants-step.md](./P1-A-variants-step.md) | Variants step + inputs step + pinned-model + Advanced disclosure | Complete |
| P1-B | [P1-B-leaderboard-drilldown.md](./P1-B-leaderboard-drilldown.md) | Per-input drilldown + variant text panel | Complete |
| P1-C | [P1-C-standalone-verbatim.md](./P1-C-standalone-verbatim.md) | Standalone-variants verbatim wiring (schema + assembleCall) | Complete |

---

## Key Files

| File | Changes |
|---|---|
| `src/pages/CreateCampaign.tsx` | Variants step, inputs step, pinned model + advanced |
| `src/pages/CampaignDashboard.tsx` | Per-input drilldown, variant text panel |
| `src/components/prompt/PromptDisplay.tsx` | Per-kind labelling helpers |
| `src/lib/api.ts` | Type extensions for prompt-arena payload |

---

## Verification

```bash
cd modelarena
npm run lint
npm run build
npx vitest run src/pages/__tests__/
npm run dev
# Manual: end-to-end prompt-arena create → vote → dashboard.
```

---

## Reference

- PRD: `docs/roadmap/05-prompt-arena.md` →
  "User-Facing Behavior" / "Templating and held-constant context"
