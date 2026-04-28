/**
 * Plan 05 Phase 0 — activate-time snapshot verify for `kind='prompt'`.
 *
 * The activate handler is the audit boundary: when a non-model campaign
 * launches, `pinned_model_snapshot` is captured from the live registry
 * so later edits to the registry don't retroactively rewrite history.
 * This test pins down two invariants:
 *
 *   1. Activating a `kind='prompt'` campaign WITHOUT an existing
 *      snapshot writes one in the same UPDATE that flips status to
 *      'active'. The snapshot mirrors the registry entry and stamps
 *      `snapshotAt` with the activation moment.
 *   2. Re-activating a campaign that ALREADY has a snapshot does NOT
 *      overwrite it. (Idempotency — the audit anchor stays put.)
 *
 * Plus a sanity bonus: a `kind='prompt'` campaign with zero `prompts`
 * rows passes the activate gate (PRD: "prompt arenas with 0 inputs
 * are valid (variants are standalone)").
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/client', () => ({ getDb: vi.fn() }));
vi.mock('../models/registry', () => ({
  listSelectableRegistryModels: vi.fn(),
}));
vi.mock('../models/library', () => ({
  invalidateAnalyticsSnapshot: vi.fn(),
}));

import { activateCampaignWebHandler } from '../routes/campaigns/activate';
import { signOperatorCookie } from '../auth/cookies';
import { getDb } from '../db/client';
import { listSelectableRegistryModels } from '../models/registry';

const getDbMock = getDb as unknown as ReturnType<typeof vi.fn>;
const listSelectableRegistryModelsMock =
  listSelectableRegistryModels as unknown as ReturnType<typeof vi.fn>;

const PINNED_MODEL_ID = 'anthropic/claude-sonnet-4-6';
const PINNED_DISPLAY_NAME = 'Claude Sonnet 4.6';
const REGISTRY_ENTRY = {
  id: 'registry-row-id',
  providerModelId: PINNED_MODEL_ID,
  displayName: PINNED_DISPLAY_NAME,
  enabled: true,
  legacy: false,
};

interface FakeCampaignRow {
  id: string;
  status: 'draft' | 'active' | 'closed' | 'archived';
  kind: 'model' | 'prompt' | 'system_prompt';
  pinnedProviderModelId: string | null;
  pinnedSystemPrompt: string | null;
  pinnedModelSnapshot: unknown | null;
  standaloneVariants: boolean;
  deletedAt: Date | null;
}

interface FakeDbState {
  campaigns: FakeCampaignRow[];
  prompts: Array<Record<string, unknown>>;
  models: Array<Record<string, unknown>>;
  generations: Array<Record<string, unknown>>;
  /**
   * Recorded UPDATE payloads, in call order. The activate handler issues
   * exactly one `db.update(campaigns).set(...).where(...)` on success.
   */
  updates: Array<Record<string, unknown>>;
}

/**
 * The activate handler issues these queries in order:
 *   1. select campaign by id (limit 1)               → FakeDbState.campaigns
 *   2. select prompts where campaignId = id          → FakeDbState.prompts
 *   3. select campaign_models where campaignId = id  → FakeDbState.models
 *   4. select successful generations                  → FakeDbState.generations
 *   5. update campaigns set {...} where id = id      → recorded into updates
 *
 * Each `.select(...)` call is a fresh chain. We tag chains by call
 * index because Drizzle table identification via private metadata is
 * brittle and the order is deterministic for this single handler.
 */
