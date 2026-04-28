import { eq } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { withOperator } from '../../auth/middleware.js';
import {
  defaultGenericMix,
  estimateRunCost,
  validateModelMix,
  defaultCostCeiling,
} from '../../simulated-runs/index.js';
import type {
  PromptMode,
  SimulatedRunModelMix,
} from '../../db/schema.js';

/**
 * POST /api/simulated-runs/preview-cost
 *
 * Returns the cost estimate for a proposed run without creating it.
 * The configurator UI hits this every time the operator changes
 * voterCount / modelMix so the user sees a live $/USD range.
 *
 * Body:
 *   {
 *     campaignId: uuid,
 *     voterCount: number,
 *     modelMix?: [{ providerModelId, weight }]
 *   }
 */
export const previewSimulatedRunCostWebHandler = withOperator(async (request) => {
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }
  const o = body as Record<string, unknown>;
  const campaignId = typeof o?.campaignId === 'string' ? o.campaignId : '';
  const voterCount = typeof o?.voterCount === 'number' ? o.voterCount : 0;
  if (!campaignId) return json({ error: 'campaignId required' }, 400);
  if (!Number.isInteger(voterCount) || voterCount <= 0) {
    return json({ error: 'voterCount must be a positive integer' }, 400);
  }

  let modelMix: SimulatedRunModelMix[] = defaultGenericMix();
  if (Array.isArray(o?.modelMix)) {
    modelMix = [];
    for (const raw of o.modelMix as unknown[]) {
      if (typeof raw !== 'object' || raw === null)
        return json({ error: 'each modelMix entry must be an object' }, 400);
      const r = raw as Record<string, unknown>;
      if (typeof r.providerModelId !== 'string')
        return json({ error: 'providerModelId must be a string' }, 400);
      if (typeof r.weight !== 'number')
        return json({ error: 'weight must be a number' }, 400);
      modelMix.push({ providerModelId: r.providerModelId, weight: r.weight });
    }
  }
  const mixCheck = validateModelMix(modelMix);
  if (!mixCheck.ok) return json({ error: mixCheck.error }, 400);

  const db = getDb();
  const [campaignRow, prompts, campaignModels] = await Promise.all([
    db
      .select({ kind: schema.campaigns.kind })
      .from(schema.campaigns)
      .where(eq(schema.campaigns.id, campaignId))
      .limit(1),
    db
      .select()
      .from(schema.prompts)
      .where(eq(schema.prompts.campaignId, campaignId)),
    db
      .select()
      .from(schema.campaignModels)
      .where(eq(schema.campaignModels.campaignId, campaignId)),
  ]);
  if (campaignRow.length === 0)
    return json({ error: 'campaign not found' }, 404);
  if (prompts.length === 0)
    return json({ error: 'campaign has no prompts' }, 400);
  if (campaignModels.length === 0)
    return json({ error: 'campaign has no models' }, 400);

  const promptsByMode: Record<PromptMode, number> = {
    tournament: 0,
    slider: 0,
    approve_reject: 0,
    best_of_n: 0,
    multi_axis: 0,
    qualitative: 0,
  };
  for (const p of prompts) promptsByMode[p.mode] += 1;

  const estimate = estimateRunCost({
    voterCount,
    promptsByMode,
    campaignModelCount: campaignModels.length,
    modelMix,
    kind: campaignRow[0].kind,
  });

  return json(
    {
      estimate,
      defaultCeilingUsd: defaultCostCeiling(estimate.estimatedUsd),
      promptsByMode,
      campaignModelCount: campaignModels.length,
    },
    200,
  );
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
