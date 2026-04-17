import { eq } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { withOperator } from '../../auth/middleware.js';
import { recomputeCampaignRatings } from '../../ratings.js';

/**
 * POST /api/campaigns/:id/recompute
 *
 * Force a full Bradley-Terry + Fisher-info rating recompute from the
 * vote log. This is the same compute that fires (best-effort) on each
 * vote submit; this route exists for the operator dashboard's manual
 * "Recompute" button and for demos/reproducibility.
 *
 * Returns a small summary — no per-model detail, since the dashboard
 * just refetches /api/campaigns/:id to pick up the new rating rows.
 */
export const recomputeCampaignWebHandler = withOperator(async (request: Request) => {
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

  const t0 = Date.now();
  const res = await recomputeCampaignRatings(id);
  const elapsedMs = Date.now() - t0;

  return json(
    {
      ok: true,
      campaignId: id,
      totalVotes: res.totalVotes,
      categories: Object.keys(res.byCategory),
      rowsWritten: res.rowsWritten,
      iterations: res.byCategory.overall?.iterations ?? null,
      converged: res.byCategory.overall?.converged ?? null,
      elapsedMs,
    },
    200,
  );
});

function extractId(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  if (
    parts[0] === 'api' &&
    parts[1] === 'campaigns' &&
    parts[3] === 'recompute'
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
