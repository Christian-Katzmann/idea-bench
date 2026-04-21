import {
  createPersonaWebHandler,
  listPersonasWebHandler,
} from '../../src/server/routes/personas/index.js';
import { toVercelHandler } from '../../src/server/vercel-adapter.js';

/**
 * /api/personas
 *   GET  ?q=&tag=&starter=1   → list personas (filtered)
 *   POST                       → create
 *
 * Per-persona GET/PATCH/DELETE live at [id]/index.ts.
 */
export default toVercelHandler(async (request: Request) => {
  if (request.method === 'GET') return listPersonasWebHandler(request);
  if (request.method === 'POST') return createPersonaWebHandler(request);
  return new Response('method not allowed', { status: 405 });
});
