import { asc, eq } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { withOperator } from '../../auth/middleware.js';
import { buildCampaignDetail } from '../../campaigns/detail.js';
import { extractQualitativeThemes } from '../../lib/qualitative-themes.js';

/**
 * GET /api/campaigns/:id/qualitative-responses
 *
 * Returns every qualitative response collected for this campaign, along
 * with the prompts + models needed to render them. This powers the
 * Comments tab on the campaign dashboard — a human-readable reader for
 * the free-text feedback voters leave on qualitative-mode prompts.
 *
 * Response shape:
 *   {
 *     campaign: { id, name, shareSlug },
 *     prompts: [{ id, orderIndex, text, mode }, ...],  // ALL prompts
 *     models:  [{ id, displayName, providerModelId }, ...],
 *     responses: [{ id, promptId, campaignModelId, email, text, createdAt }, ...]
 *   }
 *
 * `prompts` includes every prompt (not just qualitative) so the client
 * can cross-reference without a separate fetch. The client filters to
 * qualitative prompts for the reader view.
 *
 * Emails are exposed to the operator only — this is the same trust
 * level as the participants export.
 */
export const qualitativeResponsesWebHandler = withOperator(
  async (request: Request) => {
    if (request.method !== 'GET') {
      return new Response('method not allowed', { status: 405 });
    }

    const id = extractId(new URL(request.url));
    if (!id) return json({ error: 'missing id' }, 400);

    const db = getDb();
    const detail = await buildCampaignDetail(db, id);
    if (!detail) return json({ error: 'campaign not found' }, 404);

    // Left-join participants to pull emails. Responses from anonymous
    // voters have an email of null.
    const rows = await db
      .select({
        id: schema.qualitativeResponses.id,
        promptId: schema.qualitativeResponses.promptId,
        campaignModelId: schema.qualitativeResponses.campaignModelId,
        email: schema.participants.email,
        text: schema.qualitativeResponses.text,
        createdAt: schema.qualitativeResponses.createdAt,
      })
      .from(schema.qualitativeResponses)
      .leftJoin(
        schema.participants,
        eq(schema.participants.id, schema.qualitativeResponses.participantId),
      )
      .where(eq(schema.qualitativeResponses.campaignId, id))
      .orderBy(asc(schema.qualitativeResponses.createdAt));

    // Recurring-theme extraction over the free-text corpus. Heuristic
    // (n-gram frequency + stopword filtering) — not an LLM call. Returns
    // an empty array when there aren't enough responses to be reliable.
    const themes = extractQualitativeThemes(rows.map((r) => ({ text: r.text })));

    return json(
      {
        campaign: {
          id: detail.campaign.id,
          name: detail.campaign.name,
          shareSlug: detail.campaign.shareSlug,
        },
        prompts: detail.prompts.map((p) => ({
          id: p.id,
          orderIndex: p.orderIndex,
          text: p.text,
          mode: p.mode,
        })),
        models: detail.models,
        responses: rows.map((r) => ({
          id: r.id,
          promptId: r.promptId,
          campaignModelId: r.campaignModelId,
          email: r.email,
          text: r.text,
          createdAt: r.createdAt.toISOString(),
        })),
        themes,
      },
      200,
    );
  },
);

function extractId(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  if (
    parts[0] === 'api' &&
    parts[1] === 'campaigns' &&
    parts[3] === 'qualitative-responses'
  ) {
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
