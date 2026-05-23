# Operator Sidebar Pages Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder operator sidebar destinations with real pages, shipping a live `Dashboard`, a live `Model Library`, and polished shell versions of `Team Activity` and `API Settings`.

**Architecture:** Add a database-backed `model_registry` control layer on top of the existing static catalog, expose new operator-facing API endpoints for dashboard/library/activity/settings data, then wire new React routes and pages that stay inside the current design system. Keep analytics derived from existing tables rather than introducing heavyweight history systems.

**Tech Stack:** React 19, React Router 7, TanStack Query, Vite, TypeScript, Drizzle ORM, Neon HTTP driver, Vitest, Testing Library

---

**Workspace note:** this directory is currently not a git repository. Where steps below say “commit,” treat them as named checkpoints unless the workspace is initialized as git before implementation starts.

## File Map

### Backend foundation

- Create: `src/server/models/registry.ts`
- Create: `src/server/models/library.ts`
- Create: `src/server/dashboard/summary.ts`
- Create: `src/server/activity/feed.ts`
- Create: `src/server/settings/apiHealth.ts`
- Modify: `src/server/db/schema.ts`
- Modify: `src/lib/models.ts`
- Modify: `scripts/seed.ts`
- Create: `api/dashboard/index.ts`
- Create: `api/models/index.ts`
- Create: `api/models/[id]/index.ts`
- Create: `api/activity/index.ts`
- Create: `api/settings/api.ts`
- Create: `drizzle/0001_model_registry.sql`
- Modify: `drizzle/meta/_journal.json`

### Frontend routes and pages

- Modify: `src/App.tsx`
- Modify: `src/components/layout/OperatorLayout.tsx`
- Modify: `src/lib/api.ts`
- Modify: `src/pages/CreateCampaign.tsx`
- Create: `src/pages/OperatorDashboard.tsx`
- Create: `src/pages/ModelLibrary.tsx`
- Create: `src/pages/TeamActivity.tsx`
- Create: `src/pages/ApiSettings.tsx`
- Create: `src/components/dashboard/KpiCard.tsx`
- Create: `src/components/dashboard/AttentionPanel.tsx`
- Create: `src/components/models/ModelAvailabilityToggle.tsx`
- Create: `src/components/models/ModelDetailPanel.tsx`

### Tests and tooling

- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/test/renderWithProviders.tsx`
- Create: `src/components/layout/__tests__/OperatorLayout.test.tsx`
- Create: `src/server/models/__tests__/registry.test.ts`
- Create: `src/server/dashboard/__tests__/summary.test.ts`
- Create: `src/server/models/__tests__/library.test.ts`
- Create: `src/pages/__tests__/OperatorDashboard.test.tsx`
- Create: `src/pages/__tests__/ModelLibrary.test.tsx`
- Create: `src/pages/__tests__/CreateCampaign.test.tsx`

## Chunk 1: Testing Harness And Model Registry Backbone

### Task 1: Add The Test Harness

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/test/renderWithProviders.tsx`
- Test: `src/components/layout/__tests__/OperatorLayout.test.tsx`

- [ ] **Step 1: Install the failing-test toolchain**

Run:

```bash
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

Expected: new dev dependencies added without changing application behavior.

- [ ] **Step 2: Add the test runner configuration**

Create `vitest.config.ts` and `src/test/setup.ts` with the minimum browser test setup:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
});
```

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 3: Add test scripts to `package.json`**

