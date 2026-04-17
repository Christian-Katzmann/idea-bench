import { getDb } from '../../../src/server/db/client.js';
import { withOperator } from '../../../src/server/auth/middleware.js';
import { updateRegistryModel } from '../../../src/server/models/library.js';
import { toVercelHandler } from '../../../src/server/vercel-adapter.js';

export default toVercelHandler(withOperator(async (request: Request) => {
  if (request.method !== 'PATCH') {
    return new Response('method not allowed', { status: 405 });
  }

  const id = extractId(new URL(request.url));
  if (!id) return json({ error: 'missing id' }, 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }

  if (typeof body !== 'object' || body === null) {
    return json({ error: 'body must be an object' }, 400);
  }

  const patch: { enabled?: boolean; legacy?: boolean } = {};
  const raw = body as Record<string, unknown>;
  if (typeof raw.enabled === 'boolean') patch.enabled = raw.enabled;
  if (typeof raw.legacy === 'boolean') patch.legacy = raw.legacy;
  if (patch.enabled == null && patch.legacy == null) {
    return json({ error: 'body must include enabled and/or legacy boolean fields' }, 400);
  }

  try {
    const updated = await updateRegistryModel(getDb(), id, patch);
    return json(updated, 200);
  } catch (error) {
    if (error instanceof Error && error.message === 'model not found') {
      return json({ error: error.message }, 404);
    }
    throw error;
  }
}));

function extractId(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'api' && parts[1] === 'models' && parts.length === 3) {
    return parts[2] || null;
  }
  return null;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
