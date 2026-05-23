# Plan 03 — Prompt Collections + Campaign Duplication

> Status: Approved, not started. Partially independent of Plans 01 and 02
> (can ship in parallel, benefits compound once those land).
> Last updated: 2026-04-20.
> See [roadmap README](./README.md) for cross-plan context.

## Context

Reuse is the theme. ModelArena operators run many campaigns over time —
some prompts turn out especially valuable, and many campaigns are minor
variations of a previous one (swap a model, tweak a prompt, re-run with
the same setup). Today, neither pattern is supported:

- A prompt that's been proven by hundreds of votes in an old campaign is
  effectively lost once the campaign closes. To reuse it, the operator
  copy-pastes text and loses all the metadata (category tags, structured
  breakdown, vote history).
- A new campaign that's 95% the same as an existing one requires
  re-entering every model, every prompt, every setting. Mentioned as a
  gap in the original code audit.

**Prompt Collections** let an operator curate named, versioned libraries
of prompts pulled from campaign history — organized with folders and tags,
and runnable as the seed of a new campaign any time a new model drops.

**Campaign Duplication** is a one-click "duplicate this campaign" action
that deep-copies the entire config (models, prompts, modes, settings) into
a new draft for editing and re-running.

Both features are about compound value. A customer with 20 campaigns in
history gets 4× the value of one with 5, because every new model release
exercises all of their Collections and every experiment builds on a
duplicated baseline instead of starting from scratch. This is the
stickiness lever.

## User-Facing Behavior

### Campaign duplication

A "Duplicate" action is available on any campaign (list view menu, detail
page action row, Settings tab). Clicking it:

1. Creates a new campaign in `draft` status with:
   - Name suffixed ` (copy)` — editable before launch
   - All models copied (same `provider_model_id`s)
   - All prompts copied (text, structured, category tags, mode,
     mode_config — from Plan 01)
   - Voting mode, email prompt message, all campaign-level settings
     copied
2. **Does NOT copy** generations, votes, participants, tournaments,
   ratings. Those re-generate / re-collect on the new campaign.
3. Redirects the operator to the new campaign's edit view — they can
   tweak anything before launching.

Duplication is idempotent from the perspective of the source campaign:
it's read-only, unchanged. The new campaign is independent.

### Prompt Collections

**Data model.**
- A **Collection** is a named set of prompts. Fields: name, description,
  folder path (optional — see below), tags (optional, multi-valued).
- A **Collection Item** is a prompt snapshot inside a collection. It
  stores the prompt's text, structured breakdown, category tags, mode,
  and mode_config at the moment of promotion. It retains a link to the
  source prompt for traceability but doesn't depend on it — the source
  prompt being deleted does not break the collection.

**Organization.** Collections live inside nested folders (not flat).
A folder is just a path — e.g., `Support/Refund Responses`. No hard
depth limit. Tags are orthogonal: a collection can be in
`Support/Refund Responses` AND tagged `#external-communication`.

**Promoting prompts to a collection.** Two entry points:
1. From a campaign detail page, "Promote to Collection" on any prompt row
   — creates a new collection item in an existing or new collection
2. From the Collection editor, "Add from campaign history" — browse past
   campaigns, select one or more prompts, add them in bulk

**Running a Collection.** From a collection's detail page, "Run against
models" opens a quick campaign-creation flow pre-seeded with the
collection's prompts. Operator picks models, clicks launch. Generations
run as normal, votes collect as normal, results roll up as normal.

**Versioning.** Each time a collection is run, the snapshot of prompts
used in that run is preserved. If the collection is edited later (add,
remove, or replace prompts), previous runs retain their own snapshot.
The collection detail page shows a run history: "Run on 2026-03-15 vs
4 models, 82 votes" with a link to the campaign that was created.

**Core use case**: "New model dropped today. Run my Collection against
it." Operator browses to the collection, clicks "Run," picks the new
model + 2–3 baseline models, generates + launches. The new campaign's
results are directly comparable to past runs of the same collection
because the prompts are snapshots — not dependent on whether the source
campaigns still exist.

## Architecture

### Schema additions

