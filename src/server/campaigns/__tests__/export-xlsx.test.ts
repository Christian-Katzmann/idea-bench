/**
 * Tests the XLSX workbook export. Fixtures cover a campaign with two
 * models, one prompt each mode, and a handful of response events so
 * every sheet has meaningful data. Assertions focus on structural
 * invariants (right sheets, right counts, numeric columns stay numeric).
 */
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildCampaignWorkbookBuffer } from '../export-xlsx.js';
import type { CampaignWorkbookInputs } from '../export-xlsx.js';
import type { CampaignDetailData } from '../detail.js';
import type * as schema from '../../db/schema.js';

function fixture(): CampaignWorkbookInputs {
  const modelA = {
    id: 'cm-a',
    displayName: 'Claude Opus',
    providerModelId: 'anthropic/claude-opus-4-6',
  };
  const modelB = {
    id: 'cm-b',
    displayName: 'GPT-5',
    providerModelId: 'openai/gpt-5',
  };
  const now = new Date('2026-04-22T12:00:00Z');

  const detail: CampaignDetailData = {
    campaign: {
      id: 'c-1',
      shareSlug: 'demo-campaign',
      name: 'Demo Campaign',
      description: 'Fixture for export',
      categories: ['benchmark'],
      status: 'active',
      votingMode: 'hybrid',
      emailPromptMessage: null,
      createdAt: now,
      closedAt: null,
    },
    stats: {
      promptCount: 1,
      modelCount: 2,
      totalVotes: 1,
      uniqueParticipants: 1,
      finishedParticipants: 1,
      identifiedParticipants: 1,
      anonymousParticipants: 0,
    },
    models: [modelA, modelB],
    prompts: [
      {
        id: 'p-1',
        orderIndex: 0,
        text: 'hello',
        context: null,
        categoryTags: [],
        mode: 'tournament',
      },
    ],
    ratings: [
      {
        category: 'overall',
        source: 'both',
        personaId: null,
        rating: 1200,
        seRating: 40,
        btStrength: 0.5,
        ciLow: 1120,
        ciHigh: 1280,
        gameCount: 4,
        gamesPlayed: 4,
        winCount: 3,
        lossCount: 1,
        tieCount: 0,
        winRate: 0.75,
        stability: 'preliminary',
        computedAt: now,
        campaignModelId: modelA.id,
        providerModelId: modelA.providerModelId,
        displayName: modelA.displayName,
      },
      {
        category: 'overall',
        source: 'both',
        personaId: null,
        rating: 1000,
        seRating: 40,
        btStrength: -0.5,
        ciLow: 920,
        ciHigh: 1080,
        gameCount: 4,
        gamesPlayed: 4,
        winCount: 1,
        lossCount: 3,
        tieCount: 0,
        winRate: 0.25,
        stability: 'preliminary',
        computedAt: now,
        campaignModelId: modelB.id,
        providerModelId: modelB.providerModelId,
        displayName: modelB.displayName,
      },
    ],
  };

  const participants = [
    {
      participantId: 'pt-1',
      email: 'voter@example.com',
      startedAt: now,
      finishedAt: now,
      votesCast: 1,
      isFinished: true,
    },
  ];

  const responses = {
    campaign: detail.campaign,
    promptsById: new Map([
      ['p-1', { id: 'p-1', orderIndex: 0, categoryTags: [] }],
    ]),
    modelsById: new Map([
      [modelA.id, modelA],
      [modelB.id, modelB],
    ]),
    participantsById: new Map([
      ['pt-1', { id: 'pt-1', email: 'voter@example.com' }],
    ]),
    generationsById: new Map([
      ['g-a', { id: 'g-a', campaignModelId: modelA.id }],
      ['g-b', { id: 'g-b', campaignModelId: modelB.id }],
    ]),
    votes: [
      {
        id: 'v-1',
        campaignId: 'c-1',
        tournamentId: 't-1',
        promptId: 'p-1',
        participantId: 'pt-1',
        sessionId: 's-1',
        bracketPosition: 'b1',
        generationAId: 'g-a',
        generationBId: 'g-b',
        winner: 'A',
        advancedGenerationId: 'g-a',
        createdAt: now,
      } as unknown as schema.Vote,
    ],
    sliderResponses: [],
    approveRejectResponses: [],
    bestOfNResponses: [],
    multiAxisResponses: [],
    qualitativeResponses: [],
  };

  return { detail, participants, responses };
}

describe('buildCampaignWorkbookBuffer', () => {
  it('produces a workbook with the expected sheets', async () => {
    const buffer = await buildCampaignWorkbookBuffer(fixture());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);

    const sheetNames = wb.worksheets.map((s) => s.name);
    expect(sheetNames).toEqual([
      'Overview',
      'Leaderboard',
      'Participants',
      'Responses',
    ]);
  });

  it('leaderboard sheet has rating as a numeric cell, not a string', async () => {
    const buffer = await buildCampaignWorkbookBuffer(fixture());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const leaderboard = wb.getWorksheet('Leaderboard')!;

    // Row 1 is the header; Row 2 is the first data row.
    const dataRow = leaderboard.getRow(2);
    // Column 7 is 'Rating' per the handler's header order (1-indexed).
    const ratingCell = dataRow.getCell(7);
    expect(typeof ratingCell.value).toBe('number');
    expect(ratingCell.value).toBe(1200);
  });

  it('overview sheet contains campaign name + total vote count', async () => {
    const buffer = await buildCampaignWorkbookBuffer(fixture());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const overview = wb.getWorksheet('Overview')!;

    const rowTexts: string[] = [];
    overview.eachRow((row) => {
      const a = row.getCell(1).value;
      const b = row.getCell(2).value;
      rowTexts.push(`${a ?? ''}|${b ?? ''}`);
    });
    expect(rowTexts.some((t) => t.startsWith('Campaign|Demo Campaign'))).toBe(true);
    expect(rowTexts.some((t) => t.startsWith('Total votes|1'))).toBe(true);
  });

  it('responses sheet contains one row per response event', async () => {
    const buffer = await buildCampaignWorkbookBuffer(fixture());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const responses = wb.getWorksheet('Responses')!;

    // Header + 1 vote → 2 rows
    expect(responses.rowCount).toBe(2);
    const row = responses.getRow(2);
    // Mode column (col 2) is 'tournament'; Tournament winner (col 14) is 'A'.
    expect(row.getCell(2).value).toBe('tournament');
    expect(row.getCell(14).value).toBe('A');
  });
});
