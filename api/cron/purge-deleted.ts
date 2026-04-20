import { and, isNotNull, lt } from 'drizzle-orm';
import { getDb } from '../../src/server/db/client.js';
import * as schema from '../../src/server/db/schema.js';
import { invalidateAnalyticsSnapshot } from '../../src/server/models/library.js';
import { toVercelHandler } from '../../src/server/vercel-adapter.js';

/**
 * POST/GET /api/cron/purge-deleted
 *
 * Daily cron (registered in vercel.json) that hard-deletes campaigns
 * which were soft-deleted more than 30 days ago. The cascade on the
 * `prompts`, `campaign_models`, `generations`, `participants`,
 * `tournaments`, `votes`, `ratings` foreign keys takes care of the rest
 * (each one declares `onDelete: 'cascade'` in schema.ts).
 *
 * Auth: Vercel injects `Authorization: Bearer <CRON_SECRET>` automatically
 * when invoking cron endpoints. Return 401 for any other caller so the
 * route isn't exploitable as a "trash everything" button.
 *
 * Idempotent: running twice in a row deletes nothing the second time.
 */

const PURGE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

async function handler(request: Request): Promise<Response> {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const got = request.headers.get('authorization');
    if (got !== `Bearer ${expected}`) {
      return json({ error: 'unauthorized' }, 401);
    }
  } else if (process.env.NODE_ENV === 'production') {
    // Refuse to run unauthenticated in production; better a missed sweep
    // than a public delete endpoint.
    return json({ error: 'CRON_SECRET not configured' }, 500);
  }

  const cutoff = new Date(Date.now() - PURGE_AFTER_MS);
  const db = getDb();
  const purged = await db
    .delete(schema.campaigns)
    .where(
      and(
        isNotNull(schema.campaigns.deletedAt),
        lt(schema.campaigns.deletedAt, cutoff),
      ),
    )
    .returning({ id: schema.campaigns.id });

  if (purged.length > 0) {
    invalidateAnalyticsSnapshot();
  }

  return json(
    {
      ok: true,
      purgedCount: purged.length,
      cutoff: cutoff.toISOString(),
    },
    200,
  );
}

export default toVercelHandler(handler);

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
