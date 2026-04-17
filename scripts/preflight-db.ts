import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { evaluateDatabasePreflight } from '../src/server/db/preflight.js';

loadDotenv({ path: '.env.local' });
loadDotenv({ path: '.env' });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Cannot run deployment preflight.');
    process.exit(1);
  }

  const migrationFiles = readdirSync(join(process.cwd(), 'drizzle'))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const sql = neon(url);
  const tables = await sql`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
    order by table_name
  `;
  const migrationsTableCheck = await sql`
    select count(*)::int as n
    from information_schema.tables
    where table_schema = 'drizzle'
      and table_name = '__drizzle_migrations'
  `;
  const hasMigrationsTable = migrationsTableCheck[0]?.n === 1;
  const appliedMigrationCount = hasMigrationsTable
    ? (await sql`select count(*)::int as n from drizzle.__drizzle_migrations`)[0]?.n ?? 0
    : 0;

  const result = evaluateDatabasePreflight({
    existingTables: tables.map((row) => String(row.table_name)),
    hasMigrationsTable,
    appliedMigrationCount,
    migrationFiles,
  });

  if (!result.ok) {
    console.error('Database deployment preflight failed:');
    for (const message of result.messages) {
      console.error(`- ${message}`);
    }
    process.exit(1);
  }

  console.log(
    `Database deployment preflight passed. ${migrationFiles.length} migration file${migrationFiles.length === 1 ? '' : 's'} applied.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
