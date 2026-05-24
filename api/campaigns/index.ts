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
 * Plan 04 feature flag. The schema and validation accept all three
 * arena kinds; the API only accepts those whose plans have flipped
 * on. Plan 05 (Prompt Arena) opened `'prompt'`; Plan 06 (System-Prompt
 * Arena) opens `'system_prompt'`. With both shipped, all three kinds
 * are reachable via the API.
 */
export const ALLOWED_KINDS = new Set<schema.CampaignKind>([
  'model',
  'prompt',
  'system_prompt',
]);

/**
 * PRD § "Validation rules" — system-prompt arenas are meaningless on
 * fewer than 3 user prompts because the whole point is across-suite
 * robustness. Hard block at the API. Plan 04's per-kind parser allows
 * non-empty suites; this is the per-kind tightening for `system_prompt`.
 */
const SYSTEM_PROMPT_MIN_SUITE = 3;

/**
 * Per-kind contestant minimums (PRD → "Creation UX" minimums table):
 *   - model         → ≥4 (tournament bracket constraint)
 *   - prompt        → ≥2
 *   - system_prompt → ≥2
 */
const KIND_MIN_CONTESTANTS: Record<schema.CampaignKind, number> = {
  model: 4,
  prompt: 2,
  system_prompt: 2,
};

/**
 * Per-kind variant-text length cap. Plan 05's prompt arena uses 8k
 * (matches today's prompt limit). Plan 06's system-prompt arena
 * doubles that — system prompts run long (style guides, brand voice
 * docs, multi-section refusal policies) and the PRD spells out the
 * 16k allowance explicitly. `model` is null because that kind has no
 * variants.
 */
const VARIANT_TEXT_MAX: Record<schema.CampaignKind, number | null> = {
  model: null,
  prompt: 8000,
  system_prompt: 16000,
};
const PINNED_SYSTEM_PROMPT_MAX = 8000;
const VARIANT_DISPLAY_NAME_MAX = 80;

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
 * Note: this flow still inserts campaign, prompts, then models in
 * sequence. If a later insert fails, the earlier rows remain as
 * orphaned-but-harmless data (the campaign stays in draft; the operator
 * can retry or delete it). A transaction wrapper would make this
 * stricter, but the current behavior is intentionally preserved.
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

  // Plan 04 feature flag — schema permits all kinds; the API only
  // accepts those Plans 05/06 have flipped on. Reject early so the
  // operator gets a clean error instead of a downstream surprise.
  if (!ALLOWED_KINDS.has(parsed.kind)) {
    return json(
      { error: 'arena kind not yet enabled', kind: parsed.kind },
      400,
    );
  }

  const { name, description, categories, prompts, kind } = parsed;

  const db = getDb();
  const selectableModels = await listSelectableRegistryModels(db);
  const selectableModelIds = new Set(
    selectableModels.map((model) => model.providerModelId),
  );

  // Validate models the contestants reference (kind='model') OR the
  // pinned generator model (kind ∈ {prompt, system_prompt}).
  if (kind === 'model') {
    for (const providerModelId of parsed.providerModelIds) {
      if (!selectableModelIds.has(providerModelId)) {
        return json(
          { error: `providerModelId is not currently selectable: ${providerModelId}` },
          400,
        );
      }
    }
  } else {
    if (!selectableModelIds.has(parsed.pinnedProviderModelId)) {
      return json(
        {
          error: `pinnedProviderModelId is not currently selectable: ${parsed.pinnedProviderModelId}`,
        },
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
      kind,
      // Plan 04 — `pinnedModelSnapshot` stays NULL at create time.
      // The activate handler captures the snapshot at launch so
      // operator edits to the registry between create and activate
      // are reflected in the frozen value.
      pinnedProviderModelId:
        kind === 'model' ? null : parsed.pinnedProviderModelId,
      pinnedSystemPrompt: kind === 'prompt' ? parsed.pinnedSystemPrompt : null,
      // Plan 05 — only kind='prompt' carries standaloneVariants; the
      // CHECK constraint forbids true on other kinds (the column
      // defaults to false at the DB level for those).
      standaloneVariants:
        kind === 'prompt' ? parsed.standaloneVariants : false,
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
        mode: p.mode ?? 'tournament',
        modeConfig: p.modeConfig ?? null,
      })),
    )
    .returning();

  const modelRows = await db
    .insert(schema.campaignModels)
    .values(
      kind === 'model'
        ? parsed.providerModelIds.map((id) => {
            const entry = lookupModel(id)!; // validated above
            return {
              campaignId: campaign.id,
              kind,
              providerModelId: entry.providerModelId,
              displayName: entry.displayName,
              variantText: null,
            };
          })
        : parsed.variants.map((v, i) => ({
            campaignId: campaign.id,
            kind,
            providerModelId: null,
            displayName: v.displayName ?? `Variant ${i + 1}`,
            variantText: v.text,
          })),
    )
    .returning();

  invalidateAnalyticsSnapshot();
  return json(
    {
      id: campaign.id,
      shareSlug: campaign.shareSlug,
      kind: campaign.kind,
      prompts: promptRows.map((p) => ({ id: p.id, orderIndex: p.orderIndex })),
      models: modelRows.map((m) => ({
        id: m.id,
        kind: m.kind,
        providerModelId: m.providerModelId,
        displayName: m.displayName,
        variantText: m.variantText,
      })),
    },
    201,
  );
}));

