import { eq } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { withOperator } from '../../auth/middleware.js';
import { buildCampaignDetail } from '../../campaigns/detail.js';
import {
  buildCampaignResponsesCsv,
  type ResponsesExportInputs,
} from '../../campaigns/export.js';

/**
 * GET /api/campaigns/:id/export-responses
 *
 * Raw response-event CSV — one row per response across all six modes.
 * Complements the summary export (/export, per-model B-T leaderboard)
 * and the participants export (/export-participants, per-voter roster).
 *
 * This is the export operators reach for when they want to do external
 * analysis: pivot by mode, filter by prompt, group by participant, etc.
 * A `mode` column discriminates the row shape — most mode-specific
 * columns are empty for rows of a different mode.
 */
export const exportCampaignResponsesCsvWebHandler = withOperator(
  async (request: Request) => {
    if (request.method !== 'GET') {
      return new Response('method not allowed', { status: 405 });
    }

    const id = extractId(new URL(request.url));
    if (!id) return json({ error: 'missing id' }, 400);

    const db = getDb();
    const detail = await buildCampaignDetail(db, id);
    if (!detail) return json({ error: 'campaign not found' }, 404);

    // Fetch all response tables + prompts + participants + generations
    // (for tournament A/B model resolution) in parallel. Generations are
    // only needed for the tournament case, but fetching them for every
    // campaign keeps the code simpler than branching.
    const [
      prompts,
      participants,
      generations,
      votes,
      sliderResponses,
      approveRejectResponses,
      bestOfNResponses,
      multiAxisResponses,
      qualitativeResponses,
    ] = await Promise.all([
      db
        .select()
        .from(schema.prompts)
        .where(eq(schema.prompts.campaignId, id)),
      db
        .select()
        .from(schema.participants)
        .where(eq(schema.participants.campaignId, id)),
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

    const inputs: ResponsesExportInputs = {
      campaign: detail.campaign,
      promptsById: new Map(
        prompts.map((p) => [
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
        participants.map((p) => [p.id, { id: p.id, email: p.email }]),
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

    const filename = `${detail.campaign.shareSlug || detail.campaign.id}-responses.csv`;
    const csv = buildCampaignResponsesCsv(inputs);

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
    parts[3] === 'export-responses'
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
