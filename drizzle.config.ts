import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });
loadDotenv({ path: '.env' });
import { defineConfig } from 'drizzle-kit';

// DATABASE_URL is only needed for `drizzle-kit push` and `studio`.
// `generate` works offline — it diffs schema.ts against the committed
// migration history in ./drizzle.
const url = process.env.DATABASE_URL;

export default defineConfig({
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  ...(url ? { dbCredentials: { url } } : {}),
  strict: true,
  verbose: true,
});