Add:

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run"
  }
}
```

- [ ] **Step 4: Write the first failing navigation test**

Create `src/components/layout/__tests__/OperatorLayout.test.tsx`:

```tsx
it('renders real destinations for every operator nav item', () => {
  renderWithRouter(<OperatorLayout><div>body</div></OperatorLayout>);

  expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/dashboard');
  expect(screen.getByRole('link', { name: /campaigns/i })).toHaveAttribute('href', '/');
  expect(screen.getByRole('link', { name: /team activity/i })).toHaveAttribute('href', '/team-activity');
  expect(screen.getByRole('link', { name: /model library/i })).toHaveAttribute('href', '/models');
  expect(screen.getByRole('link', { name: /api settings/i })).toHaveAttribute('href', '/settings/api');
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run:

```bash
npm run test:run -- src/components/layout/__tests__/OperatorLayout.test.tsx
```

Expected: FAIL because the current layout still uses `to="#"` for the placeholder links.

- [ ] **Step 6: Checkpoint**

Checkpoint label: `plan-chunk-1-test-harness`

If git is available:

```bash
git add package.json vitest.config.ts src/test/setup.ts src/test/renderWithProviders.tsx src/components/layout/__tests__/OperatorLayout.test.tsx
git commit -m "test: add vitest harness for operator surfaces"
```

### Task 2: Add The Model Registry Schema

**Files:**
- Modify: `src/server/db/schema.ts`
- Create: `drizzle/0001_model_registry.sql`
- Modify: `drizzle/meta/_journal.json`
- Test: `src/server/models/__tests__/registry.test.ts`

- [ ] **Step 1: Write the failing registry-contract test**

Create `src/server/models/__tests__/registry.test.ts`:

```ts
it('treats enabled registry rows as the source of truth for future campaign selection', () => {
  const rows = [
    { providerModelId: 'openai/gpt-5', displayName: 'GPT-5', enabled: true, legacy: false },
    { providerModelId: 'anthropic/claude-opus-4-6', displayName: 'Claude Opus 4.6', enabled: false, legacy: false },
  ];

  expect(selectableRegistryModels(rows).map((row) => row.providerModelId)).toEqual(['openai/gpt-5']);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test:run -- src/server/models/__tests__/registry.test.ts
```

Expected: FAIL because `selectableRegistryModels` does not exist yet.

- [ ] **Step 3: Add the schema row definition**

Extend `src/server/db/schema.ts` with a new table:

```ts
export const modelRegistry = pgTable('model_registry', {
  id: uuid('id').primaryKey().defaultRandom(),
  providerModelId: text('provider_model_id').notNull().unique(),
  displayName: text('display_name').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  legacy: boolean('legacy').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 4: Generate and review the migration**

Run:

```bash
npm run db:generate
```

Expected: a new migration file plus metadata changes. Rename the generated SQL file to `drizzle/0001_model_registry.sql` if needed so the plan stays stable.

- [ ] **Step 5: Add the smallest passing helper**

Create `src/server/models/registry.ts` with:

```ts
export function selectableRegistryModels(rows: Array<{ enabled: boolean; legacy: boolean; providerModelId: string }>) {
  return rows.filter((row) => row.enabled && !row.legacy);
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run:

```bash
npm run test:run -- src/server/models/__tests__/registry.test.ts
```

Expected: PASS.

- [ ] **Step 7: Checkpoint**

Checkpoint label: `plan-chunk-1-model-registry-schema`

If git is available:

```bash
git add src/server/db/schema.ts src/server/models/registry.ts drizzle/0001_model_registry.sql drizzle/meta/_journal.json src/server/models/__tests__/registry.test.ts
git commit -m "feat: add model registry schema"
```

### Task 3: Implement Registry Sync And Live Toggle Rules

**Files:**
- Modify: `src/lib/models.ts`
- Modify: `src/server/models/registry.ts`
- Test: `src/server/models/__tests__/registry.test.ts`

- [ ] **Step 1: Extend the failing test to cover sync behavior**

Add:

```ts
it('preserves operator-managed flags while syncing the static catalog', () => {
  const existing = [
    { providerModelId: 'openai/gpt-5', displayName: 'GPT-5 old', enabled: false, legacy: false },
  ];

  const synced = mergeCatalogIntoRegistry(
    [{ providerModelId: 'openai/gpt-5', displayName: 'GPT-5' }],
    existing,
  );

  expect(synced).toEqual([
    { providerModelId: 'openai/gpt-5', displayName: 'GPT-5', enabled: false, legacy: false },
  ]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test:run -- src/server/models/__tests__/registry.test.ts
```

Expected: FAIL because `mergeCatalogIntoRegistry` does not exist yet.

- [ ] **Step 3: Add the minimal sync helper**

Implement:

```ts
export function mergeCatalogIntoRegistry(catalog, existing) {
  const byId = new Map(existing.map((row) => [row.providerModelId, row]));
  return catalog.map((entry) => {
    const prior = byId.get(entry.providerModelId);
    return {
      providerModelId: entry.providerModelId,
      displayName: entry.displayName,
      enabled: prior?.enabled ?? true,
      legacy: prior?.legacy ?? !!entry.legacy,
    };
  });
}
```

- [ ] **Step 4: Add the DB-backed sync wrapper**

In `src/server/models/registry.ts`, add a `syncModelRegistry()` function that:

- reads the static catalog from `src/lib/models.ts`
- reads existing `modelRegistry` rows
- upserts missing/new entries
- updates display names without overwriting `enabled`
- returns current rows

- [ ] **Step 5: Run the registry test file again**

Run:

```bash
npm run test:run -- src/server/models/__tests__/registry.test.ts
```

Expected: PASS.

- [ ] **Step 6: Checkpoint**

Checkpoint label: `plan-chunk-1-registry-sync`

If git is available:

```bash
git add src/lib/models.ts src/server/models/registry.ts src/server/models/__tests__/registry.test.ts
git commit -m "feat: sync static model catalog into registry"
```

## Chunk 2: Backend Operator Data Surfaces

### Task 4: Add The Dashboard Aggregation Helper

**Files:**
- Create: `src/server/dashboard/summary.ts`
- Create: `src/server/dashboard/__tests__/summary.test.ts`
- Create: `api/dashboard/index.ts`

- [ ] **Step 1: Write the failing dashboard-summary test**

Create `src/server/dashboard/__tests__/summary.test.ts`:

```ts
it('builds counts, attention buckets, and a cross-campaign leaderboard from operator data', async () => {
  const summary = await buildDashboardSummary(fakeDb);

  expect(summary.kpis.activeCampaigns).toBe(2);
  expect(summary.attention.readyToLaunch).toHaveLength(1);
  expect(summary.leaderboard[0]).toMatchObject({
    displayName: 'GPT-5',
    availability: 'enabled',
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test:run -- src/server/dashboard/__tests__/summary.test.ts
```

Expected: FAIL because `buildDashboardSummary` does not exist yet.

- [ ] **Step 3: Implement the minimal aggregator**

Create `src/server/dashboard/summary.ts` with:

- campaign counts grouped by status
- total votes
- unique participants
- recent campaign list
- attention buckets
- leaderboard rows derived from `model_registry`, `campaign_models`, `votes`, and `ratings`

Keep the first pass simple: compute in memory after a few broad reads instead of over-optimizing SQL.

- [ ] **Step 4: Expose the web handler**

Create `api/dashboard/index.ts`:

```ts
export default toVercelHandler(withOperator(async (request) => {
  if (request.method !== 'GET') return new Response('method not allowed', { status: 405 });
  const payload = await buildDashboardSummary(getDb());
  return json(payload, 200);
}));
```

- [ ] **Step 5: Run the dashboard-summary test again**

Run:

```bash
npm run test:run -- src/server/dashboard/__tests__/summary.test.ts
```

Expected: PASS.

- [ ] **Step 6: Checkpoint**

Checkpoint label: `plan-chunk-2-dashboard-backend`

If git is available:

```bash
git add src/server/dashboard/summary.ts src/server/dashboard/__tests__/summary.test.ts api/dashboard/index.ts
git commit -m "feat: add operator dashboard endpoint"
```

### Task 5: Add The Model Library Aggregation And Mutation Endpoints

**Files:**
- Create: `src/server/models/library.ts`
- Modify: `src/server/models/registry.ts`
- Create: `src/server/models/__tests__/library.test.ts`
- Create: `api/models/index.ts`
- Create: `api/models/[id]/index.ts`

- [ ] **Step 1: Write the failing model-library test**

Create `src/server/models/__tests__/library.test.ts`:

```ts
it('returns model rows with availability, usage, win signal, and recommendation tags', async () => {
  const library = await buildModelLibrary(fakeDb, { search: '', status: 'all', sort: 'usage' });

  expect(library.rows[0]).toMatchObject({
    displayName: 'Claude Sonnet 4.6',
    enabled: true,
  });
  expect(library.rows[0].usage.campaigns).toBeGreaterThan(0);
});

it('updates enabled state by registry id', async () => {
  const updated = await updateRegistryModel(fakeDb, 'registry-1', { enabled: false });
  expect(updated.enabled).toBe(false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test:run -- src/server/models/__tests__/library.test.ts
```

Expected: FAIL because `buildModelLibrary` and `updateRegistryModel` do not exist yet.

- [ ] **Step 3: Implement the library helper**

In `src/server/models/library.ts`, add:

- `buildModelLibrary(db, filters)`
- `buildModelRecommendations(rows)`
- search/filter/sort application
- usage and win-rate derivation from existing tables

- [ ] **Step 4: Implement the mutation helper**

In `src/server/models/registry.ts`, add:

```ts
export async function updateRegistryModel(db, id, patch: { enabled?: boolean; legacy?: boolean }) {
  // update row, set updatedAt, return updated row
}
```

Use registry `id` instead of `providerModelId` in the route because provider ids contain `/`.

- [ ] **Step 5: Expose GET and PATCH endpoints**

Create:

- `api/models/index.ts` for `GET /api/models`
- `api/models/[id]/index.ts` for `PATCH /api/models/:id`

Return JSON shapes that the frontend can use directly.

- [ ] **Step 6: Run the model-library test again**

Run:

```bash
npm run test:run -- src/server/models/__tests__/library.test.ts
```

Expected: PASS.

- [ ] **Step 7: Checkpoint**

Checkpoint label: `plan-chunk-2-model-library-backend`

If git is available:

```bash
git add src/server/models/library.ts src/server/models/registry.ts src/server/models/__tests__/library.test.ts api/models/index.ts api/models/[id]/index.ts
git commit -m "feat: add model library endpoints"
```

### Task 6: Add Activity And API Settings Data Endpoints

**Files:**
- Create: `src/server/activity/feed.ts`
- Create: `src/server/settings/apiHealth.ts`
- Create: `api/activity/index.ts`
- Create: `api/settings/api.ts`
- Test: `src/server/activity/__tests__/activity-and-settings.test.ts`

- [ ] **Step 1: Write a failing smoke test for the new helpers**

Create `src/server/activity/__tests__/activity-and-settings.test.ts`:

```ts
it('builds a lightweight activity feed from existing records', async () => {
  const feed = await buildActivityFeed(fakeDb);
  expect(feed.events[0]).toHaveProperty('kind');
});

it('reports configuration presence without exposing secret values', () => {
  const summary = buildApiSettingsSummary({
    OPENROUTER_API_KEY: 'secret',
    DATABASE_URL: 'postgres://example',
  });

  expect(summary.secrets.openrouter.configured).toBe(true);
  expect(summary.secrets.openrouter.value).toBeUndefined();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test:run -- src/server/activity/__tests__/activity-and-settings.test.ts
```

Expected: FAIL because the helpers do not exist yet.

- [ ] **Step 3: Implement the minimal passing helpers and routes**

- `buildActivityFeed()` should normalize events from campaigns, participants, and ratings recomputes.
- `buildApiSettingsSummary()` should return booleans and explanatory labels only.
- `api/activity/index.ts` and `api/settings/api.ts` should expose those helpers behind `withOperator`.

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
npm run test:run -- src/server/activity/__tests__/activity-and-settings.test.ts
```

Expected: PASS.

- [ ] **Step 5: Checkpoint**

Checkpoint label: `plan-chunk-2-shell-backend`

If git is available:

```bash
git add src/server/activity/feed.ts src/server/settings/apiHealth.ts api/activity/index.ts api/settings/api.ts
git commit -m "feat: add shell data endpoints for operator pages"
```

## Chunk 3: Frontend Routes, Navigation, And Real Pages

### Task 7: Wire The New Routes And Sidebar Destinations

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/layout/OperatorLayout.tsx`
- Test: `src/components/layout/__tests__/OperatorLayout.test.tsx`

- [ ] **Step 1: Run the existing failing nav test**

Run:

```bash
npm run test:run -- src/components/layout/__tests__/OperatorLayout.test.tsx
```

Expected: FAIL because the placeholder links still point to `#`.

- [ ] **Step 2: Add the real routes**

Update `src/App.tsx`:

```tsx
<Route path="/dashboard" element={<OperatorDashboard />} />
<Route path="/models" element={<ModelLibrary />} />
<Route path="/team-activity" element={<TeamActivity />} />
<Route path="/settings/api" element={<ApiSettings />} />
```

- [ ] **Step 3: Replace placeholder nav links**

Update `src/components/layout/OperatorLayout.tsx` so the sidebar uses real `Link` targets and active-state logic for all five destinations.

- [ ] **Step 4: Re-run the nav test**

Run:

```bash
npm run test:run -- src/components/layout/__tests__/OperatorLayout.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Checkpoint**

Checkpoint label: `plan-chunk-3-routing`

If git is available:

```bash
git add src/App.tsx src/components/layout/OperatorLayout.tsx src/components/layout/__tests__/OperatorLayout.test.tsx
git commit -m "feat: add real operator sidebar routes"
```

### Task 8: Build The Dashboard Page

**Files:**
- Create: `src/pages/OperatorDashboard.tsx`
- Create: `src/components/dashboard/KpiCard.tsx`
- Create: `src/components/dashboard/AttentionPanel.tsx`
- Modify: `src/lib/api.ts`
- Test: `src/pages/__tests__/OperatorDashboard.test.tsx`

- [ ] **Step 1: Write the failing dashboard page test**

Create `src/pages/__tests__/OperatorDashboard.test.tsx`:

```tsx
it('renders KPI cards, recent campaigns, and the cross-campaign leaderboard', async () => {
  mockApi('/api/dashboard', dashboardFixture);
  renderWithRouter(<OperatorDashboard />);

  expect(await screen.findByText(/active campaigns/i)).toBeInTheDocument();
  expect(screen.getByText(/top models/i)).toBeInTheDocument();
  expect(screen.getByText(/needs attention/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test:run -- src/pages/__tests__/OperatorDashboard.test.tsx
```

Expected: FAIL because the page and API types do not exist yet.

- [ ] **Step 3: Add the API types**

Extend `src/lib/api.ts` with `DashboardSummary`, `DashboardLeaderboardRow`, and `ActivityEvent` types plus a small helper fetch hook if it stays DRY.

- [ ] **Step 4: Build the minimal page**

Implement `src/pages/OperatorDashboard.tsx` using:

- TanStack Query
- existing operator layout
- compact KPI strip
- recent campaigns
- top model leaderboard
- attention panel

Stay within the current component system and avoid inventing a parallel visual language.

- [ ] **Step 5: Re-run the dashboard page test**

Run:

```bash
npm run test:run -- src/pages/__tests__/OperatorDashboard.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Checkpoint**

Checkpoint label: `plan-chunk-3-dashboard-page`

If git is available:

```bash
git add src/pages/OperatorDashboard.tsx src/components/dashboard/KpiCard.tsx src/components/dashboard/AttentionPanel.tsx src/lib/api.ts src/pages/__tests__/OperatorDashboard.test.tsx
git commit -m "feat: build operator dashboard page"
```

### Task 9: Build The Model Library Page

**Files:**
- Create: `src/pages/ModelLibrary.tsx`
- Create: `src/components/models/ModelAvailabilityToggle.tsx`
- Create: `src/components/models/ModelDetailPanel.tsx`
- Modify: `src/lib/api.ts`
- Test: `src/pages/__tests__/ModelLibrary.test.tsx`

- [ ] **Step 1: Write the failing model-library page test**

Create `src/pages/__tests__/ModelLibrary.test.tsx`:

```tsx
it('renders model rows and toggles availability optimistically', async () => {
  mockApi('/api/models', libraryFixture);
  mockPatch('/api/models/registry-1', { ...libraryFixture.rows[0], enabled: false });

  renderWithRouter(<ModelLibrary />);

  const toggle = await screen.findByRole('switch', { name: /gpt-5/i });
  await user.click(toggle);

  expect(toggle).toHaveAttribute('aria-checked', 'false');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test:run -- src/pages/__tests__/ModelLibrary.test.tsx
```

Expected: FAIL because the page and toggle components do not exist yet.

- [ ] **Step 3: Add the page and table**

Build `src/pages/ModelLibrary.tsx` with:

- query for `/api/models`
- search/filter/sort controls
- table rows
- availability toggle mutation
- detail panel
- recommendation panel

- [ ] **Step 4: Implement optimistic mutation behavior**

Use TanStack Query mutation lifecycle:

- optimistic row update
- rollback on error
- invalidate/refetch on settle

- [ ] **Step 5: Re-run the model-library page test**

Run:

```bash
npm run test:run -- src/pages/__tests__/ModelLibrary.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Checkpoint**

Checkpoint label: `plan-chunk-3-model-library-page`

If git is available:

```bash
git add src/pages/ModelLibrary.tsx src/components/models/ModelAvailabilityToggle.tsx src/components/models/ModelDetailPanel.tsx src/lib/api.ts src/pages/__tests__/ModelLibrary.test.tsx
git commit -m "feat: build model library page"
```

### Task 10: Build Team Activity And API Settings Shell Pages

**Files:**
- Create: `src/pages/TeamActivity.tsx`
- Create: `src/pages/ApiSettings.tsx`
- Test: `src/pages/__tests__/OperatorShellPages.test.tsx`

- [ ] **Step 1: Write a small failing smoke test for each shell page**

Create `src/pages/__tests__/OperatorShellPages.test.tsx`:

```tsx
it('renders activity sections and recent events', async () => {
  mockApi('/api/activity', activityFixture);
  renderWithRouter(<TeamActivity />);
  expect(await screen.findByText(/recent events/i)).toBeInTheDocument();
});

it('renders configuration health cards without exposing secrets', async () => {
  mockApi('/api/settings/api', settingsFixture);
  renderWithRouter(<ApiSettings />);
  expect(await screen.findByText(/configuration health/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npm run test:run -- src/pages/__tests__/OperatorShellPages.test.tsx
```

Expected: FAIL because the pages do not exist yet.

- [ ] **Step 3: Implement the pages**

- `TeamActivity.tsx`: recent events, active campaign highlights, throughput summary
- `ApiSettings.tsx`: configuration cards, explanatory copy, read-only status rows

- [ ] **Step 4: Re-run the tests**

Run:

```bash
npm run test:run -- src/pages/__tests__/OperatorShellPages.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Checkpoint**

Checkpoint label: `plan-chunk-3-shell-pages`

If git is available:

```bash
git add src/pages/TeamActivity.tsx src/pages/ApiSettings.tsx
git commit -m "feat: add operator shell pages"
```

## Chunk 4: Campaign Flow Integration And Full Verification

### Task 11: Replace Static Model Selection In Create Campaign

**Files:**
- Modify: `src/pages/CreateCampaign.tsx`
- Modify: `src/lib/api.ts`
- Test: `src/pages/__tests__/CreateCampaign.test.tsx`

- [ ] **Step 1: Write the failing create-campaign test**

Create `src/pages/__tests__/CreateCampaign.test.tsx`:

```tsx
it('only shows enabled non-legacy models in the campaign model selector', async () => {
  mockApi('/api/models', {
    rows: [
      { id: '1', displayName: 'GPT-5', providerModelId: 'openai/gpt-5', enabled: true, legacy: false },
      { id: '2', displayName: 'Llama 4', providerModelId: 'meta-llama/llama-4', enabled: false, legacy: false },
    ],
  });

  renderWithRouter(<CreateCampaign />);
  advanceToModelStep();

  expect(await screen.findByText(/gpt-5/i)).toBeInTheDocument();
  expect(screen.queryByText(/llama 4/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test:run -- src/pages/__tests__/CreateCampaign.test.tsx
```

Expected: FAIL because the page still reads from the static catalog.

- [ ] **Step 3: Replace the static catalog read**

In `src/pages/CreateCampaign.tsx`:

- remove direct use of `activeModels()` for runtime options
- fetch `/api/models`
- derive the selectable list from `enabled && !legacy`
- keep the existing stepper and styling

- [ ] **Step 4: Re-run the create-campaign test**

Run:

```bash
npm run test:run -- src/pages/__tests__/CreateCampaign.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Checkpoint**

Checkpoint label: `plan-chunk-4-create-campaign-integration`

If git is available:

```bash
git add src/pages/CreateCampaign.tsx src/lib/api.ts src/pages/__tests__/CreateCampaign.test.tsx
git commit -m "feat: use live model registry in campaign creation"
```

### Task 12: Verify End-To-End Operator Flow

**Files:**
- Modify: `package.json` (only if helper scripts improve repeatability)
- Test: targeted Vitest files from previous tasks

- [ ] **Step 1: Run targeted tests in backend order**

Run:

```bash
npm run test:run -- src/server/models/__tests__/registry.test.ts
npm run test:run -- src/server/dashboard/__tests__/summary.test.ts
npm run test:run -- src/server/models/__tests__/library.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Run targeted tests in frontend order**

Run:

```bash
npm run test:run -- src/components/layout/__tests__/OperatorLayout.test.tsx
npm run test:run -- src/pages/__tests__/OperatorDashboard.test.tsx
npm run test:run -- src/pages/__tests__/ModelLibrary.test.tsx
npm run test:run -- src/pages/__tests__/CreateCampaign.test.tsx
```

Expected: all PASS.

- [ ] **Step 3: Run typecheck and production build**

Run:

```bash
npm run lint
npm run build
```

Expected: both PASS.

- [ ] **Step 4: Manual smoke test**

Run the app and verify:

1. login succeeds
2. sidebar destinations all work
3. dashboard renders live data
4. model toggle updates and persists
5. disabled model disappears from create-campaign selection
6. team activity and API settings render without broken states

- [ ] **Step 5: Final checkpoint**

Checkpoint label: `plan-chunk-4-final-verification`

If git is available:

```bash
git add .
git commit -m "feat: ship real operator sidebar pages"
```

## Execution Notes

- Prefer thin route handlers and focused server helpers.
- Keep cross-campaign analytics derived from existing data; do not add premature history tables.
- Preserve current visual language; the new pages should feel like the same product, not a redesign.
- Keep the model registry logic boring and explicit. Elegant beats clever here.

Plan complete and saved to `docs/superpowers/plans/2026-04-17-operator-sidebar-pages.md`. Ready to execute?
