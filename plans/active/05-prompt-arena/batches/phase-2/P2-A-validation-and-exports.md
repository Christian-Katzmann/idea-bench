# P2-A: Activate-Time Validation & Export Label Verification

---

## Tasks

### Validation

- [ ] **P2-1**: Templating-mismatch validation at activate.
      File: `src/server/routes/campaigns/activate.ts`
      Action: For `kind='prompt'` campaigns, before flipping status to `active`:
        - If any variant contains `{{input}}` AND `prompts` is empty AND `standalone_variants` is false → reject with `400 { error: '{{input}} token used but no inputs configured', variantIds: [...] }`.
        - If `standalone_variants` is true → ignore `prompts` entirely (no token check).
        - Otherwise → proceed.
      Ref: PRD → "Templating" → activate-time error rules

- [ ] **P2-2**: Tests for validation.
      File: `src/server/__tests__/activate.test.ts`
      Action: Cover the three branches above. Confirm error includes the offending variant IDs.

### Exports

- [ ] **P2-3**: Verify per-kind column header.
      File: `src/server/__tests__/exports.test.ts`
      Action: Snapshot tests for prompt-arena CSV + XLSX. Header for the contestant column should read "Variant" not "Model".

### Header pill

- [ ] **P2-4**: Verify pill text.
      File: `src/pages/CampaignDashboard.tsx`
      Action: Confirm the Plan 04-added kind pill renders "Prompt arena" for `kind='prompt'`. Tweak copy if Plan 04 left it as a generic placeholder.

---

## Verification

```bash
cd modelarena
npm run lint
npx vitest run
```