interface ParsedPromptRow {
  text: string;
  context?: string;
  categoryTags?: string[];
  structured?: schema.PromptStructured;
  mode?: schema.PromptMode;
  modeConfig?: schema.PromptModeConfig;
}

interface ParsedVariant {
  text: string;
  displayName?: string;
}

interface ParsedShared {
  name: string;
  description: string;
  categories: string[];
  prompts: ParsedPromptRow[];
}

/**
 * Discriminated union: 'model' carries `providerModelIds`; 'prompt' /
 * 'system_prompt' carry `variants` + `pinnedProviderModelId` (plus an
 * optional `pinnedSystemPrompt` for 'prompt' only). The handler
 * narrows on `kind` before reading kind-specific fields.
 */
type ParsedPayload = ParsedShared &
  (
    | { kind: 'model'; providerModelIds: string[] }
    | {
        kind: 'prompt';
        variants: ParsedVariant[];
        pinnedProviderModelId: string;
        pinnedSystemPrompt: string | null;
        /**
         * Plan 05 — when true, `renderTemplate` runs in standalone mode
         * (variant body verbatim; literal `{{input}}` preserved). Only
         * meaningful for kind='prompt'; defaults to false.
         */
        standaloneVariants: boolean;
      }
    | {
        kind: 'system_prompt';
        variants: ParsedVariant[];
        pinnedProviderModelId: string;
      }
  );

const CAMPAIGN_KINDS: readonly schema.CampaignKind[] = [
  'model',
  'prompt',
  'system_prompt',
] as const;

const PROMPT_MODES: readonly schema.PromptMode[] = [
  'tournament',
  'slider',
  'approve_reject',
  'best_of_n',
  'multi_axis',
  'qualitative',
] as const;

/**
 * Per-mode validation for the `modeConfig` field. Returns the parsed
 * config or an error string. `null` is always valid (uses mode defaults).
 */
