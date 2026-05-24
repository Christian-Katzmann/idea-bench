/**
 * Drizzle client, module-scoped and memoized.
 *
 * Uses postgres.js instead of a provider-specific HTTP driver so the
 * quickstart works with any normal Postgres URL: local Docker, Supabase,
 * Neon, RDS, or another managed host. `prepare: false` keeps the client
 * compatible with PgBouncer / transaction-pooler setups.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

let cached: ReturnType<typeof createDbClient> | undefined;

export function createPostgresClient(url: string) {
  return postgres(url, {
    max: 1,
    prepare: false,
  });
}

export function createDbClient(url: string) {
  const client = createPostgresClient(url);
  return {
    client,
    db: drizzle(client, { schema }),
  };
}

function createDbClientFromEnv() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Run `vercel env pull` or populate .env.local.',
    );
  }
  return createDbClient(url);
}

/**
 * Returns the drizzle client. Memoized per module instance so warm
 * serverless invocations reuse the same tiny connection pool.
 */
export function getDb() {
  if (!cached) cached = createDbClientFromEnv();
  return cached.db;
}

export { schema };
