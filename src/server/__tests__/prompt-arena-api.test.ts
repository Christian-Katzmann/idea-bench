/**
 * Plan 05 Phase 0 — API smoke test for the `kind='prompt'` create path.
 *
 * Verifies the feature-flag flip in `api/campaigns/index.ts`: a
 * minimal prompt-arena payload (2 variants with `{{input}}`, 2 inputs,
 * pinned model, optional pinned system prompt) round-trips through
 * the create handler and shows up in the list endpoint.
 *
 * This test stays at the handler boundary — the `parseCreatePayload`
 * branches are exhaustively covered by `campaigns-validation.test.ts`.
 * The point here is to prove the handler accepts the new kind, writes
 * the right rows via Drizzle, and returns the new response shape.
 *
 * The sibling kind `system_prompt` has its own smoke test at
 * `system-prompt-arena-api.test.ts` (Plan 06 Phase 0).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/client', () => ({ getDb: vi.fn() }));
vi.mock('../models/registry', () => ({
  listSelectableRegistryModels: vi.fn(),
}));
vi.mock('../models/library', () => ({
  invalidateAnalyticsSnapshot: vi.fn(),
}));

import campaignsHandler from '../../../api/campaigns/index';
import { signOperatorCookie } from '../auth/cookies';
import { getDb } from '../db/client';
import { listSelectableRegistryModels } from '../models/registry';

const getDbMock = getDb as unknown as ReturnType<typeof vi.fn>;
const listSelectableRegistryModelsMock =
  listSelectableRegistryModels as unknown as ReturnType<typeof vi.fn>;

const PINNED_MODEL_ID = 'anthropic/claude-sonnet-4-6';
const REGISTRY_ENTRY = {
  id: 'registry-row-id',
  providerModelId: PINNED_MODEL_ID,
  displayName: 'Claude Sonnet 4.6',
  enabled: true,
  legacy: false,
};

type Phase = 'campaigns' | 'prompts' | 'campaignModels';

interface InsertCall {
  phase: Phase;
  values: unknown;
}

interface FakeDbState {
  inserts: InsertCall[];
  campaignsList: Array<Record<string, unknown>>;
}

/**
 * Drizzle's neon-http driver is fluent: `db.insert(table).values(...).returning()`
 * returns rows. We mimic that shape minimally — just enough for the
 * handler under test. The campaigns POST handler issues exactly three
 * inserts in a fixed order:
 *   1. campaigns (single row)
 *   2. prompts (array)
 *   3. campaign_models (array)
 * so we tag inserts by call index rather than by sniffing Drizzle's
 * private metadata on the table reference.
 *
 * For `select`, we support the GET list shape the handler hits:
 *   - GET /api/campaigns → `db.select({...}).from(campaigns).where(...).orderBy(...)`
 */
function makeFakeDb(opts: { campaignsList?: Array<Record<string, unknown>> } = {}) {
  const state: FakeDbState = {
    inserts: [],
    campaignsList: opts.campaignsList ?? [],
  };

  const phases: Phase[] = ['campaigns', 'prompts', 'campaignModels'];

  const db = {
    _state: state,
    insert(_table: unknown) {
      const phase = phases[state.inserts.length] ?? 'campaignModels';
      return {
        values(values: unknown) {
          state.inserts.push({ phase, values });
          return {
            async returning() {
              if (phase === 'campaigns') {
                const v = values as Record<string, unknown>;
                return [
                  {
                    id: 'campaign-uuid-1',
                    shareSlug: v.shareSlug,
                    kind: v.kind,
                    name: v.name,
                    description: v.description,
                    categories: v.categories,
                    status: v.status,
                    pinnedProviderModelId: v.pinnedProviderModelId,
                    pinnedSystemPrompt: v.pinnedSystemPrompt,
                  },
                ];
              }
              if (phase === 'prompts') {
                const arr = values as Array<Record<string, unknown>>;
                return arr.map((p, i) => ({
                  id: `prompt-uuid-${i + 1}`,
                  campaignId: p.campaignId,
                  orderIndex: p.orderIndex,
                  text: p.text,
                  context: p.context,
                  structured: p.structured,
                  categoryTags: p.categoryTags,
                  mode: p.mode,
                  modeConfig: p.modeConfig,
                }));
              }
              const arr = values as Array<Record<string, unknown>>;
              return arr.map((m, i) => ({
                id: `cm-uuid-${i + 1}`,
                campaignId: m.campaignId,
                kind: m.kind,
                providerModelId: m.providerModelId,
                displayName: m.displayName,
                variantText: m.variantText,
              }));
            },
          };
        },
      };
    },
    select() {
      return {
        from() {
          return {
            where() {
              return {
                async orderBy() {
                  return state.campaignsList;
                },
              };
            },
          };
        },
      };
    },
  };
  return db;
}

