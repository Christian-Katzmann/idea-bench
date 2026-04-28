# P2-A: Heatmap Leaderboard

The one genuinely new UI primitive in the trio. Treat it with care.

---

## Tasks

### Component

- [ ] **P2-1**: Heatmap component.
      File: `src/components/heatmap/HeatmapLeaderboard.tsx` (new)
      Action: Pure presentational component. Props: `{ variants: Variant[]; suitePrompts: SuitePrompt[]; cells: { variantId: string; promptId: string; score: number; ciLow?: number; ciHigh?: number; sampleSize: number }[] }`. Renders rows = variants (with display_name), columns = suite prompts (truncated to a fixed width with hover-expand). Cells colored by score using a discrete 5-step palette (e.g., red / amber / neutral / mint / green) — not a continuous gradient.
      Ref: PRD → "Leaderboard" → heatmap

- [ ] **P2-2**: Cell hover tooltip.
      File: `src/components/heatmap/HeatmapLeaderboard.tsx`
      Action: Hovering a cell shows the variant name, suite-prompt name, score, CI range, sample size, and a "View generation" link.

- [ ] **P2-3**: Empty / sparse state.
      File: `src/components/heatmap/HeatmapLeaderboard.tsx`
      Action: When no votes exist for a cell, render it greyed out. Don't infer "0" from missing data.

- [ ] **P2-4**: Component tests.
      File: `src/components/heatmap/__tests__/HeatmapLeaderboard.test.tsx` (new)
      Action: Render with fixture data; confirm cell rendering, sparse-cell handling, tooltip content.

### Dashboard integration

- [ ] **P2-5**: Toggle between rollup and heatmap.
      File: `src/pages/CampaignDashboard.tsx`
      Action: For `kind='system_prompt'`, the leaderboard area gets a tab/toggle: "Across suite (default)" / "By prompt (heatmap)". The rollup view reuses the existing leaderboard component with a "Variant" column. The heatmap view renders the new component.

- [ ] **P2-6**: Per-kind dashboard payload.
      File: `src/server/campaigns/detail.ts`
      Action: For `kind='system_prompt'`, the detail payload includes per-(variant, suite-prompt) score rows, each variant's full text (for the side panel), and the suite-prompt list. Don't blow up the payload for model arenas.

---

## Notes

- The 5-step discrete palette is a deliberate UX call from the PRD's
  spirit ("don't manufacture a single winner if the data doesn't
  support one"). Continuous gradients trick the eye into seeing
  precision that isn't there.
- If a heatmap library tempting becomes appropriate (e.g., very large
  suites with virtualization needs), flag it before pulling — V1's
  expected suite size is 5–30 prompts, well within hand-rolled
  capability.

---

## Verification

```bash
cd modelarena
npm run lint
npm run build
npx vitest run src/components/heatmap/__tests__/
```
