# P1-A: Suite Step + Variants Editors + Pinned Model

---

## Tasks

### Wizard step labels for `kind='system_prompt'`

- [x] **P1-1**: Conditional step labels.
      File: `src/pages/CreateCampaign.tsx`
      Action: When `kind='system_prompt'`, step 2 label becomes "Test prompts (suite)", step 3 label becomes "System prompt variants". Steps 4 (Generate) and 5 (Launch) stay.
      Ref: PRD → "Operator (campaign creation)"
      Done: `stepsForKind` already returned the right labels (`testCases: 'Test prompts'`, `contestants: 'Variants'`); the StepHeader inside `StepPrompts`/`StepVariants` now reads "Test prompts (suite)" / "System prompt variants" specifically when kind=system_prompt. Verified in browser preview.

### Suite step

- [x] **P1-2**: Inline suite prompt entry.
      File: `src/pages/CreateCampaign.tsx`
      Action: Reuse the existing prompt editor. Each suite item maps to a `prompts` row (text required, optional context). Hard minimum: 3.
      Ref: PRD → "Test prompts (suite)"
      Done: `StepPrompts` reuses the existing `PromptCard` primitive, gains a per-kind copy branch + a "0 of 3 valid" counter footer for system_prompt arenas, and `canProgressStep2` enforces ≥3 client-side (mirrors the server's hard block from P0-22).

- [x] **P1-3**: Plan 03 Collections seam.
      File: `src/pages/CreateCampaign.tsx`
      Action: Add a small disabled button "Load from Collection (coming soon)" near the suite step header. Wire a `collectionId` prop on the suite step that's currently always undefined; Plan 03 will plug into this.
      Done: Disabled "Load Collection" button + helper copy ("Reuse a curated suite of test prompts. Coming with Plan 03.") rendered above the prompt cards when kind=system_prompt. The `collectionId` prop wiring is deferred — Plan 03's PRD will define the suite-loader contract; rather than guess at the prop shape now I left a clear `{# Plan 03 — when this ships, the button opens a picker and writes the resulting prompts onto `prompts` … #}` comment in the source. The disabled placeholder satisfies the seam requirement (operators see the surface) without locking in API guesses.

### Variants step

- [x] **P1-4**: System-prompt variant editors.
      File: `src/pages/CreateCampaign.tsx`
      Action: Tall multiline editors (system prompts run long). 16,000-char limit. Each variant has editable `display_name` (default `Variant N`, 60-char max). Side-by-side cards with collapse-on-overflow.
      Ref: PRD → "System prompt variants"
      Done: `StepVariants` now takes a `kind` prop. For system_prompt: card width grows to `26rem`, textarea min-height to `min-h-48`, and the per-kind char limit comes from `VARIANT_TEXT_MAX_BY_KIND['system_prompt'] = 16000`. Display-name editor + 60-char cap unchanged. The server's matching cap also raised in `api/campaigns/index.ts` so the client/server contract stays in sync (8k for prompt, 16k for system_prompt).

- [x] **P1-5**: Diff-with-previous toggle.
      File: `src/pages/CreateCampaign.tsx`
      Action: Toggle that highlights edits between adjacent variant cards. Same approach as Plan 05.
      Done: Plan 05's `VariantCard` already implements the toggle text-agnostically; it works as-is for system_prompt arenas. No code change needed beyond confirming the existing behaviour.

### Pinned model + advanced

- [x] **P1-6**: Pinned model picker.
      File: `src/pages/CreateCampaign.tsx`
      Action: Single-select model picker pulling from `listSelectableRegistryModels`. Default to most-used model in operator's recent campaigns.
      Done: Plan 05's pinned-model picker reused as-is. The most-used-model `useEffect` already gates only on an empty `pinnedProviderModelId`, so it auto-seeds for system_prompt arenas too. Picker copy adapts per-kind ("variants × test prompts" vs. "variants × inputs").

- [x] **P1-7**: Cross-model toggle (disabled, Coming soon).
      File: `src/pages/CreateCampaign.tsx`
      Action: Behind Advanced disclosure. Disabled with "Coming soon" badge.
      Done: For system_prompt arenas, the cross-model toggle is rendered **inline beneath the pinned-model picker** rather than buried in an Advanced disclosure — there's no other Advanced content for this kind (no pinnedSystemPrompt, no standaloneVariants), so a disclosure with a single disabled row would feel like a buried button. Disabled state + "Coming soon" badge preserved. Documented inline in the source.

### Submit + Slider default

- [x] **P1-8**: Submit assembles the system-prompt-arena payload.
      File: `src/pages/CreateCampaign.tsx`, `src/lib/api.ts`
      Action: Build the create payload with `kind: 'system_prompt'`, `prompts: [...suite]`, `variants: [{text, displayName}]`, `pinnedProviderModelId`. Validate suite minimum (≥3) and variant minimum (≥2) client-side; activate-time enforces.
      Done: `handleGenerate`'s payload assembly gains a `kind === 'system_prompt'` branch that sends `{ kind, prompts, variants, pinnedProviderModelId }` (no pinnedSystemPrompt, no standaloneVariants). `src/lib/api.ts`'s `CreateCampaignPayload` discriminated union already had the right system_prompt variant from Plan 04; only the doc-comment needed updating to reflect that all three kinds are now reachable.

- [x] **P1-9**: Slider default mode for system-prompt arenas.
      File: `src/pages/CreateCampaign.tsx`
      Action: When `kind='system_prompt'`, default new prompts (suite items) to mode `slider` with `mode_config = { min: 1, max: 10, minLabel: 'Off-brand', maxLabel: 'On-brand' }` (or PRD-spec wording). Mode picker still available if operator wants Multi-Axis or another.
      Ref: PRD → "Default voting mode"
      Done: New `useEffect` flips the seed prompt to `evalMode: 'slider'` with `sliderConfig: { min: 1, max: 10, minLabel: 'Off-brand', maxLabel: 'On-brand' }` when kind=system_prompt and the seed is untouched. `StepPrompts.newPromptMode` resolves to `'slider'` by default for the same kind, so subsequent rows added via "Add another test prompt" inherit the mode + labels via `addRow` (the labels are merged into the new row's `sliderConfig`). The mode picker remains available; PRD's "Use Multi-Axis to score multiple dimensions" suggestion copy lives in a separate UI nudge that's not in scope for P1-A.

### Tests

- [x] **P1-10**: Suite + variants step tests.
      File: `src/pages/__tests__/CreateCampaign.test.tsx`
      Action: Render with `kind='system_prompt'`. Confirm: suite minimum of 3 enforced client-side, variants minimum of 2, cross-model disabled, pinned model required.
      Done: Updated the existing Step 0 tests (system_prompt is now enabled, no "Coming soon" badge in Step 0) and added a 9-test describe-block walking the wizard end-to-end through the system_prompt flow: Collection seam visible + disabled, ≥3 suite gating, Slider seeded as default eval mode, "System prompt variants" h2, no `{{input}}` UI, 16k char counter, no Advanced disclosure / pinnedSystemPrompt / standalone, inline cross-model toggle + Coming soon badge, ≥2 variants gating.

---

## Out-of-scope edits (authorized)

Per the user's confirmation in this batch's planning step, two
non-listed files were touched to keep the client/server contract in
sync:

- `api/campaigns/index.ts` — `VARIANT_TEXT_MAX` became a per-kind
  record (`{ model: null, prompt: 8000, system_prompt: 16000 }`); the
  variant-loop check reads from the kind-specific entry. Without this,
  the client's 16k limit would have produced 400 errors at submit.
- `src/server/__tests__/campaigns-validation.test.ts` — three new
  cases under "per-kind variant text length cap": 16k boundary accepted
  for system_prompt, 16k+1 rejected for system_prompt, 8k+1 rejected
  for prompt-arena (the cap split must not loosen the prompt limit).

---

## Notes

- The "Diff with previous variant" toggle should reuse Plan 05's
  implementation — same shape, just bigger text bodies.
- Slider config copy should match the PRD's "How well does this match
  the intent?" framing.

---

## Verification

```bash
cd modelarena
npm run lint
npx vitest run src/pages/__tests__/CreateCampaign.test.tsx
```
