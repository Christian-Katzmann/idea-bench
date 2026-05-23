# Plan 06 Glossary

Terms specific to system-prompt arenas. Cross-reference Plan 04
glossary for foundation terms.

---

## Core Concepts

| Term | Definition |
|---|---|
| System-prompt arena | A campaign with `kind='system_prompt'`. Varies system-prompt variants across a suite of user prompts on a fixed model. |
| Variant | One system-prompt-text candidate. Stored as `campaign_models` with `kind='system_prompt'`, `variant_text=<system message>`. |
| Suite | The collection of user prompts the variants are evaluated against. Stored as rows in `prompts` (no schema change from Plan 04). |
| Heatmap | Per-(variant, suite-prompt) leaderboard view; the most useful view for actual decisions. |
| Across-suite rollup | Default leaderboard view aggregating each variant's score across the entire suite. |
| Persona panel | A simulated-run configuration using one or more personas as judges. Default ON for system-prompt arenas. |
| CI badge | "based on N test prompts" badge on each variant row, with tooltip explaining how confidence intervals widen with smaller suites. |

---

## Naming Conventions

- Variant names: editable `display_name`, default "Variant N", 60-char max.
- Variant text limit: 16,000 chars (system prompts run long).
- Suite item text limit: 8,000 chars.
- Suite minimum: 3 prompts (hard block at activate).

---

## Key Files

| Path | Role |
|---|---|
| `src/pages/CreateCampaign.tsx` | Suite + variants + persona suggestion |
| `src/pages/CampaignDashboard.tsx` | Heatmap + rollup |
| `src/components/heatmap/*` | New heatmap component (Phase 2) |
| `src/server/simulated-runs/launch.ts` | Persona pre-filter helper |
| `api/campaigns/index.ts` | `ALLOWED_KINDS` widened in Phase 0 |