```typescript
// Reusable folder-path for collection organization — free-form string,
// slash-separated. Not a separate table; keeping it as a string avoids
// cycles and keeps queries simple.

export const collections = pgTable('collections', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  folderPath: text('folder_path').notNull().default(''), // e.g. 'Support/Refund Responses'
  tags: text('tags').array().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('collections_org_folder').on(t.orgId, t.folderPath),
]);

export const collectionItems = pgTable('collection_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  collectionId: uuid('collection_id').notNull().references(() => collections.id, { onDelete: 'cascade' }),
  orderIndex: integer('order_index').notNull(),
  // Snapshot fields — copied from source prompt at promotion time
  text: text('text').notNull(),
  structured: jsonb('structured').$type<PromptStructured>(),
  categoryTags: text('category_tags').array().notNull().default([]),
  mode: promptModeEnum('mode').notNull().default('tournament'),
  modeConfig: jsonb('mode_config'),
  // Traceability — not a FK (source can be deleted without breaking)
  sourcePromptId: uuid('source_prompt_id'),
  sourceCampaignId: uuid('source_campaign_id'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uniq_collection_order').on(t.collectionId, t.orderIndex),
]);

// When a collection is run, record the snapshot so historical runs are
// reproducible even if the collection has since been edited
export const collectionRuns = pgTable('collection_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  collectionId: uuid('collection_id').notNull().references(() => collections.id, { onDelete: 'cascade' }),
  campaignId: uuid('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  // Snapshot of the collection items used for this run — deep-copied into
  // the campaign's prompts, but also preserved here for quick lookup
  itemIdsSnapshot: uuid('item_ids_snapshot').array().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

Folder paths are strings with `/` as the separator. Empty string = root.
Validated at the API layer (no leading/trailing slashes, no `//`, reasonable
character set). This keeps queries trivially indexable without a recursive
folders table.

### Campaign duplication

New handler: `POST /api/campaigns/:id/duplicate`.

Logic:
```
1. Load source campaign + prompts + campaign_models (read-only)
2. In a transaction:
   a. Insert new campaigns row with status='draft', new share_slug,
      name=source.name + ' (copy)', copying everything except:
      timestamps, status, deletedAt, closedAt
   b. Insert new campaign_models rows referencing the new campaign_id
   c. Insert new prompts rows referencing the new campaign_id and (after
      Plan 01) copying mode/mode_config
3. Return the new campaign id
```

Explicitly does NOT copy: generations, participants, tournaments, votes,
ratings. The new campaign starts clean. Operator runs generation when
ready.

### Running a collection as a campaign

New handler: `POST /api/collections/:id/run`.

Input body:
```json
{
  "name": "Support Bot v2 vs Claude 4",
  "modelIds": ["anthropic/claude-4", "anthropic/claude-3.5-sonnet", ...],
  "description": "..."
}
```

Logic:
```
1. Load collection + items (ordered by orderIndex)
2. In a transaction:
   a. Create a new draft campaign
   b. Create campaign_models for each modelId
   c. Create prompts by deep-copying each collection_item's snapshot
      fields
   d. Insert a collection_runs row linking collection → new campaign,
      with itemIdsSnapshot preserved
3. Return the new campaign id
```

Operator is redirected to the campaign's generate-and-launch flow.

### Collections browser UI

- Left sidebar: folder tree, built client-side from `folderPath` strings
  of all the org's collections
- Main pane: list of collections in the selected folder + any tag
  filters, sorted by `updatedAt DESC` by default
- Each collection card shows: name, item count, last run (if any), tags
- Search across name + description + tags
- Quick actions: Run, Duplicate, Delete

Collection detail page:
- Prompt list (reorderable)
- Add prompts (from campaign history picker, or new blank prompt)
- Edit prompt snapshots in place
- Run history (list of past campaigns created from this collection, with
  rating summary for each)

### Campaign history picker

Shared component between "promote prompt" and "add from campaign
history":
- Browse past campaigns in a searchable list
- Expand a campaign to see its prompts
- Multi-select prompts; confirm adds them as collection items

## Implementation Phases

### Phase 1 — Campaign Duplication

Small, high-value. Ship independently, before Collections.

- Schema: no changes needed (all tables already exist)
- API: `POST /api/campaigns/:id/duplicate`
- UI: "Duplicate" action in CampaignDashboard Settings tab + list view
  row menu
- Handle the Plan 01 dependency gracefully: if Plan 01 has shipped,
  copy mode + mode_config; if not, defaults to tournament

Exit: operator can duplicate any campaign and edit the copy. Tested for
all voting_mode variants, all category tag configurations, and campaigns
with 1–50 prompts and 1–20 models.

### Phase 2 — Collections data model + basic CRUD

- Schema: `collections`, `collection_items`, `collection_runs` tables
- API: full CRUD for collections and items; promote-prompt-to-collection
  endpoint; run-collection endpoint
- UI: minimal Collections browser (flat list, no folders yet) + detail
  page + promote-prompt action on campaign pages
- Campaign history picker component

Exit: operator can promote prompts from campaigns into collections, run
a collection as a new campaign, and see the run history on the
collection detail page.

### Phase 3 — Organization (folders + tags + search)

- Client-side folder tree built from `folderPath` strings
- Tag management + multi-select tag filter
- Search across name/description/tags
- Move-to-folder and retag bulk actions

Exit: a customer with 30+ collections can find what they need quickly.

### Phase 4 — Polish

