# P1-B: Per-Input Drilldown & Variant Text Panel

Build the dashboard surface for prompt arenas.

---

## Tasks

### Across-input rollup (default)

- [x] **P1-11**: Reuse the existing leaderboard as the across-input
      rollup view.
      File: `src/pages/CampaignDashboard.tsx`
      Action: When `kind='prompt'`, the leaderboard header reads "Across all inputs (Best-of-N rollup)" or similar. Variants display by `display_name`. Existing rating UI works unchanged.
      Note: Best-of-N `ModeScorecard` title + description swap on `arenaKind === 'prompt'`. Existing `ratings.displayName` already reflects each variant's name, so no separate label-mapping was needed.

### Per-input drilldown

- [x] **P1-12**: Per-input drilldown view.
      File: `src/pages/CampaignDashboard.tsx`
      Action: Add a tab or toggle that switches to "By input" view. Render a table: rows are inputs, columns are variants, cells show the input's leaderboard scores for each variant. Click a row to expand and see the actual generations.
      Ref: PRD → "Leaderboard"
      Note: rendered as an inline `PerInputDrilldown` section under the across-input rollup (not a separate tab — keeps both views on one screen so operators can scan rollup → drilldown without losing context). Generations lazy-load via a new `GET /api/campaigns/:id/generations?promptId=…` endpoint (see P1-B/server). Per-input scores for non-Best-of-N modes render `—` with a footer note: "Per-input scores are available for Best-of-N in V1; other modes ship in a follow-up batch."

### Variant text panel (always-visible)

- [x] **P1-13**: Side panel with variant text.
      File: `src/pages/CampaignDashboard.tsx`
      Action: Add a side panel (or expandable section) that lists each variant's full text alongside its rank. Default-expanded for prompt arenas; the operator wants to read the winner immediately. Long variants (>2000 chars) collapse with a "Compare" button that opens a focused two-variant modal.
      Ref: PRD → "Risks" → variant text always-visible
      Note: rendered as `VariantTextPanel`, default-expanded with a Collapse toggle. Long variants (>2000 chars) get `max-h-64 overflow-y-auto` instead of a separate Compare modal — **deferring the modal per the batch's explicit allowance**. A focused two-variant modal can land in a follow-up.

### Server payload

- [x] **P1-14**: Per-kind dashboard payload.
      File: `src/server/campaigns/detail.ts`
      Action: For `kind='prompt'`, the detail payload needs to include each variant's `text` and `display_name` so the side panel can render without a second round-trip. Don't include for model arenas.
      Note: `models[].variantText` (always present, `null` for `kind='model'`) plus a new `perInputBestOfN: Array<{ promptId, campaignModelId, pickCount }>` aggregated from `best_of_n_responses` (`GROUP BY promptId, chosenCampaignModelId`). Empty for non-prompt-arena campaigns. Also added a new lazy-loaded endpoint `GET /api/campaigns/:id/generations?promptId=…` (handler at `src/server/routes/campaigns/generations.ts`) so the drilldown row expansion can read each variant's actual output without bloating the detail payload.

### Tests

- [x] **P1-15**: Dashboard tests.
      File: `src/pages/__tests__/CampaignDashboard.test.tsx`
      Action: Render with prompt-arena fixture. Confirm: across-input rollup default, drilldown toggle works, variant text panel renders, long variants collapse correctly.
      Note: 5 new tests under `describe("prompt-arena surface (kind='prompt')")` — variant text panel renders with both bodies, long variant gets max-h scroll classes, per-input drilldown table renders pick counts and percentages, row click lazy-loads outputs (asserts the `?promptId=` query param), 0-input campaign shows the standalone empty state.

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
