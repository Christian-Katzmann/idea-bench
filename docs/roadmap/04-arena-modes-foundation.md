# Plan 04 — Arena Modes Foundation

> Status: Drafted, not approved. Prerequisite for Plans 05 and 06.
> Last updated: 2026-04-28.
> See [roadmap README](./README.md) for cross-plan context.

## Context

ModelArena today is implicitly a "model arena": every campaign varies models
across a fixed set of prompts. Two new arena modes need the same machinery
applied with the axes rotated — Prompt Arena (Plan 05) varies prompt
variants on a fixed model, System-Prompt Arena (Plan 06) varies system
prompts across a suite of user prompts.

Rather than build three parallel stacks, this plan generalizes the campaign
into a **vary-X-hold-Y** experiment with a `kind` discriminator. Every
downstream concern — voting modes, brackets, ratings, simulated runs,
personas, leaderboards, exports — keeps working unchanged because they all
operate on `generations`, not on what produced them.

This is foundation work. It ships nothing user-facing on its own; it
unblocks Plans 05 and 06.

## What changes

### `campaigns.kind` discriminator

New enum column, defaulting to `'model'`:

```
campaign_kind: 'model' | 'prompt' | 'system_prompt'
```

Every existing campaign migrates to `'model'`. The voter URL and voter UI
do not surface this — voters compare outputs regardless of kind. The
operator UI gets a kind selector at campaign creation; everything else
adapts via thin per-kind copy.

### Polymorphic contestants (the X axis)

Today `campaign_models` is the X axis. Generalize it without renaming:

```
campaign_models
  id, campaign_id, display_name, params, created_at
  provider_model_id           -- now nullable; required when kind='model'
  + kind                      -- 'model' | 'prompt' | 'system_prompt'
  + variant_text              -- prompt-variant body or system-prompt body
                                 (kind='prompt' or 'system_prompt')
```

Constraints:
- `kind='model'` → `provider_model_id NOT NULL`, `variant_text NULL`
- `kind='prompt'` → `variant_text NOT NULL`, `provider_model_id NULL`
- `kind='system_prompt'` → `variant_text NOT NULL`, `provider_model_id NULL`
- Per-campaign `kind` matches `campaigns.kind` (CHECK or trigger).

The table name stays `campaign_models` despite now holding non-model rows.
Rationale: renaming forces a touch of `campaign_model_id` FK columns in
`generations` + 6 response tables + `ratings`. The cost dwarfs the
readability win. Document the misnomer in the schema header; revisit in a
later cleanup pass if it bites.

The downstream FK column `campaign_model_id` keeps its name. In
prompt/system-prompt campaigns it points at a contestant row; the type
system enforces it via the kind discriminator. Comments in the schema
note this explicitly.

### Pinned generator model (for prompt and system-prompt arenas)

Add to `campaigns`:

```
pinned_provider_model_id text       -- required when kind != 'model';
                                       null otherwise
pinned_model_snapshot    jsonb      -- frozen registry state at launch:
                                       { providerModelId, displayName,
                                         params, snapshotAt }
pinned_system_prompt     text       -- optional held-constant system
                                       message for kind='prompt' arenas;
                                       null when kind != 'prompt' or when
                                       no system message is desired
```

V1 single-model: prompt and system-prompt arenas pin one model at the
campaign level. Multi-model fan-out is wired in the UI behind an
"Advanced" toggle, marked Coming soon, and rejected at the API. When the
feature ships, `pinned_provider_model_id` becomes a denormalized
convenience and the multi-model selection lives elsewhere. Acceptable.

The `pinned_model_snapshot` is non-negotiable: registry edits down the
line (model rename, deprecation, params change) must not retroactively
rewrite a campaign's history. Mirrors the `simulated_runs.modelMix`
pattern. Snapshot is captured at launch time, not at create time —
draft edits to the registry are still picked up before the operator
hits Launch. Worth backfilling onto existing model-arena campaigns in
the same migration so the audit story is consistent across kinds.

