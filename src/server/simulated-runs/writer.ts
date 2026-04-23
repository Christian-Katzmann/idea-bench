/**
 * Internal writes for simulated-run responses. Bypasses the cookie auth
 * in submit-*.ts; instead, writes are keyed by `simulated_participant_id`
 * directly. Every write path:
 *   - validates generation belongs to (prompt, model) pair
 *   - inserts into the response table
 *   - catches the partial-unique-index violation as idempotent success
 *     (simulated participants resuming a stopped run hit this path)
 *
 * Ratings recompute is NOT called here — the runner batches a single
 * recompute at the end of each run tick to avoid O(responses) recompute
 * churn. The existing per-response recompute in the human submit path
 * continues to work for mixed human/simulated campaigns.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import * as schema from '../db/schema.js';
import { coinFlip } from '../tournament.js';

/** Helpers return the inserted row id on a new write, or null if the
 *  row already existed (idempotent resume). */
export type WriteOutcome = { ok: true; inserted: boolean };

export async function writeSliderResponse(args: {
  campaignId: string;
  simulatedParticipantId: string;
  promptId: string;
  campaignModelId: string;
  score: number;
}): Promise<WriteOutcome> {
  const db = getDb();
  try {
    await db.insert(schema.sliderResponses).values({
      campaignId: args.campaignId,
      participantId: null,
      simulatedParticipantId: args.simulatedParticipantId,
      promptId: args.promptId,
      campaignModelId: args.campaignModelId,
      sessionId: args.simulatedParticipantId,
      score: args.score,
    });
    return { ok: true, inserted: true };
  } catch (err) {
    if (isDuplicateKey(err)) return { ok: true, inserted: false };
    throw err;
  }
}

export async function writeApproveRejectResponse(args: {
  campaignId: string;
  simulatedParticipantId: string;
  promptId: string;
  campaignModelId: string;
  approved: boolean;
}): Promise<WriteOutcome> {
  const db = getDb();
  try {
    await db.insert(schema.approveRejectResponses).values({
      campaignId: args.campaignId,
      participantId: null,
      simulatedParticipantId: args.simulatedParticipantId,
      promptId: args.promptId,
      campaignModelId: args.campaignModelId,
      sessionId: args.simulatedParticipantId,
      approved: args.approved,
    });
    return { ok: true, inserted: true };
  } catch (err) {
    if (isDuplicateKey(err)) return { ok: true, inserted: false };
    throw err;
  }
}

export async function writeBestOfNResponse(args: {
  campaignId: string;
  simulatedParticipantId: string;
  promptId: string;
  chosenCampaignModelId: string;
}): Promise<WriteOutcome> {
  const db = getDb();
  try {
    await db.insert(schema.bestOfNResponses).values({
      campaignId: args.campaignId,
      participantId: null,
      simulatedParticipantId: args.simulatedParticipantId,
      promptId: args.promptId,
      chosenCampaignModelId: args.chosenCampaignModelId,
      sessionId: args.simulatedParticipantId,
    });
    return { ok: true, inserted: true };
  } catch (err) {
    if (isDuplicateKey(err)) return { ok: true, inserted: false };
    throw err;
  }
}

export async function writeMultiAxisResponse(args: {
  campaignId: string;
  simulatedParticipantId: string;
  promptId: string;
  campaignModelId: string;
  scores: Record<string, number>;
}): Promise<WriteOutcome> {
  const db = getDb();
  try {
    await db.insert(schema.multiAxisResponses).values({
      campaignId: args.campaignId,
      participantId: null,
      simulatedParticipantId: args.simulatedParticipantId,
      promptId: args.promptId,
      campaignModelId: args.campaignModelId,
      sessionId: args.simulatedParticipantId,
      scores: args.scores,
    });
    return { ok: true, inserted: true };
  } catch (err) {
    if (isDuplicateKey(err)) return { ok: true, inserted: false };
    throw err;
  }
}

