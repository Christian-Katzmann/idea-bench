import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { withParticipant } from '../../auth/middleware.js';
import {
  finalRanking,
  type TournamentVote,
} from '../../tournament.js';
import { computeParticipantRatings } from '../../ratings.js';
import { stabilityFor } from '../../../lib/stability.js';

/**
 * GET /api/vote/:slug/results
 *
 * Returns the participant's personal results for this campaign.
 *
 *   - Per-prompt rankings: derived from each tournament's final bracket.
 *     Joint-ranks when b3/b4 ties weren't broken by b5.
 *   - Campaign-level B-T: same math as the global leaderboard, but
 *     scoped to this participant's votes only. Restricted to models
 *     the participant actually saw (relevant when the campaign has
 *     >4 models and each tournament samples 4 independently).
 *   - Group agreement: fraction of decisive pair-votes where the
 *     participant picked the same side as the majority of other voters.
 *
 * Personal B-T is computed on demand; nothing is cached in the ratings
 * table for participant-scoped output.
 */
export const voteResultsWebHandler = withParticipant(async (request, ctx) => {
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
  if (!participant) return json({ error: 'participant not started' }, 409);

  // Pull all of this participant's tournament data + the campaign models
  // and prompts (needed for labels). In parallel, pull their
  // non-tournament mode contributions so the results page can summarize
  // what they actually did across a mixed-mode campaign.
  const [
    tournaments,
    votes,
    campaignModels,
    prompts,
    sliderResponses,
    approveRejectResponses,
    bestOfNResponses,
    multiAxisResponses,
    qualitativeResponses,
  ] = await Promise.all([
    db
      .select()
      .from(schema.tournaments)
      .where(eq(schema.tournaments.participantId, participant.id)),
    db
      .select()
      .from(schema.votes)
      .where(eq(schema.votes.participantId, participant.id)),
    db
      .select()
      .from(schema.campaignModels)
      .where(eq(schema.campaignModels.campaignId, campaign.id)),
    db
      .select()
      .from(schema.prompts)
      .where(eq(schema.prompts.campaignId, campaign.id)),
    db
      .select()
      .from(schema.sliderResponses)
      .where(eq(schema.sliderResponses.participantId, participant.id)),
    db
      .select()
      .from(schema.approveRejectResponses)
      .where(eq(schema.approveRejectResponses.participantId, participant.id)),
    db
      .select()
      .from(schema.bestOfNResponses)
      .where(eq(schema.bestOfNResponses.participantId, participant.id)),
    db
      .select()
      .from(schema.multiAxisResponses)
      .where(eq(schema.multiAxisResponses.participantId, participant.id)),
    db
      .select()
      .from(schema.qualitativeResponses)
      .where(eq(schema.qualitativeResponses.participantId, participant.id)),
  ]);

  const modelsById = new Map(campaignModels.map((m) => [m.id, m]));
  const promptsById = new Map(prompts.map((p) => [p.id, p]));

  // Need generation → campaign_model mapping to translate ranked
  // generation ids back to model display names.
  const generationIds = new Set<string>();
  for (const v of votes) {
    generationIds.add(v.generationAId);
    generationIds.add(v.generationBId);
  }
  const generations =
    generationIds.size > 0
      ? await db
          .select()
          .from(schema.generations)
          .where(inArray(schema.generations.id, [...generationIds]))
      : [];
  const generationToModel = new Map(
    generations.map((g) => [g.id, g.campaignModelId]),
  );

  // Per-prompt rankings.
  const perPrompt = tournaments
    .map((t) => {
      const tvotes: TournamentVote[] = votes
        .filter((v) => v.tournamentId === t.id)
        .map((v) => ({
          bracketPosition: v.bracketPosition,
          generationAId: v.generationAId,
          generationBId: v.generationBId,
          winner: v.winner,
          advancedGenerationId: v.advancedGenerationId,
        }));
      const ranking = finalRanking(tvotes);
      const prompt = promptsById.get(t.promptId);
      return {
        promptId: t.promptId,
        promptText: prompt?.text ?? '',
        complete: t.status === 'complete',
        battlesPlayed: tvotes.length,
        ranking: ranking.map((r) => ({
          rank: r.rank,
          models: r.generationIds.map((gid) => {
            const cmId = generationToModel.get(gid);
            const m = cmId ? modelsById.get(cmId) : undefined;
            return {
              campaignModelId: cmId ?? null,
              displayName: m?.displayName ?? '(unknown)',
              providerModelId: m?.providerModelId ?? '',
            };
          }),
        })),
      };
    })
    // Show tournaments with at least one vote cast.
    .filter((t) => t.battlesPlayed > 0);

  // Aggregate: count per-model wins (rank 1 or joint 1) across prompts.
  const aggregate = new Map<
    string,
    {
      displayName: string;
      providerModelId: string;
      firsts: number;
      appearances: number;
    }
  >();
  for (const t of perPrompt) {
    const seen = new Set<string>();
    for (const r of t.ranking) {
      for (const m of r.models) {
        if (!m.campaignModelId) continue;
        const key = m.campaignModelId;
        if (!aggregate.has(key)) {
          aggregate.set(key, {
            displayName: m.displayName,
            providerModelId: m.providerModelId,
            firsts: 0,
            appearances: 0,
          });
        }
        const bucket = aggregate.get(key)!;
        if (!seen.has(key)) {
          bucket.appearances++;
          seen.add(key);
        }
        if (r.rank === 1) bucket.firsts++;
      }
    }
  }
  // Phase 4: run the same B-T math the global leaderboard uses, but
  // scoped to just this participant's votes. Only models the
  // participant has seen get a rating — ones never in any of their
  // brackets are excluded (relevant when the campaign has >4 models).
  const personalBT = await computeParticipantRatings(
    campaign.id,
    participant.id,
  );
  const personalOverall = personalBT.overall;

  const campaignRanking = personalOverall.modelIds
    .map((campaignModelId) => {
      const bucket = aggregate.get(campaignModelId);
      const m = modelsById.get(campaignModelId);
      const games = personalOverall.gameCount[campaignModelId] ?? 0;
      const winRate = personalOverall.winRate[campaignModelId];
      const se = personalOverall.seRatings[campaignModelId];
      return {
        campaignModelId,
        displayName: m?.displayName ?? bucket?.displayName ?? '(unknown)',
        providerModelId: m?.providerModelId ?? bucket?.providerModelId ?? '',
        rating: Math.round(personalOverall.ratings[campaignModelId]),
        seRating: se != null ? Math.round(se * 10) / 10 : null,
        ciLow: personalOverall.ciLow[campaignModelId] != null
          ? Math.round(personalOverall.ciLow[campaignModelId]!)
          : null,
        ciHigh: personalOverall.ciHigh[campaignModelId] != null
          ? Math.round(personalOverall.ciHigh[campaignModelId]!)
          : null,
        gameCount: games,
        winRate,
        stability: stabilityFor(games),
        firstPlaceCount: bucket?.firsts ?? 0,
        appearances: bucket?.appearances ?? 0,
      };
    })
    .sort(
      (a, b) =>
        b.rating - a.rating || a.displayName.localeCompare(b.displayName),
    );

  // Group agreement: for decisive votes where ≥3 other participants
  // voted on the same pair, compute what fraction of those the
  // participant aligned with the majority.
  const decisiveVotes = votes.filter(
    (v) => v.winner === 'A' || v.winner === 'B',
  );
  let agreementSamples = 0;
  let agreementMatches = 0;
  if (decisiveVotes.length > 0) {
    // Pair by canonical generation-pair key so we can group across
    // display-order flips.
    const pairKey = (a: string, b: string) =>
      a < b ? `${a}:${b}` : `${b}:${a}`;
    const myPairs = new Map<string, { winnerGen: string }>();
    for (const v of decisiveVotes) {
      const winner =
        v.winner === 'A' ? v.generationAId : v.generationBId;
      myPairs.set(pairKey(v.generationAId, v.generationBId), {
        winnerGen: winner,
      });
    }
    const pairKeys = [...myPairs.keys()];
    if (pairKeys.length > 0) {
      // Fetch all votes on these pairs (excluding this participant).
      // We do it in one broad query and filter in memory — cheaper
      // than per-pair queries.
      const relevantGenIds = new Set<string>();
      for (const k of pairKeys) {
        const [a, b] = k.split(':');
        relevantGenIds.add(a);
        relevantGenIds.add(b);
      }
      const otherVotes = await db
        .select()
        .from(schema.votes)
        .where(
          and(
            eq(schema.votes.campaignId, campaign.id),
            inArray(schema.votes.generationAId, [...relevantGenIds]),
            inArray(schema.votes.generationBId, [...relevantGenIds]),
          ),
        );
      for (const k of pairKeys) {
        const [lo] = k.split(':');
        const votesOnPair = otherVotes.filter(
          (v) =>
            v.participantId !== participant.id &&
            pairKey(v.generationAId, v.generationBId) === k &&
            (v.winner === 'A' || v.winner === 'B'),
        );
        if (votesOnPair.length < 3) continue; // skimpy, skip
        const tally = new Map<string, number>();
        for (const v of votesOnPair) {
          const w = v.winner === 'A' ? v.generationAId : v.generationBId;
          tally.set(w, (tally.get(w) ?? 0) + 1);
        }
        const majority = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
        if (!majority) continue;
        agreementSamples++;
        if (majority[0] === myPairs.get(k)!.winnerGen) agreementMatches++;
        void lo;
      }
    }
  }
  const groupAgreement =
    agreementSamples > 0 ? agreementMatches / agreementSamples : null;

  // Per-mode contribution summary for mixed-mode campaigns. Counts the
  // prompts the participant interacted with and the raw response count
  // in each mode. Empty modes are omitted so tournament-only campaigns
  // don't get extra UI noise.
  //
  // For slider: averageScore is the mean of this participant's own
  // ratings — a personal "you rated these this way" reminder, not a
  // global aggregate. Null when no responses.
  const contributionsByMode: Array<{
    mode: schema.PromptMode;
    promptsCount: number;
    responseCount: number;
    extra?: Record<string, number | string>;
  }> = [];

  function countPrompts<T extends { promptId: string }>(rows: T[]): number {
    return new Set(rows.map((r) => r.promptId)).size;
  }

  if (sliderResponses.length > 0) {
    const avg =
      sliderResponses.reduce((s, r) => s + r.score, 0) / sliderResponses.length;
    contributionsByMode.push({
      mode: 'slider',
      promptsCount: countPrompts(sliderResponses),
      responseCount: sliderResponses.length,
      extra: { averageScore: Number(avg.toFixed(2)) },
    });
  }
  if (approveRejectResponses.length > 0) {
    const approved = approveRejectResponses.filter((r) => r.approved).length;
    contributionsByMode.push({
      mode: 'approve_reject',
      promptsCount: countPrompts(approveRejectResponses),
      responseCount: approveRejectResponses.length,
      extra: {
        approvedCount: approved,
        rejectedCount: approveRejectResponses.length - approved,
      },
    });
  }
  if (bestOfNResponses.length > 0) {
    contributionsByMode.push({
      mode: 'best_of_n',
      promptsCount: countPrompts(bestOfNResponses),
      responseCount: bestOfNResponses.length,
    });
  }
  if (multiAxisResponses.length > 0) {
    contributionsByMode.push({
      mode: 'multi_axis',
      promptsCount: countPrompts(multiAxisResponses),
      responseCount: multiAxisResponses.length,
    });
  }
  if (qualitativeResponses.length > 0) {
    contributionsByMode.push({
      mode: 'qualitative',
      promptsCount: countPrompts(qualitativeResponses),
      responseCount: qualitativeResponses.length,
    });
  }

  return json(
    {
      campaign: {
        name: campaign.name,
        shareSlug: campaign.shareSlug,
      },
      totals: {
        battlesPlayed: votes.length,
        tournamentsComplete: perPrompt.filter((t) => t.complete).length,
        tournamentsStarted: perPrompt.length,
        // New: non-tournament contribution roll-ups. Makes the results
        // page render cleanly for participants who only did slider/
        // approve_reject/etc. (otherwise the tournament-centric copy
        // above would lie about "battles played").
        nonTournamentResponses:
          sliderResponses.length +
          approveRejectResponses.length +
          bestOfNResponses.length +
          multiAxisResponses.length +
          qualitativeResponses.length,
      },
      perPrompt,
      campaignRanking,
      personalBT: {
        iterations: personalOverall.iterations,
        converged: personalOverall.converged,
      },
      groupAgreement: {
        fraction: groupAgreement,
        samples: agreementSamples,
      },
      // Preserve the honesty framing — flag low-sample personal results.
      // Sample spans tournament battles + any non-tournament responses;
      // someone who did 30 slider ratings shouldn't see the 'directional'
      // warning even with 0 battles.
      honesty: {
        directional:
          votes.length +
            sliderResponses.length +
            approveRejectResponses.length +
            bestOfNResponses.length +
            multiAxisResponses.length +
            qualitativeResponses.length <
          20,
      },
      // Per-mode participation summary; empty for tournament-only
      // campaigns. Consumer renders a "What you contributed" section
      // beside the tournament rankings.
      contributionsByMode,
    },
    200,
  );
});

function extractSlug(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'api' && parts[1] === 'vote' && parts[3] === 'results') {
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
