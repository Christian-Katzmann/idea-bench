import { desc, isNull } from 'drizzle-orm';
import { getDb } from '../../src/server/db/client.js';
import * as schema from '../../src/server/db/schema.js';
import { generateShareSlug } from '../../src/lib/ids.js';
import { isKnownModel, lookupModel } from '../../src/lib/models.js';
import { listSelectableRegistryModels } from '../../src/server/models/registry.js';
import { invalidateAnalyticsSnapshot } from '../../src/server/models/library.js';
import { withOperator } from '../../src/server/auth/middleware.js';
import { toVercelHandler } from '../../src/server/vercel-adapter.js';

/**
 * POST /api/campaigns
 *
 * Creates a new campaign in `draft` status along with its prompts and
 * campaign_models, all in one shot. This matches the CreateCampaign.tsx
 * flow: the operator fills in steps 1-3 as client state; only at
 * step 4 does anything touch the server.
 *
 * Request:
 *   {
 *     name: string,
 *     description?: string,
 *     categories?: string[],
 *     prompts: [
 *       {
 *         text: string,                       // authoritative blob for LLM
 *         context?: string,
 *         categoryTags?: string[],
 *         structured?: {                      // optional display-only breakdown
 *           instructions: string,
 *           input?: string,
 *           outputFormat?: string,
 *         },
 *       },
 *       ...
 *     ],
 *     providerModelIds: string[]   // must all be in the fixed catalog
 *   }
 *
 * Response (201):
 *   {
 *     id: uuid,
 *     shareSlug: string,
 *     prompts: [{ id, orderIndex }, ...],
 *     models:  [{ id, providerModelId, displayName }, ...]
 *   }
 *
 * Errors:
 *   - 400 on validation (missing fields, unknown model id, <4 models,
 *     0 prompts, etc.)
 *
 * Note: this is NOT atomic across tables — the neon-http driver doesn't
 * support multi-statement transactions. We insert campaign, then prompts,
 * then models in sequence. If a later insert fails, the earlier rows
 * remain as orphaned-but-harmless data (the campaign stays in draft; the
 * operator can retry or delete it). Acceptable for Phase 2; Phase 4's
 * rating recompute will need a pool-based driver swap for real transactions.
 */
export default toVercelHandler(withOperator(async (request: Request) => {
  if (request.method === 'GET') {
    return handleList();
  }
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }

  const parsed = parseCreatePayload(body);
  if ('error' in parsed) return json({ error: parsed.error }, 400);
  const { name, description, categories, prompts, providerModelIds } = parsed;

  const db = getDb();
  const selectableModels = await listSelectableRegistryModels(db);
  const selectableModelIds = new Set(
    selectableModels.map((model) => model.providerModelId),
  );
  for (const providerModelId of providerModelIds) {
    if (!selectableModelIds.has(providerModelId)) {
      return json(
        { error: `providerModelId is not currently selectable: ${providerModelId}` },
        400,
      );
    }
  }

  const [campaign] = await db
    .insert(schema.campaigns)
    .values({
      shareSlug: generateShareSlug(),
      name,
      description,
      categories,
      status: 'draft',
    })
    .returning();

  const promptRows = await db
    .insert(schema.prompts)
    .values(
      prompts.map((p, i) => ({
        campaignId: campaign.id,
        orderIndex: i,
        text: p.text,
        context: p.context ?? null,
        structured: p.structured ?? null,
        categoryTags: p.categoryTags ?? [],
      })),
    )
    .returning();

  const modelRows = await db
    .insert(schema.campaignModels)
    .values(
      providerModelIds.map((id) => {
        const entry = lookupModel(id)!; // validated above
        return {
          campaignId: campaign.id,
          providerModelId: entry.providerModelId,
          displayName: entry.displayName,
        };
      }),
    )
    .returning();

  invalidateAnalyticsSnapshot();
  return json(
    {
      id: campaign.id,
      shareSlug: campaign.shareSlug,
      prompts: promptRows.map((p) => ({ id: p.id, orderIndex: p.orderIndex })),
      models: modelRows.map((m) => ({
        id: m.id,
        providerModelId: m.providerModelId,
        displayName: m.displayName,
      })),
    },
    201,
  );
}));

