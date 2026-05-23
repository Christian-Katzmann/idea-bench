# P2-A: Heatmap Leaderboard

The one genuinely new UI primitive in the trio. Treat it with care.

---

## Tasks

### Component

- [x] **P2-1**: Heatmap component.
      File: `src/components/heatmap/HeatmapLeaderboard.tsx` (new)
      Action: Pure presentational component. Props: `{ variants: Variant[]; suitePrompts: SuitePrompt[]; cells: { variantId: string; promptId: string; score: number; ciLow?: number; ciHigh?: number; sampleSize: number }[] }`. Renders rows = variants (with display_name), columns = suite prompts (truncated to a fixed width with hover-expand). Cells colored by score using a discrete 5-step palette (e.g., red / amber / neutral / mint / green) — not a continuous gradient.
      Ref: PRD → "Leaderboard" → heatmap
      Done: New file; pure presentational; rows = variants, columns = suite prompts (sorted by `orderIndex`, truncated label with full text in column-header `title`). Sticky left "Variant" column for horizontal scroll. 5-step discrete palette via Tailwind classes (destructive/20, destructive/10, card, success/15, success/30) — no continuous gradient. Score normalises against an `scoreRange` prop (default 1–10 for slider; clamps out-of-range values).

- [x] **P2-2**: Cell hover tooltip.
      File: `src/components/heatmap/HeatmapLeaderboard.tsx`
      Action: Hovering a cell shows the variant name, suite-prompt name, score, CI range, sample size, and a "View generation" link.
      Done: Inline tooltip on hover/focus showing variant name, prompt label, score (2-decimal), 95% CI range (or "n < 2" when CI bounds are null), sample size, and an optional "View generation →" button. The button only renders when the parent passes `onViewGeneration` — keeps the component composable for future drilldown wiring.

- [x] **P2-3**: Empty / sparse state.
      File: `src/components/heatmap/HeatmapLeaderboard.tsx`
      Action: When no votes exist for a cell, render it greyed out. Don't infer "0" from missing data.
      Done: Sparse cells (missing or `sampleSize === 0`) render as a greyed em-dash with `aria-label="…: no responses yet"` for screen readers — never inferred 0. The component also has a top-level empty-state hint when variants or prompts arrays are empty.

- [x] **P2-4**: Component tests.
      File: `src/components/heatmap/__tests__/HeatmapLeaderboard.test.tsx` (new)
      Action: Render with fixture data; confirm cell rendering, sparse-cell handling, tooltip content.
      Done: 10 tests cover row × column rendering, sparse fallback, sampleSize=0 sparse path, tooltip on hover (score + CI + sample), n<2 CI fallback, "View generation" handler wiring, missing handler hides the link, suite ordering by `orderIndex` (passed in reverse to prove the sort), empty-state hint, out-of-range score clamping.

### Dashboard integration

- [x] **P2-5**: Toggle between rollup and heatmap.
      File: `src/pages/CampaignDashboard.tsx`
      Action: For `kind='system_prompt'`, the leaderboard area gets a tab/toggle: "Across suite (default)" / "By prompt (heatmap)". The rollup view reuses the existing leaderboard component with a "Variant" column. The heatmap view renders the new component.
      Done: New `leaderboardView` state ('rollup' | 'heatmap'). Inline `role="tablist"` toggle renders only on `arenaKind === 'system_prompt'`, sitting between the source filter and the leaderboard panels. The existing per-mode panels (BT, slider, approve_reject, best-of-N, multi-axis, persona rollup) are wrapped in a single conditional fragment that hides them when `leaderboardView === 'heatmap'`. A `SystemPromptHeatmapSection` helper adapts the server payload to the component's input contract — renames `campaignModelId → variantId`, builds truncated prompt labels, builds the heatmap variant list from `data.models`.

- [x] **P2-6**: Per-kind dashboard payload.
      File: `src/server/campaigns/detail.ts`
      Action: For `kind='system_prompt'`, the detail payload includes per-(variant, suite-prompt) score rows, each variant's full text (for the side panel), and the suite-prompt list. Don't blow up the payload for model arenas.
      Done: `CampaignDetailData.heatmapCells` is the new field. Server aggregates `slider_responses` grouped by `(promptId, campaignModelId)` for `kind='system_prompt'`, computing mean + 95% normal-approx CI + sample size. Empty `[]` for other kinds — payload stays cheap. Multi-axis / approve-reject / tournament / best-of-N modes are out of V1 scope; system-prompt arenas default to slider so this covers the realistic flow. Variant text was already in the payload via Plan 05's `models[].variantText` field, and the suite-prompt list via `prompts[]` — no additional plumbing needed there.

---

## Out-of-scope edits (authorized inline)

The type extension cascaded into a few places not listed in P2-A:

- `src/lib/api.ts` — added `heatmapCells` to the `CampaignDetail` type so the dashboard can read it without `any` casts.
- `api/campaigns/[id]/index.ts` — the `GET /api/campaigns/:id` handler enumerates response fields explicitly. Without adding `heatmapCells: detail.heatmapCells` to the response object, the field would land server-side but never reach the client. The browser smoke caught this — pre-fix the API returned `{ kind, …, perInputBestOfN }` only; post-fix it includes `heatmapCells: []` for non-system-prompt arenas and a populated array otherwise.
- `src/server/__tests__/exports.test.ts`, `src/server/campaigns/__tests__/export-xlsx.test.ts`, `src/server/campaigns/__tests__/export.test.ts` — three test fixtures construct `CampaignDetailData` literals; each gained `heatmapCells: []` to satisfy the new required type field.

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
