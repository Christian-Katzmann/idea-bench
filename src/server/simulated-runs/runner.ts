/**
 * Simulated-run orchestrator.
 *
 * Reads the `simulated_runs` row + `simulated_participants` for work,
 * dispatches judge calls per prompt × mode, writes responses, and
 * emits progress events to the provided `send` callback (typically an
 * SSE send from the launch endpoint).
 *
 * Resumability: every judge-produced response write is idempotent via
 * partial unique indexes. A seat re-entered mid-run skips already-
 * written responses and continues from where it left off. Crashed
 * seats in status='running' are reset to 'pending' at run start — a
 * new invocation claims them cleanly.
 *
 * Cost ceiling: `simulated_runs.cost_actual_usd` is incremented after
 * every successful judge call. If it exceeds `cost_ceiling_usd`, the
 * run stops and is marked status='failed' with the reason recorded on
 * the run row. The cost column is updated with a SQL expression
 * (`cost_actual_usd + delta`) rather than read-modify-write, which is
 * safe regardless of parallel seats.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import * as schema from '../db/schema.js';
import { sampleSeed, nextBattle } from '../tournament.js';
import type { SSESend } from '../sse.js';
import { checkCostCeiling } from './cost.js';
import {
  judgeApproveReject,
  judgeBestOfN,
  judgeMultiAxis,
  judgeQualitative,
  judgeSlider,
  judgeTournamentBattle,
  type JudgeOutcome,
  type JudgeSeatContext,
  type JudgePromptContext,
} from './judge-calls.js';
import { displayNameFor } from './panel-assembly.js';
import {
  ensureSimulatedTournament,
  markSimulatedTournamentComplete,
  writeApproveRejectResponse,
  writeBestOfNResponse,
  writeMultiAxisResponse,
  writeQualitativeResponse,
  writeSimulatedVote,
  writeSliderResponse,
} from './writer.js';

export interface RunnerProgress {
  runId: string;
  status: schema.SimulatedRunStatus;
  seatsCompleted: number;
  seatsFailed: number;
  seatsTotal: number;
  callsMade: number;
  callsSkipped: number;
  callsFailed: number;
  costActualUsd: number;
  costCeilingUsd: number | null;
}

/**
 * Main entry point. Drives the run to completion (or termination),
 * emitting 'progress' / 'seat' / 'done' SSE events as it goes.
 *
 * Safe to call repeatedly — seats already in 'complete' are skipped
 * and per-response idempotent writes protect against overlap with a
 * concurrent invocation (shouldn't happen in practice; the launch
 * endpoint gates on run.status).
 */
