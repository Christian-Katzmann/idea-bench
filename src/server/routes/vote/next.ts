import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { withParticipant } from '../../auth/middleware.js';
import {
  nextBattle,
  sampleSeed,
  type BracketSeed,
  type TournamentVote,
} from '../../tournament.js';

/**
 * GET /api/vote/:slug/next
 *
 * Returns the next step for the current participant, shaped by the
 * active prompt's evaluation mode. Phase 1 supports three shapes:
 *
 *   - tournament_battle  (legacy; b1..b5 bracket battles)
 *   - slider             (rate one model's output at a time, 1..N scale)
 *   - approve_reject     (thumbs up/down one model's output at a time)
 *
 * Terminal state is `{ done: true, stepType: 'done' }` once every prompt
 * has been fully answered for this participant.
 *
 * Iteration rule: prompts walk in `orderIndex` order; the handler for
 * the first unfinished prompt emits the next step. Slider/approve-reject
 * prompts require 4 ratings (one per campaign model) before they're
 * considered done.
 */
export const voteNextWebHandler = withParticipant(async (request, ctx) => {
  if (request.method !== 'GET') {
    return new Response('method not allowed', { status: 405 });
  }

  const slug = extractSlug(new URL(request.url));
  if (!slug) return json({ error: 'missing slug' }, 400);

  const db = getDb();
  const [campaign] = await db
    .select()
    .from(schema.campaigns)
    .where(eq(schema.campaigns.shareSlug, slug))
    .limit(1);
  if (!campaign) return json({ error: 'campaign not found' }, 404);
  if (campaign.status !== 'active') {
    return json(
      {
        error: `campaign is ${campaign.status}, not accepting votes`,
      },
      410,
    );
  }

  const [participant] = await db
    .select()
    .from(schema.participants)
    .where(
      and(
        eq(schema.participants.cookieId, ctx.participantCookieId),
        eq(schema.participants.campaignId, campaign.id),
      ),
    )
    .limit(1);
  if (!participant) {
    return json(
      { error: 'participant not started — POST /api/vote/:slug first' },
      409,
    );
  }

  const [prompts, campaignModels] = await Promise.all([
    db
      .select()
      .from(schema.prompts)
      .where(eq(schema.prompts.campaignId, campaign.id))
      .orderBy(asc(schema.prompts.orderIndex)),
    db
      .select()
      .from(schema.campaignModels)
      .where(eq(schema.campaignModels.campaignId, campaign.id))
      .orderBy(asc(schema.campaignModels.createdAt)),
  ]);

  // Tournament mode requires 4 models; slider/approve_reject could
  // theoretically work with 1, but the existing campaign-activation rule
  // already enforces 4 at create time. Keep the guard so mixed-mode
  // campaigns without enough models fail clearly instead of hanging.
  if (campaignModels.length < 4) {
    return json(
      { error: 'campaign has <4 models; cannot run evaluations' },
      409,
    );
  }

  const allModelIds = campaignModels.map((m) => m.id);
  const promptsTotal = prompts.length;

  // Walk prompts in order; the first unfinished one determines the next
  // step. The per-mode handlers return either a step payload (the API
  // response) or null (prompt is finished, try the next one).
  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    const promptsDone = i; // every prompt before this is complete

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const progress = { promptsTotal, promptsDone };

    if (prompt.mode === 'tournament') {
      const result = await tournamentStep(
        db,
        prompt,
        participant.id,
        allModelIds,
        promptsTotal,
        promptsDone,
      );
      if (result === 'error') {
        return json(
          {
            error:
              'some selected models don\u2019t have outputs for this prompt (campaign had generation failures)',
          },
          500,
        );
      }
      if (result !== null) return json(result, 200);
      continue;
    }

    if (prompt.mode === 'slider') {
      const result = await sliderStep(
        db,
        prompt,
        participant.id,
        campaignModels,
        promptsTotal,
        promptsDone,
      );
      if (result === 'error') {
        return json(
          {
            error:
              'some selected models don\u2019t have outputs for this prompt',
          },
          500,
        );
      }
      if (result !== null) return json(result, 200);
      continue;
    }

    if (prompt.mode === 'approve_reject') {
      const result = await approveRejectStep(
        db,
        prompt,
        participant.id,
        campaignModels,
        promptsTotal,
        promptsDone,
      );
      if (result === 'error') {
        return json(
          {
            error:
              'some selected models don\u2019t have outputs for this prompt',
          },
          500,
        );
      }
      if (result !== null) return json(result, 200);
      continue;
    }

    if (prompt.mode === 'best_of_n') {
      const result = await bestOfNStep(
        db,
        prompt,
        participant.id,
        campaignModels,
        promptsTotal,
        promptsDone,
      );
      if (result === 'error') {
        return json(
          {
            error:
              'some selected models don\u2019t have outputs for this prompt',
          },
          500,
        );
      }
      if (result !== null) return json(result, 200);
      continue;
    }

    if (prompt.mode === 'multi_axis') {
      const result = await multiAxisStep(
        db,
        prompt,
        participant.id,
        campaignModels,
        promptsTotal,
        promptsDone,
      );
      if (result === 'error') {
        return json(
          {
            error:
              'some selected models don\u2019t have outputs for this prompt',
          },
          500,
        );
      }
      if (result !== null) return json(result, 200);
      continue;
    }

    if (prompt.mode === 'qualitative') {
      const result = await qualitativeStep(
        db,
        prompt,
        participant.id,
        campaignModels,
        promptsTotal,
        promptsDone,
      );
      if (result === 'error') {
        return json(
          {
            error:
              'some selected models don\u2019t have outputs for this prompt',
          },
          500,
        );
      }
      if (result !== null) return json(result, 200);
      continue;
    }

    // Unreachable: every PromptMode enum value is handled above. If we
    // land here the schema has drifted from the dispatcher — fail loud.
    return json(
      { error: `unhandled prompt mode: ${prompt.mode}` },
      500,
    );
  }

  // All prompts complete. `stepType: 'done'` is the terminal sentinel in
  // the `VoteStep` union — clients redirect to results when they see it.
  return json({ done: true, stepType: 'done' as const }, 200);
});

