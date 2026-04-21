import { eq } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { withOperator } from '../../auth/middleware.js';

/**
 * POST /api/simulated-runs/:id/abort
 *
 * Flips the run's status to 'aborted'. The SSE /run stream watches for
 * this via its own abort signal (client disconnect), but an operator
 * can also call this from a separate tab to stop a run cleanly. Any
 * completed-seat responses remain durable; only pending seats stop.
 */
export const abortSimulatedRunWebHandler = withOperator(async (request) => {
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
  if (run.status === 'complete' || run.status === 'aborted' || run.status === 'failed') {
    return json(
      { ok: true, status: run.status, message: `run already ${run.status}` },
      200,
    );
  }

  await db
    .update(schema.simulatedRuns)
    .set({
      status: 'aborted',
      completedAt: new Date(),
      error: 'aborted by operator',
    })
    .where(eq(schema.simulatedRuns.id, id));

  return json({ ok: true, status: 'aborted' }, 200);
});

function extractRunId(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  // Matches both the dev-plugin shape /api/simulated-runs/:id/abort and
  // the Vercel-rewrite shape /api/simulated-runs/:id?__action=abort.
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
