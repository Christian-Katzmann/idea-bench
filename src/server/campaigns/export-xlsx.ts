/**
 * Builds a multi-sheet XLSX workbook from a campaign detail payload.
 * Shipped alongside (not replacing) the existing CSV export so stakeholders
 * who want formatted workbooks + numeric formats get them, while the CSV
 * surface stays unchanged for BI pipelines.
 *
 * Sheets:
 *   - Overview: campaign metadata + stat tiles.
 *   - Leaderboard: one row per (model, category) overall rating.
 *   - Participants: one row per participant (same shape as the CSV).
 *   - Responses: all response events across every evaluation mode.
 *
 * ExcelJS is loaded dynamically inside buildCampaignWorkbook so it only
 * costs the ~800KB import when a caller actually exports.
 */

import {
  addDataRows,
  addFooter,
  addHeaderRow,
  addSheet,
  createWorkbook,
  workbookToBuffer,
} from '../lib/xlsx/index.js';
import type { CampaignDetailData } from './detail.js';
import type {
  ParticipantExportRow,
  ResponsesExportInputs,
} from './export.js';
import type * as schema from '../db/schema.js';

/**
 * Plan 04 — per-kind XLSX header copy. Title-case to match the rest
 * of the workbook's header convention (the CSV side uses snake_case).
 * Mirrors `csvHeadersForKind` in shape but with display labels.
 */
interface XlsxKindHeaders {
  /** "Model" / "Variant" / "System Prompt Variant" */
  contestant: string;
  /** "Provider ID" / "Variant Provider ID" / "System Prompt Variant Provider ID" */
  providerId: string;
  /** "Model A" etc. — wide A/B-side labels for the Responses sheet. */
  modelA: string;
  modelAProviderId: string;
  modelB: string;
  modelBProviderId: string;
}

function xlsxHeadersForKind(kind: schema.CampaignKind): XlsxKindHeaders {
  switch (kind) {
    case 'model':
      return {
        contestant: 'Model',
        providerId: 'Provider ID',
        modelA: 'Model A',
        modelAProviderId: 'Model A provider ID',
        modelB: 'Model B',
        modelBProviderId: 'Model B provider ID',
      };
    case 'prompt':
      return {
        contestant: 'Variant',
        providerId: 'Variant provider ID',
        modelA: 'Variant A',
        modelAProviderId: 'Variant A provider ID',
        modelB: 'Variant B',
        modelBProviderId: 'Variant B provider ID',
      };
    case 'system_prompt':
      return {
        contestant: 'System Prompt Variant',
        providerId: 'System Prompt Variant provider ID',
        modelA: 'System Prompt Variant A',
        modelAProviderId: 'System Prompt Variant A provider ID',
        modelB: 'System Prompt Variant B',
        modelBProviderId: 'System Prompt Variant B provider ID',
      };
  }
}

export interface CampaignWorkbookInputs {
  detail: CampaignDetailData;
  participants: ParticipantExportRow[];
  responses: ResponsesExportInputs;
}

export async function buildCampaignWorkbookBuffer(
  inputs: CampaignWorkbookInputs,
): Promise<ArrayBuffer> {
  // Dynamic import keeps ExcelJS out of cold-start code paths that never
  // export. Vercel Functions import cost matters here.
  const ExcelJSLib = (await import('exceljs')).default;
  const { detail } = inputs;

  const wb = createWorkbook(
    ExcelJSLib,
    `ïdea Bench — ${detail.campaign.name}`,
    { creator: 'ïdea Bench' },
  );

  addOverviewSheet(wb, detail);
  addLeaderboardSheet(wb, detail);
  addParticipantsSheet(wb, detail, inputs.participants);
  addResponsesSheet(wb, inputs.responses);

  return workbookToBuffer(wb);
}

export { xlsxHeadersForKind };

function addOverviewSheet(
  wb: Awaited<ReturnType<typeof createWorkbook>>,
  detail: CampaignDetailData,
): void {
  const sheet = addSheet(wb, 'Overview');
  addHeaderRow(sheet, ['Field', 'Value']);
  addDataRows(sheet, [
    ['Campaign', detail.campaign.name],
    ['Description', detail.campaign.description],
    ['Status', detail.campaign.status],
    ['Share slug', detail.campaign.shareSlug],
    ['Categories', detail.campaign.categories.join(', ')],
    ['Created at', detail.campaign.createdAt.toISOString()],
    ['Closed at', detail.campaign.closedAt?.toISOString() ?? ''],
    ['Prompts', detail.stats.promptCount],
    ['Models', detail.stats.modelCount],
    ['Total votes', detail.stats.totalVotes],
    ['Unique participants', detail.stats.uniqueParticipants],
    ['Finished participants', detail.stats.finishedParticipants],
    ['Identified participants', detail.stats.identifiedParticipants],
    ['Anonymous participants', detail.stats.anonymousParticipants],
  ], {
    integerColumns: [1],
  });
  addFooter(sheet, [
    { text: `Exported ${new Date().toISOString()}` },
  ]);
}

