# Phase 0 — Pre-Implementation Review & Feature-Flag Flip

**Status:** Pending

---

## Purpose

This plan was scaffolded the same day as Plans 04 and 05 — but ships
**after** them. Real-world drift between scaffold time and start time
is the norm, not the exception. Phase 0 mandates a structured review
pass *before* writing any code. Then it flips the API feature flag.

This is not optional. Skip it and you will spend Phase 1 silently
working around assumptions that no longer hold.

---

## Scope

**This phase DOES:**

- Re-reads the canonical PRD critically.
- Verifies that registry state, multi-mode handlers (especially
  Slider), persona library shape, and simulated-runs API surface still
  match what this scaffold assumes.
- Documents drift findings as "drift notes" before any code change.
- Widens `ALLOWED_KINDS` in `api/campaigns/index.ts` to include
  `'system_prompt'` once review is complete.
- Smoke-tests the API path with a `kind='system_prompt'` payload.

**This phase does NOT:**

- Touch any UI (Phase 1).
- Build the heatmap (Phase 2).
- Make new architectural decisions — only verify or flag drift.

---

## Entry Criteria

- [ ] Plan 04 (Foundation) shipped and merged
- [ ] Plan 05 (Prompt Arena) shipped and merged
- [ ] Plan 01 multi-mode handlers shipped (Slider in particular)
- [ ] Plan 02 (Simulated Runs + Personas) shipped, persona library
      seeded with starter personas

---

## Exit Criteria

- [ ] **P0-A drift review completed and findings documented** (in the
      batch file's "Drift Notes" section, even if "no drift")
- [ ] Any high-impact drift escalated to user before proceeding
- [ ] `ALLOWED_KINDS` widened to include `'system_prompt'`
- [ ] API smoke test passes for a minimal `kind='system_prompt'` payload
- [ ] `npm run lint && npm run build && npx vitest run` passes

---

## Batches

| Batch | File | Description | Status |
|---|---|---|---|
| P0-A | [P0-A-pre-implementation-review.md](./P0-A-pre-implementation-review.md) | **Review the PRD critically; document drift; flag before working around** | Pending |
| P0-B | [P0-B-flag-flip-and-verify.md](./P0-B-flag-flip-and-verify.md) | Widen feature flag; smoke-test API path | Pending |

---

## Verification

```bash
cd modelarena
npm run lint
npx vitest run src/server/__tests__/
```

---

## Reference

- PRD: `docs/roadmap/06-system-prompt-arena.md`
- Plan 04 PRD: `docs/roadmap/04-arena-modes-foundation.md`
- Plan 02 PRD: `docs/roadmap/02-simulated-runs.md`