function parseModeConfig(
  mode: schema.PromptMode,
  raw: unknown,
): { ok: true; value: schema.PromptModeConfig } | { error: string } {
  if (raw == null) return { ok: true, value: null };
  if (typeof raw !== 'object') return { error: 'modeConfig must be an object' };
  const o = raw as Record<string, unknown>;

  if (mode === 'slider') {
    const min = typeof o.min === 'number' ? o.min : 1;
    const max = typeof o.max === 'number' ? o.max : 10;
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      return { error: 'slider min and max must be integers' };
    }
    if (min >= max) return { error: 'slider min must be less than max' };
    if (max - min > 99)
      return { error: 'slider range cannot exceed 99 steps (too many ticks)' };
    const value: schema.PromptModeConfig = { min, max };
    if (typeof o.minLabel === 'string' && o.minLabel.trim()) {
      (value as { minLabel?: string }).minLabel = o.minLabel.trim().slice(0, 40);
    }
    if (typeof o.maxLabel === 'string' && o.maxLabel.trim()) {
      (value as { maxLabel?: string }).maxLabel = o.maxLabel.trim().slice(0, 40);
    }
    return { ok: true, value };
  }

  if (mode === 'approve_reject') {
    const value: schema.PromptModeConfig = {};
    if (typeof o.approveLabel === 'string' && o.approveLabel.trim()) {
      (value as { approveLabel?: string }).approveLabel = o.approveLabel
        .trim()
        .slice(0, 40);
    }
    if (typeof o.rejectLabel === 'string' && o.rejectLabel.trim()) {
      (value as { rejectLabel?: string }).rejectLabel = o.rejectLabel
        .trim()
        .slice(0, 40);
    }
    return { ok: true, value };
  }

  if (mode === 'best_of_n') {
    // No per-prompt config in Phase 2. Empty object is the canonical
    // value; anything sent is ignored.
    return { ok: true, value: {} as schema.PromptModeConfig };
  }

  if (mode === 'multi_axis') {
    // `dimensions` is required — multi-axis is meaningless without at
    // least one axis to score. Each dimension needs a stable `key`
    // (used as the signal column identifier, ratings category segment,
    // and submission payload key), a human `label`, and integer bounds.
    if (!Array.isArray(o.dimensions) || o.dimensions.length === 0) {
      return { error: 'multi_axis requires at least one dimension' };
    }
    if (o.dimensions.length > 8) {
      return { error: 'multi_axis supports at most 8 dimensions' };
    }
    const dimensions: Array<{
      key: string;
      label: string;
      min: number;
      max: number;
    }> = [];
    const keySet = new Set<string>();
    for (const raw of o.dimensions) {
      if (typeof raw !== 'object' || raw === null)
        return { error: 'each dimension must be an object' };
      const d = raw as Record<string, unknown>;
      const key = typeof d.key === 'string' ? d.key.trim() : '';
      const label = typeof d.label === 'string' ? d.label.trim() : '';
      const min = typeof d.min === 'number' ? d.min : 1;
      const max = typeof d.max === 'number' ? d.max : 5;
      if (!key) return { error: 'each dimension needs a non-empty key' };
      // Dimension keys are encoded into rating category strings as
      // `multi_axis:<key>:<tag>`. A colon in the key would break the
      // encoding; simpler to forbid it than to escape downstream.
      if (key.includes(':'))
        return { error: `dimension key cannot contain ':': ${key}` };
      if (key.length > 40)
        return { error: `dimension key too long: ${key}` };
      if (keySet.has(key))
        return { error: `duplicate dimension key: ${key}` };
      keySet.add(key);
      if (!label) return { error: `dimension ${key} needs a label` };
      if (!Number.isInteger(min) || !Number.isInteger(max)) {
        return { error: `dimension ${key} min/max must be integers` };
      }
      if (min >= max)
        return { error: `dimension ${key} min must be less than max` };
      if (max - min > 19)
        return { error: `dimension ${key} range cannot exceed 19 steps` };
      dimensions.push({ key, label: label.slice(0, 60), min, max });
    }
    return { ok: true, value: { dimensions } };
  }

  if (mode === 'qualitative') {
    const value: { prompt?: string; required: boolean } = {
      required: o.required === true,
    };
    if (typeof o.prompt === 'string' && o.prompt.trim()) {
      value.prompt = o.prompt.trim().slice(0, 200);
    }
    return { ok: true, value };
  }

  // Tournament has no config. Unknown modes land here and store NULL.
  return { ok: true, value: null };
}

