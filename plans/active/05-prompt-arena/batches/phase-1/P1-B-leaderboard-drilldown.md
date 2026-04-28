# P1-B: Per-Input Drilldown & Variant Text Panel

Build the dashboard surface for prompt arenas.

---

## Tasks

### Across-input rollup (default)

- [ ] **P1-11**: Reuse the existing leaderboard as the across-input
      rollup view.
      File: `src/pages/CampaignDashboard.tsx`
      Action: When `kind='prompt'`, the leaderboard header reads "Across all inputs (Best-of-N rollup)" or similar. Variants display by `display_name`. Existing rating UI works unchanged.

### Per-input drilldown

- [ ] **P1-12**: Per-input drilldown view.
      File: `src/pages/CampaignDashboard.tsx`
      Action: Add a tab or toggle that switches to "By input" view. Render a table: rows are inputs, columns are variants, cells show the input's leaderboard scores for each variant. Click a row to expand and see the actual generations.
      Ref: PRD → "Leaderboard"

### Variant text panel (always-visible)

- [ ] **P1-13**: Side panel with variant text.
      File: `src/pages/CampaignDashboard.tsx`
      Action: Add a side panel (or expandable section) that lists each variant's full text alongside its rank. Default-expanded for prompt arenas; the operator wants to read the winner immediately. Long variants (>2000 chars) collapse with a "Compare" button that opens a focused two-variant modal.
      Ref: PRD → "Risks" → variant text always-visible

### Server payload

- [ ] **P1-14**: Per-kind dashboard payload.
      File: `src/server/campaigns/detail.ts`
      Action: For `kind='prompt'`, the detail payload needs to include each variant's `text` and `display_name` so the side panel can render without a second round-trip. Don't include for model arenas.

### Tests

- [ ] **P1-15**: Dashboard tests.
      File: `src/pages/__tests__/CampaignDashboard.test.tsx`
      Action: Render with prompt-arena fixture. Confirm: across-input rollup default, drilldown toggle works, variant text panel renders, long variants collapse correctly.

---

## Notes

- The drilldown view is the most-useful screen for operator decisions —
  per the PRD risks section, operators need to know *where* a variant
  wins. Treat this as the primary view in copy/affordances.
- The "Compare" modal can be deferred if it complicates this batch;
  flag in completion summary.

---

## Verification

```bash
cd modelarena
npm run lint
npm run build
npx vitest run src/pages/__tests__/CampaignDashboard.test.tsx
```