export async function executeSimulatedRun(args: {
  runId: string;
  send: SSESend;
  signal: AbortSignal;
}): Promise<RunnerProgress> {
  const { runId, send, signal } = args;
  const db = getDb();

  const run = await loadRun(runId);
  if (!run) throw new Error(`simulated run not found: ${runId}`);
  if (run.status === 'complete' || run.status === 'aborted') {
    send('progress', { message: `run already ${run.status}`, status: run.status });
    return baselineProgress(run, 0, 0, 0, 0, 0);
  }
  if (run.status === 'failed') {
    send('progress', { message: 'run previously failed', status: run.status });
    return baselineProgress(run, 0, 0, 0, 0, 0);
  }

  // Resurrect orphaned 'running' seats as 'pending' so this run can
  // claim them. Done before transition to run.status='running' so the
  // semantic is "restart".
  await db
    .update(schema.simulatedParticipants)
    .set({ status: 'pending' })
    .where(
      and(
        eq(schema.simulatedParticipants.simulatedRunId, runId),
        eq(schema.simulatedParticipants.status, 'running'),
      ),
    );

  await db
    .update(schema.simulatedRuns)
    .set({ status: 'running', startedAt: run.startedAt ?? new Date() })
    .where(eq(schema.simulatedRuns.id, runId));

  const campaign = (
    await db
      .select()
      .from(schema.campaigns)
      .where(eq(schema.campaigns.id, run.campaignId))
      .limit(1)
  )[0];
  if (!campaign) throw new Error(`campaign ${run.campaignId} not found`);

  const [prompts, campaignModels, seats, generations, personas] =
    await Promise.all([
      db
        .select()
        .from(schema.prompts)
        .where(eq(schema.prompts.campaignId, run.campaignId)),
      db
        .select()
        .from(schema.campaignModels)
        .where(eq(schema.campaignModels.campaignId, run.campaignId)),
      db
        .select()
        .from(schema.simulatedParticipants)
        .where(eq(schema.simulatedParticipants.simulatedRunId, runId)),
      db
        .select()
        .from(schema.generations)
        .where(
          inArray(
            schema.generations.campaignModelId,
            (await getCampaignModelIds(run.campaignId)),
          ),
        ),
      run.personaIds && run.personaIds.length > 0
        ? db
            .select()
            .from(schema.personas)
            .where(inArray(schema.personas.id, run.personaIds as string[]))
        : Promise.resolve([] as schema.Persona[]),
    ]);

  // Index lookups for fast per-prompt / per-model access.
  const cmById = new Map(campaignModels.map((c) => [c.id, c]));
  const genByPromptAndModel = new Map<string, schema.Generation>();
  for (const g of generations) {
    if (g.output == null) continue; // failed generations can't be judged
    genByPromptAndModel.set(`${g.promptId}:${g.campaignModelId}`, g);
  }
  const personaById = new Map(personas.map((p) => [p.id, p]));

  // Only prompts with generations for every campaign model are eligible.
  // (The same guard campaigns.activate enforces for humans; keeping
  // parity means the leaderboard shape matches the human read.)
  const eligiblePrompts = prompts.sort((a, b) => a.orderIndex - b.orderIndex);

  const seatsTotal = seats.length;
  const progress: RunnerProgress = {
    runId,
    status: 'running',
    seatsCompleted: seats.filter((s) => s.status === 'complete').length,
    seatsFailed: seats.filter((s) => s.status === 'failed').length,
    seatsTotal,
    callsMade: 0,
    callsSkipped: 0,
    callsFailed: 0,
    costActualUsd: Number(run.costActualUsd ?? 0),
    costCeilingUsd: run.costCeilingUsd != null ? Number(run.costCeilingUsd) : null,
  };

  send('start', {
    runId,
    seatsTotal,
    seatsRemaining: seats.filter((s) => s.status === 'pending').length,
    costEstimateUsd: run.costEstimateUsd != null ? Number(run.costEstimateUsd) : null,
    costCeilingUsd: progress.costCeilingUsd,
  });

  const pendingSeats = seats.filter(
    (s) => s.status === 'pending' || s.status === 'running',
  );
  if (pendingSeats.length === 0) {
    // All seats already done — finalize and return.
    await finalizeRun(runId, 'complete', null);
    progress.status = 'complete';
    send('done', progress);
    return progress;
  }

  // Per-run abort flag — set true if cost ceiling hits or operator aborts.
  // Shared with all seat tasks; they bail early when set.
  const runAborted = { flag: false, reason: '' as string };
  signal.addEventListener(
    'abort',
    () => {
      runAborted.flag = true;
      runAborted.reason = 'client aborted';
    },
    { once: true },
  );

  const promiseQueue = seatTaskRunner({
    seats: pendingSeats,
    runId,
    campaignId: run.campaignId,
    prompts: eligiblePrompts,
    campaignModels,
    cmById,
    genByPromptAndModel,
    personaById,
    send,
    signal,
    progress,
    runAborted,
    maxConcurrency: run.maxConcurrency,
    ceilingUsd: progress.costCeilingUsd,
  });

  await promiseQueue;

  // Decide terminal state.
  let terminalStatus: schema.SimulatedRunStatus;
  let terminalError: string | null = null;
  if (runAborted.flag) {
    terminalStatus =
      runAborted.reason === 'client aborted' ? 'aborted' : 'failed';
    terminalError = runAborted.reason || null;
  } else {
    // Count seats again from DB to pick up any rows other code wrote.
    const fresh = await db
      .select()
      .from(schema.simulatedParticipants)
      .where(eq(schema.simulatedParticipants.simulatedRunId, runId));
    const anyPending = fresh.some(
      (s) => s.status === 'pending' || s.status === 'running',
    );
    if (anyPending) {
      terminalStatus = 'failed';
      terminalError = 'seats unresolved at run end';
    } else {
      terminalStatus = 'complete';
    }
  }

  await finalizeRun(runId, terminalStatus, terminalError);

  const finalRun = await loadRun(runId);
  progress.status = terminalStatus;
  progress.costActualUsd = Number(finalRun?.costActualUsd ?? progress.costActualUsd);

  send('done', progress);
  return progress;
}

