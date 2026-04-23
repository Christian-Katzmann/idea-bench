import { asc, eq, sql } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { withOperator } from '../../auth/middleware.js';
import { buildCampaignDetail } from '../../campaigns/detail.js';
import {
  buildCampaignWorkbookBuffer,
  type CampaignWorkbookInputs,
} from '../../campaigns/export-xlsx.js';
import type {
  ParticipantExportRow,
  ResponsesExportInputs,
} from '../../campaigns/export.js';

/**
 * GET /api/campaigns/:id/export-xlsx
 *
 * Multi-sheet Excel workbook covering overview, leaderboard, participants,
 * and response events. Shipped alongside the three existing CSV exports
 * (/export, /export-participants, /export-responses) — not a replacement.
 * Operators who want formatted workbooks with numeric columns typed as
 * numbers reach for this; BI pipelines stay on CSV.
 */
export const exportCampaignXlsxWebHandler = withOperator(
  async (request: Request) => {
    if (request.method !== 'GET') {
      return new Response('method not allowed', { status: 405 });
    }

    const id = extractId(new URL(request.url));
    if (!id) return json({ error: 'missing id' }, 400);

    const db = getDb();
    const detail = await buildCampaignDetail(db, id);
    if (!detail) return json({ error: 'campaign not found' }, 404);

    const [
      promptsRows,
      participantRows,
      generations,
      votes,
      sliderResponses,
      approveRejectResponses,
      bestOfNResponses,
      multiAxisResponses,
      qualitativeResponses,
    ] = await Promise.all([
      db.select().from(schema.prompts).where(eq(schema.prompts.campaignId, id)),
      db
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
        .orderBy(asc(schema.participants.startedAt)),
      db
        .select({
          id: schema.generations.id,
          campaignModelId: schema.generations.campaignModelId,
        })
        .from(schema.generations)
        .innerJoin(
          schema.prompts,
          eq(schema.prompts.id, schema.generations.promptId),
        )
        .where(eq(schema.prompts.campaignId, id)),
      db.select().from(schema.votes).where(eq(schema.votes.campaignId, id)),
      db
        .select()
        .from(schema.sliderResponses)
        .where(eq(schema.sliderResponses.campaignId, id)),
      db
        .select()
        .from(schema.approveRejectResponses)
        .where(eq(schema.approveRejectResponses.campaignId, id)),
      db
        .select()
        .from(schema.bestOfNResponses)
        .where(eq(schema.bestOfNResponses.campaignId, id)),
      db
        .select()
        .from(schema.multiAxisResponses)
        .where(eq(schema.multiAxisResponses.campaignId, id)),
      db
        .select()
        .from(schema.qualitativeResponses)
        .where(eq(schema.qualitativeResponses.campaignId, id)),
    ]);

    const participants: ParticipantExportRow[] = participantRows.map((row) => ({
      participantId: row.participantId,
      email: row.email,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      votesCast: row.votesCast,
      isFinished: row.finishedAt != null,
    }));

    const responses: ResponsesExportInputs = {
      campaign: detail.campaign,
      promptsById: new Map(
        promptsRows.map((p) => [
          p.id,
          { id: p.id, orderIndex: p.orderIndex, categoryTags: p.categoryTags },
        ]),
      ),
      modelsById: new Map(
        detail.models.map((m) => [
          m.id,
          {
            id: m.id,
            displayName: m.displayName,
            providerModelId: m.providerModelId,
          },
        ]),
      ),
      participantsById: new Map(
        participantRows.map((p) => [
          p.participantId,
          { id: p.participantId, email: p.email },
        ]),
      ),
      generationsById: new Map(
        generations.map((g) => [
          g.id,
          { id: g.id, campaignModelId: g.campaignModelId },
        ]),
      ),
      votes,
      sliderResponses,
      approveRejectResponses,
      bestOfNResponses,
      multiAxisResponses,
      qualitativeResponses,
    };

    const inputs: CampaignWorkbookInputs = {
      detail,
      participants,
      responses,
    };

    const buffer = await buildCampaignWorkbookBuffer(inputs);
    const filename = `${detail.campaign.shareSlug || detail.campaign.id}-results.xlsx`;

    return new Response(buffer, {
      status: 200,
      headers: {
        'content-type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
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
    parts[3] === 'export-xlsx'
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
