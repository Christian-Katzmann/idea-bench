/**
 * Seeds the DB with demo campaigns that mirror the original frontend
 * mocks, so the dashboard and voting flow have realistic content to
 * render during local dev.
 *
 * Destructive: truncates every app table before seeding. Do NOT run
 * against a production-like database.
 *
 * Usage: `npm run db:seed`
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { sql } from 'drizzle-orm';
import * as schema from '../src/server/db/schema';
import { generateShareSlug, pairKey } from '../src/lib/ids';

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
  // Order matters only if we use DELETE; TRUNCATE CASCADE handles FKs.
  await db.execute(sql`
    TRUNCATE TABLE
      ${schema.ratings},
      ${schema.votes},
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

  console.log('Inserting campaign models...');
  const [opus, gpt5, gemini] = await db
    .insert(schema.campaignModels)
    .values([
      {
        campaignId: danish.id,
        providerModelId: 'anthropic/claude-opus-4-6',
        displayName: 'Claude Opus 4.6',
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
  const gens = await db
    .insert(schema.generations)
    .values([
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
    ])
    .returning();

  // Index generations by (promptId, campaignModelId) for easy lookup below.
  const g = new Map(gens.map((x) => [`${x.promptId}:${x.campaignModelId}`, x]));
  const lookup = (p: { id: string }, m: { id: string }) => {
    const hit = g.get(`${p.id}:${m.id}`);
    if (!hit) throw new Error(`missing generation for ${p.id}/${m.id}`);
    return hit;
  };

  console.log('Inserting participants + votes...');
  const participants = await db
    .insert(schema.participants)
    .values([
      { cookieId: crypto.randomUUID(), campaignId: danish.id, email: 'alice@example.com' },
      { cookieId: crypto.randomUUID(), campaignId: danish.id, email: 'bob@example.com' },
      { cookieId: crypto.randomUUID(), campaignId: danish.id, email: 'carol@example.com' },
    ])
    .returning();

  const p1Opus = lookup(prompt1, opus);
  const p1Gpt5 = lookup(prompt1, gpt5);
  const p1Gem = lookup(prompt1, gemini);
  const p2Opus = lookup(prompt2, opus);
  const p2Gem = lookup(prompt2, gemini);

  await db.insert(schema.votes).values([
    {
      campaignId: danish.id,
      participantId: participants[0].id,
      promptId: prompt1.id,
      generationAId: p1Opus.id,
      generationBId: p1Gpt5.id,
      pairKey: pairKey(p1Opus.id, p1Gpt5.id),
      winner: 'A',
    },
    {
      campaignId: danish.id,
      participantId: participants[0].id,
      promptId: prompt2.id,
      generationAId: p2Opus.id,
      generationBId: p2Gem.id,
      pairKey: pairKey(p2Opus.id, p2Gem.id),
      winner: 'B',
    },
    {
      campaignId: danish.id,
      participantId: participants[1].id,
      promptId: prompt1.id,
      generationAId: p1Gpt5.id,
      generationBId: p1Gem.id,
      pairKey: pairKey(p1Gpt5.id, p1Gem.id),
      winner: 'B',
    },
    {
      campaignId: danish.id,
      participantId: participants[2].id,
      promptId: prompt1.id,
      generationAId: p1Opus.id,
      generationBId: p1Gem.id,
      pairKey: pairKey(p1Opus.id, p1Gem.id),
      winner: 'A',
    },
  ]);

  console.log('Inserting placeholder ratings (overall only)...');
  // These are illustrative numbers to populate the dashboard. Phase 4
  // replaces them with real Elo + bootstrap CI output.
  await db.insert(schema.ratings).values([
    {
      campaignId: danish.id,
      campaignModelId: opus.id,
      category: 'overall',
      elo: 1247,
      ciLow: 1209,
      ciHigh: 1285,
      gameCount: 45,
      ciComputedAt: now,
    },
    {
      campaignId: danish.id,
      campaignModelId: gemini.id,
      category: 'overall',
      elo: 1180,
      ciLow: 1140,
      ciHigh: 1220,
      gameCount: 42,
      ciComputedAt: now,
    },
    {
      campaignId: danish.id,
      campaignModelId: gpt5.id,
      category: 'overall',
      elo: 1050,
      ciLow: 980,
      ciHigh: 1120,
      gameCount: 40,
      ciComputedAt: now,
    },
  ]);

  console.log(`\nSeeded 3 campaigns:`);
  console.log(`  Active:    /vote/${danish.shareSlug}   — ${danish.name}`);
  console.log(`  Completed: /vote/${codeReview.shareSlug}   — ${codeReview.name}`);
  console.log(`  Draft:     /vote/${meeting.shareSlug}   — ${meeting.name}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
