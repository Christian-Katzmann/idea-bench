# P2-B: CI Badge, Variant Text Panel, Persona Results, Exports

---

## Tasks

### CI badge

- [x] **P2-7**: "based on N test prompts" badge.
      File: `src/pages/CampaignDashboard.tsx`
      Action: For each variant row in both rollup and heatmap views, render a small badge reading "based on N test prompts". On hover, show a tooltip explaining: "Wider error bars = less confidence. Add more test prompts to your suite to tighten."
      Ref: PRD → "Resolved decisions" → minimum suite size
      Done: New exported `SuiteSizeBadge` component renders alongside the leaderboard-view toggle for `kind === 'system_prompt'` (visible regardless of which view the operator picks). Reads "based on N test prompt[s]" with the count as `font-mono` for emphasis. Hover tooltip carries the explainer copy: "Wider error bars on the leaderboard mean less confidence. Add more test prompts to your suite to tighten the bounds."
      **Single-N model deviation:** the PRD framing was "each variant row carries…", but in V1 every variant runs against the same campaign-level suite — N is identical for all rows. A single shared badge says it once instead of duplicating per-row noise; the source comment documents the V1-only assumption and notes that a per-variant treatment would land if a future flow lets variants opt out of specific prompts.

### Variant text side panel

- [x] **P2-8**: Side panel.
      File: `src/pages/CampaignDashboard.tsx`
      Action: Add a side panel listing each variant's full system-prompt text. **Collapsed by default** — system prompts run long. Click to expand and read in full. Side panel is operator-only (renders inside `CampaignDashboard`, which is already operator-gated).
      Ref: PRD → "Leaderboard"
      Done: Reused Plan 05's `VariantTextPanel` with two new optional props — `defaultCollapsed` (system-prompt arenas open with `defaultCollapsed: true`; prompt arenas keep their default-expanded behavior) and `ratingFormat: 'percent' | 'slider'` (slider renders the ×100-stored rating divided down to 2 decimals; percent keeps the existing "37%" form). Header copy adapts per-format ("ranked by across-suite slider score" vs. "ranked by across-input pick rate"). Mounted on the dashboard for `arenaKind === 'system_prompt' && data.models.length > 0`, fed `sortedSliderRatings`.

### Persona-aware results panel

- [x] **P2-9**: Persona results card.
      File: `src/pages/CampaignDashboard.tsx`
      Action: When a persona panel ran for the campaign, show a "By persona" panel below the leaderboard. Reuses Plan 02's per-persona rating cut: rows = personas, columns = variants, cells = aggregate score. Click a persona to drill into per-(persona, variant, suite-prompt) cells.
      Ref: PRD → "Persona integration" → leaderboard layers
      Done: Plan 02's existing `PerPersonaRollup` component was filtering on `category === 'overall'` — that matches BT (tournament) ratings only, so system-prompt arenas (which default to slider, category `slider:overall`) saw an empty per-persona rollup even when persona panels ran. Widened the filter to a `PERSONA_AGGREGATE_CATEGORIES` set covering `overall`, `slider:overall`, `approve_reject:overall`, `best_of_n:overall`. The existing rollup UI now surfaces correctly under `ratingsSource === 'simulated'` for any per-mode aggregate.
      **Out of scope for V1:** the per-(persona, variant, suite-prompt) drilldown ("Click a persona to drill into…"). The minimum-viable bar covers the across-suite per-persona view; the per-prompt drilldown is the natural extension once operators ask for it.

### Exports

- [x] **P2-10**: Verify per-kind column header.
      File: `src/server/__tests__/exports.test.ts`
      Action: Snapshot test for `kind='system_prompt'`. Header reads "System Prompt Variant" (verbose form per PRD). Adjust Plan 04's export switch if needed.
      Done: Plan 04 already shipped both the CSV (`csvHeadersForKind('system_prompt')`) and XLSX (`xlsxHeadersForKind('system_prompt')`) per-kind branches, and existing tests at lines 128, 152, 176, 244 of `exports.test.ts` already pin down "System Prompt Variant" verbose form + the `system_prompt_variant_*` snake_case CSV columns. No code change needed; test coverage already exists.

### Dashboard pill

- [x] **P2-11**: Verify pill text.
      File: `src/pages/CampaignDashboard.tsx`
      Action: Confirm Plan 04's kind pill reads "System-prompt arena" for `kind='system_prompt'`.
      Done: `KIND_PILL_LABELS.system_prompt = 'System-prompt arena'` (line 82 of `CampaignDashboard.tsx`); existing test at `CampaignDashboard.test.tsx:263` asserts the mapping. No code change needed.

---

## Notes

- The CI badge is the primary self-correcting nudge for thin suites.
  Make it visible but not noisy — small, neutral colored, hover for
  detail.
- The persona-aware panel only appears when there's persona data —
  don't render an empty panel for runs that didn't include personas.

---

## Verification

```bash
cd modelarena
npm run lint
npm run build
npx vitest run
npm run dev
# Manual: end-to-end run with persona panel; visit dashboard; confirm
# CI badge, side panel, and persona panel all render correctly.
```
