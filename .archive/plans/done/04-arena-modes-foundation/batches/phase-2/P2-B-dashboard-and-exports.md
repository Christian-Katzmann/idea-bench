# P2-B: Dashboard Kind Pill & Per-Kind Export Columns

Add the kind badge to the dashboard header and switch column headers
per kind in CSV/XLSX exports.

---

## Tasks

### Dashboard

- [x] **P2-5**: Kind pill in header.
      File: `src/pages/CampaignDashboard.tsx`
      Action: Add a small badge in the page header reading "Model arena" / "Prompt arena" / "System-prompt arena" based on `campaign.kind`. Use the existing badge component from `src/components/ui/`.

- [x] **P2-6**: Per-kind detail payload.
      File: `src/server/campaigns/detail.ts`
      Action: Surface `campaign.kind` and (when non-model) `pinnedProviderModelId`/`pinnedSystemPrompt` in the dashboard payload so the client can render the pill and any future kind-specific UI without a second round-trip. Don't expose `pinnedModelSnapshot` to the client unless needed; defer that to Plans 05/06.

### Exports

- [x] **P2-7**: CSV per-kind column headers.
      File: `src/server/campaigns/export.ts`
      Action: When `campaign.kind = 'prompt'`, the column currently labelled "Model" becomes "Variant". When `campaign.kind = 'system_prompt'`, becomes "System Prompt Variant". Row shape (rating, CI, game count, etc.) unchanged.

- [x] **P2-8**: XLSX per-kind column headers.
      File: `src/server/campaigns/export-xlsx.ts`
      Action: Mirror the CSV change in the XLSX export. Confirm bold/styled headers still render correctly.

### Tests

- [x] **P2-9**: Dashboard pill test.
      File: `src/pages/__tests__/CampaignDashboard.test.tsx`
      Action: Confirm the badge renders for each kind. Stub data for prompt/sys kinds (the API still rejects creating them in V1, but the dashboard component should handle the data shape).

- [x] **P2-10**: Export header tests.
      File: `src/server/__tests__/exports.test.ts` (new or extend)
      Action: Snapshot the first row of CSV/XLSX output for each kind.

---

## Notes

- Keep the badge visually subtle. It's an information cue, not a
  decoration. The dashboard already has a busy header; one new pill is
  fine.
- Export changes are header-only. Don't reshape rows.

---

## Verification

```bash
cd modelarena
npm run lint
npm run build
npx vitest run src/server/__tests__/exports.test.ts
```