function addLeaderboardSheet(
  wb: Awaited<ReturnType<typeof createWorkbook>>,
  detail: CampaignDetailData,
): void {
  const sheet = addSheet(wb, 'Leaderboard');
  const headers = xlsxHeadersForKind(detail.campaign.kind);
  addHeaderRow(sheet, [
    'Rank',
    headers.contestant,
    headers.providerId,
    'Category',
    'Source',
    'Persona',
    'Rating',
    'SE',
    'CI Low',
    'CI High',
    'Win rate',
    'Wins',
    'Losses',
    'Ties',
    'Comparisons',
    'Stability',
    'Computed at',
  ]);

  // Sort by rating descending within each category for readable output.
  const sorted = [...detail.ratings].sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return b.rating - a.rating;
  });

  const rows: (string | number | null)[][] = [];
  const rankByCategory = new Map<string, number>();
  for (const r of sorted) {
    const current = rankByCategory.get(r.category) ?? 0;
    const rank = current + 1;
    rankByCategory.set(r.category, rank);
    rows.push([
      rank,
      r.displayName,
      r.providerModelId,
      r.category,
      r.source,
      r.personaId ?? '',
      r.rating,
      r.seRating,
      r.ciLow,
      r.ciHigh,
      r.winRate,
      r.winCount,
      r.lossCount,
      r.tieCount,
      r.gamesPlayed,
      r.stability,
      r.computedAt?.toISOString() ?? '',
    ]);
  }

  addDataRows(sheet, rows, {
    integerColumns: [0, 11, 12, 13, 14],
    numericColumns: [6, 7, 8, 9],
    percentColumns: [10],
  });
}

function addParticipantsSheet(
  wb: Awaited<ReturnType<typeof createWorkbook>>,
  detail: CampaignDetailData,
  participants: ParticipantExportRow[],
): void {
  const sheet = addSheet(wb, 'Participants');
  addHeaderRow(sheet, [
    'Participant ID',
    'Email',
    'Identity',
    'Started at',
    'Finished at',
    'Is finished',
    'Votes cast',
  ]);
  addDataRows(
    sheet,
    participants.map((p) => [
      p.participantId,
      p.email ?? '',
      p.email ? 'identified' : 'anonymous',
      p.startedAt.toISOString(),
      p.finishedAt?.toISOString() ?? '',
      p.isFinished ? 'true' : 'false',
      p.votesCast,
    ]),
    { integerColumns: [6] },
  );
  addFooter(sheet, [
    { text: `Campaign: ${detail.campaign.name} (${detail.campaign.shareSlug})` },
  ]);
}

function addResponsesSheet(
  wb: Awaited<ReturnType<typeof createWorkbook>>,
  inputs: ResponsesExportInputs,
): void {
  const sheet = addSheet(wb, 'Responses');
  const headers = xlsxHeadersForKind(inputs.campaign.kind);
  addHeaderRow(sheet, [
    'Created at',
    'Mode',
    'Prompt order',
    'Prompt ID',
    'Category tags',
    'Participant ID',
    'Email',
    'Session ID',
    headers.modelA,
    headers.modelAProviderId,
    headers.modelB,
    headers.modelBProviderId,
    'Tournament bracket',
    'Tournament winner',
    'Slider score',
    'Approve/Reject',
    'Best-of-N chosen',
    'Multi-axis scores (JSON)',
    'Qualitative text',
    'Signal summary',
  ]);

  const events = collectResponseEvents(inputs);
  addDataRows(sheet, events, { integerColumns: [2, 14] });
}

/**
 * Normalize the union of {tournament votes, slider, approve/reject,
 * best-of-N, multi-axis, qualitative} into a single flat row shape —
 * mirrors the CSV `buildCampaignResponsesCsv` output so Excel and CSV
 * stay consistent.
 */
