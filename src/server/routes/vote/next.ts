import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { withParticipant } from '../../auth/middleware.js';
import {
  nextBattle,
  sampleSeed,
  type BracketSeed,
  type TournamentVote,
} from '../../tournament.js';

/**
 * GET /api/vote/:slug/next
 *
 * Returns the next battle for the current participant, or { done: true }
 * when all of this campaign's prompts have completed tournaments for
 * them.
 *
 * Seeding: if the participant doesn't yet have a tournament for a
 * prompt, one is created with a 4-model seed sampled from the
 * campaign's models. The seed is persisted in
 * `tournaments.seed_model_ids` so it's stable across visits.
 */
export const voteNextWebHandler = withParticipant(async (request, ctx) => {
  if (request.method !== 'GET') {
    return new Response('method not allowed', { status: 405 });
  }

  const slug = extractSlug(new URL(request.url));
  if (!slug) return json({ error: 'missing slug' }, 400);

  const db = getDb();
  const [campaign] = await db
    .select()
    .from(schema.campaigns)
    .where(eq(schema.campaigns.shareSlug, slug))
    .limit(1);
  if (!campaign) return json({ error: 'campaign not found' }, 404);
  if (campaign.status !== 'active') {
    return json(
      {
        error: `campaign is ${campaign.status}, not accepting votes`,
      },
      410,
    );
  }

  const [participant] = await db
    .select()
    .from(schema.participants)
    .where(
      and(
        eq(schema.participants.cookieId, ctx.participantCookieId),
        eq(schema.participants.campaignId, campaign.id),
      ),
    )
    .limit(1);
  if (!participant) {
    return json(
      { error: 'participant not started — POST /api/vote/:slug first' },
      409,
    );
  }

  const [prompts, campaignModels] = await Promise.all([
    db
      .select()
      .from(schema.prompts)
      .where(eq(schema.prompts.campaignId, campaign.id))
      .orderBy(asc(schema.prompts.orderIndex)),
    db
      .select()
      .from(schema.campaignModels)
      .where(eq(schema.campaignModels.campaignId, campaign.id)),
  ]);

  if (campaignModels.length < 4) {
    return json(
      { error: 'campaign has <4 models; tournament cannot run' },
      409,
    );
  }

  const modelById = new Map(campaignModels.map((m) => [m.id, m]));
  const allModelIds = campaignModels.map((m) => m.id);

  // Walk prompts in order; the first one with an in-progress tournament
  // determines the next battle.
  let totalBattles = 0;
  let completedBattles = 0;

  for (const prompt of prompts) {
    // Find or create the tournament for this (participant, prompt).
    let [tournament] = await db
      .select()
      .from(schema.tournaments)
      .where(
        and(
          eq(schema.tournaments.participantId, participant.id),
          eq(schema.tournaments.promptId, prompt.id),
        ),
      )
      .limit(1);

    if (!tournament) {
      const seed = sampleSeed(allModelIds);
      const [created] = await db
        .insert(schema.tournaments)
        .values({
          participantId: participant.id,
          promptId: prompt.id,
          seedModelIds: [...seed],
          status: 'in_progress',
        })
        .returning();
      tournament = created;
    }

    // Load generations for this prompt for the 4 seed models, and the
    // votes cast in this tournament so far.
    const seedIds = tournament.seedModelIds as string[];
    const [gens, votes] = await Promise.all([
      db
        .select()
        .from(schema.generations)
        .where(
          and(
            eq(schema.generations.promptId, prompt.id),
            inArray(schema.generations.campaignModelId, seedIds),
          ),
        ),
      db
        .select()
        .from(schema.votes)
        .where(eq(schema.votes.tournamentId, tournament.id)),
    ]);

    // Map campaign_model_id → generation_id (the output on this prompt).
    const generationByModel: Record<string, string> = {};
    for (const g of gens) {
      if (g.output) generationByModel[g.campaignModelId] = g.id;
    }
    // If any seed model is missing its generation (e.g. generation
    // failed at campaign creation), we can't play this tournament.
    const missing = seedIds.filter((id) => !generationByModel[id]);
    if (missing.length > 0) {
      return json(
        {
          error:
            'some selected models don\u2019t have outputs for this prompt (campaign had generation failures)',
          missingModelIds: missing,
        },
        500,
      );
    }

    // Re-project votes into the shape tournament.ts expects.
    const tvotes: TournamentVote[] = votes.map((v) => ({
      bracketPosition: v.bracketPosition,
      generationAId: v.generationAId,
      generationBId: v.generationBId,
      winner: v.winner,
      advancedGenerationId: v.advancedGenerationId,
    }));

    totalBattles += estimateBattlesForTournament(tvotes);
    completedBattles += votes.length;

    const battle = nextBattle(
      seedIds as unknown as BracketSeed,
      generationByModel,
      tvotes,
    );
    if (battle) {
      // Look up the generation rows so we can return full output text.
      const [genA, genB] = await Promise.all([
        db
          .select()
          .from(schema.generations)
          .where(eq(schema.generations.id, battle.generationAId))
          .limit(1),
        db
          .select()
          .from(schema.generations)
          .where(eq(schema.generations.id, battle.generationBId))
          .limit(1),
      ]);
      const gA = genA[0];
      const gB = genB[0];
      if (!gA || !gB) {
        return json(
          { error: 'internal: battle refers to missing generation row' },
          500,
        );
      }
      return json(
        {
          done: false,
          tournament: {
            id: tournament.id,
            promptId: prompt.id,
          },
          prompt: {
            id: prompt.id,
            text: prompt.text,
            context: prompt.context,
            structured: prompt.structured ?? null,
            categoryTags: prompt.categoryTags,
          },
          battle: {
            position: battle.position,
            label: battle.label,
            reason: battle.reason,
          },
          generationA: {
            id: gA.id,
            output: gA.output,
            tokensOut: gA.tokensOut,
          },
          generationB: {
            id: gB.id,
            output: gB.output,
            tokensOut: gB.tokensOut,
          },
          progress: {
            tournamentsTotal: prompts.length,
            tournamentsDone: prompts
              .slice(0, prompts.indexOf(prompt))
              .length, // everything before this one is done
          },
        },
        200,
      );
    }

    // Tournament complete; ensure status reflects it.
    if (tournament.status !== 'complete') {
      await db
        .update(schema.tournaments)
        .set({ status: 'complete', completedAt: new Date() })
        .where(eq(schema.tournaments.id, tournament.id));
    }
    void modelById; // referenced for potential future enrichment
  }

  // All prompts complete.
  return json({ done: true }, 200);
});

function estimateBattlesForTournament(votes: TournamentVote[]): number {
  // 4 battles always; +1 if b3 tied (triggers b5).
  const b3 = votes.find((v) => v.bracketPosition === 'b3');
  if (b3 && (b3.winner === 'tie' || b3.winner === 'both_bad')) return 5;
  // Before b3 is cast we don't know; report 4 as baseline (callers
  // display "Battle X" with no fixed denominator).
  return 4;
}

function extractSlug(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'api' && parts[1] === 'vote' && parts[3] === 'next') {
    return parts[2] || null;
  }
  return null;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
