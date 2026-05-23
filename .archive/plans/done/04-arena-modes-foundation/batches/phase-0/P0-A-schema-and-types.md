# P0-A: Schema Migration & Drizzle Types

Land the kinded-campaign schema, polymorphic contestants, pinned-model
snapshot, and pinned-system-prompt fields. Backfill snapshots for
existing campaigns.

---

## Tasks

### Schema

- [x] **P0-1**: Add `campaign_kind` enum.
      File: `src/server/db/schema.ts`
      Action: Define `campaignKindEnum = pgEnum('campaign_kind', ['model', 'prompt', 'system_prompt'])` and export `CampaignKind` type.
      Ref: PRD → "What changes" → `campaigns.kind` discriminator

- [x] **P0-2**: Extend `campaigns` table.
      File: `src/server/db/schema.ts`
      Action: Add `kind` (notNull, default `'model'`), `pinnedProviderModelId` (text, nullable), `pinnedModelSnapshot` (jsonb, nullable, typed as `{providerModelId: string; displayName: string; params: Record<string, unknown>; snapshotAt: string}`), `pinnedSystemPrompt` (text, nullable).
      Ref: PRD → "Pinned generator model"

- [x] **P0-3**: Extend `campaign_models` table.
      File: `src/server/db/schema.ts`
      Action: Add `kind` (campaignKindEnum, notNull, default `'model'`); add `variantText` (text, nullable); change `providerModelId` to nullable. Document the misnomer in the table-header comment.
      Ref: PRD → "Polymorphic contestants (the X axis)"

- [x] **P0-4**: CHECK constraints on `campaign_models`.
      File: `src/server/db/schema.ts`
      Action: Add CHECK constraints enforcing per-kind nullability:
      `campaign_models_model_shape`: when `kind='model'`, `provider_model_id NOT NULL` AND `variant_text IS NULL`.
      `campaign_models_variant_shape`: when `kind IN ('prompt','system_prompt')`, `variant_text NOT NULL` AND `provider_model_id IS NULL`.
      Ref: PRD → "Polymorphic contestants" → constraint list

- [x] **P0-5**: CHECK constraint on `campaigns` for kind/contestant alignment.
      File: `src/server/db/schema.ts`
      Action: Add `campaigns_pinned_model_when_kinded`: when `kind != 'model'`, `pinned_provider_model_id NOT NULL`. Other shape constraints (e.g. `kind='model'` should imply `pinned_provider_model_id IS NULL`) are also worth adding; verify against PRD.
      Ref: PRD → "Pinned generator model"

### Types

- [x] **P0-6**: Export new types.
      File: `src/server/db/schema.ts`
      Action: Add `CampaignKind`, `PinnedModelSnapshot`. Update `Campaign`/`NewCampaign`/`CampaignModel`/`NewCampaignModel` `$inferSelect`/`$inferInsert` consumers as needed.

### Migration

- [x] **P0-7**: Generate migration.
      File: `drizzle/0012_arena_modes_foundation.sql` (and `drizzle/meta/_journal.json`)
      Action: Run `npm run db:generate`. Review the output. The generated SQL should match the PRD's "Migration" subsection. If Drizzle generates multiple statements that don't match the desired order, hand-edit minimally.

- [x] **P0-8**: Backfill statement.
      File: `drizzle/0012_arena_modes_foundation.sql` (append to migration)
      Action: After the ALTER statements, append a single `UPDATE campaigns SET pinned_model_snapshot = ...` that derives the snapshot from the campaign's first `campaign_models` row. Use `jsonb_build_object('providerModelId', cm.provider_model_id, 'displayName', cm.display_name, 'params', cm.params, 'snapshotAt', NOW())`. Skip rows where derivation isn't possible — null is acceptable.
      Ref: PRD → "Migration" step 10

### Verify

- [x] **P0-9**: Apply migration to dev DB.
      Action: `npm run db:migrate`. Confirm clean apply.
- [x] **P0-10**: Inspect with Drizzle Studio.
      Action: `npm run db:studio` → confirm new columns exist, `kind='model'` for existing rows, snapshots populated where derivable.
      Verified directly via `information_schema.columns` + `pg_constraint` query (Studio not needed): all 4 new `campaigns` columns + 2 new `campaign_models` columns present with correct nullability/defaults; all 5 CHECK constraints in place; 8 of 10 existing campaigns got a backfilled `pinned_model_snapshot` (the 2 with null have zero `campaign_models` rows — correctly skipped per spec).
- [x] **P0-11**: Lint pass.
      Action: `npm run lint` — Drizzle types compile.

---

## Notes

- The `neon-http` driver doesn't support multi-statement transactions.
  The migration runner applies statements sequentially; if any fails,
  prior statements remain applied. Acceptable for additive
  ALTER+UPDATE; not a blocker.
- Do not rename `campaign_models` or its FK columns. PRD-resolved.
- If `db:generate` produces unexpected output (e.g., column reordering,
  index drops), stop and ask — drift between expected and generated is
  a meaningful signal.

---

## Verification

```bash
cd modelarena
npm run db:generate
# Review the generated SQL diff before committing
npm run db:migrate
npm run lint
```
