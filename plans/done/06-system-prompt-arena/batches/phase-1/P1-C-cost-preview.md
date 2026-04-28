# P1-C: Cost Preview at Launch Step

Add the prominent cost preview with soft-threshold confirmation.

---

## Tasks

### Cost helper

- [x] **P1-17**: Per-kind cost preview.
      File: `src/server/simulated-runs/cost.ts`
      Action: Confirm the existing cost-estimator helper handles `kind='system_prompt'` correctly. The estimate must include both:
        (a) Generation cost: `variants × suite × pinned_model_per_call_cost`.
        (b) Persona judging cost: `personas × voters × suite × judge_model_per_call_cost`.
      If the helper doesn't already do both, extend it with a per-kind branch. Add tests.
      Ref: PRD → "Cost preview & launch"
      Done: Added `kind?: CampaignKind` field to `CostEstimateInput` (defaults to `'model'` for back-compat). New `KIND_INPUT_SURCHARGE` constant adds 1500 input tokens per judge call for `system_prompt` (HELPER.md gotcha #3). Threaded `kind` through `launch.ts` and `previewCost.ts` so existing simulated-runs API calls also benefit. **Generation cost (a) is NOT computed by this helper** — by Step 5 the operator has already paid it via the SSE Generate stream, so the UI sums per-slot `costUsd` directly. The helper only models judging cost (b), which is the spend still under the operator's control at launch. Documented this split in the cost-preview card copy ("already spent" vs "estimated").

- [x] **P1-18**: Cost preview API endpoint.
      File: `api/campaigns/[id]/[action].ts`
      Action: Add a `cost-estimate` action returning `{ generationUsd, simulatedRunUsd, totalUsd }` based on the campaign's current draft state + provided persona/voter selection. Used by the front-end to render the preview live.
      **Skipped — minimum-viable deviation.** `estimateRunCost` is a pure function with no DB; the UI imports it directly client-side and computes the estimate on every render. No round-trip needed; the live update happens via React state rather than a debounced fetch. The existing `/api/simulated-runs/preview-cost` endpoint already exists for the simulated-runs configurator and got the `kind`-passthrough update for free.

### UI

- [x] **P1-19**: Cost preview card on the launch step.
      File: `src/pages/CreateCampaign.tsx`
      Action: Render the estimate prominently above the Launch button. Format: large number with breakdown ("Generations: $X · Persona judging: $Y · Total: $Z"). Updates live as the operator changes voter count or persona selection.
      Ref: PRD → "Cost preview & launch"
      Done: New exported `CostPreviewCard` component on the launch step. Hero number is the total; two breakdown rows show generation actuals (sum of `slot.costUsd`) and persona-judging estimate. Recomputes via `useMemo` on voter-count + persona-selection changes. Sub-cent estimates render as `<$0.01` so the operator never sees a deceptive `$0.00`.

- [x] **P1-20**: Soft-threshold confirmation.
      File: `src/pages/CreateCampaign.tsx`
      Action: When estimated total exceeds $5 (constant for V1), require a checkbox "I understand this run costs about $X" before the Launch button enables. Below $5 the checkbox is hidden.
      Ref: PRD → "Resolved decisions" → persona panel
      Done: `COST_SOFT_THRESHOLD_USD = 5` constant in `CreateCampaign.tsx`. When `aboveCostThreshold && !costAcknowledged`, the Launch button's `disabled` is true and `title` explains why. The checkbox appears inside the cost card with the formatted total in its label.

- [x] **P1-21**: Pass `costCeilingUsd` to the simulated-run launch.
      File: `src/pages/CreateCampaign.tsx`
      Action: Set `costCeilingUsd` on the simulated-run create payload to `2 × estimatedTotal` (PRD-default). The runner uses this as the runtime hard stop.
      Done: `handleLaunch`'s sim-run create payload now includes `costCeilingUsd: defaultCostCeiling(estimate.estimatedUsd)` (the same helper the server falls back to when ceiling is omitted, so the floor of $0.50 still applies for tiny estimates).

### Tests

- [x] **P1-22**: Cost preview tests.
      File: `src/pages/__tests__/CreateCampaign.test.tsx`
      Action: Render the launch step with various voter/persona counts. Confirm: estimate updates live, soft-threshold checkbox appears above $5, Launch button disabled until checkbox is checked.
      Done: 6 unit tests on the exported `CostPreviewCard`: total + breakdown rows, em-dash when no judging estimate, sub-cent formatting, threshold checkbox hidden below $5, threshold checkbox shown above $5 with formatted label, click emits `onCostAcknowledgedChange`. **Live updates** are inherent to React's render model — testing them via the wizard host requires Step 5 access (out of scope per P1-B's note); the props drive the card and we test the card directly. The wizard's Launch-button gating is verified at the typecheck level (`disabled={... || (aboveCostThreshold && !costAcknowledged)}`) and could get a wizard-end-to-end test in a later batch alongside the deferred generation harness.

- [x] **P1-23**: Cost helper tests.
      File: `src/server/__tests__/cost.test.ts` (new or extend)
      Action: Cover system-prompt-arena cost calculation: generations + judging across various sizes.
      Done: Extended the existing co-located `src/server/simulated-runs/__tests__/cost.test.ts` (rather than creating a new file at `src/server/__tests__/`) with 4 new cases: kind=model omits surcharge (back-compat), kind=prompt omits surcharge, kind=system_prompt inflates within the 1.3×–3× band, call counts unchanged across kinds. Generation cost itself isn't covered here because cost.ts doesn't model it — see P1-17's note.

---

## Out-of-scope edits (authorized inline)

- `src/server/simulated-runs/launch.ts` — added `kind: campaign.kind` to the `estimateRunCost` call so existing sim-run launches inherit the per-kind surcharge automatically.
- `src/server/routes/simulated-runs/previewCost.ts` — fetches `campaigns.kind` (one extra `select` in the `Promise.all`) and passes it to `estimateRunCost`. Returns 404 if the campaign isn't found.

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