function collectResponseEvents(
  inputs: ResponsesExportInputs,
): (string | number | null)[][] {
  interface Row {
    createdAt: Date;
    mode: schema.PromptMode;
    promptId: string;
    participantId: string;
    sessionId: string;
    modelAId: string | null;
    modelBId: string | null;
    tournamentBracket: string;
    tournamentWinner: string;
    sliderScore: number | null;
    approveRejectApproved: string;
    bestOfNChosen: string;
    multiAxisScoresJson: string;
    qualitativeText: string;
    signalSummary: string;
  }

  const rows: Row[] = [];

  for (const v of inputs.votes) {
    const genA = inputs.generationsById.get(v.generationAId);
    const genB = inputs.generationsById.get(v.generationBId);
    rows.push({
      createdAt: v.createdAt,
      mode: 'tournament',
      promptId: v.promptId,
      participantId: v.participantId,
      sessionId: v.sessionId,
      modelAId: genA?.campaignModelId ?? null,
      modelBId: genB?.campaignModelId ?? null,
      tournamentBracket: v.bracketPosition,
      tournamentWinner: v.winner,
      sliderScore: null,
      approveRejectApproved: '',
      bestOfNChosen: '',
      multiAxisScoresJson: '',
      qualitativeText: '',
      signalSummary: `${v.bracketPosition}: ${v.winner}`,
    });
  }
  for (const r of inputs.sliderResponses) {
    rows.push({
      createdAt: r.createdAt,
      mode: 'slider',
      promptId: r.promptId,
      participantId: r.participantId,
      sessionId: r.sessionId,
      modelAId: r.campaignModelId,
      modelBId: null,
      tournamentBracket: '',
      tournamentWinner: '',
      sliderScore: r.score,
      approveRejectApproved: '',
      bestOfNChosen: '',
      multiAxisScoresJson: '',
      qualitativeText: '',
      signalSummary: `score=${r.score}`,
    });
  }
  for (const r of inputs.approveRejectResponses) {
    rows.push({
      createdAt: r.createdAt,
      mode: 'approve_reject',
      promptId: r.promptId,
      participantId: r.participantId,
      sessionId: r.sessionId,
      modelAId: r.campaignModelId,
      modelBId: null,
      tournamentBracket: '',
      tournamentWinner: '',
      sliderScore: null,
      approveRejectApproved: r.approved ? 'approved' : 'rejected',
      bestOfNChosen: '',
      multiAxisScoresJson: '',
      qualitativeText: '',
      signalSummary: r.approved ? 'approved' : 'rejected',
    });
  }
  for (const r of inputs.bestOfNResponses) {
    rows.push({
      createdAt: r.createdAt,
      mode: 'best_of_n',
      promptId: r.promptId,
      participantId: r.participantId,
      sessionId: r.sessionId,
      modelAId: r.chosenCampaignModelId,
      modelBId: null,
      tournamentBracket: '',
      tournamentWinner: '',
      sliderScore: null,
      approveRejectApproved: '',
      bestOfNChosen: 'chosen',
      multiAxisScoresJson: '',
      qualitativeText: '',
      signalSummary: 'chosen',
    });
  }
  for (const r of inputs.multiAxisResponses) {
    const scoresJson = JSON.stringify(r.scores);
    rows.push({
      createdAt: r.createdAt,
      mode: 'multi_axis',
      promptId: r.promptId,
      participantId: r.participantId,
      sessionId: r.sessionId,
      modelAId: r.campaignModelId,
      modelBId: null,
      tournamentBracket: '',
      tournamentWinner: '',
      sliderScore: null,
      approveRejectApproved: '',
      bestOfNChosen: '',
      multiAxisScoresJson: scoresJson,
      qualitativeText: '',
      signalSummary: scoresJson,
    });
  }
  for (const r of inputs.qualitativeResponses) {
    rows.push({
      createdAt: r.createdAt,
      mode: 'qualitative',
      promptId: r.promptId,
      participantId: r.participantId,
      sessionId: r.sessionId,
      modelAId: r.campaignModelId,
      modelBId: null,
      tournamentBracket: '',
      tournamentWinner: '',
      sliderScore: null,
      approveRejectApproved: '',
      bestOfNChosen: '',
      multiAxisScoresJson: '',
      qualitativeText: r.text,
      signalSummary: `text (${r.text.length} chars)`,
    });
  }

  rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  return rows.map((e) => {
    const prompt = inputs.promptsById.get(e.promptId);
    const participant = inputs.participantsById.get(e.participantId);
    const modelA = e.modelAId ? inputs.modelsById.get(e.modelAId) : undefined;
    const modelB = e.modelBId ? inputs.modelsById.get(e.modelBId) : undefined;
    return [
      e.createdAt.toISOString(),
      e.mode,
      prompt?.orderIndex ?? null,
      e.promptId,
      (prompt?.categoryTags ?? []).join('|'),
      e.participantId,
      participant?.email ?? '',
      e.sessionId,
      modelA?.displayName ?? '',
      modelA?.providerModelId ?? '',
      modelB?.displayName ?? '',
      modelB?.providerModelId ?? '',
      e.tournamentBracket,
      e.tournamentWinner,
      e.sliderScore,
      e.approveRejectApproved,
      e.bestOfNChosen,
      e.multiAxisScoresJson,
      e.qualitativeText,
      e.signalSummary,
    ];
  });
}
