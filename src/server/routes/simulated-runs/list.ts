import { desc, eq } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { withOperator } from '../../auth/middleware.js';

/**
 * GET /api/simulated-runs?campaignId=uuid
 *
 * Returns a compact list of runs (newest first) for the operator
 * dashboard. Per-run details — including seats and per-seat progress —
 * come from GET /api/simulated-runs/:id.
 */
export const listSimulatedRunsWebHandler = withOperator(async (request) => {
  if (request.method !== 'GET') {
    return new Response('method not allowed', { status: 405 });
  }
  const url = new URL(request.url);
  const campaignId = url.searchParams.get('campaignId');
  if (!campaignId) return json({ error: 'campaignId required' }, 400);

  const db = getDb();
  const rows = await db
    .select({
      id: schema.simulatedRuns.id,
      campaignId: schema.simulatedRuns.campaignId,
      panelType: schema.simulatedRuns.panelType,
      voterCount: schema.simulatedRuns.voterCount,
      modelMix: schema.simulatedRuns.modelMix,
      personaIds: schema.simulatedRuns.personaIds,
      status: schema.simulatedRuns.status,
      costEstimateUsd: schema.simulatedRuns.costEstimateUsd,
      costActualUsd: schema.simulatedRuns.costActualUsd,
      costCeilingUsd: schema.simulatedRuns.costCeilingUsd,
      error: schema.simulatedRuns.error,
      createdAt: schema.simulatedRuns.createdAt,
      startedAt: schema.simulatedRuns.startedAt,
      completedAt: schema.simulatedRuns.completedAt,
    })
    .from(schema.simulatedRuns)
    .where(eq(schema.simulatedRuns.campaignId, campaignId))
    .orderBy(desc(schema.simulatedRuns.createdAt));

  return json(
    {
      runs: rows.map((r) => ({
        ...r,
        costEstimateUsd:
          r.costEstimateUsd != null ? Number(r.costEstimateUsd) : null,
        costActualUsd:
          r.costActualUsd != null ? Number(r.costActualUsd) : 0,
        costCeilingUsd:
          r.costCeilingUsd != null ? Number(r.costCeilingUsd) : null,
      })),
    },
    200,
  );
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