export async function writeQualitativeResponse(args: {
  campaignId: string;
  simulatedParticipantId: string;
  promptId: string;
  campaignModelId: string;
  text: string;
}): Promise<WriteOutcome> {
  const db = getDb();
  try {
    await db.insert(schema.qualitativeResponses).values({
      campaignId: args.campaignId,
      participantId: null,
      simulatedParticipantId: args.simulatedParticipantId,
      promptId: args.promptId,
      campaignModelId: args.campaignModelId,
      sessionId: args.simulatedParticipantId,
      text: args.text,
    });
    return { ok: true, inserted: true };
  } catch (err) {
    if (isDuplicateKey(err)) return { ok: true, inserted: false };
    throw err;
  }
}

/**
 * Tournament write path: creates (or finds) the simulated tournament
 * row for (simulatedParticipantId, promptId), then writes the votes it
 * owes. `seedModelIds` must be exactly 4 campaignModelIds — the runner
 * samples these up front.
 *
 * `battles` is an ordered list of bracket positions to record. For a
 * simulated run the runner runs b1..b4 (plus optional b5) and passes
 * them all here in one call, but the function is idempotent row-by-row
 * so partial progress is safe.
 */
export async function ensureSimulatedTournament(args: {
  simulatedParticipantId: string;
  promptId: string;
  seedModelIds: readonly string[];
}): Promise<{ tournamentId: string }> {
  const db = getDb();
  // Upsert tournament keyed on (simulated_participant_id, prompt_id).
  // The partial unique index covers exactly this lookup.
  const existing = await db
    .select()
    .from(schema.tournaments)
    .where(eq(schema.tournaments.simulatedParticipantId, args.simulatedParticipantId));
  const match = existing.find((t) => t.promptId === args.promptId);
  if (match) return { tournamentId: match.id };

  const [row] = await db
    .insert(schema.tournaments)
    .values({
      participantId: null,
      simulatedParticipantId: args.simulatedParticipantId,
      promptId: args.promptId,
      seedModelIds: args.seedModelIds as string[],
      status: 'in_progress',
    })
    .returning({ id: schema.tournaments.id });
  return { tournamentId: row.id };
}

export interface SimulatedVoteInput {
  tournamentId: string;
  simulatedParticipantId: string;
  campaignId: string;
  promptId: string;
  bracketPosition: schema.BracketPosition;
  generationAId: string;
  generationBId: string;
  winner: schema.VoteWinner;
  /**
   * Optional RNG for deterministic tie-break advancement when the
   * simulated judge returns 'tie' / 'both_bad'. Pass a PRNG derived
   * from (run.seed, seat.id, prompt.id) to make replay reproducible.
   */
  rng?: () => number;
}

export async function writeSimulatedVote(
  input: SimulatedVoteInput,
): Promise<WriteOutcome> {
  const db = getDb();
  let advancedGenerationId: string | null = null;
  if (input.bracketPosition === 'b1' || input.bracketPosition === 'b2') {
    if (input.winner === 'A') advancedGenerationId = input.generationAId;
    else if (input.winner === 'B') advancedGenerationId = input.generationBId;
    else
      advancedGenerationId = coinFlip(
        input.generationAId,
        input.generationBId,
        input.rng,
      );
  }
  try {
    await db.insert(schema.votes).values({
      campaignId: input.campaignId,
      tournamentId: input.tournamentId,
      participantId: null,
      simulatedParticipantId: input.simulatedParticipantId,
      promptId: input.promptId,
      sessionId: input.simulatedParticipantId,
      bracketPosition: input.bracketPosition,
      generationAId: input.generationAId,
      generationBId: input.generationBId,
      winner: input.winner,
      advancedGenerationId,
    });
    return { ok: true, inserted: true };
  } catch (err) {
    if (isDuplicateKey(err)) return { ok: true, inserted: false };
    throw err;
  }
}

export async function markSimulatedTournamentComplete(
  tournamentId: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.tournaments)
    .set({ status: 'complete', completedAt: new Date() })
    .where(eq(schema.tournaments.id, tournamentId));
}

function isDuplicateKey(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /duplicate key|uniq_/i.test(msg);
}
