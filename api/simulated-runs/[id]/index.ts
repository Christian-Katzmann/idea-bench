import { getSimulatedRunWebHandler } from '../../../src/server/routes/simulated-runs/get.js';
import { previewSimulatedRunCostWebHandler } from '../../../src/server/routes/simulated-runs/previewCost.js';
import { toVercelHandler } from '../../../src/server/vercel-adapter.js';

/**
 * Dispatched by id path segment:
 *   GET  /api/simulated-runs/:id              → run detail
 *   POST /api/simulated-runs/preview-cost     → cost estimate, no writes
 *
 * 'preview-cost' is reserved at the id level (a uuid can never match).
 * Merged into this handler to keep the repo under Vercel Hobby's
 * 12-function limit — splitting into a separate `preview-cost.ts` in
 * this directory would push the count over.
 */
export default toVercelHandler(async (request: Request) => {
  const parts = new URL(request.url).pathname.split('/').filter(Boolean);
  const idOrKeyword = parts[2] ?? '';
  if (idOrKeyword === 'preview-cost') {
    return previewSimulatedRunCostWebHandler(request);
  }
  return getSimulatedRunWebHandler(request);
});
