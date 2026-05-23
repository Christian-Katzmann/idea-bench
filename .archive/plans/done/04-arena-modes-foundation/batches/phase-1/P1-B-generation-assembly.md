# P1-B: Per-Kind Generation Assembly

Add the per-kind switch to the generate handler and ship the
`{{input}}` templating helper.

---

## Tasks

### Templating helper

- [x] **P1-9**: New `renderTemplate` helper.
      File: `src/server/lib/render-template.ts` (new)
      Action: Export `renderTemplate(template: string, input: string, opts?: { standalone?: boolean }): string` that:
        1. If `standalone === true`, return `template` verbatim.
        2. If `template` contains literal `{{input}}`, substitute (single replacement) and return.
        3. Else, return `template + '\n\n' + input`.
      No regex flexibility, no whitespace tolerance. Documented in the file's top comment with rationale (matches PRD).
      Ref: PRD → "Templating in prompt-arena" + Plan 05 PRD → "Templating and held-constant context"

### Generation routing

- [x] **P1-10**: Add per-kind assembly to generate handler.
      File: `src/server/routes/campaigns/generate.ts`
      Action: Add `assembleCall(campaign, contestant, testCase)` per the PRD code sketch. Switch on `campaign.kind`:
        - `model` → existing path (provider_model_id from contestant, prompt from test case).
        - `prompt` → pinned model from campaign; system message = `pinnedSystemPrompt ?? testCase.context ?? null`; user message = `renderTemplate(contestant.variantText, testCase.text)`.
        - `system_prompt` → pinned model from campaign; system message = `contestant.variantText`; user message = `testCase.text`.
      Ref: PRD → "Generation router" code block

- [x] **P1-11**: Capture pinned-model snapshot at launch.
      File: `src/server/routes/campaigns/activate.ts`
      Action: When activating a non-model-kind campaign, write `pinned_model_snapshot` jsonb to `campaigns` from current registry state for the pinned model. Idempotent — if already set (re-activate), preserve existing.
      Ref: PRD → "pinned_model_snapshot is captured at launch time, not at create time"

### Preview

- [x] **P1-12**: Per-kind preview shape.
      File: `src/server/routes/campaigns/preview.ts`
      Action: Update preview handler to use `assembleCall` so previews mirror the runtime assembly across kinds.

### Tests

- [x] **P1-13**: Render template tests.
      File: `src/server/__tests__/render-template.test.ts` (new)
      Action: Cover token substitution, no-token append, standalone passthrough, missing-input handling.

- [x] **P1-14**: Per-kind generation assembly tests.
      File: `src/server/__tests__/generate-assembly.test.ts` (new)
      Action: Build minimal fixtures for each kind; assert the assembled `OpenRouterCallInput` has the expected `providerModelId`, `context`, and `prompt`. Don't actually call OpenRouter — assert the inputs.

---

## Notes

- `assembleCall` should be a pure function — no DB access, no
  side-effects. The existing handler can extract its current logic
  into the `model` branch with no other change.
- The activate handler writes the snapshot. Don't write it at
  create-time; the operator may edit the registry between create and
  activate, and we want the launched value to be the truth.

---

## Verification

```bash
cd modelarena
npm run lint
npm run build
npx vitest run src/server/__tests__
```
