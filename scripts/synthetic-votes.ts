/**
 * Generates synthetic participants + tournaments + votes for a given
 * campaign so ratings have enough data to look alive in the dashboard.
 *
 * Synthetic rows are identifiable by email pattern:
 *   synthetic-demo+<tag>-<i>@idea-bench.local
 *
 * The script assigns each campaign_model a "true strength" from a
 * config (defaults below). Each synthetic vote is sampled to favor
 * the stronger model in the pair. Ties are rare. The B-T solver
 * should then recover something close to the configured ordering.
 *
 * Usage:
 *   tsx scripts/synthetic-votes.ts <campaign_id_or_slug> [participants]
 *
 * Examples:
 *   tsx scripts/synthetic-votes.ts my-slug 100      # ~100 participants
 *   tsx scripts/synthetic-votes.ts <uuid> 10        # directional tier
 *
 * Run `recomputeCampaignRatings` after this script (or hit the
 * dashboard Recompute button) to populate the ratings table.
 */
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });
loadDotenv({ path: '.env' });

import { and, asc, eq, inArray } from 'drizzle-orm';
import { createDbClient } from '../src/server/db/client';
import * as schema from '../src/server/db/schema';

/** Assigned "true" strength per OpenRouter id. Higher = stronger. */
const TRUE_STRENGTHS: Record<string, number> = {
  'anthropic/claude-opus-4-6': 1.60,
  'anthropic/claude-sonnet-4-6': 1.30,
  'anthropic/claude-haiku-4-5': 1.10,
  'openai/gpt-5': 1.45,
  'openai/gpt-5-mini': 0.95,
  'google/gemini-2.5-pro': 1.15,
  'google/gemini-2.5-flash': 0.85,
  'meta-llama/llama-4': 0.75,
  'deepseek/deepseek-v3.2': 0.70,
};
const DEFAULT_STRENGTH = 1.0;