The `pinned_system_prompt` is the held-constant system message for
prompt arenas — operators iterating on user-prompt phrasing often want
a sticky persona ("you are a customer support agent") that stays the
same across all variants and inputs. Distinct from a system-prompt
arena, where the system message *is* the variable being tested.

### Test cases (the Y axis)

The existing `prompts` table is reused as test cases without schema
change. Per-kind interpretation:

| Kind | A `prompts` row means | Sent to LLM as |
|---|---|---|
| `model` | A user prompt (today) | User message |
| `prompt` | An input fragment for the variant template | The variant rendered with `{{input}}` substitution; standalone variants ignore the row's text and use the variant verbatim |
| `system_prompt` | A user prompt | User message + variant as system message |

Prompt arenas with 0 inputs are valid (variants are standalone — Plan 05
"Advanced: standalone variants"). The schema permits it; the API treats a
campaign with `kind='prompt'` and zero `prompts` rows as a single
synthetic case. Documented, not exposed in UI.

### Generation router

`src/server/openrouter.ts` is unchanged. The campaign-level generate
handler (`generateCampaignWebHandler`) gets a thin per-kind assembly step:

```ts
function assembleCall(
  campaign: Campaign,
  contestant: CampaignModel,        // misnomer; see above
  testCase: Prompt | null,
): OpenRouterCallInput {
  switch (campaign.kind) {
    case 'model':
      return {
        providerModelId: contestant.providerModelId!,
        context: testCase!.context ?? null,
        prompt: testCase!.text,
        params: contestant.params,
      };
    case 'prompt':
      return {
        providerModelId: campaign.pinnedProviderModelId!,
        context:
          campaign.pinnedSystemPrompt ?? testCase?.context ?? null,
        prompt: render(contestant.variantText!, testCase?.text ?? ''),
      };
    case 'system_prompt':
      return {
        providerModelId: campaign.pinnedProviderModelId!,
        context: contestant.variantText!,    // system message
        prompt: testCase!.text,
      };
  }
}
```

Where `render(template, input)` substitutes a single `{{input}}` token —
no nested expressions, no helpers. If `template` contains no `{{input}}`,
input is appended after a newline. Documented behavior.

### Creation UX (operator)

Campaign creation gains a Step 0: pick the arena kind. The wizard's
remaining steps adapt:

| Wizard step | Model arena | Prompt arena | System-prompt arena |
|---|---|---|---|
| 0. Kind | new | new | new |
| 1. Basics | unchanged | unchanged | unchanged |
| 2. Test cases | "Prompts" (today) | "Inputs" (optional, defaults empty) | "Test prompts" suite |
| 3. Contestants | "Models" (4+ today) | "Prompt variants" (2+) | "System prompt variants" (2+) |
| 3b. Advanced | — | model picker (single, default); cross-model toggle (Coming soon, disabled) | model picker (single, default); cross-model toggle (Coming soon, disabled) |
| 4. Generate | unchanged | unchanged | unchanged |
| 5. Launch | unchanged | unchanged | unchanged |

The minimums-of-4 rule on `providerModelIds` becomes a per-kind contestant
minimum:
- `model` → ≥4 (tournament bracket constraint preserved for default mode)
- `prompt` → ≥2
- `system_prompt` → ≥2

When the operator picks a non-tournament default voting mode for prompt or
system-prompt arenas (Plan 05/06 default to Best-of-N and Slider
respectively), the ≥4 constraint doesn't apply.

### What does not change

- Voter URL, voter UI, voter cookies.
- All 6 evaluation modes from Plan 01 (tournament, slider, approve_reject,
  best_of_n, multi_axis, qualitative). Each works against any contestant
  kind because all of them vote on `generations`.
- Bradley-Terry ratings pipeline. Ranks contestants regardless of kind.
- Simulated runs (Plan 02). Personas judge outputs — the underlying
  contestant kind is invisible to the judge prompt.
