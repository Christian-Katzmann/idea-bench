# Phase 0 — Feature-flag flip + foundation verify

**Status:** Pending

---

## Purpose

Open the API gate so `kind='prompt'` payloads are accepted, and verify
Plan 04's foundation (schema, generation router, templating helper) is
sound for prompt-arena use before building any UI.

---

## Scope

**This phase DOES:**

- Widens `ALLOWED_KINDS` in `api/campaigns/index.ts` to include `'prompt'`.
- Smoke-tests the `kind='prompt'` create + generate path against Plan 04's
  routing using a minimal API-only fixture.
- Confirms `renderTemplate` behavior matches the PRD (substitution,
  no-token append, standalone passthrough).

**This phase does NOT:**

- Touch any UI (Phase 1).
- Add validation rules beyond what Plan 04 already enforces.

---

## Entry Criteria

- [ ] Plan 04 Phase 0–2 complete and merged
- [ ] Plan 04 migration applied to dev DB
- [ ] Plan 04 generation routing landed (`renderTemplate`, per-kind
      assembly)
- [ ] Plan 01 multi-mode handlers for Best-of-N live (or fall back to
      Tournament for V0; flagged in PRD risk)

---

## Exit Criteria

- [ ] All P0 batches marked complete
- [ ] `kind='prompt'` round-trips through create → generate → activate
      with the API only (no UI yet)
- [ ] `renderTemplate` test matrix passes

---

## Batches

| Batch | File | Description | Status |
|---|---|---|---|
| P0-A | [P0-A-flag-flip-and-verify.md](./P0-A-flag-flip-and-verify.md) | Widen `ALLOWED_KINDS`; smoke-test the API path; reverify renderTemplate | Pending |

---

## Verification

```bash
cd modelarena
npm run lint
npx vitest run src/server/__tests__/render-template.test.ts
npx vitest run src/server/__tests__/generate-assembly.test.ts
```

---

## Reference

- PRD: `docs/roadmap/05-prompt-arena.md`
- Plan 04 PRD: `docs/roadmap/04-arena-modes-foundation.md`
