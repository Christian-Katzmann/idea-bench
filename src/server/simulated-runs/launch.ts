/**
 * Creates a new simulated run + seats. Validates inputs, computes the
 * cost estimate + default ceiling, and inserts in sequence:
 *   1. `simulated_runs` row (status='pending')
 *   2. N `simulated_participants` rows (status='pending')
 *
 * Separated from the runner so the API layer can launch synchronously
 * (fast 201) and the actual execution rides a separate request to the
 * streaming endpoint.
 */
import { eq, inArray } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import * as schema from '../db/schema.js';
import {
  assignSeats,
  defaultGenericMix,
  validateModelMix,
} from './panel-assembly.js';
import {
  defaultCostCeiling,
  estimateRunCost,
  type CostEstimateOutput,
} from './cost.js';

/** Hard bounds the API layer enforces too, kept in sync. */
export const MIN_VOTER_COUNT = 10;
export const MAX_VOTER_COUNT = 500;
export const MIN_MAX_CONCURRENCY = 1;
export const MAX_MAX_CONCURRENCY = 25;

export interface LaunchInput {
  campaignId: string;
  panelType: schema.PanelType;
  voterCount: number;
  modelMix?: schema.SimulatedRunModelMix[];
  personaIds?: string[];
  maxConcurrency?: number;
  /** If present, overrides the 2× estimate default. */
  costCeilingUsd?: number;
}

export interface LaunchResult {
  run: schema.SimulatedRun;
  seats: schema.SimulatedParticipant[];
  estimate: CostEstimateOutput;
}

export type LaunchOutcome =
  | { ok: true; result: LaunchResult }
  | { ok: false; error: string };

export async function createSimulatedRun(
  input: LaunchInput,
): Promise<LaunchOutcome> {
  if (
    !Number.isInteger(input.voterCount) ||
    input.voterCount < MIN_VOTER_COUNT ||
    input.voterCount > MAX_VOTER_COUNT
  ) {
    return {
      ok: false,
      error: `voterCount must be an integer in [${MIN_VOTER_COUNT}, ${MAX_VOTER_COUNT}]`,
    };
  }

  const maxConcurrency = clampInt(
    input.maxConcurrency ?? 5,
    MIN_MAX_CONCURRENCY,
    MAX_MAX_CONCURRENCY,
  );

  const modelMix = input.modelMix?.length ? input.modelMix : defaultGenericMix();
  const mixCheck = validateModelMix(modelMix);
  if (!mixCheck.ok) return { ok: false, error: mixCheck.error! };

  if (input.panelType === 'persona') {
    if (!input.personaIds || input.personaIds.length === 0) {
      return { ok: false, error: 'persona panel requires at least one personaId' };
    }
    if (input.personaIds.length > 10) {
      return { ok: false, error: 'persona panel supports at most 10 personas per run' };
    }
  }

  const db = getDb();

  const [campaign] = await db
    .select()
    .from(schema.campaigns)
    .where(eq(schema.campaigns.id, input.campaignId))
    .limit(1);
  if (!campaign || campaign.deletedAt) {
    return { ok: false, error: 'campaign not found' };
  }
  if (campaign.status !== 'active') {
    return {
      ok: false,
      error: `campaign must be active (is ${campaign.status})`,
    };
  }

  const [prompts, campaignModels] = await Promise.all([
    db
      .select()
      .from(schema.prompts)
      .where(eq(schema.prompts.campaignId, input.campaignId)),
    db
      .select()
      .from(schema.campaignModels)
      .where(eq(schema.campaignModels.campaignId, input.campaignId)),
  ]);
  if (prompts.length === 0) {
    return { ok: false, error: 'campaign has no prompts' };
  }
  if (campaignModels.length === 0) {
    return { ok: false, error: 'campaign has no models' };
  }

  // Validate persona ids exist (persona panel only).
  if (input.personaIds && input.personaIds.length > 0) {
    const found = await db
      .select({ id: schema.personas.id })
      .from(schema.personas)
      .where(inArray(schema.personas.id, input.personaIds));
    const foundSet = new Set(found.map((p) => p.id));
    for (const id of input.personaIds) {
      if (!foundSet.has(id)) {
        return { ok: false, error: `unknown personaId: ${id}` };
      }
    }
  }

  // Tally prompts by mode for cost estimation.
  const promptsByMode: Record<schema.PromptMode, number> = {
    tournament: 0,
    slider: 0,
    approve_reject: 0,
    best_of_n: 0,
    multi_axis: 0,
    qualitative: 0,
  };
  for (const p of prompts) promptsByMode[p.mode] += 1;

  const estimate = estimateRunCost({
    voterCount: input.voterCount,
    promptsByMode,
    campaignModelCount: campaignModels.length,
    modelMix,
  });

  const ceilingUsd =
    typeof input.costCeilingUsd === 'number'
      ? input.costCeilingUsd
      : defaultCostCeiling(estimate.estimatedUsd);

  // Insert the run row.
  const [run] = await db
    .insert(schema.simulatedRuns)
    .values({
      campaignId: input.campaignId,
      panelType: input.panelType,
      voterCount: input.voterCount,
      modelMix,
      personaIds:
        input.panelType === 'persona' && input.personaIds
          ? input.personaIds
          : null,
      status: 'pending',
      costEstimateUsd: estimate.estimatedUsd.toFixed(4),
      costActualUsd: '0',
      costCeilingUsd: ceilingUsd.toFixed(4),
      maxConcurrency,
    })
    .returning();

  // Build the seat assignment + insert.
  const seatSpecs = assignSeats({
    voterCount: input.voterCount,
    modelMix,
    personaIds: input.panelType === 'persona' ? input.personaIds : null,
  });
  const seatRows = await db
    .insert(schema.simulatedParticipants)
    .values(
      seatSpecs.map((s) => ({
        simulatedRunId: run.id,
        personaId: s.personaId,
        judgeModelId: s.judgeModelId,
        seatIndex: s.seatIndex,
        status: 'pending' as const,
      })),
    )
    .returning();

  return {
    ok: true,
    result: {
      run,
      seats: seatRows,
      estimate,
    },
  };
}

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  const rounded = Math.round(n);
  return Math.max(lo, Math.min(hi, rounded));
}