// ─────────────────────────────────────────────────────────────────────────
// Seat task runner — concurrency pool
// ─────────────────────────────────────────────────────────────────────────

interface SeatTaskContext {
  seats: schema.SimulatedParticipant[];
  runId: string;
  campaignId: string;
  prompts: schema.Prompt[];
  campaignModels: schema.CampaignModel[];
  cmById: Map<string, schema.CampaignModel>;
  genByPromptAndModel: Map<string, schema.Generation>;
  personaById: Map<string, schema.Persona>;
  send: SSESend;
  signal: AbortSignal;
  progress: RunnerProgress;
  runAborted: { flag: boolean; reason: string };
  maxConcurrency: number;
  ceilingUsd: number | null;
}

async function seatTaskRunner(ctx: SeatTaskContext): Promise<void> {
  const queue = [...ctx.seats];
  const workers: Promise<void>[] = [];
  const pool = Math.max(1, Math.min(ctx.maxConcurrency, ctx.seats.length));
  for (let i = 0; i < pool; i++) {
    workers.push(seatWorker(queue, ctx));
  }
  await Promise.all(workers);
}

async function seatWorker(
  queue: schema.SimulatedParticipant[],
  ctx: SeatTaskContext,
): Promise<void> {
  while (queue.length > 0) {
    if (ctx.runAborted.flag) return;
    const seat = queue.shift();
    if (!seat) return;
    try {
      await processSeat(seat, ctx);
    } catch (err) {
      ctx.progress.seatsFailed += 1;
      await markSeatFailed(seat.id, errToStr(err));
      ctx.send('seat', {
        seatId: seat.id,
        seatIndex: seat.seatIndex,
        status: 'failed',
        error: errToStr(err),
      });
    }
  }
}

async function processSeat(
  seat: schema.SimulatedParticipant,
  ctx: SeatTaskContext,
): Promise<void> {
  // Claim the seat atomically.
  const claimed = await claimSeat(seat.id);
  if (!claimed) return; // another worker took it (shouldn't happen in V1 but safe)

  const persona =
    seat.personaId ? ctx.personaById.get(seat.personaId) ?? null : null;
  const seatCtx: JudgeSeatContext = {
    judgeModelId: seat.judgeModelId,
    personaSystemPrompt: persona?.systemPrompt ?? null,
  };

  ctx.send('seat', {
    seatId: seat.id,
    seatIndex: seat.seatIndex,
    status: 'running',
    judgeModelId: seat.judgeModelId,
    judgeDisplayName: displayNameFor(seat.judgeModelId),
    personaName: persona?.name ?? null,
  });

  let failures = 0;
  let totalUnits = 0;

  for (const prompt of ctx.prompts) {
    if (ctx.signal.aborted || ctx.runAborted.flag) return;

    const promptCtx: JudgePromptContext = {
      promptText: prompt.text,
      promptContext: prompt.context,
    };

    try {
      const r = await runPromptForSeat({
        seat,
        seatCtx,
        prompt,
        promptCtx,
        ctx,
      });
      totalUnits += r.callsMade + r.callsSkipped + r.callsFailed;
      failures += r.callsFailed;
    } catch (err) {
      failures += 1;
      ctx.send('progress', {
        seatId: seat.id,
        promptId: prompt.id,
        status: 'error',
        error: errToStr(err),
      });
      // Don't fail the whole seat on one prompt — continue.
    }

    if (ctx.runAborted.flag) return;
  }

  // Consider a seat "failed" only if EVERY unit failed — partial
  // progress is still useful.
  const finalStatus: schema.SimulatedParticipantStatus =
    totalUnits > 0 && failures === totalUnits ? 'failed' : 'complete';
  if (finalStatus === 'failed') {
    await markSeatFailed(seat.id, `all ${failures} judge calls failed`);
    ctx.progress.seatsFailed += 1;
  } else {
    await markSeatComplete(seat.id);
    ctx.progress.seatsCompleted += 1;
  }
  ctx.send('seat', {
    seatId: seat.id,
    seatIndex: seat.seatIndex,
    status: finalStatus,
    totalUnits,
    failures,
  });
}