export function parseCreatePayload(
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

  // Plan 04 — `kind` defaults to 'model' for back-compat with existing
  // clients. Validated against the enum.
  let kind: schema.CampaignKind = 'model';
  if (o.kind !== undefined) {
    if (typeof o.kind !== 'string' || !CAMPAIGN_KINDS.includes(o.kind as schema.CampaignKind)) {
      return { error: `unknown arena kind: ${String(o.kind)}` };
    }
    kind = o.kind as schema.CampaignKind;
  }

  // PRD: prompt arenas with 0 inputs are valid — variants are
  // "standalone" and run without {{input}} substitution. The activate
  // handler already permits the empty-suite case for kind='prompt';
  // the create parser must agree so the Phase 1 Standalone-variants
  // toggle round-trips. All other kinds still require a non-empty
  // suite (model arenas have no concept of standalone contestants;
  // system_prompt arenas need at least one user prompt to test).
  if (!Array.isArray(o.prompts)) {
    return { error: 'prompts[] is required' };
  }
  if (o.prompts.length === 0 && o.kind !== 'prompt') {
    return { error: 'prompts[] must be non-empty' };
  }
  const prompts: ParsedPromptRow[] = [];
  for (const raw of o.prompts) {
    if (typeof raw !== 'object' || raw === null)
      return { error: 'each prompt must be an object' };
    const pr = raw as Record<string, unknown>;
    const text = typeof pr.text === 'string' ? pr.text.trim() : '';
    if (!text) return { error: 'each prompt must have non-empty text' };
    const parsedStructured = parseStructured(pr.structured);
    if (parsedStructured.kind === 'error')
      return { error: parsedStructured.error };

    // Evaluation mode defaults to 'tournament' (legacy behavior). When
    // provided, it must be one of the known modes.
    let mode: schema.PromptMode = 'tournament';
    if (typeof pr.mode === 'string') {
      if (!PROMPT_MODES.includes(pr.mode as schema.PromptMode)) {
        return { error: `unknown prompt mode: ${pr.mode}` };
      }
      mode = pr.mode as schema.PromptMode;
    }
    const parsedModeConfig = parseModeConfig(mode, pr.modeConfig);
    if ('error' in parsedModeConfig) return { error: parsedModeConfig.error };

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
      mode,
      modeConfig: parsedModeConfig.value,
    });
  }

  const shared: ParsedShared = { name, description, categories, prompts };

  if (kind === 'model') {
    // Reject kind-specific fields on the legacy path. Operators flip
    // these only after explicitly choosing a non-model kind.
    if (o.variants !== undefined) {
      return { error: 'variants[] is only allowed for prompt/system_prompt kinds' };
    }
    if (o.pinnedProviderModelId !== undefined) {
      return {
        error: 'pinnedProviderModelId is only allowed for prompt/system_prompt kinds',
      };
    }
    if (o.pinnedSystemPrompt !== undefined) {
      return { error: 'pinnedSystemPrompt is only allowed for prompt kinds' };
    }
    if (o.standaloneVariants !== undefined) {
      return {
        error: 'standaloneVariants is only allowed for prompt kinds',
      };
    }

    const min = KIND_MIN_CONTESTANTS.model;
    if (
      !Array.isArray(o.providerModelIds) ||
      o.providerModelIds.length < min ||
      !o.providerModelIds.every((x) => typeof x === 'string')
    ) {
      return {
        error: `providerModelIds[] requires at least ${min} entries (tournament minimum)`,
      };
    }
    const ids = Array.from(new Set(o.providerModelIds as string[]));
    if (ids.length < min)
      return {
        error: `providerModelIds must have at least ${min} distinct entries`,
      };
    for (const id of ids) {
      if (!isKnownModel(id))
        return { error: `unknown providerModelId: ${id}` };
    }
    return { ...shared, kind, providerModelIds: ids };
  }

  // kind ∈ {prompt, system_prompt}: variant-driven contestants + pinned model.
  if (o.providerModelIds !== undefined) {
    return {
      error: 'providerModelIds[] is only allowed for model kind',
    };
  }
  if (
    typeof o.pinnedProviderModelId !== 'string' ||
    !o.pinnedProviderModelId.trim()
  ) {
    return { error: 'pinnedProviderModelId is required for prompt/system_prompt kinds' };
  }
  const pinnedProviderModelId = o.pinnedProviderModelId.trim();
  if (!isKnownModel(pinnedProviderModelId)) {
    return { error: `unknown pinnedProviderModelId: ${pinnedProviderModelId}` };
  }

  const min = KIND_MIN_CONTESTANTS[kind];
  if (!Array.isArray(o.variants) || o.variants.length < min) {
    return { error: `variants[] requires at least ${min} entries for ${kind} kind` };
  }
  // Per-kind cap. Non-null for any kind that carries variants — the
  // type system enforces this branch is unreachable for kind='model'.
  const variantTextMax = VARIANT_TEXT_MAX[kind]!;
  const variants: ParsedVariant[] = [];
  for (let i = 0; i < o.variants.length; i++) {
    const raw = o.variants[i];
    if (typeof raw !== 'object' || raw === null) {
      return { error: `variants[${i}] must be an object` };
    }
    const v = raw as Record<string, unknown>;
    const text = typeof v.text === 'string' ? v.text.trim() : '';
    if (!text) return { error: `variants[${i}].text is required` };
    if (text.length > variantTextMax) {
      return { error: `variants[${i}].text exceeds ${variantTextMax} chars` };
    }
    let displayName: string | undefined;
    if (typeof v.displayName === 'string' && v.displayName.trim()) {
      displayName = v.displayName.trim().slice(0, VARIANT_DISPLAY_NAME_MAX);
    }
    variants.push({ text, displayName });
  }

  if (kind === 'prompt') {
    if (
      o.pinnedSystemPrompt !== undefined &&
      o.pinnedSystemPrompt !== null &&
      typeof o.pinnedSystemPrompt !== 'string'
    ) {
      return { error: 'pinnedSystemPrompt must be a string' };
    }
    let pinnedSystemPrompt: string | null = null;
    if (typeof o.pinnedSystemPrompt === 'string' && o.pinnedSystemPrompt.trim()) {
      const sp = o.pinnedSystemPrompt.trim();
      if (sp.length > PINNED_SYSTEM_PROMPT_MAX) {
        return {
          error: `pinnedSystemPrompt exceeds ${PINNED_SYSTEM_PROMPT_MAX} chars`,
        };
      }
      pinnedSystemPrompt = sp;
    }
    if (
      o.standaloneVariants !== undefined &&
      typeof o.standaloneVariants !== 'boolean'
    ) {
      return { error: 'standaloneVariants must be a boolean' };
    }
    const standaloneVariants = o.standaloneVariants === true;
    return {
      ...shared,
      kind,
      variants,
      pinnedProviderModelId,
      pinnedSystemPrompt,
      standaloneVariants,
    };
  }

  // kind === 'system_prompt'
  if (o.pinnedSystemPrompt !== undefined) {
    return {
      error: 'pinnedSystemPrompt is only allowed for prompt kinds (the system message IS the variant for system_prompt kinds)',
    };
  }
  if (o.standaloneVariants !== undefined) {
    return {
      error: 'standaloneVariants is only allowed for prompt kinds',
    };
  }
  // PRD: across-suite robustness is the whole point — fewer than 3 user
  // prompts makes the result meaningless. Hard block here; the operator
  // sees this inline at create time rather than discovering it after a
  // run completes with thin CIs. Confidence intervals on the
  // leaderboard handle the upper-bound nudging on their own.
  if (prompts.length < SYSTEM_PROMPT_MIN_SUITE) {
    return {
      error: `system_prompt arenas require at least ${SYSTEM_PROMPT_MIN_SUITE} test prompts; got ${prompts.length}`,
    };
  }
  return { ...shared, kind, variants, pinnedProviderModelId };
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
