import { eq } from 'drizzle-orm';
import { getDb } from '../../../src/server/db/client.js';
import { withOperator } from '../../../src/server/auth/middleware.js';
import { buildCampaignDetail } from '../../../src/server/campaigns/detail.js';
import * as schema from '../../../src/server/db/schema.js';
import { invalidateAnalyticsSnapshot } from '../../../src/server/models/library.js';
import { toVercelHandler } from '../../../src/server/vercel-adapter.js';

/**
 * GET    /api/campaigns/:id  — full dashboard payload
 *                              (campaign + stats + models + prompts + ratings)
 * PATCH  /api/campaigns/:id  — edit name / description / categories
 *                              (status, slug, generations stay immutable here)
 * DELETE /api/campaigns/:id  — soft-delete (sets deletedAt = now);
 *                              the daily purge cron hard-deletes rows older
 *                              than 30 days. Vote/rating history is preserved
 *                              through the grace window so the operator can
 *                              recover via DB until then.
 *
 * All three require the operator session cookie.
 */
export default toVercelHandler(
  withOperator(async (request: Request) => {
    const id = extractId(new URL(request.url));
    if (!id) return json({ error: 'missing id' }, 400);

    if (request.method === 'GET') {
      const detail = await buildCampaignDetail(getDb(), id);
      if (!detail) return json({ error: 'campaign not found' }, 404);
      return json(
        {
          campaign: detail.campaign,
          stats: detail.stats,
          models: detail.models,
          prompts: detail.prompts,
          ratings: detail.ratings,
          // Plan 05 P1-B — per-input Best-of-N drilldown rows. Empty
          // for non-prompt-arena campaigns; the dashboard reads this
          // to render the "By input" table without a second round-trip.
          perInputBestOfN: detail.perInputBestOfN,
          // Plan 06 P2-A — heatmap cells for system-prompt arenas
          // (per-(variant, prompt) slider score grid). Empty for
          // other kinds.
          heatmapCells: detail.heatmapCells,
        },
        200,
      );
    }

    if (request.method === 'PATCH') {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'invalid JSON body' }, 400);
      }
      const parsed = parseEditPayload(body);
      if ('error' in parsed) return json({ error: parsed.error }, 400);
      if (Object.keys(parsed.patch).length === 0) {
        return json({ error: 'nothing to update' }, 400);
      }

      const db = getDb();
      const [existing] = await db
        .select()
        .from(schema.campaigns)
        .where(eq(schema.campaigns.id, id))
        .limit(1);
      if (!existing || existing.deletedAt) {
        return json({ error: 'campaign not found' }, 404);
      }

      const now = new Date();
      const [updated] = await db
        .update(schema.campaigns)
        .set({ ...parsed.patch, updatedAt: now })
        .where(eq(schema.campaigns.id, id))
        .returning();

      invalidateAnalyticsSnapshot();
      return json(
        {
          ok: true,
          campaign: {
            id: updated.id,
            shareSlug: updated.shareSlug,
            name: updated.name,
            description: updated.description,
            categories: updated.categories,
            status: updated.status,
            votingMode: updated.votingMode,
            emailPromptMessage: updated.emailPromptMessage,
            createdAt: updated.createdAt,
            closedAt: updated.closedAt,
          },
        },
        200,
      );
    }

    if (request.method === 'DELETE') {
      const db = getDb();
      const [existing] = await db
        .select({
          id: schema.campaigns.id,
          deletedAt: schema.campaigns.deletedAt,
        })
        .from(schema.campaigns)
        .where(eq(schema.campaigns.id, id))
        .limit(1);
      if (!existing) {
        return json({ error: 'campaign not found' }, 404);
      }
      if (existing.deletedAt) {
        // Idempotent: already soft-deleted, return the existing tombstone.
        return json(
          {
            ok: true,
            deletedAt: existing.deletedAt.toISOString(),
            alreadyDeleted: true,
          },
          200,
        );
      }
      const now = new Date();
      await db
        .update(schema.campaigns)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(schema.campaigns.id, id));

      invalidateAnalyticsSnapshot();
      return json({ ok: true, deletedAt: now.toISOString() }, 200);
    }

    return new Response('method not allowed', { status: 405 });
  }),
);

interface EditPatch {
  name?: string;
  description?: string;
  categories?: string[];
  votingMode?: schema.VotingMode;
  emailPromptMessage?: string | null;
}

const VOTING_MODES: readonly schema.VotingMode[] = [
  'anonymous',
  'email_required',
  'hybrid',
];

function parseEditPayload(
  input: unknown,
): { patch: EditPatch } | { error: string } {
  if (typeof input !== 'object' || input === null) {
    return { error: 'body must be an object' };
  }
  const o = input as Record<string, unknown>;
  const patch: EditPatch = {};

  if ('name' in o) {
    if (typeof o.name !== 'string') return { error: 'name must be a string' };
    const trimmed = o.name.trim();
    if (!trimmed) return { error: 'name cannot be empty' };
    if (trimmed.length > 200) return { error: 'name is too long (max 200)' };
    patch.name = trimmed;
  }

  if ('description' in o) {
    if (typeof o.description !== 'string') {
      return { error: 'description must be a string' };
    }
    if (o.description.length > 2000) {
      return { error: 'description is too long (max 2000)' };
    }
    patch.description = o.description.trim();
  }

  if ('categories' in o) {
    if (!Array.isArray(o.categories)) {
      return { error: 'categories must be a string array' };
    }
    const tags: string[] = [];
    for (const raw of o.categories) {
      if (typeof raw !== 'string') {
        return { error: 'each category must be a string' };
      }
      const trimmed = raw.trim();
      if (trimmed) tags.push(trimmed);
    }
    patch.categories = tags;
  }

  if ('votingMode' in o) {
    if (
      typeof o.votingMode !== 'string' ||
      !VOTING_MODES.includes(o.votingMode as schema.VotingMode)
    ) {
      return {
        error: `votingMode must be one of: ${VOTING_MODES.join(', ')}`,
      };
    }
    patch.votingMode = o.votingMode as schema.VotingMode;
  }

  if ('emailPromptMessage' in o) {
    if (o.emailPromptMessage === null) {
      patch.emailPromptMessage = null;
    } else if (typeof o.emailPromptMessage === 'string') {
      const trimmed = o.emailPromptMessage.trim();
      if (trimmed.length > 500) {
        return { error: 'emailPromptMessage is too long (max 500)' };
      }
      patch.emailPromptMessage = trimmed || null;
    } else {
      return { error: 'emailPromptMessage must be a string or null' };
    }
  }

  return { patch };
}

function extractId(url: URL): string | null {
  // /api/campaigns/:id → parts[0]='api', parts[1]='campaigns', parts[2]=id
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'api' && parts[1] === 'campaigns' && parts.length === 3) {
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