interface PromptRunSummary {
  callsMade: number;
  callsSkipped: number;
  callsFailed: number;
}

async function runPromptForSeat(args: {
  seat: schema.SimulatedParticipant;
  seatCtx: JudgeSeatContext;
  prompt: schema.Prompt;
  promptCtx: JudgePromptContext;
  ctx: SeatTaskContext;
}): Promise<PromptRunSummary> {
  const { seat, seatCtx, prompt, promptCtx, ctx } = args;
  switch (prompt.mode) {
    case 'tournament':
      return runTournamentForSeat({ seat, seatCtx, prompt, promptCtx, ctx });
    case 'slider':
      return runSliderForSeat({ seat, seatCtx, prompt, promptCtx, ctx });
    case 'approve_reject':
      return runApproveRejectForSeat({ seat, seatCtx, prompt, promptCtx, ctx });
    case 'best_of_n':
      return runBestOfNForSeat({ seat, seatCtx, prompt, promptCtx, ctx });
    case 'multi_axis':
      return runMultiAxisForSeat({ seat, seatCtx, prompt, promptCtx, ctx });
    case 'qualitative':
      return runQualitativeForSeat({ seat, seatCtx, prompt, promptCtx, ctx });
    default:
      return { callsMade: 0, callsSkipped: 0, callsFailed: 0 };
  }
}

// ─── Mode handlers ────────────────────────────────────────────────────────

