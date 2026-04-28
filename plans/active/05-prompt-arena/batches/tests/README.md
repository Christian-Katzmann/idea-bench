# Tests — Plan 05 Cross-Phase Coverage

Test batches that span phases or verify integration. Run after the
listed prerequisite batches.

---

## When to Run

| Test Batch | Run After | What It Tests |
|---|---|---|
| T-A | P0-A | Foundation works for prompt-arena payloads |
| T-B | P1-A, P1-B | Variants step + drilldown UI |
| T-C | P2-A, P2-B | Validation + exports + simulated-runs end-to-end |
| T-D | All | Regression: model arenas unchanged after Plan 05 |

---

## Entry Criteria

- [ ] Required implementation batches complete
- [ ] `npm run lint && npm run build` passes
- [ ] Existing tests passing

---

## Test Organization

```
src/server/__tests__/
  prompt-arena-api.test.ts       # P0-A
  generate-assembly.test.ts      # extends Plan 04
  activate.test.ts               # P2-A
  exports.test.ts                # P2-A
  simulated-prompt-arena.test.ts # P2-B
src/pages/__tests__/
  CreateCampaign.test.tsx        # P1-A
  CampaignDashboard.test.tsx     # P1-B
```

---

## Coverage Targets

Specific behaviors that must have tests:

- API accepts `kind='prompt'` and rejects without feature flag
- Templating: substitute, append, standalone passthrough
- Activate-time validation rejects bad token/input combinations
- Per-input drilldown renders for `kind='prompt'`
- Voter UI excludes variant `display_name` (blinding)
- Simulated runs work end-to-end on a prompt arena
- Model-arena flow unchanged by Plan 05 (regression)
