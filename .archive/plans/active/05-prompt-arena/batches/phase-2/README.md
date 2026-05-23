# Phase 2 — Polish: Validation, Exports, Simulated-Runs Verification

**Status:** Pending

---

## Purpose

Activate-time validation, per-kind export labels, and verification that
simulated runs (especially persona panels) work for prompt arenas.

---

## Scope

**This phase DOES:**

- Adds activate-time validation (token-bearing variants without inputs
  → error; inputs without templating in any variant → warning, not
  error).
- Switches export column headers ("Model" → "Variant") for prompt
  arenas (Plan 04 Phase 2 set up the per-kind switch; verify it's
  wired correctly).
- "Prompt arena" header pill on the dashboard (Plan 04 Phase 2 added
  the kind pill; verify text reads "Prompt arena").
- Smoke-tests simulated runs against a prompt-arena campaign — generic
  panels and persona panels should both work because the underlying
  kind is invisible to the judge.

**This phase does NOT:**

- Build cross-model fan-out.
- Build LLM-suggested variant rewrites.

---

## Entry Criteria

- [ ] Phase 1 complete; operators can run prompt arenas end-to-end via UI

---

## Exit Criteria

- [ ] All P2 batches marked complete
- [ ] Activate-time validation surfaces errors inline
- [ ] CSV/XLSX exports for prompt arenas use "Variant" column header
- [ ] Dashboard header pill reads "Prompt arena"
- [ ] Simulated runs work end-to-end on a prompt arena (manual + test)

---

## Batches

| Batch | File | Description | Status |
|---|---|---|---|
| P2-A | [P2-A-validation-and-exports.md](./P2-A-validation-and-exports.md) | Activate-time validation + export label verification | Pending |
| P2-B | [P2-B-simulated-runs-smoke.md](./P2-B-simulated-runs-smoke.md) | Confirm simulated + persona runs work for prompt arenas | Pending |

---

## Reference

- PRD: `docs/roadmap/05-prompt-arena.md` →
  "Validation rules" / "What's reused vs. new"
