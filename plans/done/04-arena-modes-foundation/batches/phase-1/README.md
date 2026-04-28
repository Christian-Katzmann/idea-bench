# Phase 1 — Per-Kind API Validation & Generation Routing

**Status:** Complete

---

## Purpose

Wire the new schema through the API layer: validate per-kind payloads,
route generation calls per kind, and feature-flag prompt/system-prompt
kinds off until Plans 05/06 ship.

---

## Scope

**This phase DOES:**

- Updates `parseCreatePayload` in `api/campaigns/index.ts` to handle
  per-kind contestant payloads + minimums.
- Adds the per-kind generation assembly switch in
  `src/server/routes/campaigns/generate.ts`.
- Adds the `{{input}}` templating renderer (used by Plan 05; lives here
  so the foundation owns it).
- Updates `preview.ts` for per-kind payload shapes.
- API rejects `kind ∈ {prompt, system_prompt}` with a clear error until
  Plans 05/06 flip their feature flag.
- Updates `src/lib/api.ts` types for the campaign create payload.

**This phase does NOT:**

- Touch any UI (Phase 2).
- Surface kind selection to operators (Phase 2).
- Implement Plan 05's standalone-variants advanced toggle (Plan 05).
- Implement Plan 06's persona suggestion (Plan 06).

---

## Entry Criteria

- [ ] Phase 0 complete; schema + types compile
- [ ] Migration applied to dev DB
- [ ] All P0 batches marked `[x]`

---

## Exit Criteria

- [ ] All P1 batches marked complete
- [ ] `npm run lint && npm run build && npx vitest run` passes
- [ ] Existing model-arena create flow still works (regression check)
- [ ] Submitting `kind='prompt'` or `kind='system_prompt'` returns
      400/403 with a clear "feature not yet enabled" error

---

## Batches

| Batch | File | Description | Status |
|---|---|---|---|
| P1-A | [P1-A-api-validation.md](./P1-A-api-validation.md) | Per-kind validation + feature flag in create payload parser | Complete |
| P1-B | [P1-B-generation-assembly.md](./P1-B-generation-assembly.md) | Per-kind call assembly, templating renderer, preview update | Complete |

---

## Key Files

| File | Changes |
|---|---|
| `api/campaigns/index.ts` | `parseCreatePayload` per-kind branches; feature flag |
| `src/server/routes/campaigns/generate.ts` | Per-kind assemble + render |
| `src/server/routes/campaigns/preview.ts` | Per-kind preview |
| `src/lib/api.ts` | Type extensions on payload |
| `src/server/lib/render-template.ts` | New `{{input}}` substitution helper |

---

## Verification

```bash
cd modelarena
npm run lint
npm run build
npx vitest run src/server/__tests__
```

---

## Reference

- PRD: `docs/roadmap/04-arena-modes-foundation.md` →
  "Generation router" / "Surfaces touched"
