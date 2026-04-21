import { createSimulatedRunWebHandler } from '../../src/server/routes/simulated-runs/create.js';
import { listSimulatedRunsWebHandler } from '../../src/server/routes/simulated-runs/list.js';
import { toVercelHandler } from '../../src/server/vercel-adapter.js';

/**
 * /api/simulated-runs
 *   GET  ?campaignId=uuid  → list runs for the campaign
 *   POST                   → create a new run (launch inputs in body)
 *
 * Sibling paths:
 *   POST /api/simulated-runs/preview-cost        (see preview-cost.ts)
 *   GET  /api/simulated-runs/:id                 (see [id]/index.ts)
 *   POST /api/simulated-runs/:id/run|abort       (see [id]/[action].ts)
 */
export default toVercelHandler(async (request: Request) => {
  if (request.method === 'GET') return listSimulatedRunsWebHandler(request);
  if (request.method === 'POST') return createSimulatedRunWebHandler(request);
  return new Response('method not allowed', { status: 405 });
});
