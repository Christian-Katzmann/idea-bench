# P0-B: Feature-Flag Flip & API Smoke Test

After P0-A's review pass is signed off, open the API gate for
`kind='system_prompt'` and confirm the foundation handles it
correctly.

---

## Tasks

- [ ] **P0-18**: Widen `ALLOWED_KINDS`.
      File: `api/campaigns/index.ts`
      Action: Add `'system_prompt'` to `ALLOWED_KINDS`.
      Ref: PRD §V1 scope

- [ ] **P0-19**: API smoke test for system-prompt-arena create.
      File: `src/server/__tests__/system-prompt-arena-api.test.ts` (new)
      Action: Stand up a minimal `kind='system_prompt'` create payload (3 suite prompts, 2 system-prompt variants, pinned model from registry). Assert 201. Round-trip via list endpoint.

- [ ] **P0-20**: Generate-assembly verify for system-prompt kind.
      File: `src/server/__tests__/generate-assembly.test.ts` (extend)
      Action: Add cases for `kind='system_prompt'`: assert system message equals the variant text, user message equals the test case text, no templating runs.

- [ ] **P0-21**: Activate-time snapshot verify.
      File: `src/server/__tests__/activate.test.ts` (extend)
      Action: Confirm activating `kind='system_prompt'` writes `pinned_model_snapshot` from current registry state. Idempotent on re-activate.

- [ ] **P0-22**: Suite minimum validation at create.
      File: `api/campaigns/index.ts`
      Action: For `kind='system_prompt'`, reject `prompts.length < 3` at the create handler with a clear error. (PRD calls this out — confirm Plan 04's parser enforces it; if not, add the per-kind branch here.)

---

## Notes

- Do not start P0-B until P0-A's "Drift Notes" section is filled in
  and signed off. The phase README enforces this in its Exit Criteria.
- If P0-A surfaced drift that affects this batch, adjust accordingly
  before running.

---

## Verification

```bash
cd modelarena
npm run lint
npx vitest run src/server/__tests__/
```
