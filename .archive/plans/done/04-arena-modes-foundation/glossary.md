# Plan 04 Glossary

Terms specific to this plan. Cross-reference with the PRD for fuller
definitions.

---

## Core Concepts

| Term | Definition |
|---|---|
| Arena kind | The `campaigns.kind` discriminator: `model`, `prompt`, or `system_prompt`. |
| Contestant | The X in vary-X-hold-Y. The `campaign_models` row representing one contestant; misnomer documented. |
| Test case | The Y in vary-X-hold-Y. A row in `prompts` whose interpretation depends on the campaign's kind. |
| Pinned model | The single generator model used for prompt and system-prompt arenas. Stored on `campaigns.pinned_provider_model_id` plus a `pinned_model_snapshot` jsonb. |
| Pinned system prompt | An optional held-constant system message for prompt arenas. Stored on `campaigns.pinned_system_prompt`. |
| Snapshot | Frozen registry state captured at launch. Mirrors `simulated_runs.modelMix`. |

---

## Naming Conventions

- New schema fields: snake_case in SQL, camelCase in Drizzle (`pinnedModelSnapshot`).
- New enum: `campaign_kind` (SQL), `campaignKindEnum` + `CampaignKind` type (Drizzle).
- Migration filename: `0012_arena_modes_foundation.sql`.

---

## Key Files

| Path | Role |
|---|---|
| `src/server/db/schema.ts` | Drizzle schema + exported types |
| `drizzle/0012_arena_modes_foundation.sql` | The new migration |
| `api/campaigns/index.ts` | Per-kind validation in `parseCreatePayload` |
| `src/server/routes/campaigns/generate.ts` | Per-kind call assembly |
| `src/server/routes/campaigns/preview.ts` | Per-kind preview shape |
| `src/pages/CreateCampaign.tsx` | Step 0 + per-kind step labels |
| `src/lib/api.ts` | Type extensions on the campaign create payload |