// ─────────────────────────────────────────────────────────────────────────
// Mode-specific step builders. Each one either returns a step payload
// ready to JSON-encode, `null` (prompt is finished — caller moves on),
// or the literal string 'error' (data invariant violated).
// ─────────────────────────────────────────────────────────────────────────

type StepPayload = Record<string, unknown>;
type StepResult = StepPayload | null | 'error';

async function tournamentStep(
  db: ReturnType<typeof getDb>,
  prompt: schema.Prompt,
  participantId: string,
  allModelIds: string[],
  promptsTotal: number,
  promptsDone: number,
): Promise<StepResult> {
  // Find or create the tournament for this (participant, prompt).
  let [tournament] = await db
    .select()
    .from(schema.tournaments)
    .where(
      and(
        eq(schema.tournaments.participantId, participantId),
        eq(schema.tournaments.promptId, prompt.id),
      ),
    )
    .limit(1);

  if (!tournament) {
    const seed = sampleSeed(allModelIds);
    const [created] = await db
      .insert(schema.tournaments)
      .values({
        participantId,
        promptId: prompt.id,
        seedModelIds: [...seed],
        status: 'in_progress',
      })
      .returning();
    tournament = created;
  }

  const seedIds = tournament.seedModelIds as string[];
  const [gens, votes] = await Promise.all([
    db
      .select()
      .from(schema.generations)
      .where(
        and(
          eq(schema.generations.promptId, prompt.id),
          inArray(schema.generations.campaignModelId, seedIds),
        ),
      ),
    db
      .select()
      .from(schema.votes)
      .where(eq(schema.votes.tournamentId, tournament.id)),
  ]);

  const generationByModel: Record<string, string> = {};
  for (const g of gens) {
    if (g.output) generationByModel[g.campaignModelId] = g.id;
  }
  if (seedIds.some((id) => !generationByModel[id])) return 'error';

  const tvotes: TournamentVote[] = votes.map((v) => ({
    bracketPosition: v.bracketPosition,
    generationAId: v.generationAId,
    generationBId: v.generationBId,
    winner: v.winner,
    advancedGenerationId: v.advancedGenerationId,
  }));

  const battle = nextBattle(
    seedIds as unknown as BracketSeed,
    generationByModel,
    tvotes,
  );
  if (!battle) {
    // Tournament complete; mark it and let caller advance.
    if (tournament.status !== 'complete') {
      await db
        .update(schema.tournaments)
        .set({ status: 'complete', completedAt: new Date() })
        .where(eq(schema.tournaments.id, tournament.id));
    }
    return null;
  }

  const [genA, genB] = await Promise.all([
    db
      .select()
      .from(schema.generations)
      .where(eq(schema.generations.id, battle.generationAId))
      .limit(1),
    db
      .select()
      .from(schema.generations)
      .where(eq(schema.generations.id, battle.generationBId))
      .limit(1),
  ]);
  const gA = genA[0];
  const gB = genB[0];
  if (!gA || !gB) return 'error';

  return {
    done: false,
    stepType: 'tournament_battle' as const,
    tournament: {
      id: tournament.id,
      promptId: prompt.id,
    },
    prompt: {
      id: prompt.id,
      text: prompt.text,
      context: prompt.context,
      structured: prompt.structured ?? null,
      categoryTags: prompt.categoryTags,
      mode: prompt.mode,
    },
    battle: {
      position: battle.position,
      label: battle.label,
      reason: battle.reason,
    },
    generationA: {
      id: gA.id,
      output: gA.output,
      tokensOut: gA.tokensOut,
    },
    generationB: {
      id: gB.id,
      output: gB.output,
      tokensOut: gB.tokensOut,
    },
    progress: {
      tournamentsTotal: promptsTotal,
      tournamentsDone: promptsDone,
      promptsTotal,
      promptsDone,
    },
  };
}

