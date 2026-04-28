# P1-C: Cost Preview at Launch Step

Add the prominent cost preview with soft-threshold confirmation.

---

## Tasks

### Cost helper

- [ ] **P1-17**: Per-kind cost preview.
      File: `src/server/simulated-runs/cost.ts`
      Action: Confirm the existing cost-estimator helper handles `kind='system_prompt'` correctly. The estimate must include both:
        (a) Generation cost: `variants × suite × pinned_model_per_call_cost`.
        (b) Persona judging cost: `personas × voters × suite × judge_model_per_call_cost`.
      If the helper doesn't already do both, extend it with a per-kind branch. Add tests.
      Ref: PRD → "Cost preview & launch"

- [ ] **P1-18**: Cost preview API endpoint.
      File: `api/campaigns/[id]/[action].ts`
      Action: Add a `cost-estimate` action returning `{ generationUsd, simulatedRunUsd, totalUsd }` based on the campaign's current draft state + provided persona/voter selection. Used by the front-end to render the preview live.

### UI

- [ ] **P1-19**: Cost preview card on the launch step.
      File: `src/pages/CreateCampaign.tsx`
      Action: Render the estimate prominently above the Launch button. Format: large number with breakdown ("Generations: $X · Persona judging: $Y · Total: $Z"). Updates live as the operator changes voter count or persona selection.
      Ref: PRD → "Cost preview & launch"

- [ ] **P1-20**: Soft-threshold confirmation.
      File: `src/pages/CreateCampaign.tsx`
      Action: When estimated total exceeds $5 (constant for V1), require a checkbox "I understand this run costs about $X" before the Launch button enables. Below $5 the checkbox is hidden.
      Ref: PRD → "Resolved decisions" → persona panel

- [ ] **P1-21**: Pass `costCeilingUsd` to the simulated-run launch.
      File: `src/pages/CreateCampaign.tsx`
      Action: Set `costCeilingUsd` on the simulated-run create payload to `2 × estimatedTotal` (PRD-default). The runner uses this as the runtime hard stop.

### Tests

- [ ] **P1-22**: Cost preview tests.
      File: `src/pages/__tests__/CreateCampaign.test.tsx`
      Action: Render the launch step with various voter/persona counts. Confirm: estimate updates live, soft-threshold checkbox appears above $5, Launch button disabled until checkbox is checked.

- [ ] **P1-23**: Cost helper tests.
      File: `src/server/__tests__/cost.test.ts` (new or extend)
      Action: Cover system-prompt-arena cost calculation: generations + judging across various sizes.

---

## Notes

- The $5 threshold is intentionally low for V1 — orgs notice $50
  charges, not $0.50. We can raise it later if it becomes friction.
- The cost preview must update without a page reload as the operator
  tunes voter count and persona selection. Consider using TanStack
  Query with a debounced fetch to the `cost-estimate` endpoint.

---

## Verification

```bash
cd modelarena
npm run lint
npm run build
npx vitest run
```
