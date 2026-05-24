/**
 * Plan 06 P0-A drift remediation — seed the personas table with the
 * curated starter library.
 *
 * Plan 02 Phase 2 was supposed to ship this seeding step but never
 * landed; the symptom was every system-prompt-arena operator landing
 * on the empty-state CTA in the persona suggestion card. This script
 * fills that gap by reading `data/starter-personas.json` (a
 * hand-curated list of 5 persona archetypes — see the Plan 02 handoff
 * doc warning against LLM-generating them) and INSERTing each row
 * with `is_starter = true`.
 *
 * Idempotent: re-running is safe. The script skips any persona whose
 * `name` already exists in the table — first to avoid clobbering an
 * operator-edited starter, second so that running this in a CI/CD
 * deploy pipeline doesn't multiply rows on every push.
 *
 * Refuses to run against `NODE_ENV=production` unless
 * `ALLOW_PROD_SEED=1` is set — same guardrail as `scripts/seed.ts`.
 *
 * Usage: `npm run db:seed-starter-personas`
 *
 * Editing the library:
 * - Open `data/starter-personas.json`
 * - Add, remove, or edit persona objects
 * - Re-run this script. Existing rows by `name` are preserved;
 *   new rows are inserted; deleted rows in the file are NOT removed
 *   from the DB (curated starters are operator-protected — see the
 *   `delete` handler in `src/server/routes/personas/index.ts`).
 */
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });
loadDotenv({ path: '.env' });
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { createDbClient } from '../src/server/db/client';
import * as schema from '../src/server/db/schema';

interface StarterPersona {
  name: string;
  description: string;
  systemPrompt: string;
  priorities: string[];
  antiPatterns: string[];
  tags: string[];
}

function isStarterPersona(value: unknown): value is StarterPersona {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.name === 'string' &&
    typeof v.description === 'string' &&
    typeof v.systemPrompt === 'string' &&
    Array.isArray(v.priorities) &&
    v.priorities.every((p) => typeof p === 'string') &&
    Array.isArray(v.antiPatterns) &&
    v.antiPatterns.every((p) => typeof p === 'string') &&
    Array.isArray(v.tags) &&
    v.tags.every((t) => typeof t === 'string')
  );
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ALLOW_PROD_SEED !== '1'
  ) {
    console.error(
      'Refusing to seed production. Set ALLOW_PROD_SEED=1 to override.',
    );
    process.exit(1);
  }

  const dataPath = path.resolve(
    new URL('.', import.meta.url).pathname,
    '..',
    'data',
    'starter-personas.json',
  );
  const raw = await readFile(dataPath, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(
      `Failed to parse ${dataPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
  if (!Array.isArray(parsed)) {
    console.error(`${dataPath} must be a JSON array.`);
    process.exit(1);
  }
  const starters: StarterPersona[] = [];
  for (let i = 0; i < parsed.length; i++) {
    if (!isStarterPersona(parsed[i])) {
      console.error(
        `Entry ${i} in ${dataPath} is missing required fields ` +
          `(name, description, systemPrompt, priorities[], antiPatterns[], tags[]).`,
      );
      process.exit(1);
    }
    starters.push(parsed[i] as StarterPersona);
  }
  if (starters.length === 0) {
    console.warn(`${dataPath} contains zero personas — nothing to seed.`);
    return;
  }

  const { db, client } = createDbClient(url);

  try {
    let inserted = 0;
    let skipped = 0;
    for (const persona of starters) {
      const existing = await db
        .select({ id: schema.personas.id, isStarter: schema.personas.isStarter })
        .from(schema.personas)
        .where(eq(schema.personas.name, persona.name))
        .limit(1);
      if (existing.length > 0) {
        skipped += 1;
        const tag = existing[0].isStarter ? 'starter' : 'operator-created';
        console.log(`  skip   ${persona.name}  (already exists, ${tag})`);
        continue;
      }
      await db.insert(schema.personas).values({
        name: persona.name,
        description: persona.description,
        systemPrompt: persona.systemPrompt,
        priorities: persona.priorities,
        antiPatterns: persona.antiPatterns,
        tags: persona.tags,
        isStarter: true,
      });
      inserted += 1;
      console.log(`  insert ${persona.name}`);
    }

    console.log(
      `\nDone. Inserted ${inserted}, skipped ${skipped} of ${starters.length} ` +
        `personas in ${dataPath}.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Seeding starter personas failed:', err);
  process.exit(1);
});
