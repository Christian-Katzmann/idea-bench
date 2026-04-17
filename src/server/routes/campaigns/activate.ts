import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { withOperator } from '../../auth/middleware.js';

/**
 * POST /api/campaigns/:id/activate
 *
 * Transitions a draft campaign to active. Validates:
 *   - status === 'draft'
 *   - >= 4 campaign_models (tournament minimum)
 *   - every (prompt × campaign_model) has a successful generation
 *     (output IS NOT NULL)
 *
 * Refuses activation if any slot is missing or errored. The operator's
 * recourse is to re-run /generate (which UPSERTs, so retries overwrite).
 */
export const activateCampaignWebHandler = withOperator(async (request: Request) => {
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  const id = extractId(new URL(request.url));
  if (!id) return json({ error: 'missing id' }, 400);

  const db = getDb();

  const [campaign] = await db
    .select()
    .from(schema.campaigns)
    .where(eq(schema.campaigns.id, id))
    .limit(1);
  if (!campaign) return json({ error: 'campaign not found' }, 404);
  if (campaign.status !== 'draft') {
    return json(
      { error: `cannot activate: status is ${campaign.status}` },
      409,
    );
  }

  const [prompts, models] = await Promise.all([
    db.select().from(schema.prompts).where(eq(schema.prompts.campaignId, id)),
    db
      .select()
      .from(schema.campaignModels)
      .where(eq(schema.campaignModels.campaignId, id)),
  ]);

  if (models.length < 4) {
    return json(
      {
        error: `need at least 4 models for a tournament; have ${models.length}`,
      },
      400,
    );
  }
  if (prompts.length === 0) {
    return json({ error: 'no prompts' }, 400);
  }

  // Count successful generations across the full matrix.
  const promptIds = prompts.map((p) => p.id);
  const expected = prompts.length * models.length;
  const okGenerations = await db
    .select({ id: schema.generations.id })
    .from(schema.generations)
    .where(
      and(
        isNotNull(schema.generations.output),
        inArray(schema.generations.promptId, promptIds),
      ),
    );

  if (okGenerations.length < expected) {
    return json(
      {
        error: `not all generations succeeded: ${okGenerations.length}/${expected} ready`,
        expected,
        ready: okGenerations.length,
      },
      409,
    );
  }

  // Flip to active.
  await db
    .update(schema.campaigns)
    .set({ status: 'active', updatedAt: new Date() })
    .where(eq(schema.campaigns.id, id));

  return json({ ok: true, status: 'active' }, 200);
});

function extractId(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  if (
    parts[0] === 'api' &&
    parts[1] === 'campaigns' &&
    parts[3] === 'activate'
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
