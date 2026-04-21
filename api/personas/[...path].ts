import {
  createPersonaWebHandler,
  deletePersonaWebHandler,
  getPersonaWebHandler,
  listPersonasWebHandler,
  updatePersonaWebHandler,
} from '../../src/server/routes/personas/index.js';
import { toVercelHandler } from '../../src/server/vercel-adapter.js';

/**
 * Single catch-all dispatcher for /api/personas/**. Collapsed from
 * two files to fit the Hobby-plan 12-function budget.
 *
 * Routes handled:
 *   GET    /api/personas       → list (with ?q/?tag/?starter filters)
 *   POST   /api/personas       → create
 *   GET    /api/personas/:id   → detail
 *   PATCH  /api/personas/:id   → update
 *   DELETE /api/personas/:id   → delete
 */
export default toVercelHandler(async (request: Request) => {
  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  // `__root` sentinel from vercel.json rewrite — see the simulated-runs
  // dispatcher for the full explanation.
  let rest = parts.slice(2);
  if (rest.length === 1 && rest[0] === '__root') rest = [];

  if (rest.length === 0) {
    if (request.method === 'GET') return listPersonasWebHandler(request);
    if (request.method === 'POST') return createPersonaWebHandler(request);
    return new Response('method not allowed', { status: 405 });
  }

  if (rest.length === 1) {
    if (request.method === 'GET') return getPersonaWebHandler(request);
    if (request.method === 'PATCH') return updatePersonaWebHandler(request);
    if (request.method === 'DELETE') return deletePersonaWebHandler(request);
    return new Response('method not allowed', { status: 405 });
  }

  return new Response(JSON.stringify({ error: 'not found' }), {
    status: 404,
    headers: { 'content-type': 'application/json' },
  });
});
