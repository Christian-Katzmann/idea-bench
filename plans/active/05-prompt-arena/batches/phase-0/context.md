# Phase 0 Context

Compressed context for AI agents working on Phase 0.

---

## What We're Building (This Phase)

Two things: (1) widening the API feature flag added in Plan 04 so
`kind='prompt'` is accepted, and (2) a smoke test confirming the
foundation behaves correctly for prompt-arena use. No UI; this is the
"prove the pipes work" phase.

---

## Key Decisions (PRD-resolved)

- Single pinned model in V1.
- `{{input}}` single-token templating; standalone-variants is an
  Advanced opt-in (UI lands in Phase 1; the helper already supports the
  flag).
- Default voting mode: Best-of-N. If Plan 01's Best-of-N handler isn't
  live, fall back to Tournament for an interim — flag this in the
  Phase 1 batch when it lands.

---

## Dependencies

- Plan 04 schema migration applied
- `renderTemplate` exists at `src/server/lib/render-template.ts`
- `assembleCall` per-kind switch in `generate.ts`
- `parseCreatePayload` accepts `kind`, variants, pinned model

---

## File Patterns

| Pattern | Purpose |
|---|---|
| `api/campaigns/index.ts` | Feature flag (`ALLOWED_KINDS`) |
| `src/server/__tests__/*.test.ts` | Verification |

---

## Constraints

- Only modify the feature flag + test fixtures in this phase.
- Do not introduce new validation rules — Plan 04 owns those.

---

## Verification

```bash
cd modelarena
npm run lint
npx vitest run
```

---

## Quick Reference

- **Canonical spec:** `docs/roadmap/05-prompt-arena.md`
- **Foundation spec:** `docs/roadmap/04-arena-modes-foundation.md`
- **Phase README:** `batches/phase-0/README.md`
- **Helper:** `HELPER.md`
