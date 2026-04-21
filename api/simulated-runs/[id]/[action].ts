import { abortSimulatedRunWebHandler } from '../../../src/server/routes/simulated-runs/abort.js';
import { runSimulatedRunWebHandler } from '../../../src/server/routes/simulated-runs/run.js';
import { type WebHandler, toVercelHandler } from '../../../src/server/vercel-adapter.js';

const actionHandlers: Record<string, WebHandler> = {
  run: runSimulatedRunWebHandler,
  abort: abortSimulatedRunWebHandler,
};

const actionWebHandler: WebHandler = async (request) => {
  const parts = new URL(request.url).pathname.split('/').filter(Boolean);
  const action = parts[3] ?? '';
  const handler = actionHandlers[action];
  if (!handler) {
    return new Response(JSON.stringify({ error: 'not found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  }
  return handler(request);
};

export default toVercelHandler(actionWebHandler);
