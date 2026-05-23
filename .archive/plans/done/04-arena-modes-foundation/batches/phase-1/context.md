# Phase 1 Context

Compressed context for AI agents working on Phase 1.

---

## What We're Building (This Phase)

Two server-side changes: per-kind validation in the campaign create
payload parser, and per-kind generation assembly in the generate
handler. The templating renderer (`{{input}}`) lives in a new helper
module so Plan 05 reuses it. Prompt and system-prompt kinds are
explicitly rejected with a clear error until 05/06 flip the flag.

---

## Key Decisions (PRD-resolved)

- Per-kind contestant minimums:
  - `model` → ≥4
  - `prompt` → ≥2
  - `system_prompt` → ≥2
- Templating: single `{{input}}` token, exact match. No-token + inputs
  → input appended after a blank line. Standalone-variants mode skips
  substitution entirely (Plan 05; the helper takes a flag).
- Pinned-model snapshot is captured at **launch** time (activate
  endpoint), not at create time. Phase 1 only validates that
  `pinnedProviderModelId` is selectable; the snapshot write happens in
  the activate handler — note this for the future Plan 05 integration.

---

## Dependencies from Phase 0

- `campaign_kind` enum exists.
- New columns on `campaigns` and `campaign_models` exist with CHECK
  constraints in place.
- Drizzle types updated.

---

## File Patterns

| Pattern | Purpose |
|---|---|
| `api/campaigns/index.ts` | Create payload parsing |
| `src/server/routes/campaigns/*.ts` | Per-route handlers |
| `src/server/lib/*.ts` | Pure helpers (template renderer lives here) |
| `src/lib/api.ts` | Shared types between client and server |

---

## Constraints

- Only modify files listed in batch files.
- Keep the existing model-arena flow byte-for-byte equivalent — no
  behavior change for `kind='model'` campaigns.
- Feature flag for prompt/system-prompt kinds is a constant
  (`ALLOWED_KINDS` set) — Plans 05/06 widen it.
- Don't touch UI; that's Phase 2.

---

## Verification

```bash
cd modelarena
npm run lint
npm run build
npx vitest run
```

---

## Quick Reference

- **Canonical spec:** `docs/roadmap/04-arena-modes-foundation.md`
- **Phase README:** `batches/phase-1/README.md`
- **Helper:** `HELPER.md`