async function sliderStep(
  db: ReturnType<typeof getDb>,
  prompt: schema.Prompt,
  participantId: string,
  campaignModels: schema.CampaignModel[],
  promptsTotal: number,
  promptsDone: number,
): Promise<StepResult> {
  return perModelRatingStep({
    db,
    prompt,
    participantId,
    campaignModels,
    promptsTotal,
    promptsDone,
    responseTable: schema.sliderResponses,
    responseModelColumn: schema.sliderResponses.campaignModelId,
    stepType: 'slider',
  });
}

async function approveRejectStep(
  db: ReturnType<typeof getDb>,
  prompt: schema.Prompt,
  participantId: string,
  campaignModels: schema.CampaignModel[],
  promptsTotal: number,
  promptsDone: number,
): Promise<StepResult> {
  return perModelRatingStep({
    db,
    prompt,
    participantId,
    campaignModels,
    promptsTotal,
    promptsDone,
    responseTable: schema.approveRejectResponses,
    responseModelColumn: schema.approveRejectResponses.campaignModelId,
    stepType: 'approve_reject',
  });
}

async function multiAxisStep(
  db: ReturnType<typeof getDb>,
  prompt: schema.Prompt,
  participantId: string,
  campaignModels: schema.CampaignModel[],
  promptsTotal: number,
  promptsDone: number,
): Promise<StepResult> {
  return perModelRatingStep({
    db,
    prompt,
    participantId,
    campaignModels,
    promptsTotal,
    promptsDone,
    responseTable: schema.multiAxisResponses,
    responseModelColumn: schema.multiAxisResponses.campaignModelId,
    stepType: 'multi_axis',
  });
}

async function qualitativeStep(
  db: ReturnType<typeof getDb>,
  prompt: schema.Prompt,
  participantId: string,
  campaignModels: schema.CampaignModel[],
  promptsTotal: number,
  promptsDone: number,
): Promise<StepResult> {
  return perModelRatingStep({
    db,
    prompt,
    participantId,
    campaignModels,
    promptsTotal,
    promptsDone,
    responseTable: schema.qualitativeResponses,
    responseModelColumn: schema.qualitativeResponses.campaignModelId,
    stepType: 'qualitative',
  });
}

/**
 * Best-of-N step: a single step per prompt that shows every campaign
 * model's output at once. The voter picks one winner → one response
 * row in best_of_n_responses. Different shape from the per-model modes
 * above (no withinPrompt sub-progress, no target model).
 *
 * Returns `null` if this participant has already chosen a winner for
 * this prompt, 'error' if any generation is missing, or a step payload
 * otherwise.
 */
