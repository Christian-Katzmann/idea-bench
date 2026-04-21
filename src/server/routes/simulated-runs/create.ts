import { withOperator } from '../../auth/middleware.js';
import {
  createSimulatedRun,
  MIN_VOTER_COUNT,
  MAX_VOTER_COUNT,
  type LaunchInput,
} from '../../simulated-runs/index.js';
import type { PanelType, SimulatedRunModelMix } from '../../db/schema.js';

/**
 * POST /api/simulated-runs
 *
 * Body:
 *   {
 *     campaignId: uuid,
 *     panelType: 'generic' | 'persona',
 *     voterCount: 10..500,
 *     modelMix?: [{ providerModelId, weight }],
 *     personaIds?: uuid[],       // required when panelType='persona'
 *     maxConcurrency?: 1..25,
 *     costCeilingUsd?: number    // overrides the 2× estimate default
 *   }
 *
 * Synchronous. Returns the run row + seats + cost estimate. The run is
 * in status='pending'; the client then opens POST /:id/run to stream
 * execution.
 */
export const createSimulatedRunWebHandler = withOperator(async (request) => {
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }
  const parsed = parseBody(body);
  if ('error' in parsed) return json({ error: parsed.error }, 400);

  const outcome = await createSimulatedRun(parsed);
  if (!outcome.ok) {
    // strict:false tsconfig: explicit narrowing.
    const err = outcome as Extract<typeof outcome, { ok: false }>;
    return json({ error: err.error }, 400);
  }
  const okOutcome = outcome as Extract<typeof outcome, { ok: true }>;
  const { run, seats, estimate } = okOutcome.result;
  return json(
    {
      run: {
        id: run.id,
        campaignId: run.campaignId,
        panelType: run.panelType,
        voterCount: run.voterCount,
        modelMix: run.modelMix,
        personaIds: run.personaIds,
        status: run.status,
        costEstimateUsd:
          run.costEstimateUsd != null ? Number(run.costEstimateUsd) : null,
        costCeilingUsd:
          run.costCeilingUsd != null ? Number(run.costCeilingUsd) : null,
        maxConcurrency: run.maxConcurrency,
        createdAt: run.createdAt,
      },
      seatsCreated: seats.length,
      estimate: {
        estimatedUsd: estimate.estimatedUsd,
        lowUsd: estimate.lowUsd,
        highUsd: estimate.highUsd,
        totalCalls: estimate.totalCalls,
        perMode: estimate.perMode,
      },
    },
    201,
  );
});

interface ParsedBody extends LaunchInput {}

function parseBody(input: unknown): ParsedBody | { error: string } {
  if (typeof input !== 'object' || input === null)
    return { error: 'body must be an object' };
  const o = input as Record<string, unknown>;

  const campaignId = typeof o.campaignId === 'string' ? o.campaignId : '';
  if (!campaignId) return { error: 'campaignId is required' };

  const panelType = typeof o.panelType === 'string' ? o.panelType : '';
  if (panelType !== 'generic' && panelType !== 'persona') {
    return { error: "panelType must be 'generic' or 'persona'" };
  }

  if (typeof o.voterCount !== 'number' || !Number.isInteger(o.voterCount)) {
    return { error: 'voterCount must be an integer' };
  }
  if (o.voterCount < MIN_VOTER_COUNT || o.voterCount > MAX_VOTER_COUNT) {
    return {
      error: `voterCount must be in [${MIN_VOTER_COUNT}, ${MAX_VOTER_COUNT}]`,
    };
  }

  let modelMix: SimulatedRunModelMix[] | undefined;
  if (o.modelMix != null) {
    if (!Array.isArray(o.modelMix)) return { error: 'modelMix must be an array' };
    modelMix = [];
    for (const raw of o.modelMix) {
      if (typeof raw !== 'object' || raw === null)
        return { error: 'each modelMix entry must be an object' };
      const r = raw as Record<string, unknown>;
      if (typeof r.providerModelId !== 'string')
        return { error: 'modelMix.providerModelId must be a string' };
      if (typeof r.weight !== 'number')
        return { error: 'modelMix.weight must be a number' };
      modelMix.push({ providerModelId: r.providerModelId, weight: r.weight });
    }
  }

  let personaIds: string[] | undefined;
  if (o.personaIds != null) {
    if (!Array.isArray(o.personaIds))
      return { error: 'personaIds must be an array' };
    personaIds = o.personaIds.filter((x): x is string => typeof x === 'string');
  }

  const maxConcurrency =
    typeof o.maxConcurrency === 'number' ? o.maxConcurrency : undefined;
  const costCeilingUsd =
    typeof o.costCeilingUsd === 'number' ? o.costCeilingUsd : undefined;

  return {
    campaignId,
    panelType: panelType as PanelType,
    voterCount: o.voterCount,
    modelMix,
    personaIds,
    maxConcurrency,
    costCeilingUsd,
  };
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
