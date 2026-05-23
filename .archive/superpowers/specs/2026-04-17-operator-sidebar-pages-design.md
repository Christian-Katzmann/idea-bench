# Operator Sidebar Pages Design

**Date:** 2026-04-17

**Status:** Approved

**Goal**

Replace the placeholder operator sidebar destinations with real, on-brand pages that make the app feel complete and operationally useful. `Dashboard` and `Model Library` should ship as genuinely useful product surfaces. `Team Activity` and `API Settings` should ship as polished, believable shells that fit the same information architecture and can deepen later without redesign.

## Product Decisions

- Keep the current design system, typography, dark theme, spacing language, and component vocabulary.
- Keep `Campaigns` as the current root page at `/`.
- Add real routes for the placeholder sidebar items:
  - `/dashboard`
  - `/team-activity`
  - `/models`
  - `/settings/api`
- Use the approved `A3` layout direction:
  - hybrid of calm operator overview and stronger analytics structure
  - more signal than the current campaigns page
  - less density than a full research console

## Page Roles

### Dashboard

The operator control room.

It should answer three questions immediately:

1. What is happening across the app right now?
2. Which campaigns need attention?
3. Which models are strongest across campaigns?

### Model Library

The model intelligence and control workspace.

It should let the operator:

- understand how models are performing across campaigns
- see where each model is used
- enable or disable models for future campaign creation
- keep historical model references intact

### Team Activity

A polished shell in v1.

It should establish the future information architecture for activity and throughput without requiring a full audit/event system yet.

### API Settings

A polished shell in v1.

It should make the system feel complete and trustworthy by clearly showing configuration health, sensitive boundaries, and what is or is not editable in the UI today.

## Information Architecture

### Dashboard Content Blocks

#### KPI strip

- active campaigns
- draft campaigns
- total votes
- unique participants
- `New Campaign` quick action

#### Operational overview

- recent campaigns list
- status badge
- created time
- total votes
- participant count
- direct link to each campaign

#### Cross-campaign model leaderboard

- best-performing models across campaigns
- show:
  - model name
  - appearances
  - comparisons
  - win rate
  - current availability status
- allow a lightweight filter such as:
  - all campaigns
  - active only
  - completed only

#### Needs attention

- draft campaigns with no generations
- draft campaigns ready to launch
- active campaigns with low vote volume

#### Recent movement

- concise event feed derived from existing records
- examples:
  - campaign created
  - campaign activated
  - participant finished
  - ratings recomputed

### Model Library Content Blocks

#### Library header

- total models in registry
- enabled count
- disabled count
- legacy count

#### Filter and sort row

- search by display name or provider model id
- filter by:
  - enabled
  - disabled
  - legacy
  - in use
- sort by:
  - name
  - usage
  - win rate

#### Model table

Per model row:

- display name
- provider model id
- live availability toggle
- legacy badge
- usage across campaigns
- comparisons / vote signal
- win rate
- campaign footprint
- recommendation tag

#### Selection guidance panel

- recommended mix for the next campaign
- coverage notes
- warnings about low-sample or underperforming models

#### Detail panel

- campaigns that use the model
- activity/status summary
- why the model is recommended, neutral, or discouraged

### Team Activity Shell

- recent events list
- top active campaigns
- participant throughput summary
- empty state copy that still feels product-grade

### API Settings Shell

- provider and secret health cards
- environment readiness summary
- explanatory copy for what is editable later
- explicit visual distinction between configured, missing, and not-editable-in-UI

## Data Architecture

### Model Registry

The current static catalog in `src/lib/models.ts` remains the canonical list of recognized models and their baseline labels. A new database-backed registry becomes the live operator control layer.

Add a new `model_registry` table with:

- `id`
- `provider_model_id` (unique)
- `display_name`
- `enabled`
- `legacy`
- `created_at`
- `updated_at`

### Canonical split of responsibility

- Code catalog:
  - defines which provider model ids are recognized by the app
  - defines default labels
- Database registry:
  - defines which recognized models are currently available to operators
  - stores live enable/disable and legacy state

This keeps model identity stable while allowing runtime operator control without redeploy-only edits.

