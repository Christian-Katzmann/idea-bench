# P2-B: CI Badge, Variant Text Panel, Persona Results, Exports

---

## Tasks

### CI badge

- [ ] **P2-7**: "based on N test prompts" badge.
      File: `src/pages/CampaignDashboard.tsx`
      Action: For each variant row in both rollup and heatmap views, render a small badge reading "based on N test prompts". On hover, show a tooltip explaining: "Wider error bars = less confidence. Add more test prompts to your suite to tighten."
      Ref: PRD → "Resolved decisions" → minimum suite size

### Variant text side panel

- [ ] **P2-8**: Side panel.
      File: `src/pages/CampaignDashboard.tsx`
      Action: Add a side panel listing each variant's full system-prompt text. **Collapsed by default** — system prompts run long. Click to expand and read in full. Side panel is operator-only (renders inside `CampaignDashboard`, which is already operator-gated).
      Ref: PRD → "Leaderboard"

### Persona-aware results panel

- [ ] **P2-9**: Persona results card.
      File: `src/pages/CampaignDashboard.tsx`
      Action: When a persona panel ran for the campaign, show a "By persona" panel below the leaderboard. Reuses Plan 02's per-persona rating cut: rows = personas, columns = variants, cells = aggregate score. Click a persona to drill into per-(persona, variant, suite-prompt) cells.
      Ref: PRD → "Persona integration" → leaderboard layers

### Exports

- [ ] **P2-10**: Verify per-kind column header.
      File: `src/server/__tests__/exports.test.ts`
      Action: Snapshot test for `kind='system_prompt'`. Header reads "System Prompt Variant" (verbose form per PRD). Adjust Plan 04's export switch if needed.

### Dashboard pill

- [ ] **P2-11**: Verify pill text.
      File: `src/pages/CampaignDashboard.tsx`
      Action: Confirm Plan 04's kind pill reads "System-prompt arena" for `kind='system_prompt'`.

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
