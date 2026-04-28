import { and, eq } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { withOperator } from '../../auth/middleware.js';

/**
 * GET /api/campaigns/:id/generations?promptId=<uuid>
 *
 * Lazy-loaded by the dashboard's per-input drilldown so the operator
 * can read each variant's actual output for a given input. Returns a
 * tight payload — id, campaignModelId, output (or error) — keyed off
 * the (campaignId, promptId) pair so a row that was overwritten by a
 * later generate retry yields the most-recent text.
 *
 * No editing surface here: generations are produced by /generate and
 * read-only thereafter. Failed slots return their `error` string in
 * place of `output` so the operator can see why a cell is empty.
 */
export const generationsByPromptWebHandler = withOperator(
  async (request: Request) => {
    if (request.method !== 'GET') {
      return new Response('method not allowed', { status: 405 });
    }

    const url = new URL(request.url);
    const campaignId = extractCampaignId(url);
    if (!campaignId) {
      return json({ error: 'missing campaign id in URL' }, 400);
    }
    const promptId = url.searchParams.get('promptId');
    if (!promptId) {
      return json({ error: 'promptId query parameter is required' }, 400);
    }

    const db = getDb();
    const [campaign] = await db
      .select({ id: schema.campaigns.id, deletedAt: schema.campaigns.deletedAt })
      .from(schema.campaigns)
      .where(eq(schema.campaigns.id, campaignId))
      .limit(1);
    if (!campaign || campaign.deletedAt) {
      return json({ error: 'campaign not found' }, 404);
    }

    // Sanity-check the prompt belongs to this campaign before we serve
    // its generations. Cheap and prevents a cross-campaign leak if the
    // caller composes URLs by hand.
    const [prompt] = await db
      .select({ id: schema.prompts.id })
      .from(schema.prompts)
      .where(
        and(
          eq(schema.prompts.id, promptId),
          eq(schema.prompts.campaignId, campaignId),
        ),
      )
      .limit(1);
    if (!prompt) {
      return json({ error: 'prompt not found in this campaign' }, 404);
    }

    const generations = await db
      .select({
        id: schema.generations.id,
        campaignModelId: schema.generations.campaignModelId,
        output: schema.generations.output,
        error: schema.generations.error,
        tokensIn: schema.generations.tokensIn,
        tokensOut: schema.generations.tokensOut,
        latencyMs: schema.generations.latencyMs,
        completedAt: schema.generations.completedAt,
      })
      .from(schema.generations)
      .where(eq(schema.generations.promptId, promptId));

    return json({ promptId, generations }, 200);
  },
);

function extractCampaignId(url: URL): string | null {
  // /api/campaigns/:id/generations → parts[2] is the id.
  const parts = url.pathname.split('/').filter(Boolean);
  if (
    parts[0] === 'api' &&
    parts[1] === 'campaigns' &&
    parts[3] === 'generations'
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