async function main() {
  const [campaignArg, participantsArg] = process.argv.slice(2);
  if (!campaignArg) {
    console.error('Usage: tsx scripts/synthetic-votes.ts <campaign_id_or_slug> [participants=60]');
    process.exit(1);
  }
  const targetParticipants = Number(participantsArg ?? 60);
  if (!Number.isFinite(targetParticipants) || targetParticipants < 1) {
    console.error('participants must be a positive integer');
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }
  const { db, client } = createDbClient(url);
  try {

  // Resolve campaign by UUID or share slug.
  const campaign = (
    await db
      .select()
      .from(schema.campaigns)
      .where(
        campaignArg.length === 16 && !campaignArg.includes('-')
          ? eq(schema.campaigns.shareSlug, campaignArg)
          : eq(schema.campaigns.id, campaignArg),
      )
      .limit(1)
  )[0];
  if (!campaign) {
    console.error(`no campaign matching: ${campaignArg}`);
    process.exit(1);
  }
  if (campaign.status !== 'active') {
    console.error(`campaign is ${campaign.status}; activate it first`);
    process.exit(1);
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
      .where(eq(schema.campaignModels.campaignId, campaign.id)),
  ]);

  if (prompts.length === 0 || campaignModels.length < 4) {
    console.error('campaign needs >=1 prompt and >=4 models');
    process.exit(1);
  }

  // Load every generation for this campaign's prompts, keyed by
  // (promptId, campaignModelId). We need an output to exist for each
  // model we'll seed into a bracket.
  const generations = await db
    .select()
    .from(schema.generations)
    .where(
      inArray(
        schema.generations.promptId,
        prompts.map((p) => p.id),
      ),
    );
  const genByKey = new Map<string, schema.Generation>();
  for (const g of generations) {
    if (g.output != null)
      genByKey.set(`${g.promptId}:${g.campaignModelId}`, g);
  }

  // Only keep models that have a successful generation on ALL prompts.
  const eligibleModels = campaignModels.filter((m) =>
    prompts.every((p) => genByKey.has(`${p.id}:${m.id}`)),
  );
  if (eligibleModels.length < 4) {
    console.error(
      `only ${eligibleModels.length} models have outputs on every prompt; need >=4`,
    );
    process.exit(1);
  }

  console.log(
    `Campaign: ${campaign.name} (${campaign.id})\n` +
      `  prompts: ${prompts.length}\n` +
      `  eligible models: ${eligibleModels.length}\n` +
      `  target participants: ${targetParticipants}`,
  );

  const strengths = new Map<string, number>();
  for (const m of eligibleModels) {
    strengths.set(
      m.id,
      TRUE_STRENGTHS[m.providerModelId] ?? DEFAULT_STRENGTH,
    );
  }
  console.log('\n  configured true strengths:');
  for (const m of eligibleModels) {
    console.log(
      `    ${m.displayName.padEnd(22)} → ${strengths.get(m.id)!.toFixed(2)}`,
    );
  }

  const emailTag = `synthetic-${campaign.shareSlug}`;
  let participantsInserted = 0;
  let tournamentsInserted = 0;
  let votesInserted = 0;

  for (let i = 0; i < targetParticipants; i++) {
    const cookieId = crypto.randomUUID();
    const [participant] = await db
      .insert(schema.participants)
      .values({
        cookieId,
        campaignId: campaign.id,
        email: `synthetic-demo+${emailTag}-${i}@idea-bench.local`,
      })
      .returning();
    participantsInserted++;

    for (const prompt of prompts) {
      // Sample 4 models for this (participant, prompt).
      const shuffled = [...eligibleModels];
      for (let k = shuffled.length - 1; k > 0; k--) {
        const j = Math.floor(Math.random() * (k + 1));
        [shuffled[k], shuffled[j]] = [shuffled[j], shuffled[k]];
      }
      const seed = shuffled.slice(0, 4);

      const [tournament] = await db
        .insert(schema.tournaments)
        .values({
          participantId: participant.id,
          promptId: prompt.id,
          seedModelIds: seed.map((m) => m.id),
          status: 'in_progress',
        })
        .returning();
      tournamentsInserted++;

      // Play the bracket deterministically-by-outcome.
      const genFor = (m: schema.CampaignModel) =>
        genByKey.get(`${prompt.id}:${m.id}`)!.id;

      const sessionId = crypto.randomUUID();
      const sample = (
        a: schema.CampaignModel,
        b: schema.CampaignModel,
      ): 'A' | 'B' | 'tie' | 'both_bad' => {
        const sa = strengths.get(a.id)!;
        const sb = strengths.get(b.id)!;
        const pA = sa / (sa + sb);
        // 5% chance of a tie/both_bad, split evenly.
        const r = Math.random();
        if (r < 0.025) return 'tie';
        if (r < 0.05) return 'both_bad';
        return Math.random() < pA ? 'A' : 'B';
      };

      // b1: seed[0] vs seed[1]
      const b1 = sample(seed[0], seed[1]);
      const b1Advancer =
        b1 === 'A'
          ? seed[0]
          : b1 === 'B'
            ? seed[1]
            : Math.random() < 0.5
              ? seed[0]
              : seed[1];
      const b1Loser = b1Advancer === seed[0] ? seed[1] : seed[0];

      // b2: seed[2] vs seed[3]
      const b2 = sample(seed[2], seed[3]);
      const b2Advancer =
        b2 === 'A'
          ? seed[2]
          : b2 === 'B'
            ? seed[3]
            : Math.random() < 0.5
              ? seed[2]
              : seed[3];
      const b2Loser = b2Advancer === seed[2] ? seed[3] : seed[2];

      // b3: winners' final
      const b3 = sample(b1Advancer, b2Advancer);
      // b4: losers' bracket
      const b4 = sample(b1Loser, b2Loser);
      // b5: only if b3 was a tie/both_bad
      const needsB5 = b3 === 'tie' || b3 === 'both_bad';
      const b5 = needsB5 ? sample(b1Advancer, b2Advancer) : null;

      const rows: schema.NewVote[] = [
        {
          campaignId: campaign.id,
          tournamentId: tournament.id,
          participantId: participant.id,
          promptId: prompt.id,
          sessionId,
          bracketPosition: 'b1',
          generationAId: genFor(seed[0]),
          generationBId: genFor(seed[1]),
          winner: b1,
          advancedGenerationId: genFor(b1Advancer),
        },
        {
          campaignId: campaign.id,
          tournamentId: tournament.id,
          participantId: participant.id,
          promptId: prompt.id,
          sessionId,
          bracketPosition: 'b2',
          generationAId: genFor(seed[2]),
          generationBId: genFor(seed[3]),
          winner: b2,
          advancedGenerationId: genFor(b2Advancer),
        },
        {
          campaignId: campaign.id,
          tournamentId: tournament.id,
          participantId: participant.id,
          promptId: prompt.id,
          sessionId,
          bracketPosition: 'b3',
          generationAId: genFor(b1Advancer),
          generationBId: genFor(b2Advancer),
          winner: b3,
          advancedGenerationId: null,
        },
        {
          campaignId: campaign.id,
          tournamentId: tournament.id,
          participantId: participant.id,
          promptId: prompt.id,
          sessionId,
          bracketPosition: 'b4',
          generationAId: genFor(b1Loser),
          generationBId: genFor(b2Loser),
          winner: b4,
          advancedGenerationId: null,
        },
      ];
      if (b5 != null) {
        rows.push({
          campaignId: campaign.id,
          tournamentId: tournament.id,
          participantId: participant.id,
          promptId: prompt.id,
          sessionId,
          bracketPosition: 'b5',
          generationAId: genFor(b1Advancer),
          generationBId: genFor(b2Advancer),
          winner: b5,
          advancedGenerationId: null,
        });
      }

      await db.insert(schema.votes).values(rows);
      await db
        .update(schema.tournaments)
        .set({ status: 'complete', completedAt: new Date() })
        .where(eq(schema.tournaments.id, tournament.id));
      votesInserted += rows.length;
    }

    // Mark participant as finished.
    await db
      .update(schema.participants)
      .set({ finishedAt: new Date() })
      .where(eq(schema.participants.id, participant.id));
  }

  console.log(
    `\nInserted:\n` +
      `  participants: ${participantsInserted}\n` +
      `  tournaments:  ${tournamentsInserted}\n` +
      `  votes:        ${votesInserted}\n` +
      `\nNext: POST /api/campaigns/${campaign.id}/recompute ` +
      `(or click Recompute on the dashboard).`,
  );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
