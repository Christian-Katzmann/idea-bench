# Tests — Plan 04 Cross-Phase Coverage

Test batches that span phases or verify integration. Run after the
listed prerequisite batches.

---

## When to Run

| Test Batch | Run After | What It Tests |
|---|---|---|
| T-A | P0-A | Schema migration applies cleanly; types compile; backfill works |
| T-B | P1-A, P1-B | Per-kind validation + generation assembly + feature-flag rejection |
| T-C | P2-A, P2-B | Step 0 rendering, kind pill on dashboard, per-kind export columns |
| T-D | P0–P2 all complete | End-to-end: existing model arenas regression-clean; can't create prompt/system-prompt kind via API |

---

## Entry Criteria

- [ ] Required implementation batches complete
- [ ] `npm run lint && npm run build` passes
- [ ] Existing tests passing

---

## Exit Criteria

- [ ] All test cases written and passing
- [ ] No regressions in existing test suite

---

## Batches

| Batch | File | Description | Prerequisites |
|---|---|---|---|
| T-A | T-A-schema.md | Schema + migration + backfill tests | P0-A |
| T-B | T-B-api-and-routing.md | API validation + generation assembly tests | P1-A, P1-B |
| T-C | T-C-ux.md | UI tests for Step 0, kind pill, export columns | P2-A, P2-B |
| T-D | T-D-regression.md | End-to-end model-arena regression check | All P0–P2 |

Test batch files are stubs — fill in concrete cases as the
corresponding implementation batches land.

---

## Test Organization

```
src/server/__tests__/
  campaigns-validation.test.ts   # P1-A
  render-template.test.ts        # P1-B
  generate-assembly.test.ts      # P1-B
  exports.test.ts                # P2-B
src/pages/__tests__/
  CreateCampaign.test.tsx        # P2-A
  CampaignDashboard.test.tsx     # P2-B
```

---

## Coverage Targets

No formal coverage threshold for this plan. Specific behaviors that
must have tests:

- Per-kind validation rejection paths
- Per-kind generation assembly (each branch)
- Feature-flag rejection at the API
- Existing model-arena flow byte-for-byte regression
- Migration applies + backfill populates expected rows
