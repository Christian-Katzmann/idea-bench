import { and, eq } from 'drizzle-orm';
import { getDb } from '../../../src/server/db/client.js';
import * as schema from '../../../src/server/db/schema.js';
import { withParticipant } from '../../../src/server/auth/middleware.js';
import { coinFlip } from '../../../src/server/tournament.js';
import { recomputeCampaignRatings } from '../../../src/server/ratings.js';
import { toVercelHandler } from '../../../src/server/vercel-adapter.js';

/**
 * POST /api/vote/:slug/submit
 * Body: {
 *   tournamentId: uuid,
 *   bracketPosition: 'b1'|'b2'|'b3'|'b4'|'b5',
 *   generationAId: uuid,
 *   generationBId: uuid,
 *   winner: 'A' | 'B' | 'tie' | 'both_bad'
 * }
 *
 * Validates the tournament belongs to this participant, that the
 * bracket_position isn't already voted on (unique index backs this up),
 * and inserts the vote. For b1/b2 rows the `advanced_generation_id` is
 * set — either the winner's gen id (decisive) or a coin-flipped choice
 * (tie/both_bad). For b3/b4/b5 rows it stays null.
 *
 * The session_id tag is generated server-side per request — a logical
 * "sitting" spans one browser visit; we approximate that with a UUID
 * per submit. If a fancier session notion is ever needed, move this
 * into the start handler.
 */
export default toVercelHandler(withParticipant(async (request, ctx) => {
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  const slug = extractSlug(new URL(request.url));
  if (!slug) return json({ error: 'missing slug' }, 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }
  const parsed = parseSubmitBody(body);
  if ('error' in parsed) return json({ error: parsed.error }, 400);

  const db = getDb();

  const [campaign] = await db
    .select()
    .from(schema.campaigns)
    .where(eq(schema.campaigns.shareSlug, slug))
    .limit(1);
  if (!campaign) return json({ error: 'campaign not found' }, 404);
  if (campaign.status !== 'active') {
    return json({ error: `campaign is ${campaign.status}` }, 410);
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
  if (!participant) return json({ error: 'participant not started' }, 409);

  const [tournament] = await db
    .select()
    .from(schema.tournaments)
    .where(eq(schema.tournaments.id, parsed.tournamentId))
    .limit(1);
  if (!tournament)
    return json({ error: 'tournament not found' }, 404);
  if (tournament.participantId !== participant.id) {
    return json({ error: 'tournament does not belong to this participant' }, 403);
  }

  // Determine advanced_generation_id for b1/b2 rows.
  let advancedGenerationId: string | null = null;
  if (parsed.bracketPosition === 'b1' || parsed.bracketPosition === 'b2') {
    if (parsed.winner === 'A') advancedGenerationId = parsed.generationAId;
    else if (parsed.winner === 'B') advancedGenerationId = parsed.generationBId;
    else
      advancedGenerationId = coinFlip(
        parsed.generationAId,
        parsed.generationBId,
      );
  }

  try {
    await db.insert(schema.votes).values({
      campaignId: campaign.id,
      tournamentId: tournament.id,
      participantId: participant.id,
      promptId: tournament.promptId,
      sessionId: crypto.randomUUID(),
      bracketPosition: parsed.bracketPosition,
      generationAId: parsed.generationAId,
      generationBId: parsed.generationBId,
      winner: parsed.winner,
      advancedGenerationId,
    });
  } catch (err) {
    // Unique-index violation on (tournament_id, bracket_position) =
    // duplicate submission. Treat as idempotent success.
    const msg = err instanceof Error ? err.message : String(err);
    if (/duplicate key|uniq_vote_tournament_position/i.test(msg)) {
      return json(
        { ok: true, dedup: true, message: 'already voted at this position' },
        200,
      );
    }
    throw err;
  }

  // Kick a fresh rating recompute. Synchronous + try/catch so a compute
  // failure doesn't take down the submit path — a stale leaderboard is
  // a better failure mode than a rejected vote. Compute is cheap
  // (O(M² × iters) where M is model count, ~4-8) so the added latency
  // is negligible at our scale.
  try {
    await recomputeCampaignRatings(campaign.id);
  } catch (err) {
    console.error('[submit] rating recompute failed (non-fatal):', err);
  }

  return json(
    {
      ok: true,
      advancedGenerationId,
      coinFlipped:
        advancedGenerationId != null &&
        (parsed.winner === 'tie' || parsed.winner === 'both_bad'),
    },
    200,
  );
}));

interface ParsedSubmit {
  tournamentId: string;
  bracketPosition: schema.BracketPosition;
  generationAId: string;
  generationBId: string;
  winner: schema.Vote['winner'];
}

function parseSubmitBody(
  input: unknown,
): ParsedSubmit | { error: string } {
  if (typeof input !== 'object' || input === null)
    return { error: 'body must be an object' };
  const o = input as Record<string, unknown>;
  const tournamentId = typeof o.tournamentId === 'string' ? o.tournamentId : '';
  const bracketPosition =
    typeof o.bracketPosition === 'string' ? o.bracketPosition : '';
  const generationAId =
    typeof o.generationAId === 'string' ? o.generationAId : '';
  const generationBId =
    typeof o.generationBId === 'string' ? o.generationBId : '';
  const winner = typeof o.winner === 'string' ? o.winner : '';

  if (!tournamentId) return { error: 'tournamentId required' };
  if (!['b1', 'b2', 'b3', 'b4', 'b5'].includes(bracketPosition))
    return { error: 'bracketPosition invalid' };
  if (!generationAId || !generationBId)
    return { error: 'generationAId and generationBId required' };
  if (generationAId === generationBId)
    return { error: 'generationAId and generationBId must differ' };
  if (!['A', 'B', 'tie', 'both_bad'].includes(winner))
    return { error: 'winner must be A, B, tie, or both_bad' };

  return {
    tournamentId,
    bracketPosition: bracketPosition as schema.BracketPosition,
    generationAId,
    generationBId,
    winner: winner as schema.Vote['winner'],
  };
}

function extractSlug(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'api' && parts[1] === 'vote' && parts[3] === 'submit') {
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
