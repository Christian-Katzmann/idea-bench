import { eq } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { withOperator } from '../../auth/middleware.js';
import { invalidateAnalyticsSnapshot } from '../../models/library.js';

export const closeCampaignWebHandler = withOperator(
  async (request: Request) => {
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
    if (campaign.status === 'draft') {
      return json({ error: 'draft campaigns cannot be closed' }, 409);
    }
    if (campaign.status === 'completed') {
      return json(
        {
          ok: true,
          status: 'completed',
          closedAt:
            campaign.closedAt?.toISOString() ?? campaign.updatedAt.toISOString(),
          alreadyClosed: true,
        },
        200,
      );
    }

    const now = new Date();
    await db
      .update(schema.campaigns)
      .set({
        status: 'completed',
        closedAt: now,
        updatedAt: now,
      })
      .where(eq(schema.campaigns.id, id));

    invalidateAnalyticsSnapshot();
    return json(
      {
        ok: true,
        status: 'completed',
        closedAt: now.toISOString(),
      },
      200,
    );
  },
);

function extractId(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'api' && parts[1] === 'campaigns' && parts[3] === 'close') {
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
