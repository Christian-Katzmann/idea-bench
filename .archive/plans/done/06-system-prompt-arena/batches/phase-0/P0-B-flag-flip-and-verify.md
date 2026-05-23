# P0-B: Feature-Flag Flip & API Smoke Test

After P0-A's review pass is signed off, open the API gate for
`kind='system_prompt'` and confirm the foundation handles it
correctly.

---

## Tasks

- [x] **P0-18**: Widen `ALLOWED_KINDS`.
      File: `api/campaigns/index.ts`
      Action: Add `'system_prompt'` to `ALLOWED_KINDS`.
      Ref: PRD §V1 scope
      Done: `api/campaigns/index.ts:11-22` — `ALLOWED_KINDS` now `{model, prompt, system_prompt}` (size 3); doc-comment updated to note Plan 06's flip alongside Plan 05's.

- [x] **P0-19**: API smoke test for system-prompt-arena create.
      File: `src/server/__tests__/system-prompt-arena-api.test.ts` (new)
      Action: Stand up a minimal `kind='system_prompt'` create payload (3 suite prompts, 2 system-prompt variants, pinned model from registry). Assert 201. Round-trip via list endpoint.
      Done: New file mirrors `prompt-arena-api.test.ts`; covers 201 happy path + payload shape, campaign row pinned-model write + `pinnedSystemPrompt` NULL, campaign_models written as variants, ≥3 hard block, unselectable-model rejection, 401 unauth, list round-trip.

- [x] **P0-20**: Generate-assembly verify for system-prompt kind.
      File: `src/server/__tests__/generate-assembly.test.ts` (extend)
      Action: Add cases for `kind='system_prompt'`: assert system message equals the variant text, user message equals the test case text, no templating runs.
      Done: Existing `system_prompt` describe-block already covered the core invariants (Plan 04 P2-1). Hardened with two more cases: `testCase.context` is ignored under `system_prompt`, and a stray `pinnedSystemPrompt` does not shadow the variant being tested. The `sysCampaign()` factory now takes overrides so future tests can flip campaign-level fields without rewriting the constructor.

- [x] **P0-21**: Activate-time snapshot verify.
      File: `src/server/__tests__/activate.test.ts` (extend)
      Action: Confirm activating `kind='system_prompt'` writes `pinned_model_snapshot` from current registry state. Idempotent on re-activate.
      Done: New `kind='system_prompt'` describe-block mirrors the prompt-kind block: snapshot capture on first activate, no-overwrite on re-activate (registry not consulted), 409 when pinned model is no longer selectable, plus a system_prompt-specific zero-prompts rejection (kind='prompt' is the only standalone-capable kind).

- [x] **P0-22**: Suite minimum validation at create.
      File: `api/campaigns/index.ts`
      Action: For `kind='system_prompt'`, reject `prompts.length < 3` at the create handler with a clear error. (PRD calls this out — confirm Plan 04's parser enforces it; if not, add the per-kind branch here.)
      Done: Plan 04's parser enforces only "non-empty for non-prompt kinds." Added a per-kind ≥3 gate inside the `system_prompt` arm of `parseCreatePayload`, behind a named `SYSTEM_PROMPT_MIN_SUITE` constant. New tests in `campaigns-validation.test.ts` cover [], 1-prompt, and 2-prompt rejections; the smoke test in `system-prompt-arena-api.test.ts` covers the 2-prompt rejection at the handler boundary.

---

## Out-of-scope edits required by the flag flip (authorized inline)

The flag flip in P0-18 invalidated two pre-existing tests left as
placeholders by the Plan 05 author. Both were updated in this batch:

- `src/server/__tests__/campaigns-validation.test.ts` — `ALLOWED_KINDS`
  feature-flag assertion flipped from `size 2 / system_prompt: false`
  to `size 3 / system_prompt: true`. The system_prompt fixture now uses
  3 prompts (was 1), and a new test exercises the ≥3 hard block.
- `src/server/__tests__/prompt-arena-api.test.ts` — removed the "still
  rejects kind='system_prompt'" test (its assertion no longer holds);
  updated the file header to point at the new sibling smoke test.

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
