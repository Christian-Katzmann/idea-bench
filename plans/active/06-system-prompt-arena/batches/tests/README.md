# Tests — Plan 06 Cross-Phase Coverage

Test batches that span phases or verify integration. Run after the
listed prerequisite batches.

---

## When to Run

| Test Batch | Run After | What It Tests |
|---|---|---|
| T-A | P0-B | Foundation works for system-prompt-arena payloads |
| T-B | P1-A, P1-B, P1-C | Suite + variants + persona card + cost preview |
| T-C | P2-A | Heatmap component renders correctly |
| T-D | P2-B | CI badge + variant panel + persona results + exports |
| T-E | All | Regression: model + prompt arenas unchanged after Plan 06 |

---

## Entry Criteria

- [ ] Required implementation batches complete
- [ ] `npm run lint && npm run build` passes
- [ ] Existing tests passing

---

## Test Organization

```
src/server/__tests__/
  system-prompt-arena-api.test.ts   # P0-B
  generate-assembly.test.ts          # extends Plan 04 + 05
  persona-suggest.test.ts            # P1-B
  cost.test.ts                       # P1-C (extend or new)
  exports.test.ts                    # P2-B (extend)
src/pages/__tests__/
  CreateCampaign.test.tsx            # P1-A, P1-B, P1-C
  CampaignDashboard.test.tsx         # P2-A, P2-B
src/components/heatmap/__tests__/
  HeatmapLeaderboard.test.tsx        # P2-A
```

---

## Coverage Targets

Specific behaviors that must have tests:

- API accepts `kind='system_prompt'` and rejects below suite minimum
- Per-kind generation assembly: system message = variant text
- Pinned-model snapshot captured at activate
- Persona pre-filter ranks by tag overlap
- Cost preview includes generation + judging
- Soft-threshold checkbox required above $5
- Heatmap renders cells, sparse cells, and tooltips
- "By persona" rating cut renders only when persona data exists
- Per-kind export columns
- Model + prompt arena flows unchanged (regression)