async function bestOfNStep(
  db: ReturnType<typeof getDb>,
  prompt: schema.Prompt,
  participantId: string,
  campaignModels: schema.CampaignModel[],
  promptsTotal: number,
  promptsDone: number,
): Promise<StepResult> {
  const [existing] = await db
    .select({ id: schema.bestOfNResponses.id })
    .from(schema.bestOfNResponses)
    .where(
      and(
        eq(schema.bestOfNResponses.participantId, participantId),
        eq(schema.bestOfNResponses.promptId, prompt.id),
      ),
    )
    .limit(1);
  if (existing) return null; // prompt done — one choice per (participant, prompt)

  // Load generations for every campaign model on this prompt. Unlike
  // tournament mode, best_of_n doesn't sample a 4-model seed — it shows
  // every model the operator configured (matches the "see all and pick
  // the best" mental model).
  const modelIds = campaignModels.map((m) => m.id);
  const gens = await db
    .select()
    .from(schema.generations)
    .where(
      and(
        eq(schema.generations.promptId, prompt.id),
        inArray(schema.generations.campaignModelId, modelIds),
      ),
    );

  const generationByModel: Record<string, schema.Generation> = {};
  for (const g of gens) {
    if (g.output) generationByModel[g.campaignModelId] = g;
  }
  // Missing any generation is unrecoverable for this participant —
  // selecting an output that never existed is nonsensical.
  const missing = modelIds.filter((id) => !generationByModel[id]);
  if (missing.length > 0) return 'error';

  const targets = campaignModels.map((m) => {
    const gen = generationByModel[m.id];
    return {
      campaignModelId: m.id,
      generation: {
        id: gen.id,
        output: gen.output,
        tokensOut: gen.tokensOut,
      },
    };
  });

  return {
    done: false,
    stepType: 'best_of_n',
    prompt: {
      id: prompt.id,
      text: prompt.text,
      context: prompt.context,
      structured: prompt.structured ?? null,
      categoryTags: prompt.categoryTags,
      mode: prompt.mode,
    },
    modeConfig: prompt.modeConfig ?? null,
    targets,
    progress: {
      promptsTotal,
      promptsDone,
    },
  };
}

/**
 * Shared logic for modes that rate each of N models independently (slider,
 * approve/reject). Finds the next model that hasn't been rated yet by
 * this participant for this prompt; returns null if all models are done.
 *
 * Model ordering: stable across visits, driven by campaign_models.created_at
 * (ascending). Future work: per-participant shuffle for fairness — but
 * that requires a seed column somewhere. Phase 1 accepts deterministic
 * order; the aggregate means/pass-rates are insensitive to rating order.
 */
async function perModelRatingStep(args: {
  db: ReturnType<typeof getDb>;
  prompt: schema.Prompt;
  participantId: string;
  campaignModels: schema.CampaignModel[];
  promptsTotal: number;
  promptsDone: number;
  responseTable:
    | typeof schema.sliderResponses
    | typeof schema.approveRejectResponses
    | typeof schema.multiAxisResponses
    | typeof schema.qualitativeResponses;
  responseModelColumn:
    | typeof schema.sliderResponses.campaignModelId
    | typeof schema.approveRejectResponses.campaignModelId
    | typeof schema.multiAxisResponses.campaignModelId
    | typeof schema.qualitativeResponses.campaignModelId;
  stepType: 'slider' | 'approve_reject' | 'multi_axis' | 'qualitative';
}): Promise<StepResult> {
  const {
    db,
    prompt,
    participantId,
    campaignModels,
    promptsTotal,
    promptsDone,
    responseTable,
    responseModelColumn,
    stepType,
  } = args;

  // Already-rated models for this (participant, prompt).
  const rated = await db
    .select({ campaignModelId: responseModelColumn })
    .from(responseTable)
    .where(
      and(
        eq(responseTable.participantId, participantId),
        eq(responseTable.promptId, prompt.id),
      ),
    );
  const ratedSet = new Set(rated.map((r) => r.campaignModelId));
  const totalModels = campaignModels.length;
  const ratedCount = ratedSet.size;

  if (ratedCount >= totalModels) return null; // prompt done

  const nextModel = campaignModels.find((m) => !ratedSet.has(m.id));
  if (!nextModel) return null; // shouldn't happen given the count check

  // Load the generation for this (prompt, next model).
  const [gen] = await db
    .select()
    .from(schema.generations)
    .where(
      and(
        eq(schema.generations.promptId, prompt.id),
        eq(schema.generations.campaignModelId, nextModel.id),
      ),
    )
    .limit(1);
  if (!gen || !gen.output) return 'error';

  return {
    done: false,
    stepType,
    prompt: {
      id: prompt.id,
      text: prompt.text,
      context: prompt.context,
      structured: prompt.structured ?? null,
      categoryTags: prompt.categoryTags,
      mode: prompt.mode,
    },
    modeConfig: prompt.modeConfig ?? null,
    target: {
      // The generation identity is what submission uses — the client
      // POSTs the generationId it was asked to rate so the server can
      // verify the participant is rating what we served them.
      campaignModelId: nextModel.id,
      generation: {
        id: gen.id,
        output: gen.output,
        tokensOut: gen.tokensOut,
      },
    },
    progress: {
      promptsTotal,
      promptsDone,
      // withinPrompt exposes the per-model rating sub-progress so the
      // client can render "Rating 2 of 4 for this prompt".
      withinPrompt: {
        total: totalModels,
        done: ratedCount,
      },
    },
  };
}

function extractSlug(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'api' && parts[1] === 'vote' && parts[3] === 'next') {
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