function makeFakeDb(state: FakeDbState) {
  let selectIndex = 0;
  const db = {
    _state: state,
    select(_projection?: unknown) {
      const idx = selectIndex++;
      // Each select returns the rows that correspond to its position
      // in the handler's query sequence.
      const rowsFor = (i: number): Array<Record<string, unknown>> => {
        if (i === 0) return state.campaigns as unknown as Array<Record<string, unknown>>;
        if (i === 1) return state.prompts;
        if (i === 2) return state.models;
        if (i === 3) return state.generations;
        return [];
      };

      // The campaign select includes `.limit(1)`; the prompts/models
      // selects don't. Both shapes are supported via terminal awaitable
      // behavior on whichever method the handler calls last.
      const fromChain = {
        from() {
          return whereChain;
        },
      };
      const whereChain: Record<string, unknown> = {
        where() {
          return limitOrAwait;
        },
      };
      const limitOrAwait: Record<string, unknown> = {
        limit() {
          return Promise.resolve(rowsFor(idx));
        },
        // For non-`.limit()` shapes, the chain is awaited directly.
        then(resolve: (v: Array<Record<string, unknown>>) => void) {
          resolve(rowsFor(idx));
        },
      };
      return fromChain;
    },
    update(_table: unknown) {
      return {
        set(values: Record<string, unknown>) {
          state.updates.push(values);
          return {
            where() {
              return Promise.resolve();
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

function activateRequest(campaignId: string): Request {
  return new Request(
    `https://app.example.com/api/campaigns/${campaignId}/activate`,
    {
      method: 'POST',
      headers: { cookie: operatorCookieHeader() },
    },
  );
}

const promptCampaignRow = (
  overrides: Partial<FakeCampaignRow> = {},
): FakeCampaignRow => ({
  id: 'camp-1',
  status: 'draft',
  kind: 'prompt',
  pinnedProviderModelId: PINNED_MODEL_ID,
  pinnedSystemPrompt: null,
  pinnedModelSnapshot: null,
  standaloneVariants: false,
  deletedAt: null,
  ...overrides,
});

describe("activate handler — kind='prompt' snapshot capture", () => {
  beforeEach(() => {
    vi.stubEnv('AUTH_SECRET', 'x'.repeat(32));
    listSelectableRegistryModelsMock.mockReset();
    listSelectableRegistryModelsMock.mockResolvedValue([REGISTRY_ENTRY]);
  });

  it('writes pinned_model_snapshot from the registry on first activate', async () => {
    // Two prompts × two variant-models = four generations needed.
    const prompts = [
      { id: 'p1', orderIndex: 0 },
      { id: 'p2', orderIndex: 1 },
    ];
    const models = [
      { id: 'cm1', kind: 'prompt', providerModelId: null, variantText: 'V1: {{input}}' },
      { id: 'cm2', kind: 'prompt', providerModelId: null, variantText: 'V2: {{input}}' },
    ];
    const generations = [
      { id: 'g1' }, { id: 'g2' }, { id: 'g3' }, { id: 'g4' },
    ];
    const state: FakeDbState = {
      campaigns: [promptCampaignRow()],
      prompts,
      models,
      generations,
      updates: [],
    };
    getDbMock.mockReturnValue(makeFakeDb(state));

    const before = Date.now();
    const res = await activateCampaignWebHandler(activateRequest('camp-1'));
    const after = Date.now();
    expect(res.status).toBe(200);

    expect(state.updates).toHaveLength(1);
    const update = state.updates[0]!;
    expect(update.status).toBe('active');
    expect(update.updatedAt).toBeInstanceOf(Date);

    const snapshot = update.pinnedModelSnapshot as {
      providerModelId: string;
      displayName: string;
      params: Record<string, unknown>;
      snapshotAt: string;
    };
    expect(snapshot).toBeDefined();
    expect(snapshot.providerModelId).toBe(PINNED_MODEL_ID);
    expect(snapshot.displayName).toBe(PINNED_DISPLAY_NAME);
    expect(snapshot.params).toEqual({});
    // `snapshotAt` is an ISO string captured at activate-time.
    const snapMs = Date.parse(snapshot.snapshotAt);
    expect(snapMs).toBeGreaterThanOrEqual(before);
    expect(snapMs).toBeLessThanOrEqual(after);
  });

  it('does NOT overwrite an existing pinned_model_snapshot (idempotent re-activate)', async () => {
    const existingSnapshot = {
      providerModelId: PINNED_MODEL_ID,
      displayName: 'Locked-in name from earlier activation',
      params: { temperature: 0.5 },
      snapshotAt: '2026-04-01T00:00:00.000Z',
    };
    const state: FakeDbState = {
      campaigns: [
        // Re-activate path: campaign was bounced back to draft after a
        // first activation. The snapshot it captured then must survive.
        promptCampaignRow({ pinnedModelSnapshot: existingSnapshot }),
      ],
      prompts: [{ id: 'p1', orderIndex: 0 }],
      models: [
        { id: 'cm1', kind: 'prompt', providerModelId: null, variantText: 'V: {{input}}' },
        { id: 'cm2', kind: 'prompt', providerModelId: null, variantText: 'V: {{input}}' },
      ],
      generations: [{ id: 'g1' }, { id: 'g2' }],
      updates: [],
    };
    getDbMock.mockReturnValue(makeFakeDb(state));

    const res = await activateCampaignWebHandler(activateRequest('camp-1'));
    expect(res.status).toBe(200);

    expect(state.updates).toHaveLength(1);
    const update = state.updates[0]!;
    expect(update.status).toBe('active');
    // Snapshot is omitted from the SET when one already exists — the
    // handler short-circuits the registry lookup. Registry should not
    // have been queried at all on this path.
    expect('pinnedModelSnapshot' in update).toBe(false);
    expect(listSelectableRegistryModelsMock).not.toHaveBeenCalled();
  });

  it('refuses activation if pinned model is no longer selectable', async () => {
    listSelectableRegistryModelsMock.mockResolvedValueOnce([]); // registry empty
    const state: FakeDbState = {
      campaigns: [promptCampaignRow()],
      prompts: [{ id: 'p1', orderIndex: 0 }],
      models: [
        { id: 'cm1', kind: 'prompt', providerModelId: null, variantText: 'V: {{input}}' },
        { id: 'cm2', kind: 'prompt', providerModelId: null, variantText: 'V: {{input}}' },
      ],
      generations: [{ id: 'g1' }, { id: 'g2' }],
      updates: [],
    };
    getDbMock.mockReturnValue(makeFakeDb(state));

    const res = await activateCampaignWebHandler(activateRequest('camp-1'));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/no longer selectable/);
    expect(state.updates).toHaveLength(0);
  });

  it("permits a kind='prompt' campaign with zero prompts (standalone variants)", async () => {
    // PRD: prompt arenas with 0 inputs are valid; variants are
    // standalone. Activate must NOT reject on "no prompts" for this
    // kind (it does for kind='model' / 'system_prompt').
    const state: FakeDbState = {
      campaigns: [promptCampaignRow()],
      prompts: [],
      models: [
        { id: 'cm1', kind: 'prompt', providerModelId: null, variantText: 'V1' },
        { id: 'cm2', kind: 'prompt', providerModelId: null, variantText: 'V2' },
      ],
      generations: [], // 0 prompts × 2 models = 0 expected generations
      updates: [],
    };
    getDbMock.mockReturnValue(makeFakeDb(state));

    const res = await activateCampaignWebHandler(activateRequest('camp-1'));
    expect(res.status).toBe(200);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]!.status).toBe('active');
  });
});

/**
 * Plan 05 P2-1 — templating-mismatch validation at activate.
 *
 * Three branches exercised here:
 *   (a) `kind='prompt'`, `standalone_variants=false`, zero prompts, AND
 *       at least one variant carrying `{{input}}` → reject 400 with the
 *       offending variant IDs in the body.
 *   (b) `kind='prompt'`, `standalone_variants=true` → token check is
 *       skipped entirely; activation proceeds even with `{{input}}` in
 *       the variant body and zero prompts (the variant body IS the
 *       prompt; inputs are ignored by design).
 *   (c) `kind='prompt'`, `standalone_variants=false`, zero prompts, NO
 *       `{{input}}` token in any variant → activation proceeds (the
 *       PRD's "input is appended after a blank line" fallback would
 *       apply if there were inputs; with zero, the variants run as-is).
 *
 * The error body shape is contractually relevant: the launch UI reads
 * `error` for the toast and `variantIds` to highlight the offending
 * card(s) inline.
 */
describe("activate handler — kind='prompt' templating validation (P2-1)", () => {
  beforeEach(() => {
    vi.stubEnv('AUTH_SECRET', 'x'.repeat(32));
    listSelectableRegistryModelsMock.mockReset();
    listSelectableRegistryModelsMock.mockResolvedValue([REGISTRY_ENTRY]);
  });

  it('(a) rejects when {{input}} token used but no inputs configured', async () => {
    const state: FakeDbState = {
      campaigns: [promptCampaignRow({ standaloneVariants: false })],
      prompts: [],
      models: [
        // cm1 carries the token; cm2 doesn't. Only cm1 is reported.
        { id: 'cm1', kind: 'prompt', providerModelId: null, variantText: 'Reply: {{input}}' },
        { id: 'cm2', kind: 'prompt', providerModelId: null, variantText: 'Reply succinctly.' },
        { id: 'cm3', kind: 'prompt', providerModelId: null, variantText: 'Use this template: {{input}} (end)' },
      ],
      generations: [],
      updates: [],
    };
    getDbMock.mockReturnValue(makeFakeDb(state));

    const res = await activateCampaignWebHandler(activateRequest('camp-1'));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; variantIds: string[] };
    expect(body.error).toBe('{{input}} token used but no inputs configured');
    // Two variants carry the token; both IDs surface, in the order the
    // models were enumerated.
    expect(body.variantIds).toEqual(['cm1', 'cm3']);
    // No DB update should have been performed and the registry must
    // not have been consulted (we short-circuit before snapshot).
    expect(state.updates).toHaveLength(0);
    expect(listSelectableRegistryModelsMock).not.toHaveBeenCalled();
  });

  it('(b) ignores `prompts` (no token check) when standaloneVariants is true', async () => {
    // Even with zero prompts AND `{{input}}` in the variants, standalone
    // mode means the variant body is the full prompt — so no rejection.
    const state: FakeDbState = {
      campaigns: [promptCampaignRow({ standaloneVariants: true })],
      prompts: [],
      models: [
        { id: 'cm1', kind: 'prompt', providerModelId: null, variantText: 'Variant carrying {{input}} verbatim' },
        { id: 'cm2', kind: 'prompt', providerModelId: null, variantText: 'Another standalone variant' },
      ],
      generations: [], // 0 prompts × 2 models = 0 expected generations
      updates: [],
    };
    getDbMock.mockReturnValue(makeFakeDb(state));

    const res = await activateCampaignWebHandler(activateRequest('camp-1'));
    expect(res.status).toBe(200);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]!.status).toBe('active');
  });

  it('(c) proceeds when no variant contains {{input}} and no inputs are configured', async () => {
    const state: FakeDbState = {
      campaigns: [promptCampaignRow({ standaloneVariants: false })],
      prompts: [],
      models: [
        { id: 'cm1', kind: 'prompt', providerModelId: null, variantText: 'Plain variant one' },
        { id: 'cm2', kind: 'prompt', providerModelId: null, variantText: 'Plain variant two' },
      ],
      generations: [],
      updates: [],
    };
    getDbMock.mockReturnValue(makeFakeDb(state));

    const res = await activateCampaignWebHandler(activateRequest('camp-1'));
    expect(res.status).toBe(200);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]!.status).toBe('active');
  });
});

