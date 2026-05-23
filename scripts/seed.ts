/**
 * Seeds the DB with demo campaigns so the dashboard and landing pages
 * have realistic content to render during local dev.
 *
 * What's seeded:
 *   - 3 campaigns (active / completed / draft)
 *   - Prompts + campaign_models + generations for the active one
 *   - Pre-computed ratings on the active one, so the leaderboard shows
 *     numbers out of the box
 *
 * What's NOT seeded:
 *   - Participants, tournaments, votes. These are created organically
 *     when a real voter walks through /vote/:slug, and fabricating
 *     bracket-shaped vote logs just to populate the dashboard is more
 *     trouble than it's worth. The pre-computed ratings exist so the
 *     dashboard demo looks plausible without them.
 *
 * Destructive: truncates every app table before seeding. Refuses to
 * run against `NODE_ENV=production` unless `ALLOW_PROD_SEED=1`.
 *
 * Usage: `npm run db:seed`
 *
 * Personal/Danish demo data lives in `scripts/seed.personal.ts` (gitignored).
 */
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });
loadDotenv({ path: '.env' });
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { sql } from 'drizzle-orm';
import * as schema from '../src/server/db/schema';
import { generateShareSlug } from '../src/lib/ids';
import { AVAILABLE_MODELS } from '../src/lib/models';

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

  const db = drizzle(neon(url), { schema });

  console.log('Truncating tables...');
  // TRUNCATE ... CASCADE handles FKs regardless of order.
  await db.execute(sql`
    TRUNCATE TABLE
      ${schema.modelRegistry},
      ${schema.ratings},
      ${schema.votes},
      ${schema.tournaments},
      ${schema.participants},
      ${schema.generations},
      ${schema.campaignModels},
      ${schema.prompts},
      ${schema.campaigns}
    RESTART IDENTITY CASCADE
  `);

  console.log('Syncing model registry seed...');
  await db.insert(schema.modelRegistry).values(
    AVAILABLE_MODELS.map((model) => ({
      providerModelId: model.providerModelId,
      displayName: model.displayName,
      legacy: 'legacy' in model && !!model.legacy,
    })),
  );

  console.log('Inserting campaigns...');
  const [email, codeReview, meeting] = await db
    .insert(schema.campaigns)
    .values([
      {
        shareSlug: generateShareSlug(),
        name: 'Email writing',
        description:
          'Which model writes the clearest, most professional emails for everyday business situations?',
        categories: ['creative writing', 'communication'],
        status: 'active',
      },
      {
        shareSlug: generateShareSlug(),
        name: 'Code review quality',
        description:
          'Which model provides the most actionable and accurate code reviews?',
        categories: ['code', 'reasoning'],
        status: 'completed',
        closedAt: new Date(Date.now() - 1 * 24 * 3600 * 1000),
      },
      {
        shareSlug: generateShareSlug(),
        name: 'Meeting summary extraction',
        description:
          'Extracting action items and key decisions from messy meeting transcripts.',
        categories: ['summarization', 'data extraction'],
        status: 'draft',
      },
    ])
    .returning();

  console.log('Inserting prompts...');
  const [prompt1, prompt2] = await db
    .insert(schema.prompts)
    .values([
      {
        campaignId: email.id,
        orderIndex: 0,
        text: 'Write a polite email declining a meeting invitation because you have a scheduling conflict, while suggesting two alternative times next week.',
        categoryTags: ['creative writing'],
      },
      {
        campaignId: email.id,
        orderIndex: 1,
        text: 'Draft an email to a customer apologizing for a shipping delay, explaining what happened in one sentence, and offering a 15% discount on their next order.',
        context:
          'The order was delayed three days because of a warehouse system outage. The customer ordered three items totalling $84. They have not asked for a refund yet, but you want to get ahead of it.',
        categoryTags: ['communication'],
      },
    ])
    .returning();

  console.log('Inserting campaign models (4 — minimum for a tournament)...');
  const [opus, sonnet, gpt5, gemini] = await db
    .insert(schema.campaignModels)
    .values([
      {
        campaignId: email.id,
        providerModelId: 'anthropic/claude-opus-4-6',
        displayName: 'Claude Opus 4.6',
      },
      {
        campaignId: email.id,
        providerModelId: 'anthropic/claude-sonnet-4-6',
        displayName: 'Claude Sonnet 4.6',
      },
      {
        campaignId: email.id,
        providerModelId: 'openai/gpt-5',
        displayName: 'GPT-5',
      },
      {
        campaignId: email.id,
        providerModelId: 'google/gemini-2.5-pro',
        displayName: 'Gemini 2.5 Pro',
      },
    ])
    .returning();

  console.log('Inserting generations...');
  const now = new Date();
  await db.insert(schema.generations).values([
    // prompt 1 — declining a meeting
    {
      promptId: prompt1.id,
      campaignModelId: opus.id,
      output:
        "Hi Sam,\n\nThank you for the invite — I'd love to join, but I have a hard conflict at that time. Would either Tuesday at 10am or Thursday at 2pm next week work for you? Happy to send a calendar hold once you confirm.\n\nBest,\nAlex",
      tokensIn: 95,
      tokensOut: 68,
      latencyMs: 1180,
      completedAt: now,
    },
    {
      promptId: prompt1.id,
      campaignModelId: sonnet.id,
      output:
        "Hi Sam,\n\nI can't make the meeting on Friday — I'm already booked at that time. Could we move it to Tuesday at 10am or Thursday at 2pm next week instead? Either works on my end.\n\nThanks,\nAlex",
      tokensIn: 95,
      tokensOut: 58,
      latencyMs: 880,
      completedAt: now,
    },
    {
      promptId: prompt1.id,
      campaignModelId: gpt5.id,
      output:
        "Hi Sam,\n\nUnfortunately I have a conflict at the proposed time and won't be able to attend. Two alternatives that work for me next week: Tuesday 10am or Thursday 2pm. Let me know which you prefer.\n\nThanks,\nAlex",
      tokensIn: 95,
      tokensOut: 62,
      latencyMs: 820,
      completedAt: now,
    },
    {
      promptId: prompt1.id,
      campaignModelId: gemini.id,
      output:
        "Hi Sam,\n\nThanks for including me. I have to bow out of that slot due to another commitment, but I'd like to find a time that works. Could you do Tuesday morning at 10 or Thursday afternoon at 2 next week?\n\nBest,\nAlex",
      tokensIn: 95,
      tokensOut: 70,
      latencyMs: 960,
      completedAt: now,
    },
    // prompt 2 — shipping-delay apology
    {
      promptId: prompt2.id,
      campaignModelId: opus.id,
      output:
        "Hi Jordan,\n\nI wanted to reach out personally about your recent order — it shipped three days late because of a warehouse system outage on our end, and that's on us. To make it right, please use code THANKS15 for 15% off your next order. Your package is now on the way and you should have it within two business days.\n\nThanks for your patience,\nMaria",
      tokensIn: 155,
      tokensOut: 88,
      latencyMs: 1240,
      completedAt: now,
    },
    {
      promptId: prompt2.id,
      campaignModelId: sonnet.id,
      output:
        "Hi Jordan,\n\nQuick note to apologize for the three-day delay on your order — a warehouse system outage put us behind, and that's on us. As a thank-you for your patience, here's 15% off your next order with code THANKS15.\n\nBest,\nMaria",
      tokensIn: 155,
      tokensOut: 65,
      latencyMs: 920,
      completedAt: now,
    },
    {
      promptId: prompt2.id,
      campaignModelId: gpt5.id,
      output:
        "Hi Jordan,\n\nApologies for the delayed shipment — a warehouse system outage pushed your order back three days. To make up for it, please use THANKS15 at checkout next time for 15% off.\n\nThanks,\nMaria",
      tokensIn: 155,
      tokensOut: 55,
      latencyMs: 780,
      completedAt: now,
    },
    {
      promptId: prompt2.id,
      campaignModelId: gemini.id,
      output:
        "Hi Jordan,\n\nI'm sorry your order arrived late — a warehouse system outage delayed it by three days, and we should have given you a heads-up sooner. As a small thank-you for sticking with us, here's 15% off your next order: code THANKS15.\n\nWe appreciate you,\nMaria",
      tokensIn: 155,
      tokensOut: 80,
      latencyMs: 1080,
      completedAt: now,
    },
  ]);

  console.log('Inserting placeholder ratings (illustrative; Phase 4 replaces)...');
  // These are not real B-T output — just plausible numbers so the
  // dashboard renders with content. Phase 4 computes the real thing from
  // the vote log.
  await db.insert(schema.ratings).values([
    {
      campaignId: email.id,
      campaignModelId: opus.id,
      category: 'overall',
      rating: 1247,
      ciLow: 1209,
      ciHigh: 1285,
      gameCount: 45,
    },
    {
      campaignId: email.id,
      campaignModelId: sonnet.id,
      category: 'overall',
      rating: 1195,
      ciLow: 1155,
      ciHigh: 1235,
      gameCount: 43,
    },
    {
      campaignId: email.id,
      campaignModelId: gemini.id,
      category: 'overall',
      rating: 1180,
      ciLow: 1140,
      ciHigh: 1220,
      gameCount: 42,
    },
    {
      campaignId: email.id,
      campaignModelId: gpt5.id,
      category: 'overall',
      rating: 1050,
      ciLow: 980,
      ciHigh: 1120,
      gameCount: 40,
    },
  ]);

  console.log(`\nSeeded 3 campaigns:`);
  console.log(`  Active:    /vote/${email.shareSlug}`);
  console.log(`  Completed: /vote/${codeReview.shareSlug}`);
  console.log(`  Draft:     /vote/${meeting.shareSlug}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
