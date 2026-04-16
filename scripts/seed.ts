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
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { sql } from 'drizzle-orm';
import * as schema from '../src/server/db/schema';
import { generateShareSlug } from '../src/lib/ids';

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

  console.log('Inserting campaigns...');
  const [danish, codeReview, meeting] = await db
    .insert(schema.campaigns)
    .values([
      {
        shareSlug: generateShareSlug(),
        name: 'Danish citizen-letter drafting',
        description:
          'Evaluate models on drafting official letters to citizens in Danish, focusing on tone and clarity.',
        categories: ['translation', 'creative writing'],
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
        campaignId: danish.id,
        orderIndex: 0,
        text: 'Draft a letter to a citizen informing them that their application for a building permit has been approved, but they must start construction within 12 months.',
        categoryTags: ['creative writing'],
      },
      {
        campaignId: danish.id,
        orderIndex: 1,
        text: 'Translate this technical policy update into plain Danish suitable for a general audience.',
        context:
          'Policy update: The municipal waste management directive 2024/B requires all households to separate organic waste into the new green bins starting October 1st. Failure to comply may result in a fine of 500 DKK.',
        categoryTags: ['translation'],
      },
    ])
    .returning();

  console.log('Inserting campaign models (4 — minimum for a tournament)...');
  const [opus, sonnet, gpt5, gemini] = await db
    .insert(schema.campaignModels)
    .values([
      {
        campaignId: danish.id,
        providerModelId: 'anthropic/claude-opus-4-6',
        displayName: 'Claude Opus 4.6',
      },
      {
        campaignId: danish.id,
        providerModelId: 'anthropic/claude-sonnet-4-6',
        displayName: 'Claude Sonnet 4.6',
      },
      {
        campaignId: danish.id,
        providerModelId: 'openai/gpt-5',
        displayName: 'GPT-5',
      },
      {
        campaignId: danish.id,
        providerModelId: 'google/gemini-2.5-pro',
        displayName: 'Gemini 2.5 Pro',
      },
    ])
    .returning();

  console.log('Inserting generations...');
  const now = new Date();
  await db.insert(schema.generations).values([
    // prompt 1
    {
      promptId: prompt1.id,
      campaignModelId: opus.id,
      output:
        'Kære Borger,\n\nVi har den glæde at meddele dig, at din ansøgning om byggetilladelse er blevet godkendt. Du kan nu påbegynde dit byggeprojekt.\n\nVær venligst opmærksom på, at byggeriet skal påbegyndes inden for 12 måneder fra dags dato. Hvis dette ikke overholdes, vil tilladelsen bortfalde.\n\nMed venlig hilsen,\nKommunen',
      tokensIn: 120,
      tokensOut: 65,
      latencyMs: 1200,
      completedAt: now,
    },
    {
      promptId: prompt1.id,
      campaignModelId: sonnet.id,
      output:
        'Kære modtager,\n\nDin ansøgning om byggetilladelse er godkendt. Bemærk at byggeriet skal igangsættes inden 12 måneder, ellers bortfalder tilladelsen.\n\nVenlig hilsen,\nByggesagsafdelingen',
      tokensIn: 120,
      tokensOut: 45,
      latencyMs: 900,
      completedAt: now,
    },
    {
      promptId: prompt1.id,
      campaignModelId: gpt5.id,
      output:
        'Til rette vedkommende.\n\nDin byggetilladelse er godkendt. Byggeriet skal starte inden 12 måneder, ellers udløber tilladelsen.\n\nVenlig hilsen,\nByggeafdelingen',
      tokensIn: 120,
      tokensOut: 40,
      latencyMs: 800,
      completedAt: now,
    },
    {
      promptId: prompt1.id,
      campaignModelId: gemini.id,
      output:
        'Kære ansøger,\n\nVi skriver for at informere dig om, at din byggetilladelse er godkendt. Husk at byggeriet skal sættes i gang senest 12 måneder fra i dag.\n\nVenlig hilsen,\nBorgerservice',
      tokensIn: 120,
      tokensOut: 50,
      latencyMs: 950,
      completedAt: now,
    },
    // prompt 2
    {
      promptId: prompt2.id,
      campaignModelId: opus.id,
      output:
        'Vigtig information om affaldssortering.\n\nFra den 1. oktober skal alle husstande sortere deres madaffald i de nye grønne spande. Det er vigtigt at overholde dette, da manglende sortering kan medføre et gebyr på 500 kr.',
      tokensIn: 180,
      tokensOut: 55,
      latencyMs: 1100,
      completedAt: now,
    },
    {
      promptId: prompt2.id,
      campaignModelId: sonnet.id,
      output:
        'Kære beboer,\n\nFra 1. oktober starter en ny ordning for affaldssortering: madaffald skal i de grønne spande. Manglende sortering kan udløse et gebyr på 500 kr.',
      tokensIn: 180,
      tokensOut: 40,
      latencyMs: 880,
      completedAt: now,
    },
    {
      promptId: prompt2.id,
      campaignModelId: gpt5.id,
      output:
        'Nye regler for affald.\n\nAlle skal bruge de grønne spande til organisk affald fra 1. oktober. Bøde på 500 kr. hvis det ikke overholdes.',
      tokensIn: 180,
      tokensOut: 35,
      latencyMs: 750,
      completedAt: now,
    },
    {
      promptId: prompt2.id,
      campaignModelId: gemini.id,
      output:
        'Kære borger,\n\nFra 1. oktober indfører vi nye regler for affaldssortering. Det betyder, at du skal sortere dit madaffald i den nye grønne spand. Bemærk venligst, at det kan koste en afgift på 500 kr., hvis affaldet ikke sorteres korrekt.',
      tokensIn: 180,
      tokensOut: 60,
      latencyMs: 1050,
      completedAt: now,
    },
  ]);

  console.log('Inserting placeholder ratings (illustrative; Phase 4 replaces)...');
  // These are not real B-T output — just plausible numbers so the
  // dashboard renders with content. Phase 4 computes the real thing from
  // the vote log.
  await db.insert(schema.ratings).values([
    {
      campaignId: danish.id,
      campaignModelId: opus.id,
      category: 'overall',
      rating: 1247,
      ciLow: 1209,
      ciHigh: 1285,
      gameCount: 45,
    },
    {
      campaignId: danish.id,
      campaignModelId: sonnet.id,
      category: 'overall',
      rating: 1195,
      ciLow: 1155,
      ciHigh: 1235,
      gameCount: 43,
    },
    {
      campaignId: danish.id,
      campaignModelId: gemini.id,
      category: 'overall',
      rating: 1180,
      ciLow: 1140,
      ciHigh: 1220,
      gameCount: 42,
    },
    {
      campaignId: danish.id,
      campaignModelId: gpt5.id,
      category: 'overall',
      rating: 1050,
      ciLow: 980,
      ciHigh: 1120,
      gameCount: 40,
    },
  ]);

  console.log(`\nSeeded 3 campaigns:`);
  console.log(`  Active:    /vote/${danish.shareSlug}`);
  console.log(`  Completed: /vote/${codeReview.shareSlug}`);
  console.log(`  Draft:     /vote/${meeting.shareSlug}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
