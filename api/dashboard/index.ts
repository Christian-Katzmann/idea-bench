import { getDb } from '../../src/server/db/client.js';
import { withOperator } from '../../src/server/auth/middleware.js';
import { buildDashboardSummary } from '../../src/server/dashboard/summary.js';
import { toVercelHandler } from '../../src/server/vercel-adapter.js';

export default toVercelHandler(withOperator(async (request: Request) => {
  if (request.method !== 'GET') {
    return new Response('method not allowed', { status: 405 });
  }

  const summary = await buildDashboardSummary(getDb());
  return json(summary, 200);
}));

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
