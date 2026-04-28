# P1-A: Suite Step + Variants Editors + Pinned Model

---

## Tasks

### Wizard step labels for `kind='system_prompt'`

- [ ] **P1-1**: Conditional step labels.
      File: `src/pages/CreateCampaign.tsx`
      Action: When `kind='system_prompt'`, step 2 label becomes "Test prompts (suite)", step 3 label becomes "System prompt variants". Steps 4 (Generate) and 5 (Launch) stay.
      Ref: PRD → "Operator (campaign creation)"

### Suite step

- [ ] **P1-2**: Inline suite prompt entry.
      File: `src/pages/CreateCampaign.tsx`
      Action: Reuse the existing prompt editor. Each suite item maps to a `prompts` row (text required, optional context). Hard minimum: 3.
      Ref: PRD → "Test prompts (suite)"

- [ ] **P1-3**: Plan 03 Collections seam.
      File: `src/pages/CreateCampaign.tsx`
      Action: Add a small disabled button "Load from Collection (coming soon)" near the suite step header. Wire a `collectionId` prop on the suite step that's currently always undefined; Plan 03 will plug into this.

### Variants step

- [ ] **P1-4**: System-prompt variant editors.
      File: `src/pages/CreateCampaign.tsx`
      Action: Tall multiline editors (system prompts run long). 16,000-char limit. Each variant has editable `display_name` (default `Variant N`, 60-char max). Side-by-side cards with collapse-on-overflow.
      Ref: PRD → "System prompt variants"

- [ ] **P1-5**: Diff-with-previous toggle.
      File: `src/pages/CreateCampaign.tsx`
      Action: Toggle that highlights edits between adjacent variant cards. Same approach as Plan 05.

### Pinned model + advanced

- [ ] **P1-6**: Pinned model picker.
      File: `src/pages/CreateCampaign.tsx`
      Action: Single-select model picker pulling from `listSelectableRegistryModels`. Default to most-used model in operator's recent campaigns.

- [ ] **P1-7**: Cross-model toggle (disabled, Coming soon).
      File: `src/pages/CreateCampaign.tsx`
      Action: Behind Advanced disclosure. Disabled with "Coming soon" badge.

### Submit + Slider default

- [ ] **P1-8**: Submit assembles the system-prompt-arena payload.
      File: `src/pages/CreateCampaign.tsx`, `src/lib/api.ts`
      Action: Build the create payload with `kind: 'system_prompt'`, `prompts: [...suite]`, `variants: [{text, displayName}]`, `pinnedProviderModelId`. Validate suite minimum (≥3) and variant minimum (≥2) client-side; activate-time enforces.

- [ ] **P1-9**: Slider default mode for system-prompt arenas.
      File: `src/pages/CreateCampaign.tsx`
      Action: When `kind='system_prompt'`, default new prompts (suite items) to mode `slider` with `mode_config = { min: 1, max: 10, minLabel: 'Off-brand', maxLabel: 'On-brand' }` (or PRD-spec wording). Mode picker still available if operator wants Multi-Axis or another.
      Ref: PRD → "Default voting mode"

### Tests

- [ ] **P1-10**: Suite + variants step tests.
      File: `src/pages/__tests__/CreateCampaign.test.tsx`
      Action: Render with `kind='system_prompt'`. Confirm: suite minimum of 3 enforced client-side, variants minimum of 2, cross-model disabled, pinned model required.

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
