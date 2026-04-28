# Plan 05 Glossary

Terms specific to prompt arenas. Cross-reference Plan 04 glossary for
foundation terms (kind, contestant, snapshot).

---

## Core Concepts

| Term | Definition |
|---|---|
| Prompt arena | A campaign with `kind='prompt'`. Varies prompt variants on a fixed model. |
| Variant | One prompt-text candidate. Stored as a `campaign_models` row with `kind='prompt'`, `variant_text=<the prompt>`. |
| Input | A test-case fragment substituted into the variant template via `{{input}}`. Stored as a row in `prompts`. |
| Standalone variants | Mode where variants run as-is, ignoring inputs and templating. Operator opt-in via Advanced settings. |
| Per-input drilldown | Leaderboard view showing each variant's results for a single input. The decision-making view. |

---

## Naming Conventions

- Variant names: editable `display_name` defaulting to `Variant N`. 60 chars max.
- Inputs: stored in `prompts.text`; framing in `prompts.context`.
- `{{input}}`: literal token, exact match, no whitespace tolerance.

---

## Key Files

| Path | Role |
|---|---|
| `src/pages/CreateCampaign.tsx` | Variants step + advanced disclosure |
| `src/pages/CampaignDashboard.tsx` | Per-input drilldown + variant text panel |
| `src/server/lib/render-template.ts` | `{{input}}` substitution helper (added in Plan 04) |
| `src/server/routes/campaigns/generate.ts` | Per-kind assembly (Plan 04) |
| `api/campaigns/index.ts` | `ALLOWED_KINDS` flag widened in Phase 0 |