### Registry sync strategy

Introduce an idempotent sync helper that upserts the code-defined catalog into `model_registry`.

Behavior:

- newly added code catalog entries appear in the DB automatically
- existing DB rows keep operator-managed flags such as `enabled`
- provider model ids remain canonical across history

This helper should be safe to call repeatedly. In v1, it can run from operator-facing registry/dashboard/create-campaign code paths rather than requiring boot-time infrastructure.

## Aggregation Strategy

Do not add heavyweight analytics/history tables in this phase.

Use the existing tables to derive the new pages:

- `campaigns`
- `participants`
- `votes`
- `ratings`
- `campaign_models`
- `generations`

Cross-campaign model insight should be computed from existing campaign membership, votes, and ratings plus the new registry rows.

## Frontend/Backend Shape

### New operator routes

- `src/pages/OperatorDashboard.tsx`
- `src/pages/ModelLibrary.tsx`
- `src/pages/TeamActivity.tsx`
- `src/pages/ApiSettings.tsx`

### New backend endpoints

- `GET /api/dashboard`
  - aggregate dashboard payload
- `GET /api/models`
  - model library payload, filters, usage, recommendations
- `PATCH /api/models/:id`
  - update `enabled` and/or `legacy`
- `GET /api/activity`
  - lightweight activity feed and shell data
- `GET /api/settings/api`
  - configuration health summary

### Existing flow changes

- `Create Campaign` must stop reading directly from `activeModels()` at render time.
- It should fetch the operator-visible model list from the backend and only show models that are currently enabled and not legacy by default.

Historical campaign pages continue to resolve model information from stored campaign rows, so disabling a model never breaks existing campaigns.

## Interaction Design

### Dashboard

- Clicking a campaign row opens that campaign.
- Clicking a leaderboard model opens `Model Library` with that model pre-filtered.
- Attention cards deep-link to the related campaign.
- Once loaded, local filters should feel instant.

### Model Library

- Availability toggle updates optimistically.
- On mutation failure, the row must revert visibly and show inline feedback.
- Disabled models disappear from future campaign creation but stay visible in history and in the library.
- Legacy models remain visible and labeled but are excluded from default selection.
- Clicking a row opens a detail panel rather than navigating away.

### Team Activity

- Read-only in v1.
- Feels operational, not decorative.

### API Settings

- Mostly read-only in v1.
- Never reveal secret values.
- Make current limitations explicit instead of implying hidden functionality exists.

## Error Handling

### Dashboard

- if the whole page fails, show a page-level error with retry
- if a subsection fails, degrade that subsection only

### Model Library

- toggle failures show inline row-level error state
- optimistic updates revert cleanly
- recommendations may fail independently without blocking catalog visibility

### Team Activity and API Settings

- simple empty/error states are sufficient in v1

### Backend rules

- unknown provider ids must be rejected
- registry sync must be idempotent
- historical campaign rendering must remain stable for disabled or legacy models

## Testing Strategy

### Backend

- registry sync behavior
- model toggle update behavior
- dashboard aggregation math
- model library aggregation and filtering
- create-campaign available-model filtering
- historical campaign stability after disable/legacy changes

### Frontend

- sidebar navigation renders correct routes
- dashboard loading, error, and empty states
- model library filter/sort behavior
- optimistic toggle update and rollback

### Integration

- login
- navigate to dashboard
- navigate to model library
- disable a model
- verify the disabled model is excluded from create-campaign selection

## Out of Scope for This Phase

- freeform model creation/editing in the UI
- editing provider ids in the UI
- full audit log/event sourcing
- chart-heavy trend analysis
- secret editing in the browser
- advanced recommendation models beyond rule-based heuristics

## Implementation Order

1. Add model registry persistence and sync
2. Add backend endpoints for dashboard and model library
3. Add frontend routes and sidebar navigation
4. Build dashboard
5. Build model library
6. Build polished shell pages for team activity and API settings
7. Add tests and full verification

## Notes

- This workspace is currently not a git repository, so the usual “write spec and commit it” step from the brainstorming workflow cannot be completed here. The spec is still saved in the expected location so implementation can begin cleanly.