async function runTournamentForSeat(args: {
  seat: schema.SimulatedParticipant;
  seatCtx: JudgeSeatContext;
  prompt: schema.Prompt;
  promptCtx: JudgePromptContext;
  ctx: SeatTaskContext;
}): Promise<PromptRunSummary> {
  const { seat, seatCtx, prompt, promptCtx, ctx } = args;
  const modelsForPrompt = ctx.campaignModels.filter((m) => {
    return ctx.genByPromptAndModel.has(`${prompt.id}:${m.id}`);
  });
  if (modelsForPrompt.length < 4) {
    // Not enough generations — skip silently. Campaign activation
    // normally guarantees this, but belt + suspenders.
    return { callsMade: 0, callsSkipped: 0, callsFailed: 0 };
  }
  const seedIds = sampleSeed(modelsForPrompt.map((m) => m.id));
  const genByModel: Record<string, string> = {};
  const providerByModel: Record<string, string> = {};
  const outputByModel: Record<string, string> = {};
  for (const m of modelsForPrompt) {
    const g = ctx.genByPromptAndModel.get(`${prompt.id}:${m.id}`);
    if (!g) continue;
    genByModel[m.id] = g.id;
    providerByModel[m.id] = m.providerModelId;
    outputByModel[m.id] = g.output ?? '';
  }

  const { tournamentId } = await ensureSimulatedTournament({
    simulatedParticipantId: seat.id,
    promptId: prompt.id,
    seedModelIds: seedIds,
  });

  const votes: Array<{
    bracketPosition: schema.BracketPosition;
    generationAId: string;
    generationBId: string;
    winner: schema.VoteWinner;
    advancedGenerationId: string | null;
  }> = [];
  let made = 0;
  let skipped = 0;
  let failed = 0;

  while (true) {
    if (ctx.signal.aborted || ctx.runAborted.flag) break;
    const next = nextBattle(seedIds, genByModel, votes);
    if (!next) break;

    // Find the model ids whose generations are `next.generationAId/BId`.
    const aModelId = findModelIdForGeneration(
      next.generationAId,
      genByModel,
    );
    const bModelId = findModelIdForGeneration(
      next.generationBId,
      genByModel,
    );
    if (!aModelId || !bModelId) {
      failed += 1;
      break;
    }

    const outcome = await judgeTournamentBattle(
      {
        seat: seatCtx,
        prompt: promptCtx,
        a: {
          providerModelId: providerByModel[aModelId],
          output: outputByModel[aModelId],
        },
        b: {
          providerModelId: providerByModel[bModelId],
          output: outputByModel[bModelId],
        },
      },
      ctx.signal,
    );

    if (outcome.kind === 'skipped') {
      // Cross-family exclusion: we can't skip a battle in the middle
      // of a bracket — progress would stall. Use a coin-flip tie so
      // the bracket continues; mark the battle as an exclusion via
      // `both_bad` which forces the tournament to a reasonable result
      // without recording meaningful judge signal. Log and count.
      skipped += 1;
      const winner: schema.VoteWinner = 'tie';
      await writeSimulatedVote({
        tournamentId,
        simulatedParticipantId: seat.id,
        campaignId: prompt.campaignId,
        promptId: prompt.id,
        bracketPosition: next.position,
        generationAId: next.generationAId,
        generationBId: next.generationBId,
        winner,
      });
      const v = {
        bracketPosition: next.position,
        generationAId: next.generationAId,
        generationBId: next.generationBId,
        winner,
        advancedGenerationId:
          next.position === 'b1' || next.position === 'b2'
            ? // tie → coin-flip advancer (same as human path); just pick a
              next.generationAId
            : null,
      };
      votes.push(v);
      ctx.send('progress', {
        seatId: seat.id,
        promptId: prompt.id,
        bracketPosition: next.position,
        status: 'skipped',
        reason: outcome.reason,
      });
      continue;
    }

    if (outcome.kind === 'failed') {
      failed += 1;
      // Bail out of this bracket — one failed battle invalidates the
      // rest (downstream pairs depend on advancers).
      ctx.send('progress', {
        seatId: seat.id,
        promptId: prompt.id,
        bracketPosition: next.position,
        status: 'failed',
        reason: outcome.reason,
        message: outcome.message,
      });
      break;
    }

    const winner = outcome.payload;
    await writeSimulatedVote({
      tournamentId,
      simulatedParticipantId: seat.id,
      campaignId: prompt.campaignId,
      promptId: prompt.id,
      bracketPosition: next.position,
      generationAId: next.generationAId,
      generationBId: next.generationBId,
      winner,
    });
    const advancedGenerationId =
      next.position === 'b1' || next.position === 'b2'
        ? winner === 'A'
          ? next.generationAId
          : winner === 'B'
            ? next.generationBId
            : next.generationAId // tie → fake-advance; coin-flip in writer isn't reflected here
        : null;
    votes.push({
      bracketPosition: next.position,
      generationAId: next.generationAId,
      generationBId: next.generationBId,
      winner,
      advancedGenerationId,
    });
    made += 1;
    await applyCostDelta(ctx, outcome);
  }

  // Mark tournament complete if we got through b3 + b4 (minimum).
  const hasB3 = votes.some((v) => v.bracketPosition === 'b3');
  const hasB4 = votes.some((v) => v.bracketPosition === 'b4');
  if (hasB3 && hasB4) {
    await markSimulatedTournamentComplete(tournamentId);
  }

  ctx.progress.callsMade += made;
  ctx.progress.callsSkipped += skipped;
  ctx.progress.callsFailed += failed;
  return { callsMade: made, callsSkipped: skipped, callsFailed: failed };
}

