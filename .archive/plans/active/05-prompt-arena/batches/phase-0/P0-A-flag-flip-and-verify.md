# P0-A: Feature-Flag Flip & Foundation Verify

Open the API gate for `kind='prompt'` and confirm Plan 04's foundation
behaves correctly for prompt-arena payloads.

---

## Tasks

- [x] **P0-1**: Widen `ALLOWED_KINDS`.
      File: `api/campaigns/index.ts`
      Action: Add `'prompt'` to `ALLOWED_KINDS`. Leave `'system_prompt'` excluded — that's Plan 06's flip.
      Ref: PRD §V1 scope; Plan 04 PRD → "V1 scope"

- [x] **P0-2**: API smoke test for prompt-arena create.
      File: `src/server/__tests__/prompt-arena-api.test.ts` (new)
      Action: Stand up a minimal `kind='prompt'` create payload (2 variants with `{{input}}`, 2 inputs, pinned model from registry, optional pinned system prompt). Assert 201 with the new shape. Round-trip the campaign via list endpoint to confirm storage.

- [x] **P0-3**: Generate-assembly verify for prompt kind.
      File: `src/server/__tests__/generate-assembly.test.ts` (extend Plan 04 test)
      Action: Add cases: variant with `{{input}}` + input → substituted; variant without `{{input}}` + input → appended; standalone flag → variant verbatim. Assert system message resolves to `pinnedSystemPrompt` first, then `testCase.context`, then null.
      Note: standalone-flag wiring through `assembleCall` deferred to Phase 1 (Plan 05 Phase 1 lands the wiring + test alongside the operator UI). Helper-level standalone behavior covered in `render-template.test.ts`.

- [x] **P0-4**: Activate-time snapshot verify.
      File: `src/server/__tests__/activate.test.ts` (extend or new)
      Action: Confirm activating a `kind='prompt'` campaign writes `pinned_model_snapshot` from current registry state. Verify idempotency: re-activate doesn't overwrite an existing snapshot.

---

## Notes

- Best-of-N handler dependency: if Plan 01's Best-of-N isn't live, the
  prompt-arena UX still works with Tournament as fallback. Decision goes
  into Phase 1, not this phase.
- This phase is intentionally small. Resist scope creep — Phase 1 is
  where the visible work lands.

---

## Verification

```bash
cd modelarena
npm run lint
npx vitest run src/server/__tests__/
```
