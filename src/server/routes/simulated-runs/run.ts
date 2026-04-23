import { eq } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { withAIOperator } from '../../auth/middleware.js';
import { createSSEStream, sseHeaders } from '../../sse.js';
import { executeSimulatedRun } from '../../simulated-runs/index.js';
import { recomputeCampaignRatings } from '../../ratings.js';

/**
 * POST /api/simulated-runs/:id/run
 *
 * Opens an SSE stream and drives the run to completion (or pause, on
 * abort / ceiling). Idempotent: calling again on a run with pending
 * seats resumes from the last durable row. Calling on a completed run
 * is a no-op that emits a single 'done' event.
 *
 * After the run terminates, a single ratings recompute is kicked so
 * the leaderboard reflects the new simulated signal. If the recompute
 * fails, the run's data is still durable and a later human submit
 * (which also recomputes) will catch up.
 */
export const runSimulatedRunWebHandler = withAIOperator(async (request) => {
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }
  const id = extractRunId(new URL(request.url));
  if (!id) return json({ error: 'missing id' }, 400);

  const db = getDb();
  const [run] = await db
    .select()
    .from(schema.simulatedRuns)
    .where(eq(schema.simulatedRuns.id, id))
    .limit(1);
  if (!run) return json({ error: 'simulated run not found' }, 404);

  const campaignIdAtStart = run.campaignId;

  const stream = createSSEStream(async (send, signal) => {
    try {
      await executeSimulatedRun({ runId: id, send, signal });
    } catch (err) {
      send('error', {
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    // Fresh rating aggregate — synchronous and forgiving, matching the
    // pattern in the human submit handlers.
    try {
      await recomputeCampaignRatings(campaignIdAtStart);
      send('recomputed', { campaignId: campaignIdAtStart });
    } catch (err) {
      send('recompute_error', {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return new Response(stream, { status: 200, headers: sseHeaders() });
});

function extractRunId(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  // Matches both /api/simulated-runs/:id/run (dev) and the Vercel-rewrite
  // shape /api/simulated-runs/:id (with ?__action=run).
  if (parts[0] === 'api' && parts[1] === 'simulated-runs' && parts[2]) {
    return parts[2];
  }
  return null;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
