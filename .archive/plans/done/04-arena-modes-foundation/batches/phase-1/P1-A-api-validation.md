# P1-A: Per-Kind API Validation

Update the campaign create payload parser to handle the kinded
schema. Reject prompt/system-prompt kinds at the API until Plans 05/06
ship.

---

## Tasks

### Validation

- [x] **P1-1**: Add `kind` parsing to `parseCreatePayload`.
      File: `api/campaigns/index.ts`
      Action: Accept optional `kind` field defaulting to `'model'`. Validate against the enum values. Add a shared `ALLOWED_KINDS` constant set initially containing only `'model'`.
      Ref: PRD → "Creation UX (operator)"

- [x] **P1-2**: Per-kind contestant validation.
      File: `api/campaigns/index.ts`
      Action: Branch on `kind`. For `model`: keep existing `providerModelIds[]` parsing with ≥4 minimum. For `prompt`/`system_prompt`: parse `variants[]` (each `{ text: string; displayName?: string }`) with ≥2 minimum.
      Ref: PRD → "Creation UX" → minimums table

- [x] **P1-3**: Per-kind campaign-level fields.
      File: `api/campaigns/index.ts`
      Action: For `prompt`/`system_prompt`: require `pinnedProviderModelId`, validate against `listSelectableRegistryModels`. For `prompt` only: accept optional `pinnedSystemPrompt` (string, ≤8000 chars). For `model`: reject these fields (extra-key rejection).
      Ref: PRD → "Pinned generator model"

- [x] **P1-4**: Feature-flag rejection.
      File: `api/campaigns/index.ts`
      Action: Before insert, if `kind` is not in `ALLOWED_KINDS`, return `400 { error: 'arena kind not yet enabled', kind }`. Plans 05/06 widen `ALLOWED_KINDS`.
      Ref: PRD → "V1 scope" — "API rejects kind ∈ {prompt, system_prompt}"

### Insert flow

- [x] **P1-5**: Per-kind insert into `campaign_models`.
      File: `api/campaigns/index.ts`
      Action: For `model`: keep existing path (provider_model_id from registry). For `prompt`/`system_prompt`: insert variant rows with `kind=<kind>`, `variant_text=<text>`, `display_name=displayName ?? \`Variant \${i+1}\``, `provider_model_id=null`.

- [x] **P1-6**: Per-kind insert onto `campaigns`.
      File: `api/campaigns/index.ts`
      Action: Set `kind`, `pinnedProviderModelId`, `pinnedSystemPrompt` (when applicable). `pinnedModelSnapshot` stays NULL until activate-time (note in code comment for the future activate-handler pass).

### Types

- [x] **P1-7**: Extend client/shared types.
      File: `src/lib/api.ts`
      Action: Add `arenaKind`/`Variant` types in the campaign create payload. Re-export so `CreateCampaign.tsx` (Phase 2) can consume.

### Tests

- [x] **P1-8**: Validation tests.
      File: `src/server/__tests__/campaigns-validation.test.ts` (new or extend)
      Action: Cover model-kind happy path (regression), prompt/sys rejection by feature flag, per-kind minimums, missing pinned-model rejection.

---

## Notes

- Existing model-arena tests must continue to pass. Run them after
  every change.
- The `parseCreatePayload` function is already reasonably structured —
  add per-kind branches, don't rewrite the whole thing.

---

## Verification

```bash
cd modelarena
npm run lint
npx vitest run src/server/__tests__/campaigns-validation.test.ts
```
