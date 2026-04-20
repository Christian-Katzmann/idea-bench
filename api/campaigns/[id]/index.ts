import { getDb } from '../../../src/server/db/client.js';
import { withOperator } from '../../../src/server/auth/middleware.js';
import { buildCampaignDetail } from '../../../src/server/campaigns/detail.js';
import { toVercelHandler } from '../../../src/server/vercel-adapter.js';

/**
 * GET /api/campaigns/:id
 *
 * Returns the campaign + everything the dashboard needs in one shot:
 * stats (vote count, unique participants, elapsed), campaign_models,
 * prompts count, per-model ratings (for the leaderboard).
 *
 * Ratings are served as-is from the `ratings` table. Phase 4 will add
 * the B-T recompute that keeps them fresh; for now, the seed populates
 * placeholder ratings on the demo campaign and new campaigns return an
 * empty leaderboard until voting + Phase 4 compute run.
 */
export default toVercelHandler(withOperator(async (request: Request) => {
  if (request.method !== 'GET') {
    return new Response('method not allowed', { status: 405 });
  }

  const id = extractId(new URL(request.url));
  if (!id) return json({ error: 'missing id' }, 400);

  const detail = await buildCampaignDetail(getDb(), id);
  if (!detail) return json({ error: 'campaign not found' }, 404);

  return json(
    {
      campaign: detail.campaign,
      stats: detail.stats,
      models: detail.models,
      prompts: detail.prompts,
      ratings: detail.ratings,
    },
    200,
  );
}));

function extractId(url: URL): string | null {
  // /api/campaigns/:id → parts[0]='api', parts[1]='campaigns', parts[2]=id
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'api' && parts[1] === 'campaigns' && parts.length === 3) {
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
