/**
 * Plan 04 — per-kind export column header coverage. The CSV/XLSX
 * exports keep the same row shape across kinds; only the column
 * headers shift so a prompt-arena export reads as `variant_*` rather
 * than `model_*`. These tests pin those headers so a regression in
 * `csvHeadersForKind` / `xlsxHeadersForKind` surfaces immediately.
 *
 * BI pipelines that consume the CSVs need to handle the per-kind
 * header — the column position is stable, only the label changes.
 */
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import {
  buildCampaignResultsCsv,
  buildCampaignResponsesCsv,
  csvHeadersForKind,
  type ResponsesExportInputs,
} from '../campaigns/export.js';
import {
  buildCampaignWorkbookBuffer,
  xlsxHeadersForKind,
  type CampaignWorkbookInputs,
} from '../campaigns/export-xlsx.js';
import type { CampaignDetailData } from '../campaigns/detail.js';
import type * as schema from '../db/schema.js';

const NOW = new Date('2026-04-22T12:00:00.000Z');

function makeCampaign(
  kind: schema.CampaignKind,
): CampaignDetailData['campaign'] {
  return {
    id: 'c-1',
    shareSlug: 'demo',
    name: 'Demo',
    description: '',
    categories: [],
    status: 'active',
    votingMode: 'hybrid',
    emailPromptMessage: null,
    createdAt: NOW,
    closedAt: null,
    kind,
    pinnedProviderModelId:
      kind === 'model' ? null : 'anthropic/claude-opus-4-6',
    pinnedSystemPrompt: null,
  };
}

function makeDetail(kind: schema.CampaignKind): CampaignDetailData {
  return {
    campaign: makeCampaign(kind),
    stats: {
      promptCount: 1,
      modelCount: 2,
      totalVotes: 0,
      uniqueParticipants: 0,
      finishedParticipants: 0,
      identifiedParticipants: 0,
      anonymousParticipants: 0,
    },
    models: [],
    prompts: [],
    ratings: [
      {
        category: 'overall',
        source: 'both',
        personaId: null,
        campaignModelId: 'cm-1',
        providerModelId: 'anthropic/claude-opus-4-6',
        displayName: 'Variant 1',
        rating: 1100,
        seRating: null,
        btStrength: null,
        ciLow: 1080,
        ciHigh: 1120,
        winRate: 0.6,
        winCount: 3,
        lossCount: 1,
        tieCount: 0,
        gameCount: 4,
        gamesPlayed: 4,
        stability: 'stable',
        computedAt: NOW,
      },
    ],
  };
}

function emptyResponseInputs(
  kind: schema.CampaignKind,
): ResponsesExportInputs {
  return {
    campaign: makeCampaign(kind),
    promptsById: new Map(),
    modelsById: new Map(),
    participantsById: new Map(),
    generationsById: new Map(),
    votes: [],
    sliderResponses: [],
    approveRejectResponses: [],
    bestOfNResponses: [],
    multiAxisResponses: [],
    qualitativeResponses: [],
  };
}

describe('csvHeadersForKind', () => {
  it('returns model_* headers for kind=model (legacy)', () => {
    expect(csvHeadersForKind('model')).toMatchObject({
      display: 'model_display_name',
      providerId: 'provider_model_id',
      modelADisplay: 'model_a_display_name',
    });
  });

  it('returns variant_* headers for kind=prompt', () => {
    expect(csvHeadersForKind('prompt')).toMatchObject({
      display: 'variant_display_name',
      providerId: 'variant_provider_id',
      modelADisplay: 'variant_a_display_name',
    });
  });

  it('returns system_prompt_variant_* headers for kind=system_prompt', () => {
    expect(csvHeadersForKind('system_prompt')).toMatchObject({
      display: 'system_prompt_variant_display_name',
      providerId: 'system_prompt_variant_provider_id',
      modelADisplay: 'system_prompt_variant_a_display_name',
    });
  });
});

