/**
 * Plan 06 Phase 0 — API smoke test for the `kind='system_prompt'`
 * create path.
 *
 * Mirrors `prompt-arena-api.test.ts` for the sibling kind. After
 * widening `ALLOWED_KINDS` in P0-18, the handler must accept a minimal
 * system-prompt-arena payload (≥3 test prompts, ≥2 system-prompt
 * variants, pinned model) and persist it via the same three-insert
 * flow used for the other kinds. This test pins down the handler
 * boundary; the `parseCreatePayload` per-kind branches are exhaustively
 * covered by `campaigns-validation.test.ts`.
 *
 * Specifically validated here:
 *   - 201 response with the expected body shape (id, slug, kind=system_prompt)
 *   - campaign row carries `kind='system_prompt'`, the pinned model id,
 *     and NULL pinnedSystemPrompt (the variant IS the system message;
 *     pinnedSystemPrompt is reserved for `kind='prompt'`)
 *   - campaign_models rows are variants (variantText set, providerModelId null)
 *   - 400 rejection when `prompts.length < 3` (Plan 06 hard block)
 *   - 400 rejection when the pinned model is not currently selectable
 *   - 401 on missing operator cookie
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
 * Same fake-db shape as `prompt-arena-api.test.ts`. The campaigns POST
 * handler issues exactly three inserts (campaigns → prompts →
 * campaign_models); we tag by call index since Drizzle's table identity
 * isn't worth the introspection cost in test code.
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

const systemPromptArenaPayload = (overrides: Record<string, unknown> = {}) => ({
  name: 'System prompt arena smoke',
  description: 'Two voice variants vs three representative user prompts.',
  kind: 'system_prompt' as const,
  prompts: [
    { text: 'Draft a polite refusal to a refund request.' },
    { text: 'Reply to an angry customer about a late delivery.' },
    { text: 'Write a short welcome note for a new subscriber.' },
  ],
  pinnedProviderModelId: PINNED_MODEL_ID,
  variants: [
    {
      text: 'You are a warm, professional brand voice. Be concise.',
      displayName: 'Warm Pro',
    },
    {
      text: 'You are a playful, witty brand voice. Lean into personality.',
      displayName: 'Playful',
    },
  ],
  ...overrides,
});

describe('POST /api/campaigns — kind="system_prompt" feature-flag flip', () => {
  beforeEach(() => {
    vi.stubEnv('AUTH_SECRET', 'x'.repeat(32));
    listSelectableRegistryModelsMock.mockReset();
    listSelectableRegistryModelsMock.mockResolvedValue([REGISTRY_ENTRY]);
  });

  it('accepts a minimal system-prompt-arena payload and returns 201 with the new shape', async () => {
    const db = makeFakeDb();
    getDbMock.mockReturnValue(db);

    const res = await campaignsHandler.__webHandler(
      postCreate(systemPromptArenaPayload()),
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.id).toBe('campaign-uuid-1');
    expect(body.kind).toBe('system_prompt');
    expect(typeof body.shareSlug).toBe('string');
    expect((body.shareSlug as string).length).toBeGreaterThan(0);

    const prompts = body.prompts as Array<Record<string, unknown>>;
    expect(prompts).toHaveLength(3);
    expect(prompts.map((p) => p.orderIndex)).toEqual([0, 1, 2]);

    const models = body.models as Array<Record<string, unknown>>;
    expect(models).toHaveLength(2);
    // Variants — not provider models — so providerModelId is null and
    // variantText carries the variable axis (the system message).
    for (const m of models) {
      expect(m.kind).toBe('system_prompt');
      expect(m.providerModelId).toBeNull();
      expect(typeof m.variantText).toBe('string');
    }
    expect(models.map((m) => m.displayName)).toEqual(['Warm Pro', 'Playful']);
    expect(models.map((m) => m.variantText)).toEqual([
      'You are a warm, professional brand voice. Be concise.',
      'You are a playful, witty brand voice. Lean into personality.',
    ]);
  });

  it('persists the pinned model and leaves pinnedSystemPrompt NULL on the campaign row', async () => {
    const db = makeFakeDb();
    getDbMock.mockReturnValue(db);

    const res = await campaignsHandler.__webHandler(
      postCreate(systemPromptArenaPayload()),
    );
    expect(res.status).toBe(201);

    const campaignInsert = db._state.inserts.find((i) => i.phase === 'campaigns');
    expect(campaignInsert).toBeDefined();
    const v = campaignInsert!.values as Record<string, unknown>;
    expect(v.kind).toBe('system_prompt');
    expect(v.status).toBe('draft');
    expect(v.pinnedProviderModelId).toBe(PINNED_MODEL_ID);
    // The variant IS the system message under this kind — there is no
    // separate held-constant pinnedSystemPrompt.
    expect(v.pinnedSystemPrompt).toBeNull();
    // standaloneVariants is a kind='prompt' concept; system_prompt arenas
    // always store false to satisfy the per-kind CHECK constraint.
    expect(v.standaloneVariants).toBe(false);
    // Snapshot is captured at activate-time, not create-time.
    expect((v as { pinnedModelSnapshot?: unknown }).pinnedModelSnapshot)
      .toBeUndefined();
  });

  it('writes campaign_models rows as variants (variantText set, providerModelId null)', async () => {
    const db = makeFakeDb();
    getDbMock.mockReturnValue(db);

    await campaignsHandler.__webHandler(
      postCreate(systemPromptArenaPayload()),
    );

    const cmInsert = db._state.inserts.find((i) => i.phase === 'campaignModels');
    expect(cmInsert).toBeDefined();
    const rows = cmInsert!.values as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.kind).toBe('system_prompt');
      expect(row.providerModelId).toBeNull();
      expect(typeof row.variantText).toBe('string');
    }
    expect(rows.map((r) => r.displayName)).toEqual(['Warm Pro', 'Playful']);
  });

  it('rejects fewer than 3 test prompts with a 400 (Plan 06 hard block)', async () => {
    const db = makeFakeDb();
    getDbMock.mockReturnValue(db);

    const res = await campaignsHandler.__webHandler(
      postCreate(
        systemPromptArenaPayload({
          prompts: [{ text: 'one' }, { text: 'two' }],
        }),
      ),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/at least 3 test prompts/);
    expect(db._state.inserts).toHaveLength(0);
  });

  it('rejects a pinned model that is not currently selectable with 400', async () => {
    const db = makeFakeDb();
    getDbMock.mockReturnValue(db);
    // Registry empty — `parseCreatePayload` accepts the catalog id, but
    // the handler's `listSelectableRegistryModels` gate rejects.
    listSelectableRegistryModelsMock.mockResolvedValueOnce([]);

    const res = await campaignsHandler.__webHandler(
      postCreate(systemPromptArenaPayload()),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/not currently selectable/);
    expect(db._state.inserts).toHaveLength(0);
  });

  it('rejects an unauthenticated request with 401 (no operator cookie)', async () => {
    const db = makeFakeDb();
    getDbMock.mockReturnValue(db);

    const res = await campaignsHandler.__webHandler(
      postCreate(systemPromptArenaPayload(), { withCookie: false }),
    );
    expect(res.status).toBe(401);
    expect(db._state.inserts).toHaveLength(0);
  });
});

describe('GET /api/campaigns — round-trip after kind="system_prompt" create', () => {
  beforeEach(() => {
    vi.stubEnv('AUTH_SECRET', 'x'.repeat(32));
    listSelectableRegistryModelsMock.mockReset();
    listSelectableRegistryModelsMock.mockResolvedValue([REGISTRY_ENTRY]);
  });

  it('lists a freshly-created system-prompt-arena campaign with the expected core fields', async () => {
    // Mirrors the prompt-arena round-trip — the list endpoint projects
    // a kind-agnostic subset (slug, name, status), so we assert on those.
    const created = {
      id: 'campaign-uuid-1',
      shareSlug: 'sysabc1',
      name: 'System prompt arena smoke',
      description: 'Two voice variants vs three representative user prompts.',
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
      shareSlug: 'sysabc1',
      name: 'System prompt arena smoke',
      status: 'draft',
    });
  });
});
