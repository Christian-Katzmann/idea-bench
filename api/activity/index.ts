import { getDb } from '../../src/server/db/client.js';
import { withOperator } from '../../src/server/auth/middleware.js';
import { buildActivityFeed } from '../../src/server/activity/feed.js';
import { toVercelHandler } from '../../src/server/vercel-adapter.js';

export default toVercelHandler(withOperator(async (request: Request) => {
  if (request.method !== 'GET') {
    return new Response('method not allowed', { status: 405 });
  }

  const feed = await buildActivityFeed(getDb());
  return json(feed, 200);
}));

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