- Versioning UI: diff between collection versions (current vs past run's
  snapshot)
- Export collection to JSON (for backup / portability)
- Duplicate collection action
- "Templates" — seeded starter collections for common use cases (support
  bot eval, content quality, etc.); same editorial craft as starter
  personas

Exit: Collections feel like a mature content-organization surface, not
just a prompt list.

## Acceptance Criteria

- [ ] Operator can duplicate any campaign with a single click and edit
  the resulting draft before launching
- [ ] Duplication does NOT copy generations, votes, or participants
- [ ] Operator can promote individual prompts from a campaign into a
  collection (new or existing)
- [ ] Operator can run a collection as a new campaign by picking models;
  prompts are deep-copied from collection snapshots
- [ ] Running the same collection three times against different model
  sets produces three independent campaigns, each with its own votes
  and ratings
- [ ] Collections are organizable via folder paths + tags + search
- [ ] Collection detail page shows run history with links to past
  campaigns
- [ ] Deleting a source campaign does not break collections derived from
  its prompts (snapshot model is load-bearing)
- [ ] All operations scope cleanly to the operator's org (after
  multi-tenancy ships)

## Risks & Watchouts

1. **Snapshot vs reference.** The plan takes snapshots — collection
   items are independent copies of prompt text + structure. Resist the
   temptation to make collections reference live prompts. If the source
   campaign is deleted, snapshots should survive. If a source prompt is
   edited post-promotion, the collection keeps the original. This is
   the whole point.

2. **Folder paths as strings can drift.** Typos create duplicate folders
   (`Support/Refunds` vs `Support / Refunds`). Mitigate with a folder
   picker UI that shows existing paths as suggestions, not free-form
   entry. Backstop: a dedupe/merge action for operators who've made a
   mess.

3. **Duplication must be fully isolated.** The new campaign must not
   reference any row from the source campaign. Every copy is a fresh
   row with a fresh id. Test this explicitly — one hidden FK to the
   source and edits cascade unexpectedly.

4. **Collection items vs prompts divergence.** Collections snapshot the
   prompt schema as of promotion time. When Plan 01 (modes) ships, old
   collection items will have mode=tournament by default. That's fine —
   but be explicit in the UI about which mode each item is set to, and
   let the operator change it when running the collection.

5. **Don't build folders as a table.** Avoid the temptation to model
   folders as a separate table with parent pointers. That's overkill for
   the UX. String paths are simpler, indexable, and adequate.

6. **Scale of campaign history.** The "browse past campaigns" picker
   must paginate. An org with 200+ campaigns shouldn't crash the UI.

7. **Duplicate campaigns can drift silently.** Operator duplicates a
   campaign, makes a small edit, re-runs — looks identical to the
   source but isn't. Leaderboard comparisons across the two campaigns
   must be opt-in, not automatic.

## Critical Files

- `src/server/db/schema.ts` — collections, collection_items,
  collection_runs tables
- `src/server/collections/index.ts` — new module
  - `duplicate.ts` — campaign duplication logic (also used by
    `/api/campaigns/:id/duplicate`)
  - `promote.ts` — prompt promotion to collection
  - `run.ts` — collection → new campaign
- `api/campaigns/[id]/duplicate.ts` — duplication endpoint
- `api/collections/index.ts` + `api/collections/[id]/*.ts` — CRUD + run
- `src/pages/Collections.tsx` — browser page
- `src/pages/CollectionDetail.tsx` — detail + run history
- `src/components/campaigns/PromoteToCollection.tsx` — modal invoked
  from campaign detail page
- `src/components/collections/CampaignHistoryPicker.tsx` — reusable
  picker
- `src/pages/CampaignDashboard.tsx` — "Duplicate" action in Settings
  tab
- `drizzle/000X_collections.sql`

## Verification

1. `npm run db:migrate` — migration applies cleanly
2. `npm run test:run` — new tests pass (duplication isolation, snapshot
   independence, run-collection flow)
3. Integration, Phase 1: duplicate a campaign with 4 models, 10 prompts,
   mixed category tags, and non-default voting_mode. Confirm the copy
   has all the same config and none of the source's generations/votes
4. Integration, Phase 2: promote 5 prompts from campaign A into a new
   collection, run the collection against a different set of models,
   complete a vote on the new campaign, see results
5. Integration, Phase 2: delete the source campaign after promoting.
   Collection still exists, still runs, still shows snapshots intact
6. Integration, Phase 3: create 30 collections across 5 folder paths
   with overlapping tags. Folder tree renders correctly; tag filter
   narrows results; search finds by name
7. Scale: campaign history picker loads responsively with 200+
   campaigns (paginated, not all at once)
8. Regression: existing campaigns behave identically; Collections are a
   purely additive surface

Any failure in 1–8 means the feature isn't done.