function operatorCookieHeader(): string {
  const cookie = signOperatorCookie({
    method: 'email',
    identity: 'alice@co.dev',
  });
  return `operator_session=${cookie}`;
}

function postCreate(body: unknown, opts: { withCookie?: boolean } = {}): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (opts.withCookie !== false) {
    headers.cookie = operatorCookieHeader();
  }
  return new Request('https://app.example.com/api/campaigns', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function getList(): Request {
  return new Request('https://app.example.com/api/campaigns', {
    method: 'GET',
    headers: { cookie: operatorCookieHeader() },
  });
}

const promptArenaPayload = (overrides: Record<string, unknown> = {}) => ({
  name: 'Prompt arena smoke',
  description: 'Two variants vs two inputs.',
  kind: 'prompt' as const,
  prompts: [
    { text: 'Translate to French: hello world.' },
    { text: 'Translate to French: how are you today?' },
  ],
  pinnedProviderModelId: PINNED_MODEL_ID,
  variants: [
    { text: 'You are a senior translator. {{input}}', displayName: 'Senior' },
    { text: 'You are a junior translator. {{input}}', displayName: 'Junior' },
  ],
  ...overrides,
});

describe('POST /api/campaigns — kind="prompt" feature-flag flip', () => {
  beforeEach(() => {
    vi.stubEnv('AUTH_SECRET', 'x'.repeat(32));
    listSelectableRegistryModelsMock.mockReset();
    listSelectableRegistryModelsMock.mockResolvedValue([REGISTRY_ENTRY]);
  });

  it('accepts a minimal prompt-arena payload and returns 201 with the new shape', async () => {
    const db = makeFakeDb();
    getDbMock.mockReturnValue(db);

    const res = await campaignsHandler.__webHandler(
      postCreate(promptArenaPayload()),
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.id).toBe('campaign-uuid-1');
    expect(body.kind).toBe('prompt');
    expect(typeof body.shareSlug).toBe('string');
    expect((body.shareSlug as string).length).toBeGreaterThan(0);

    const prompts = body.prompts as Array<Record<string, unknown>>;
    expect(prompts).toHaveLength(2);
    expect(prompts.map((p) => p.orderIndex)).toEqual([0, 1]);

    const models = body.models as Array<Record<string, unknown>>;
    expect(models).toHaveLength(2);
    // Variants — not provider models — so providerModelId is null and
    // variantText carries the variable axis.
    for (const m of models) {
      expect(m.kind).toBe('prompt');
      expect(m.providerModelId).toBeNull();
      expect(typeof m.variantText).toBe('string');
    }
    expect(models.map((m) => m.displayName)).toEqual(['Senior', 'Junior']);
    expect(models.map((m) => m.variantText)).toEqual([
      'You are a senior translator. {{input}}',
      'You are a junior translator. {{input}}',
    ]);
  });

  it('persists the pinned model + optional pinnedSystemPrompt on the campaign row', async () => {
    const db = makeFakeDb();
    getDbMock.mockReturnValue(db);

    const res = await campaignsHandler.__webHandler(
      postCreate(
        promptArenaPayload({
          pinnedSystemPrompt: 'You are a friendly assistant.',
        }),
      ),
    );
    expect(res.status).toBe(201);

    const campaignInsert = db._state.inserts.find((i) => i.phase === 'campaigns');
    expect(campaignInsert).toBeDefined();
    const v = campaignInsert!.values as Record<string, unknown>;
    expect(v.kind).toBe('prompt');
    expect(v.status).toBe('draft');
    expect(v.pinnedProviderModelId).toBe(PINNED_MODEL_ID);
    expect(v.pinnedSystemPrompt).toBe('You are a friendly assistant.');
    // Defaults to false unless the operator opts in.
    expect(v.standaloneVariants).toBe(false);
    // Snapshot is captured at activate-time, not create-time.
    expect((v as { pinnedModelSnapshot?: unknown }).pinnedModelSnapshot)
      .toBeUndefined();
  });

  it('persists standaloneVariants:true through to the campaign row (Plan 05 P1-C)', async () => {
    const db = makeFakeDb();
    getDbMock.mockReturnValue(db);

    const res = await campaignsHandler.__webHandler(
      postCreate(
        promptArenaPayload({
          standaloneVariants: true,
          // PRD: empty inputs is the canonical companion to standalone.
          prompts: [],
        }),
      ),
    );
    expect(res.status).toBe(201);

    const campaignInsert = db._state.inserts.find((i) => i.phase === 'campaigns');
    const v = campaignInsert!.values as Record<string, unknown>;
    expect(v.kind).toBe('prompt');
    expect(v.standaloneVariants).toBe(true);
  });

  it('writes campaign_models rows as variants (variantText set, providerModelId null)', async () => {
    const db = makeFakeDb();
    getDbMock.mockReturnValue(db);

    await campaignsHandler.__webHandler(postCreate(promptArenaPayload()));

    const cmInsert = db._state.inserts.find((i) => i.phase === 'campaignModels');
    expect(cmInsert).toBeDefined();
    const rows = cmInsert!.values as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.kind).toBe('prompt');
      expect(row.providerModelId).toBeNull();
      expect(typeof row.variantText).toBe('string');
    }
    expect(rows.map((r) => r.displayName)).toEqual(['Senior', 'Junior']);
  });

  it('rejects an unknown pinned model id with 400', async () => {
    const db = makeFakeDb();
    getDbMock.mockReturnValue(db);
    // Registry has no entries → pinned model is not selectable, even
    // though `parseCreatePayload` accepts a known catalog id.
    listSelectableRegistryModelsMock.mockResolvedValueOnce([]);

    const res = await campaignsHandler.__webHandler(
      postCreate(promptArenaPayload()),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/not currently selectable/);
    // No campaign was inserted on the validation-fail path.
    expect(db._state.inserts).toHaveLength(0);
  });

  it('rejects an unauthenticated request with 401 (no operator cookie)', async () => {
    const db = makeFakeDb();
    getDbMock.mockReturnValue(db);

    const res = await campaignsHandler.__webHandler(
      postCreate(promptArenaPayload(), { withCookie: false }),
    );
    expect(res.status).toBe(401);
    expect(db._state.inserts).toHaveLength(0);
  });
});

