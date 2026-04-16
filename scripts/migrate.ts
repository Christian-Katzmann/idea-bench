/**
 * Applies pending migrations in ./drizzle to the database pointed at by
 * DATABASE_URL. Idempotent — drizzle tracks applied migrations in its
 * own `__drizzle_migrations` table.
 *
 * Usage: `npm run db:migrate`
 */
import { config as loadDotenv } from 'dotenv';
// Prefer .env.local (developer overrides), fall back to .env.
loadDotenv({ path: '.env.local' });
loadDotenv({ path: '.env' });
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import { neon } from '@neondatabase/serverless';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const db = drizzle(neon(url));
  console.log('Applying migrations from ./drizzle...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations applied.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
