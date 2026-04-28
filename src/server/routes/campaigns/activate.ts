import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { withOperator } from '../../auth/middleware.js';
import { invalidateAnalyticsSnapshot } from '../../models/library.js';
import { listSelectableRegistryModels } from '../../models/registry.js';

/**
 * POST /api/campaigns/:id/activate
 *
 * Transitions a draft campaign to active. Validates:
 *   - status === 'draft'
 *   - >= 4 campaign_models (tournament minimum)
 *   - every (prompt × campaign_model) has a successful generation
 *     (output IS NOT NULL)
 *
 * Refuses activation if any slot is missing or errored. The operator's
 * recourse is to re-run /generate (which UPSERTs, so retries overwrite).
 */
export const activateCampaignWebHandler = withOperator(async (request: Request) => {
  if (request.method !== 'POST') {
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
  if (campaign.status !== 'draft') {
    return json(
      { error: `cannot activate: status is ${campaign.status}` },
      409,
    );
  }

  const [prompts, models] = await Promise.all([
    db.select().from(schema.prompts).where(eq(schema.prompts.campaignId, id)),
    db
      .select()
      .from(schema.campaignModels)
      .where(eq(schema.campaignModels.campaignId, id)),
  ]);

  // Plan 04 — per-kind contestant minimum at activate time. The
  // create-payload parser already enforces these (model ≥4, prompt /
  // system_prompt ≥2); the same gate lives here in case prompts /
  // models were edited between create and activate, or if the campaign
  // was created before its kind's minimums were enforced.
  const minContestants = campaign.kind === 'model' ? 4 : 2;
  if (models.length < minContestants) {
    return json(
      {
        error: `need at least ${minContestants} contestants for ${campaign.kind} kind; have ${models.length}`,
      },
      400,
    );
  }
  if (prompts.length === 0 && campaign.kind !== 'prompt') {
    // PRD: prompt arenas with 0 inputs are valid (variants are
    // standalone). For other kinds the test-case suite is required.
    return json({ error: 'no prompts' }, 400);
  }

  // Count successful generations across the full matrix.
  const promptIds = prompts.map((p) => p.id);
  const expected = prompts.length * models.length;
  const okGenerations = await db
    .select({ id: schema.generations.id })
    .from(schema.generations)
    .where(
      and(
        isNotNull(schema.generations.output),
        inArray(schema.generations.promptId, promptIds),
      ),
    );

  if (okGenerations.length < expected) {
    return json(
      {
        error: `not all generations succeeded: ${okGenerations.length}/${expected} ready`,
        expected,
        ready: okGenerations.length,
      },
      409,
    );
  }

  // Plan 04 — capture the pinned-model snapshot at launch for
  // non-model kinds. Idempotent: if the campaign already has a
  // snapshot (re-activate after editing in some future flow), we
  // preserve it. Snapshot is non-negotiable for audit — registry
  // edits down the line must not retroactively rewrite history.
  let pinnedModelSnapshot: schema.PinnedModelSnapshot | null = null;
  if (campaign.kind !== 'model' && !campaign.pinnedModelSnapshot) {
    if (!campaign.pinnedProviderModelId) {
      // CHECK constraint guarantees this is non-null for non-model
      // kinds; defensive check for completeness.
      return json(
        { error: 'campaign is missing pinnedProviderModelId' },
        500,
      );
    }
    const registry = await listSelectableRegistryModels(db);
    const entry = registry.find(
      (r) => r.providerModelId === campaign.pinnedProviderModelId,
    );
    if (!entry) {
      return json(
        {
          error: `pinned model is no longer selectable: ${campaign.pinnedProviderModelId}`,
        },
        409,
      );
    }
    pinnedModelSnapshot = {
      providerModelId: entry.providerModelId,
      displayName: entry.displayName,
      params: {},
      snapshotAt: new Date().toISOString(),
    };
  }

  // Flip to active. Set the snapshot in the same UPDATE when applicable.
  await db
    .update(schema.campaigns)
    .set({
      status: 'active',
      updatedAt: new Date(),
      ...(pinnedModelSnapshot ? { pinnedModelSnapshot } : {}),
    })
    .where(eq(schema.campaigns.id, id));

  invalidateAnalyticsSnapshot();
  return json({ ok: true, status: 'active' }, 200);
});

function extractId(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  if (
    parts[0] === 'api' &&
    parts[1] === 'campaigns' &&
    parts[3] === 'activate'
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
