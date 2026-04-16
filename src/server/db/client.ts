/**
 * Drizzle client, module-scoped and memoized.
 *
 * Uses the Neon HTTP driver (not pool/WebSocket). HTTP is a better fit
 * for Vercel Functions: no connection lifecycle to manage, no cold-start
 * dial cost, and Neon handles pooling upstream.
 *
 * Tradeoff: the HTTP driver does not support multi-statement
 * transactions. None of our current operations require them. If we ever
 * need them (e.g. a reconcile job that must rewrite ratings atomically),
 * swap to `drizzle-orm/neon-serverless` with a `Pool`.
 */
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema.js';

let cached: ReturnType<typeof createDb> | undefined;

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Run `vercel env pull` or populate .env.local.',
    );
  }
  return drizzle(neon(url), { schema });
}

/**
 * Returns the drizzle client. Memoized per module instance — safe to call
 * from every handler invocation; the Neon HTTP driver is cheap to
 * construct but there's no reason to rebuild it per request.
 */
export function getDb() {
  if (!cached) cached = createDb();
  return cached;
}

export { schema };
