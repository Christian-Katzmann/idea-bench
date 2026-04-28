import { asc, eq, inArray } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { withOperator } from '../../auth/middleware.js';

/**
 * GET /api/campaigns/:id/preview
 *
 * Operator-only read-only snapshot that powers the Participant Preview
 * view switcher. Returns everything the voting UI needs to drive a full
 * tournament client-side — models, prompts, and cached generations —
 * without creating a participant row, tournament row, or vote row.
 *
 * Preview mode:
 *   - Runs entirely client-side using the tournament algorithm ported
 *     to src/lib/tournament.ts.
 *   - Votes cast during preview are never persisted.
 *   - The operator sees what a voter sees, including the campaign's
 *     actual generations — the only fidelity gap is that seed selection
 *     is not randomized against the voter's cookie (it's deterministic
 *     per preview session for reproducibility).
 */
export const previewCampaignWebHandler = withOperator(async (request) => {
  if (request.method !== 'GET') {
    return new Response('method not allowed', { status: 405 });
  }

  const id = extractId(new URL(request.url));
  if (!id) return json({ error: 'missing id' }, 400);

  const db = getDb();

  const [campaign] = await db
    .select()
    .from(schema.campaigns)
    .where(eq(schema.campaigns.id, id))
    .limit(1);
  if (!campaign || campaign.deletedAt)
    return json({ error: 'campaign not found' }, 404);

  const [prompts, campaignModels] = await Promise.all([
    db
      .select()
      .from(schema.prompts)
      .where(eq(schema.prompts.campaignId, id))
      .orderBy(asc(schema.prompts.orderIndex)),
    db
      .select()
      .from(schema.campaignModels)
      .where(eq(schema.campaignModels.campaignId, id)),
  ]);

  // Generations don't carry campaignId — we scope them via promptId
  // instead (prompts are 1:1 with the campaign, so no leakage).
  const promptIds = prompts.map((p) => p.id);
  const generations =
    promptIds.length === 0
      ? []
      : await db
          .select()
          .from(schema.generations)
          .where(inArray(schema.generations.promptId, promptIds));

  // Plan 04 — per-kind shape. The preview consumer renders the same
  // generations regardless of kind (voters see outputs only), but the
  // operator-facing preview UI uses `campaign.kind` and the per-row
  // `kind` / `variantText` to label contestants correctly (e.g.
  // "Variant 1: <body>" instead of a model name) and to surface the
  // pinned generator model alongside the variant axis.
  return json(
    {
      campaign: {
        id: campaign.id,
        shareSlug: campaign.shareSlug,
        name: campaign.name,
        description: campaign.description,
        categories: campaign.categories,
        status: campaign.status,
        kind: campaign.kind,
        pinnedProviderModelId: campaign.pinnedProviderModelId,
        pinnedModelSnapshot: campaign.pinnedModelSnapshot,
        pinnedSystemPrompt: campaign.pinnedSystemPrompt,
      },
      prompts: prompts.map((p) => ({
        id: p.id,
        text: p.text,
        context: p.context,
        categoryTags: p.categoryTags,
        orderIndex: p.orderIndex,
      })),
      models: campaignModels.map((m) => ({
        id: m.id,
        kind: m.kind,
        providerModelId: m.providerModelId,
        displayName: m.displayName,
        variantText: m.variantText,
      })),
      generations: generations
        .filter((g) => g.output != null)
        .map((g) => ({
          id: g.id,
          promptId: g.promptId,
          campaignModelId: g.campaignModelId,
          output: g.output,
          tokensOut: g.tokensOut,
        })),
    },
    200,
  );
});

function extractId(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'api' && parts[1] === 'campaigns' && parts.length === 4) {
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
