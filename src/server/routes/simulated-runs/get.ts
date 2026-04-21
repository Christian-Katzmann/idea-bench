import { eq } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { withOperator } from '../../auth/middleware.js';

/**
 * GET /api/simulated-runs/:id
 *
 * Returns the full run detail — run row + seats summary + per-seat
 * progress counts. The operator's progress UI polls this when no SSE
 * stream is active (e.g., after a page reload).
 */
export const getSimulatedRunWebHandler = withOperator(async (request) => {
  if (request.method !== 'GET') {
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

  const seats = await db
    .select({
      id: schema.simulatedParticipants.id,
      seatIndex: schema.simulatedParticipants.seatIndex,
      judgeModelId: schema.simulatedParticipants.judgeModelId,
      personaId: schema.simulatedParticipants.personaId,
      status: schema.simulatedParticipants.status,
      error: schema.simulatedParticipants.error,
      completedAt: schema.simulatedParticipants.completedAt,
    })
    .from(schema.simulatedParticipants)
    .where(eq(schema.simulatedParticipants.simulatedRunId, id))
    .orderBy(schema.simulatedParticipants.seatIndex);

  const seatsByStatus = {
    pending: 0,
    running: 0,
    complete: 0,
    failed: 0,
  };
  for (const s of seats) seatsByStatus[s.status] += 1;

  return json(
    {
      run: {
        id: run.id,
        campaignId: run.campaignId,
        panelType: run.panelType,
        voterCount: run.voterCount,
        modelMix: run.modelMix,
        personaIds: run.personaIds,
        status: run.status,
        costEstimateUsd:
          run.costEstimateUsd != null ? Number(run.costEstimateUsd) : null,
        costActualUsd:
          run.costActualUsd != null ? Number(run.costActualUsd) : 0,
        costCeilingUsd:
          run.costCeilingUsd != null ? Number(run.costCeilingUsd) : null,
        maxConcurrency: run.maxConcurrency,
        error: run.error,
        createdAt: run.createdAt,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
      },
      seatsByStatus,
      seatsTotal: seats.length,
      seats,
    },
    200,
  );
});

function extractRunId(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  // /api/simulated-runs/:id
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