describe('GET /api/campaigns — round-trip after kind="prompt" create', () => {
  beforeEach(() => {
    vi.stubEnv('AUTH_SECRET', 'x'.repeat(32));
    listSelectableRegistryModelsMock.mockReset();
    listSelectableRegistryModelsMock.mockResolvedValue([REGISTRY_ENTRY]);
  });

  it('lists a freshly-created prompt-arena campaign with the expected core fields', async () => {
    // Simulate persistence: after the POST, the same campaign comes
    // back from the list query. The list endpoint projects a subset
    // of columns — kind isn't currently returned, but slug + name +
    // status are — so we assert on those.
    const created = {
      id: 'campaign-uuid-1',
      shareSlug: 'abc123',
      name: 'Prompt arena smoke',
      description: 'Two variants vs two inputs.',
      categories: [],
      status: 'draft',
      votingMode: null,
      emailPromptMessage: null,
      createdAt: new Date('2026-04-28T12:00:00Z'),
      closedAt: null,
    };
    const db = makeFakeDb({ campaignsList: [created] });
    getDbMock.mockReturnValue(db);

    const res = await campaignsHandler.__webHandler(getList());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      campaigns: Array<Record<string, unknown>>;
    };
    expect(body.campaigns).toHaveLength(1);
    expect(body.campaigns[0]).toMatchObject({
      id: 'campaign-uuid-1',
      shareSlug: 'abc123',
      name: 'Prompt arena smoke',
      status: 'draft',
    });
  });
});
