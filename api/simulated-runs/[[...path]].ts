import { createSimulatedRunWebHandler } from '../../src/server/routes/simulated-runs/create.js';
import { listSimulatedRunsWebHandler } from '../../src/server/routes/simulated-runs/list.js';
import { previewSimulatedRunCostWebHandler } from '../../src/server/routes/simulated-runs/previewCost.js';
import { getSimulatedRunWebHandler } from '../../src/server/routes/simulated-runs/get.js';
import { runSimulatedRunWebHandler } from '../../src/server/routes/simulated-runs/run.js';
import { abortSimulatedRunWebHandler } from '../../src/server/routes/simulated-runs/abort.js';
import { toVercelHandler } from '../../src/server/vercel-adapter.js';

/**
 * Single catch-all dispatcher for /api/simulated-runs/**. Collapsing
 * the previous 3-file tree (index + [id]/index + [id]/[action]) into
 * one entrypoint so the Hobby-plan function budget stays at 12.
 *
 * Routes handled:
 *   GET    /api/simulated-runs                      → list
 *   POST   /api/simulated-runs                      → create
 *   POST   /api/simulated-runs/preview-cost         → cost estimate
 *   GET    /api/simulated-runs/:id                  → detail
 *   POST   /api/simulated-runs/:id/run              → SSE launch
 *   POST   /api/simulated-runs/:id/abort            → soft-abort
 */
export default toVercelHandler(async (request: Request) => {
  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  // parts = ['api', 'simulated-runs', ...rest]
  const rest = parts.slice(2);

  if (rest.length === 0) {
    if (request.method === 'GET') return listSimulatedRunsWebHandler(request);
    if (request.method === 'POST') return createSimulatedRunWebHandler(request);
    return new Response('method not allowed', { status: 405 });
  }

  if (rest.length === 1) {
    // /api/simulated-runs/{preview-cost | <id>}
    if (rest[0] === 'preview-cost') {
      return previewSimulatedRunCostWebHandler(request);
    }
    return getSimulatedRunWebHandler(request);
  }

  if (rest.length === 2) {
    // /api/simulated-runs/:id/<action>
    const action = rest[1];
    if (action === 'run') return runSimulatedRunWebHandler(request);
    if (action === 'abort') return abortSimulatedRunWebHandler(request);
  }

  return new Response(JSON.stringify({ error: 'not found' }), {
    status: 404,
    headers: { 'content-type': 'application/json' },
  });
});