interface ParsedPayload {
  name: string;
  description: string;
  categories: string[];
  prompts: Array<{
    text: string;
    context?: string;
    categoryTags?: string[];
    structured?: schema.PromptStructured;
  }>;
  providerModelIds: string[];
}

function parseCreatePayload(
  input: unknown,
): ParsedPayload | { error: string } {
  if (typeof input !== 'object' || input === null)
    return { error: 'body must be an object' };
  const o = input as Record<string, unknown>;

  const name = typeof o.name === 'string' ? o.name.trim() : '';
  if (!name) return { error: 'name is required' };

  const description =
    typeof o.description === 'string' ? o.description.trim() : '';

  const categories = Array.isArray(o.categories)
    ? o.categories.filter((x): x is string => typeof x === 'string')
    : [];

  if (!Array.isArray(o.prompts) || o.prompts.length === 0) {
    return { error: 'prompts[] must be non-empty' };
  }
  const prompts: ParsedPayload['prompts'] = [];
  for (const raw of o.prompts) {
    if (typeof raw !== 'object' || raw === null)
      return { error: 'each prompt must be an object' };
    const pr = raw as Record<string, unknown>;
    const text = typeof pr.text === 'string' ? pr.text.trim() : '';
    if (!text) return { error: 'each prompt must have non-empty text' };
    const parsedStructured = parseStructured(pr.structured);
    if (parsedStructured.kind === 'error')
      return { error: parsedStructured.error };
    prompts.push({
      text,
      context:
        typeof pr.context === 'string' && pr.context.trim()
          ? pr.context
          : undefined,
      categoryTags: Array.isArray(pr.categoryTags)
        ? pr.categoryTags.filter((x): x is string => typeof x === 'string')
        : undefined,
      structured:
        parsedStructured.kind === 'ok' ? parsedStructured.value : undefined,
    });
  }

  if (
    !Array.isArray(o.providerModelIds) ||
    o.providerModelIds.length < 4 ||
    !o.providerModelIds.every((x) => typeof x === 'string')
  ) {
    return {
      error: 'providerModelIds[] requires at least 4 entries (tournament minimum)',
    };
  }
  const ids = Array.from(new Set(o.providerModelIds as string[]));
  if (ids.length < 4)
    return { error: 'providerModelIds must have at least 4 distinct entries' };
  for (const id of ids) {
    if (!isKnownModel(id))
      return { error: `unknown providerModelId: ${id}` };
  }

  return { name, description, categories, prompts, providerModelIds: ids };
}

type ParseStructuredResult =
  | { kind: 'absent' }
  | { kind: 'ok'; value: schema.PromptStructured }
  | { kind: 'error'; error: string };

function parseStructured(raw: unknown): ParseStructuredResult {
  if (raw == null) return { kind: 'absent' };
  if (typeof raw !== 'object')
    return { kind: 'error', error: 'structured must be an object' };
  const s = raw as Record<string, unknown>;
  const instructions =
    typeof s.instructions === 'string' ? s.instructions.trim() : '';
  if (!instructions) return { kind: 'absent' }; // empty object → treat as missing
  const input =
    typeof s.input === 'string' && s.input.trim() ? s.input : undefined;
  const outputFormat =
    typeof s.outputFormat === 'string' && s.outputFormat.trim()
      ? s.outputFormat
      : undefined;
  const value: schema.PromptStructured = { instructions };
  if (input) value.input = input;
  if (outputFormat) value.outputFormat = outputFormat;
  return { kind: 'ok', value };
}

async function handleList(): Promise<Response> {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.campaigns.id,
      shareSlug: schema.campaigns.shareSlug,
      name: schema.campaigns.name,
      description: schema.campaigns.description,
      categories: schema.campaigns.categories,
      status: schema.campaigns.status,
      votingMode: schema.campaigns.votingMode,
      emailPromptMessage: schema.campaigns.emailPromptMessage,
      createdAt: schema.campaigns.createdAt,
      closedAt: schema.campaigns.closedAt,
    })
    .from(schema.campaigns)
    // Soft-deleted campaigns are filtered everywhere except the (future)
    // "Recently deleted" recovery surface and the daily purge cron.
    .where(isNull(schema.campaigns.deletedAt))
    .orderBy(desc(schema.campaigns.createdAt));
  return json({ campaigns: rows }, 200);
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