/**
 * Plan 06 Phase 0 — activate-time snapshot verify for `kind='system_prompt'`.
 *
 * Mirrors the kind='prompt' snapshot block: the audit anchor for
 * non-model arenas is `pinned_model_snapshot`, captured from the live
 * registry on first activate and preserved on subsequent re-activates.
 * Differences for system_prompt: `pinnedSystemPrompt` is always null
 * (the variant IS the system message), `standaloneVariants` is always
 * false, and zero-prompts is rejected (only kind='prompt' allows the
 * empty-suite standalone shape).
 */
const sysPromptCampaignRow = (
  overrides: Partial<FakeCampaignRow> = {},
): FakeCampaignRow => ({
  id: 'camp-1',
  status: 'draft',
  kind: 'system_prompt',
  pinnedProviderModelId: PINNED_MODEL_ID,
  pinnedSystemPrompt: null,
  pinnedModelSnapshot: null,
  standaloneVariants: false,
  deletedAt: null,
  ...overrides,
});

describe("activate handler — kind='system_prompt' snapshot capture", () => {
  beforeEach(() => {
    vi.stubEnv('AUTH_SECRET', 'x'.repeat(32));
    listSelectableRegistryModelsMock.mockReset();
    listSelectableRegistryModelsMock.mockResolvedValue([REGISTRY_ENTRY]);
  });

  it('writes pinned_model_snapshot from the registry on first activate', async () => {
    // PRD-faithful suite: ≥3 user prompts × 2 system-prompt variants =
    // 6 generations. The registry-snapshot path is what we actually pin
    // down here; the matrix size is just enough to satisfy the
    // "every (prompt × model) has a successful generation" gate.
    const prompts = [
      { id: 'p1', orderIndex: 0 },
      { id: 'p2', orderIndex: 1 },
      { id: 'p3', orderIndex: 2 },
    ];
    const models = [
      { id: 'cm1', kind: 'system_prompt', providerModelId: null, variantText: 'You are concise.' },
      { id: 'cm2', kind: 'system_prompt', providerModelId: null, variantText: 'You are verbose.' },
    ];
    const generations = [
      { id: 'g1' }, { id: 'g2' }, { id: 'g3' },
      { id: 'g4' }, { id: 'g5' }, { id: 'g6' },
    ];
    const state: FakeDbState = {
      campaigns: [sysPromptCampaignRow()],
      prompts,
      models,
      generations,
      updates: [],
    };
    getDbMock.mockReturnValue(makeFakeDb(state));

    const before = Date.now();
    const res = await activateCampaignWebHandler(activateRequest('camp-1'));
    const after = Date.now();
    expect(res.status).toBe(200);

    expect(state.updates).toHaveLength(1);
    const update = state.updates[0]!;
    expect(update.status).toBe('active');
    expect(update.updatedAt).toBeInstanceOf(Date);

    const snapshot = update.pinnedModelSnapshot as {
      providerModelId: string;
      displayName: string;
      params: Record<string, unknown>;
      snapshotAt: string;
    };
    expect(snapshot).toBeDefined();
    expect(snapshot.providerModelId).toBe(PINNED_MODEL_ID);
    expect(snapshot.displayName).toBe(PINNED_DISPLAY_NAME);
    expect(snapshot.params).toEqual({});
    const snapMs = Date.parse(snapshot.snapshotAt);
    expect(snapMs).toBeGreaterThanOrEqual(before);
    expect(snapMs).toBeLessThanOrEqual(after);
  });

  it('does NOT overwrite an existing pinned_model_snapshot (idempotent re-activate)', async () => {
    const existingSnapshot = {
      providerModelId: PINNED_MODEL_ID,
      displayName: 'Locked-in name from earlier activation',
      params: { temperature: 0.5 },
      snapshotAt: '2026-04-01T00:00:00.000Z',
    };
    const state: FakeDbState = {
      campaigns: [sysPromptCampaignRow({ pinnedModelSnapshot: existingSnapshot })],
      prompts: [
        { id: 'p1', orderIndex: 0 },
        { id: 'p2', orderIndex: 1 },
        { id: 'p3', orderIndex: 2 },
      ],
      models: [
        { id: 'cm1', kind: 'system_prompt', providerModelId: null, variantText: 'A' },
        { id: 'cm2', kind: 'system_prompt', providerModelId: null, variantText: 'B' },
      ],
      generations: [
        { id: 'g1' }, { id: 'g2' }, { id: 'g3' },
        { id: 'g4' }, { id: 'g5' }, { id: 'g6' },
      ],
      updates: [],
    };
    getDbMock.mockReturnValue(makeFakeDb(state));

    const res = await activateCampaignWebHandler(activateRequest('camp-1'));
    expect(res.status).toBe(200);

    expect(state.updates).toHaveLength(1);
    const update = state.updates[0]!;
    expect(update.status).toBe('active');
    // Snapshot is omitted from the SET when one already exists — the
    // handler short-circuits the registry lookup. Registry should not
    // have been queried at all on this path.
    expect('pinnedModelSnapshot' in update).toBe(false);
    expect(listSelectableRegistryModelsMock).not.toHaveBeenCalled();
  });

  it('refuses activation if pinned model is no longer selectable', async () => {
    listSelectableRegistryModelsMock.mockResolvedValueOnce([]); // registry empty
    const state: FakeDbState = {
      campaigns: [sysPromptCampaignRow()],
      prompts: [
        { id: 'p1', orderIndex: 0 },
        { id: 'p2', orderIndex: 1 },
        { id: 'p3', orderIndex: 2 },
      ],
      models: [
        { id: 'cm1', kind: 'system_prompt', providerModelId: null, variantText: 'A' },
        { id: 'cm2', kind: 'system_prompt', providerModelId: null, variantText: 'B' },
      ],
      generations: [
        { id: 'g1' }, { id: 'g2' }, { id: 'g3' },
        { id: 'g4' }, { id: 'g5' }, { id: 'g6' },
      ],
      updates: [],
    };
    getDbMock.mockReturnValue(makeFakeDb(state));

    const res = await activateCampaignWebHandler(activateRequest('camp-1'));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/no longer selectable/);
    expect(state.updates).toHaveLength(0);
  });

  it("rejects a kind='system_prompt' campaign with zero prompts", async () => {
    // Unlike kind='prompt', system_prompt arenas are not standalone-
    // capable — the suite (≥3 user prompts) is the whole point of the
    // arena. Zero prompts must surface as 'no prompts' at activate.
    const state: FakeDbState = {
      campaigns: [sysPromptCampaignRow()],
      prompts: [],
      models: [
        { id: 'cm1', kind: 'system_prompt', providerModelId: null, variantText: 'A' },
        { id: 'cm2', kind: 'system_prompt', providerModelId: null, variantText: 'B' },
      ],
      generations: [],
      updates: [],
    };
    getDbMock.mockReturnValue(makeFakeDb(state));

    const res = await activateCampaignWebHandler(activateRequest('camp-1'));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('no prompts');
    expect(state.updates).toHaveLength(0);
  });
});