async function runSliderForSeat(args: {
  seat: schema.SimulatedParticipant;
  seatCtx: JudgeSeatContext;
  prompt: schema.Prompt;
  promptCtx: JudgePromptContext;
  ctx: SeatTaskContext;
}): Promise<PromptRunSummary> {
  const { seat, seatCtx, prompt, promptCtx, ctx } = args;
  const cfg = (prompt.modeConfig ?? {}) as {
    min?: number;
    max?: number;
    minLabel?: string;
    maxLabel?: string;
  };
  const min = typeof cfg.min === 'number' ? cfg.min : 1;
  const max = typeof cfg.max === 'number' ? cfg.max : 10;

  let made = 0;
  let skipped = 0;
  let failed = 0;
  for (const m of ctx.campaignModels) {
    if (ctx.signal.aborted || ctx.runAborted.flag) break;
    const gen = ctx.genByPromptAndModel.get(`${prompt.id}:${m.id}`);
    if (!gen || gen.output == null) continue;

    const outcome = await judgeSlider(
      {
        seat: seatCtx,
        prompt: promptCtx,
        output: gen.output,
        targetProviderModelId: m.providerModelId,
        min,
        max,
        minLabel: cfg.minLabel,
        maxLabel: cfg.maxLabel,
      },
      ctx.signal,
    );
    if (outcome.kind === 'skipped') {
      skipped += 1;
      continue;
    }
    if (outcome.kind === 'failed') {
      failed += 1;
      continue;
    }
    await writeSliderResponse({
      campaignId: prompt.campaignId,
      simulatedParticipantId: seat.id,
      promptId: prompt.id,
      campaignModelId: m.id,
      score: outcome.payload,
    });
    made += 1;
    await applyCostDelta(ctx, outcome);
  }
  ctx.progress.callsMade += made;
  ctx.progress.callsSkipped += skipped;
  ctx.progress.callsFailed += failed;
  return { callsMade: made, callsSkipped: skipped, callsFailed: failed };
}

async function runApproveRejectForSeat(args: {
  seat: schema.SimulatedParticipant;
  seatCtx: JudgeSeatContext;
  prompt: schema.Prompt;
  promptCtx: JudgePromptContext;
  ctx: SeatTaskContext;
}): Promise<PromptRunSummary> {
  const { seat, seatCtx, prompt, promptCtx, ctx } = args;
  const cfg = (prompt.modeConfig ?? {}) as {
    approveLabel?: string;
    rejectLabel?: string;
  };
  let made = 0;
  let skipped = 0;
  let failed = 0;
  for (const m of ctx.campaignModels) {
    if (ctx.signal.aborted || ctx.runAborted.flag) break;
    const gen = ctx.genByPromptAndModel.get(`${prompt.id}:${m.id}`);
    if (!gen || gen.output == null) continue;

    const outcome = await judgeApproveReject(
      {
        seat: seatCtx,
        prompt: promptCtx,
        output: gen.output,
        targetProviderModelId: m.providerModelId,
        approveLabel: cfg.approveLabel,
        rejectLabel: cfg.rejectLabel,
      },
      ctx.signal,
    );
    if (outcome.kind === 'skipped') {
      skipped += 1;
      continue;
    }
    if (outcome.kind === 'failed') {
      failed += 1;
      continue;
    }
    await writeApproveRejectResponse({
      campaignId: prompt.campaignId,
      simulatedParticipantId: seat.id,
      promptId: prompt.id,
      campaignModelId: m.id,
      approved: outcome.payload,
    });
    made += 1;
    await applyCostDelta(ctx, outcome);
  }
  ctx.progress.callsMade += made;
  ctx.progress.callsSkipped += skipped;
  ctx.progress.callsFailed += failed;
  return { callsMade: made, callsSkipped: skipped, callsFailed: failed };
}

