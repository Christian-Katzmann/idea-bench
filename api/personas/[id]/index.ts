import {
  deletePersonaWebHandler,
  getPersonaWebHandler,
  updatePersonaWebHandler,
} from '../../../src/server/routes/personas/index.js';
import { toVercelHandler } from '../../../src/server/vercel-adapter.js';

/**
 * /api/personas/:id
 *   GET    → persona detail
 *   PATCH  → partial update (any subset of name / description / prompt /
 *            priorities / antiPatterns / tags)
 *   DELETE → hard delete (starter personas are rejected)
 */
export default toVercelHandler(async (request: Request) => {
  if (request.method === 'GET') return getPersonaWebHandler(request);
  if (request.method === 'PATCH') return updatePersonaWebHandler(request);
  if (request.method === 'DELETE') return deletePersonaWebHandler(request);
  return new Response('method not allowed', { status: 405 });
});
