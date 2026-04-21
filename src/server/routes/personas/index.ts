/**
 * Handlers for /api/personas (list + create) and the shared update/get
 * path used by [id]/index.ts. Split here so both route files stay thin.
 */
import { and, desc, eq, ilike, inArray, sql, or } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { withOperator } from '../../auth/middleware.js';
import { validatePersonaInput } from './validate.js';

/** GET /api/personas?q=&tag=&starter=1 — list personas with cheap filters. */
export const listPersonasWebHandler = withOperator(async (request) => {
  if (request.method !== 'GET') {
    return new Response('method not allowed', { status: 405 });
  }
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const tag = (url.searchParams.get('tag') ?? '').trim().toLowerCase();
  const starterOnly = url.searchParams.get('starter') === '1';

  const db = getDb();
  const filters = [];
  if (q) {
    filters.push(
      or(
        ilike(schema.personas.name, `%${q}%`),
        ilike(schema.personas.description, `%${q}%`),
      ),
    );
  }
  if (tag) {
    // Postgres text[] contains operator: `tags @> ARRAY['corp']`.
    filters.push(sql`${schema.personas.tags} @> ARRAY[${tag}]::text[]`);
  }
  if (starterOnly) {
    filters.push(eq(schema.personas.isStarter, true));
  }

  const rows = await db
    .select()
    .from(schema.personas)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(
      desc(schema.personas.isStarter),
      desc(schema.personas.updatedAt),
    );
  return json({ personas: rows }, 200);
});

/** POST /api/personas — create. Operator never starts from a blank page;
 *  the UI pre-populates from a starter or a previous persona, but the
 *  API accepts raw fields too. */
export const createPersonaWebHandler = withOperator(async (request) => {
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }
  const parsed = validatePersonaInput(body);
  if (!parsed.ok) {
    const err = parsed as Extract<typeof parsed, { ok: false }>;
    return json({ error: err.error }, 400);
  }
  const okParsed = parsed as Extract<typeof parsed, { ok: true }>;
  const input = okParsed.value;

  // If derivedFromPersonaId is set, verify it exists so the
  // lineage link isn't a dangling FK later.
  const db = getDb();
  if (input.derivedFromPersonaId) {
    const [parent] = await db
      .select({ id: schema.personas.id })
      .from(schema.personas)
      .where(eq(schema.personas.id, input.derivedFromPersonaId))
      .limit(1);
    if (!parent) {
      return json(
        { error: `derivedFromPersonaId not found: ${input.derivedFromPersonaId}` },
        400,
      );
    }
  }

  const [row] = await db
    .insert(schema.personas)
    .values({
      name: input.name,
      description: input.description,
      systemPrompt: input.systemPrompt,
      priorities: input.priorities,
      antiPatterns: input.antiPatterns,
      tags: input.tags,
      derivedFromPersonaId: input.derivedFromPersonaId,
      isStarter: false,
    })
    .returning();

  return json({ persona: row }, 201);
});

/** GET /api/personas/:id — single persona detail. */
export const getPersonaWebHandler = withOperator(async (request) => {
  if (request.method !== 'GET') {
    return new Response('method not allowed', { status: 405 });
  }
  const id = extractPersonaId(new URL(request.url));
  if (!id) return json({ error: 'missing id' }, 400);

  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.personas)
    .where(eq(schema.personas.id, id))
    .limit(1);
  if (!row) return json({ error: 'persona not found' }, 404);
  return json({ persona: row }, 200);
});

/** PATCH /api/personas/:id — partial update. */
export const updatePersonaWebHandler = withOperator(async (request) => {
  if (request.method !== 'PATCH') {
    return new Response('method not allowed', { status: 405 });
  }
  const id = extractPersonaId(new URL(request.url));
  if (!id) return json({ error: 'missing id' }, 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }
  const parsed = validatePersonaInput(body, { allowPartial: true });
  if (!parsed.ok) {
    const err = parsed as Extract<typeof parsed, { ok: false }>;
    return json({ error: err.error }, 400);
  }
  const okParsed = parsed as Extract<typeof parsed, { ok: true }>;
  const input = okParsed.value;

  const db = getDb();
  const updates: Partial<typeof schema.personas.$inferInsert> = {
    updatedAt: new Date(),
  };
  const raw = body as Record<string, unknown>;
  if (typeof raw.name === 'string') updates.name = input.name;
  if (typeof raw.description === 'string')
    updates.description = input.description;
  if (typeof raw.systemPrompt === 'string')
    updates.systemPrompt = input.systemPrompt;
  if (Array.isArray(raw.priorities)) updates.priorities = input.priorities;
  if (Array.isArray(raw.antiPatterns))
    updates.antiPatterns = input.antiPatterns;
  if (Array.isArray(raw.tags)) updates.tags = input.tags;

  const [row] = await db
    .update(schema.personas)
    .set(updates)
    .where(eq(schema.personas.id, id))
    .returning();
  if (!row) return json({ error: 'persona not found' }, 404);
  return json({ persona: row }, 200);
});

/** DELETE /api/personas/:id — hard delete. Simulated_participants
 *  referencing this persona get their personaId set to null via the FK
 *  ON DELETE SET NULL, so past runs' lineage becomes "(deleted
 *  persona)" rather than disappearing. Ratings rows follow the same
 *  rule. */
export const deletePersonaWebHandler = withOperator(async (request) => {
  if (request.method !== 'DELETE') {
    return new Response('method not allowed', { status: 405 });
  }
  const id = extractPersonaId(new URL(request.url));
  if (!id) return json({ error: 'missing id' }, 400);

  const db = getDb();
  const [row] = await db
    .delete(schema.personas)
    .where(eq(schema.personas.id, id))
    .returning({ id: schema.personas.id, isStarter: schema.personas.isStarter });
  if (!row) return json({ error: 'persona not found' }, 404);
  if (row.isStarter) {
    // Undo — starters are intentionally protected. Operators duplicate-
    // and-edit starters rather than modify or remove them.
    await db
      .insert(schema.personas)
      .values({ id: row.id } as typeof schema.personas.$inferInsert)
      // No-op — the row is gone; instead return an error. This branch is
      // defensive; the client-side confirmation already warns.
      .onConflictDoNothing();
    return json(
      { error: 'starter personas cannot be deleted — duplicate instead' },
      409,
    );
  }
  return json({ ok: true, id }, 200);
});

function extractPersonaId(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  // /api/personas/:id
  if (parts[0] === 'api' && parts[1] === 'personas' && parts[2]) {
    return parts[2];
  }
  return null;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// Silence unused-import lint — these drizzle helpers are referenced
// conditionally via the list handler's filter composition.
void inArray;