- Exports (CSV, XLSX). Column headers shift per-kind — "Model" becomes
  "Variant" or "System Prompt" — but the row shape is identical.
- Soft-delete, share slugs, voter dedup, AI spend gate.

## Migration

Single migration, `0012_arena_modes_foundation.sql`:

1. Create `campaign_kind` enum.
2. `ALTER TABLE campaigns ADD COLUMN kind campaign_kind NOT NULL DEFAULT 'model'`.
3. `ALTER TABLE campaigns ADD COLUMN pinned_provider_model_id text`.
4. `ALTER TABLE campaigns ADD COLUMN pinned_model_snapshot jsonb`.
5. `ALTER TABLE campaigns ADD COLUMN pinned_system_prompt text`.
6. `ALTER TABLE campaign_models ADD COLUMN kind campaign_kind NOT NULL DEFAULT 'model'`.
7. `ALTER TABLE campaign_models ADD COLUMN variant_text text`.
8. `ALTER TABLE campaign_models ALTER COLUMN provider_model_id DROP NOT NULL`.
9. CHECK constraints enforcing per-kind nullability.
10. Backfill `pinned_model_snapshot` for existing model-arena campaigns
    with first-model registry data so the audit story is consistent
    across kinds. (One-shot; if registry rows are missing we leave the
    snapshot null — downstream readers fall back to `campaign_models`.)
11. Other defaults are already set; existing rows are correct.

No downtime. Rollback is `DROP COLUMN` × 5 plus enum drop, safe because
no existing code reads the new columns until Plan 05/06 ship.

## Surfaces touched

| File / area | Change |
|---|---|
| `src/server/db/schema.ts` | New enum + columns + types |
| `drizzle/0012_*.sql` | The migration above |
| `api/campaigns/index.ts` | Per-kind validation in `parseCreatePayload` |
| `src/server/routes/campaigns/generate.ts` | Per-kind call assembly |
| `src/server/routes/campaigns/preview.ts` | Per-kind preview shape |
| `src/pages/CreateCampaign.tsx` | Step 0 + per-kind step labels |
| `src/lib/api.ts` | Type extensions on the campaign create payload |
| `src/server/campaigns/export.ts` + `export-xlsx.ts` | Per-kind column headers |
| `src/server/campaigns/detail.ts` | Per-kind contestant rendering for the dashboard |

Tests:
- `src/server/__tests__/`: per-kind validation, per-kind generate
  assembly with `{{input}}` rendering, the standalone-variant fallback.
- `src/pages/__tests__/CreateCampaign.test.tsx`: kind selector +
  per-kind step rendering.

## V1 scope (this plan)

- Foundation only. No new arena kinds become reachable through the UI
  unless Plan 05 and/or 06 also ship in the same release window.
- Validation rejects `kind ∈ {prompt, system_prompt}` at the API until
  the dependent plan flips its feature flag.

## Deferred / out of scope

- Renaming `campaign_models` → `campaign_contestants`. Pure ergonomics.
- Renaming `campaign_model_id` FK columns. Same.
- Multi-model fan-out for prompt/system-prompt arenas. Wired in UI as
  Coming soon; rejected at API. Future plan.
- Cross-kind aggregation in the leaderboard (e.g., "compare prompt-arena
  results from campaign A vs system-prompt-arena results from campaign B").
  No clear use case; revisit if asked.

## Resolved decisions

Captured from the 2026-04-28 review pass; previously listed as open.

- **Snapshot the pinned model at launch** (`pinned_model_snapshot`
  jsonb on campaigns). Non-negotiable for audit and reproducibility —
  registry edits must not retroactively rewrite a campaign's history.
  Backfilled onto existing model-arena rows in the same migration so
  the audit story is consistent across kinds.
- **Held-constant system prompt for prompt arenas**
  (`pinned_system_prompt` text on campaigns). Lets operators pin a
  sticky persona across variants without conflating Prompt Arena with
  System-Prompt Arena. Optional; null means no system message.
