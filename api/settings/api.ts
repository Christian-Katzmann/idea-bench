import { withOperator } from '../../src/server/auth/middleware.js';
import { buildApiSettingsSummary } from '../../src/server/settings/apiHealth.js';
import { toVercelHandler } from '../../src/server/vercel-adapter.js';

export default toVercelHandler(withOperator(async (request: Request) => {
  if (request.method !== 'GET') {
    return new Response('method not allowed', { status: 405 });
  }

  return json(buildApiSettingsSummary(), 200);
}));

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
