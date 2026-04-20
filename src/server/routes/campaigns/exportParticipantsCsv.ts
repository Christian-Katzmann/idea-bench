import { asc, eq, sql } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { withOperator } from '../../auth/middleware.js';
import { buildCampaignDetail } from '../../campaigns/detail.js';
import {
  buildCampaignParticipantsCsv,
  type ParticipantExportRow,
} from '../../campaigns/export.js';

/**
 * GET /api/campaigns/:id/export-participants
 *
 * Per-participant CSV download. Complements the per-model summary CSV.
 * Anonymous voters appear as rows with a blank `email` and `identity =
 * anonymous`. Useful for operators running hybrid campaigns who want to
 * know *who* voted (vs. the summary CSV's aggregate counts).
 */
export const exportCampaignParticipantsCsvWebHandler = withOperator(
  async (request: Request) => {
    if (request.method !== 'GET') {
      return new Response('method not allowed', { status: 405 });
    }

    const id = extractId(new URL(request.url));
    if (!id) return json({ error: 'missing id' }, 400);

    const db = getDb();
    // Reuse buildCampaignDetail to confirm the campaign exists and isn't
    // soft-deleted. It also gives us the campaign name/slug for the CSV
    // header columns.
    const detail = await buildCampaignDetail(db, id);
    if (!detail) return json({ error: 'campaign not found' }, 404);

    // One row per participant, with their vote-count aggregated in SQL so
    // we don't fan out an N+1 per participant.
    const rows = await db
      .select({
        participantId: schema.participants.id,
        email: schema.participants.email,
        startedAt: schema.participants.startedAt,
        finishedAt: schema.participants.finishedAt,
        votesCast: sql<number>`count(${schema.votes.id})`.mapWith(Number),
      })
      .from(schema.participants)
      .leftJoin(
        schema.votes,
        eq(schema.votes.participantId, schema.participants.id),
      )
      .where(eq(schema.participants.campaignId, id))
      .groupBy(schema.participants.id)
      .orderBy(asc(schema.participants.startedAt));

    const exportRows: ParticipantExportRow[] = rows.map((row) => ({
      participantId: row.participantId,
      email: row.email,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      votesCast: row.votesCast,
      isFinished: row.finishedAt != null,
    }));

    const filename = `${detail.campaign.shareSlug || detail.campaign.id}-participants.csv`;
    const csv = buildCampaignParticipantsCsv(detail.campaign, exportRows);

    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store',
      },
    });
  },
);

function extractId(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  if (
    parts[0] === 'api' &&
    parts[1] === 'campaigns' &&
    parts[3] === 'export-participants'
  ) {
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