async function runBestOfNForSeat(args: {
  seat: schema.SimulatedParticipant;
  seatCtx: JudgeSeatContext;
  prompt: schema.Prompt;
  promptCtx: JudgePromptContext;
  ctx: SeatTaskContext;
}): Promise<PromptRunSummary> {
  const { seat, seatCtx, prompt, promptCtx, ctx } = args;
  const candidates = ctx.campaignModels
    .map((m) => {
      const gen = ctx.genByPromptAndModel.get(`${prompt.id}:${m.id}`);
      if (!gen || gen.output == null) return null;
      return {
        providerModelId: m.providerModelId,
        campaignModelId: m.id,
        output: gen.output,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);
  if (candidates.length === 0) return { callsMade: 0, callsSkipped: 0, callsFailed: 0 };

  const outcome = await judgeBestOfN(
    { seat: seatCtx, prompt: promptCtx, candidates },
    ctx.signal,
  );
  if (outcome.kind === 'skipped') {
    ctx.progress.callsSkipped += 1;
    return { callsMade: 0, callsSkipped: 1, callsFailed: 0 };
  }
  if (outcome.kind === 'failed') {
    ctx.progress.callsFailed += 1;
    return { callsMade: 0, callsSkipped: 0, callsFailed: 1 };
  }
  await writeBestOfNResponse({
    campaignId: prompt.campaignId,
    simulatedParticipantId: seat.id,
    promptId: prompt.id,
    chosenCampaignModelId: outcome.payload.chosenCampaignModelId,
  });
  await applyCostDelta(ctx, outcome);
  ctx.progress.callsMade += 1;
  return { callsMade: 1, callsSkipped: 0, callsFailed: 0 };
}

async function runMultiAxisForSeat(args: {
  seat: schema.SimulatedParticipant;
  seatCtx: JudgeSeatContext;
  prompt: schema.Prompt;
  promptCtx: JudgePromptContext;
  ctx: SeatTaskContext;
}): Promise<PromptRunSummary> {
  const { seat, seatCtx, prompt, promptCtx, ctx } = args;
  const cfg = prompt.modeConfig as
    | { dimensions?: Array<{ key: string; label: string; min: number; max: number }> }
    | null;
  if (!cfg?.dimensions || cfg.dimensions.length === 0) {
    return { callsMade: 0, callsSkipped: 0, callsFailed: 0 };
  }
  let made = 0;
  let skipped = 0;
  let failed = 0;
  for (const m of ctx.campaignModels) {
    if (ctx.signal.aborted || ctx.runAborted.flag) break;
    const gen = ctx.genByPromptAndModel.get(`${prompt.id}:${m.id}`);
    if (!gen || gen.output == null) continue;

    const outcome = await judgeMultiAxis(
      {
        seat: seatCtx,
        prompt: promptCtx,
        output: gen.output,
        targetProviderModelId: m.providerModelId,
        dimensions: cfg.dimensions,
      },
      ctx.signal,
    );
    if (outcome.kind === 'skipped') {
      skipped += 1;
      continue;
    }
    if (outcome.kind === 'failed') {
      failed += 1;
      continue;
    }
    await writeMultiAxisResponse({
      campaignId: prompt.campaignId,
      simulatedParticipantId: seat.id,
      promptId: prompt.id,
      campaignModelId: m.id,
      scores: outcome.payload,
    });
    made += 1;
    await applyCostDelta(ctx, outcome);
  }
  ctx.progress.callsMade += made;
  ctx.progress.callsSkipped += skipped;
  ctx.progress.callsFailed += failed;
  return { callsMade: made, callsSkipped: skipped, callsFailed: failed };
}

async function runQualitativeForSeat(args: {
  seat: schema.SimulatedParticipant;
  seatCtx: JudgeSeatContext;
  prompt: schema.Prompt;
  promptCtx: JudgePromptContext;
  ctx: SeatTaskContext;
}): Promise<PromptRunSummary> {
  const { seat, seatCtx, prompt, promptCtx, ctx } = args;
  const cfg = (prompt.modeConfig ?? {}) as { prompt?: string; required?: boolean };
  let made = 0;
  let skipped = 0;
  let failed = 0;
  for (const m of ctx.campaignModels) {
    if (ctx.signal.aborted || ctx.runAborted.flag) break;
    const gen = ctx.genByPromptAndModel.get(`${prompt.id}:${m.id}`);
    if (!gen || gen.output == null) continue;

    const outcome = await judgeQualitative(
      {
        seat: seatCtx,
        prompt: promptCtx,
        output: gen.output,
        targetProviderModelId: m.providerModelId,
        qualitativePrompt: cfg.prompt,
      },
      ctx.signal,
    );
    if (outcome.kind === 'skipped') {
      skipped += 1;
      continue;
    }
    if (outcome.kind === 'failed') {
      failed += 1;
      continue;
    }
    await writeQualitativeResponse({
      campaignId: prompt.campaignId,
      simulatedParticipantId: seat.id,
      promptId: prompt.id,
      campaignModelId: m.id,
      text: outcome.payload,
    });
    made += 1;
    await applyCostDelta(ctx, outcome);
  }
  ctx.progress.callsMade += made;
  ctx.progress.callsSkipped += skipped;
  ctx.progress.callsFailed += failed;
  return { callsMade: made, callsSkipped: skipped, callsFailed: failed };
}

// ─── Cost accounting + seat state transitions ─────────────────────────────

async function applyCostDelta(
  ctx: SeatTaskContext,
  outcome: JudgeOutcome<unknown>,
): Promise<void> {
  if (outcome.kind !== 'ok') return;
  const delta = outcome.costUsd;
  if (delta <= 0) return;
  const db = getDb();
  await db
    .update(schema.simulatedRuns)
    .set({
      costActualUsd: sql`COALESCE(${schema.simulatedRuns.costActualUsd}, 0) + ${delta}`,
    })
    .where(eq(schema.simulatedRuns.id, ctx.runId));
  ctx.progress.costActualUsd += delta;

  const check = checkCostCeiling(ctx.ceilingUsd, ctx.progress.costActualUsd);
  if (check.status === 'exceeded') {
    ctx.runAborted.flag = true;
    ctx.runAborted.reason = `cost ceiling $${check.ceilingUsd} exceeded`;
    ctx.send('progress', {
      status: 'ceiling_exceeded',
      costActualUsd: ctx.progress.costActualUsd,
      ceilingUsd: check.ceilingUsd,
    });
  }
}

async function claimSeat(seatId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .update(schema.simulatedParticipants)
    .set({ status: 'running' })
    .where(
      and(
        eq(schema.simulatedParticipants.id, seatId),
        inArray(schema.simulatedParticipants.status, ['pending', 'running']),
      ),
    )
    .returning({ id: schema.simulatedParticipants.id });
  return rows.length > 0;
}

async function markSeatComplete(seatId: string): Promise<void> {
  const db = getDb();
  await db
    .update(schema.simulatedParticipants)
    .set({ status: 'complete', completedAt: new Date(), error: null })
    .where(eq(schema.simulatedParticipants.id, seatId));
}

async function markSeatFailed(seatId: string, reason: string): Promise<void> {
  const db = getDb();
  await db
    .update(schema.simulatedParticipants)
    .set({
      status: 'failed',
      completedAt: new Date(),
      error: reason.slice(0, 500),
    })
    .where(eq(schema.simulatedParticipants.id, seatId));
}

async function finalizeRun(
  runId: string,
  status: schema.SimulatedRunStatus,
  error: string | null,
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.simulatedRuns)
    .set({
      status,
      completedAt: new Date(),
      error: error ? error.slice(0, 500) : null,
    })
    .where(eq(schema.simulatedRuns.id, runId));
}

async function loadRun(runId: string): Promise<schema.SimulatedRun | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.simulatedRuns)
    .where(eq(schema.simulatedRuns.id, runId))
    .limit(1);
  return rows[0] ?? null;
}

async function getCampaignModelIds(campaignId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.campaignModels.id })
    .from(schema.campaignModels)
    .where(eq(schema.campaignModels.campaignId, campaignId));
  return rows.map((r) => r.id);
}

function baselineProgress(
  run: schema.SimulatedRun,
  seatsCompleted: number,
  seatsFailed: number,
  callsMade: number,
  callsSkipped: number,
  callsFailed: number,
): RunnerProgress {
  return {
    runId: run.id,
    status: run.status,
    seatsCompleted,
    seatsFailed,
    seatsTotal: run.voterCount,
    callsMade,
    callsSkipped,
    callsFailed,
    costActualUsd: Number(run.costActualUsd ?? 0),
    costCeilingUsd: run.costCeilingUsd != null ? Number(run.costCeilingUsd) : null,
  };
}

function findModelIdForGeneration(
  generationId: string,
  genByModel: Record<string, string>,
): string | null {
  for (const [modelId, gId] of Object.entries(genByModel)) {
    if (gId === generationId) return modelId;
  }
  return null;
}

function errToStr(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