describe('xlsxHeadersForKind', () => {
  it('uses Title Case "Model" / "Provider ID" for kind=model', () => {
    expect(xlsxHeadersForKind('model')).toMatchObject({
      contestant: 'Model',
      providerId: 'Provider ID',
    });
  });

  it('uses "Variant" labels for kind=prompt', () => {
    expect(xlsxHeadersForKind('prompt')).toMatchObject({
      contestant: 'Variant',
      providerId: 'Variant provider ID',
    });
  });

  it('uses "System Prompt Variant" labels for kind=system_prompt', () => {
    expect(xlsxHeadersForKind('system_prompt')).toMatchObject({
      contestant: 'System Prompt Variant',
    });
  });
});

describe('buildCampaignResultsCsv — per-kind header', () => {
  it('emits model_display_name for kind=model', () => {
    const csv = buildCampaignResultsCsv(makeDetail('model'));
    const header = csv.split('\n')[0];
    expect(header).toContain('model_display_name');
    expect(header).toContain('provider_model_id');
    expect(header).not.toContain('variant_display_name');
  });

  it('emits variant_display_name for kind=prompt', () => {
    const csv = buildCampaignResultsCsv(makeDetail('prompt'));
    const header = csv.split('\n')[0];
    expect(header).toContain('variant_display_name');
    expect(header).toContain('variant_provider_id');
    expect(header).not.toContain('model_display_name');
  });

  it('emits system_prompt_variant_display_name for kind=system_prompt', () => {
    const csv = buildCampaignResultsCsv(makeDetail('system_prompt'));
    const header = csv.split('\n')[0];
    expect(header).toContain('system_prompt_variant_display_name');
    expect(header).not.toContain('model_display_name');
  });
});

describe('buildCampaignResponsesCsv — per-kind header', () => {
  it('emits model_a/model_b headers for kind=model', () => {
    const csv = buildCampaignResponsesCsv(emptyResponseInputs('model'));
    const header = csv.split('\n')[0];
    expect(header).toContain('model_a_display_name');
    expect(header).toContain('model_b_display_name');
    expect(header).not.toContain('variant_a_display_name');
  });

  it('emits variant_a/variant_b headers for kind=prompt', () => {
    const csv = buildCampaignResponsesCsv(emptyResponseInputs('prompt'));
    const header = csv.split('\n')[0];
    expect(header).toContain('variant_a_display_name');
    expect(header).toContain('variant_b_display_name');
    expect(header).not.toContain('model_a_display_name');
  });
});

// ── XLSX header tests ──────────────────────────────────────────
// We build the workbook end-to-end and read the Leaderboard sheet's
// header row back via ExcelJS so the test mirrors what an operator
// would see when opening the file.

async function readLeaderboardHeader(
  wb: CampaignWorkbookInputs,
): Promise<string[]> {
  const buf = await buildCampaignWorkbookBuffer(wb);
  const reader = new ExcelJS.Workbook();
  await reader.xlsx.load(buf as Buffer);
  const sheet = reader.getWorksheet('Leaderboard');
  if (!sheet) throw new Error('Leaderboard sheet missing');
  const header = sheet.getRow(1).values as (string | undefined)[];
  return header.filter((v): v is string => typeof v === 'string');
}

function makeWorkbookInputs(
  kind: schema.CampaignKind,
): CampaignWorkbookInputs {
  return {
    detail: makeDetail(kind),
    participants: [],
    responses: emptyResponseInputs(kind),
  };
}

describe('XLSX leaderboard sheet — per-kind header', () => {
  it('reads back as "Model" / "Provider ID" for kind=model', async () => {
    const header = await readLeaderboardHeader(makeWorkbookInputs('model'));
    expect(header).toContain('Model');
    expect(header).toContain('Provider ID');
    expect(header).not.toContain('Variant');
  });

  it('reads back as "Variant" / "Variant provider ID" for kind=prompt', async () => {
    const header = await readLeaderboardHeader(makeWorkbookInputs('prompt'));
    expect(header).toContain('Variant');
    expect(header).toContain('Variant provider ID');
    expect(header).not.toContain('Model');
  });

  it('reads back as "System Prompt Variant" for kind=system_prompt', async () => {
    const header = await readLeaderboardHeader(
      makeWorkbookInputs('system_prompt'),
    );
    expect(header).toContain('System Prompt Variant');
  });
});
