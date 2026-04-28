import type { CampaignDetailData } from './detail.js';
import type * as schema from '../db/schema.js';

/**
 * Plan 04 — per-kind column header copy. The export rows still carry
 * the same data shape (one contestant row, one provider/variant id);
 * only the header LABEL shifts so a prompt-arena export reads as
 * "variant_*" rather than "model_*". BI pipelines that consume these
 * CSVs will need to handle the per-kind header — operators of
 * non-model arenas care about variants, not models.
 */
interface KindHeaders {
  /** "model_display_name" / "variant_display_name" / etc. */
  display: string;
  /** "provider_model_id" / "variant_provider_id" / etc. */
  providerId: string;
  /** Wide A-side variant for the responses CSV. */
  modelADisplay: string;
  modelAProviderId: string;
  modelBDisplay: string;
  modelBProviderId: string;
}

export function csvHeadersForKind(kind: schema.CampaignKind): KindHeaders {
  switch (kind) {
    case 'model':
      return {
        display: 'model_display_name',
        providerId: 'provider_model_id',
        modelADisplay: 'model_a_display_name',
        modelAProviderId: 'model_a_provider_id',
        modelBDisplay: 'model_b_display_name',
        modelBProviderId: 'model_b_provider_id',
      };
    case 'prompt':
      return {
        display: 'variant_display_name',
        providerId: 'variant_provider_id',
        modelADisplay: 'variant_a_display_name',
        modelAProviderId: 'variant_a_provider_id',
        modelBDisplay: 'variant_b_display_name',
        modelBProviderId: 'variant_b_provider_id',
      };
    case 'system_prompt':
      return {
        display: 'system_prompt_variant_display_name',
        providerId: 'system_prompt_variant_provider_id',
        modelADisplay: 'system_prompt_variant_a_display_name',
        modelAProviderId: 'system_prompt_variant_a_provider_id',
        modelBDisplay: 'system_prompt_variant_b_display_name',
        modelBProviderId: 'system_prompt_variant_b_provider_id',
      };
  }
}

export function buildCampaignResultsCsv(detail: CampaignDetailData): string {
  const rows = detail.ratings
    .filter((rating) => rating.category === 'overall')
    .sort((a, b) => b.rating - a.rating)
    .map((rating, index) => [
      detail.campaign.name,
      detail.campaign.status,
      detail.campaign.shareSlug,
      index + 1,
      rating.displayName,
      rating.providerModelId,
      rating.rating,
      rating.ciLow ?? '',
      rating.ciHigh ?? '',
      rating.winRate != null ? rating.winRate.toFixed(4) : '',
      rating.winCount,
      rating.lossCount,
      rating.tieCount,
      rating.gamesPlayed,
      rating.stability,
      rating.computedAt?.toISOString() ?? '',
      detail.stats.totalVotes,
      detail.stats.uniqueParticipants,
      detail.stats.finishedParticipants,
      detail.stats.identifiedParticipants,
      detail.stats.anonymousParticipants,
    ]);

  const headers = csvHeadersForKind(detail.campaign.kind);
  return [
    [
      'campaign_name',
      'campaign_status',
      'share_slug',
      'rank',
      headers.display,
      headers.providerId,
      'rating',
      'ci_low',
      'ci_high',
      'win_rate',
      'win_count',
      'loss_count',
      'tie_count',
      'comparisons',
      'stability',
      'computed_at',
      'total_votes',
      'unique_participants',
      'finished_participants',
      'identified_participants',
      'anonymous_participants',
    ],
    ...rows,
  ]
    .map((row) => row.map(escapeCsvCell).join(','))
    .join('\n');
}

export interface ParticipantExportRow {
  participantId: string;
  email: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  votesCast: number;
  isFinished: boolean;
}

/**
 * Per-participant CSV. One row per participant row in the DB. Email is
 * blank for anonymous voters. `votes_cast` is the count of vote rows
 * attributed to this participant — useful for spotting bailed-out sessions
 * (started but never hit b1).
 */
export function buildCampaignParticipantsCsv(
  campaign: CampaignDetailData['campaign'],
  rows: ParticipantExportRow[],
): string {
  const body = rows.map((row) => [
    campaign.name,
    campaign.shareSlug,
    row.participantId,
    row.email ?? '',
    row.email ? 'identified' : 'anonymous',
    row.startedAt.toISOString(),
    row.finishedAt?.toISOString() ?? '',
    row.isFinished ? 'true' : 'false',
    row.votesCast,
  ]);

  return [
    [
      'campaign_name',
      'share_slug',
      'participant_id',
      'email',
      'identity',
      'started_at',
      'finished_at',
      'is_finished',
      'votes_cast',
    ],
    ...body,
  ]
    .map((row) => row.map(escapeCsvCell).join(','))
    .join('\n');
}

function escapeCsvCell(value: unknown): string {
  const text = String(value ?? '');
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

// ─────────────────────────────────────────────────────────────────────────
// Raw responses export — one row per response event across all six
// evaluation modes. Operators pull this for external analysis
// (spreadsheets, BI tools, custom rollups). The row shape is a wide
// union: a `mode` discriminator tells you which columns to read.
//
// Column rationale
//   - All events share: campaign + prompt + participant + session + time.
//   - Tournament rows use model_a/model_b (A vs B) + tournament_* fields.
//   - Per-model modes (slider/approve_reject/multi_axis/qualitative) use
//     model_a as the model whose output was rated; model_b stays empty.
//   - Best-of-N uses model_a as the CHOSEN model. We don't emit rows for
//     the models that weren't chosen — the data model only records the
//     winner.
//   - `signal_summary` is a human-readable one-liner ("A wins",
//     "score=7", "approved", "GPT-5 chosen", etc.) — convenient when
//     eyeballing the CSV without pivoting.
// ─────────────────────────────────────────────────────────────────────────

/** Inputs bundle for buildCampaignResponsesCsv — fetched in the route. */
export interface ResponsesExportInputs {
  campaign: CampaignDetailData['campaign'];
  promptsById: Map<
    string,
    { id: string; orderIndex: number; categoryTags: string[] }
  >;
  modelsById: Map<
    string,
    { id: string; displayName: string; providerModelId: string }
  >;
  participantsById: Map<
    string,
    { id: string; email: string | null }
  >;
  generationsById: Map<
    string,
    { id: string; campaignModelId: string }
  >;
  votes: schema.Vote[];
  sliderResponses: schema.SliderResponse[];
  approveRejectResponses: schema.ApproveRejectResponse[];
  bestOfNResponses: schema.BestOfNResponse[];
  multiAxisResponses: schema.MultiAxisResponse[];
  qualitativeResponses: schema.QualitativeResponse[];
}

interface NormalizedRow {
  createdAt: Date;
  mode: schema.PromptMode;
  promptId: string;
  participantId: string;
  sessionId: string;
  modelAId: string | null;
  modelBId: string | null;
  tournamentBracket: string;
  tournamentWinner: string;
  sliderScore: string;
  approveRejectApproved: string;
  bestOfNChosen: string;
  multiAxisScoresJson: string;
  qualitativeText: string;
  signalSummary: string;
}

export function buildCampaignResponsesCsv(
  inputs: ResponsesExportInputs,
): string {
  const events: NormalizedRow[] = [];

  // Tournament votes — one row per vote, with both sides populated.
  for (const v of inputs.votes) {
    const genA = inputs.generationsById.get(v.generationAId);
    const genB = inputs.generationsById.get(v.generationBId);
    const winnerName =
      v.winner === 'A'
        ? modelLabel(inputs, genA?.campaignModelId)
        : v.winner === 'B'
          ? modelLabel(inputs, genB?.campaignModelId)
          : v.winner; // 'tie' | 'both_bad'
    events.push({
      createdAt: v.createdAt,
      mode: 'tournament',
      promptId: v.promptId,
      participantId: v.participantId,
      sessionId: v.sessionId,
      modelAId: genA?.campaignModelId ?? null,
      modelBId: genB?.campaignModelId ?? null,
      tournamentBracket: v.bracketPosition,
      tournamentWinner: v.winner,
      sliderScore: '',
      approveRejectApproved: '',
      bestOfNChosen: '',
      multiAxisScoresJson: '',
      qualitativeText: '',
      signalSummary: `${v.bracketPosition}: ${winnerName}`,
    });
  }

  for (const r of inputs.sliderResponses) {
    events.push({
      createdAt: r.createdAt,
      mode: 'slider',
      promptId: r.promptId,
      participantId: r.participantId,
      sessionId: r.sessionId,
      modelAId: r.campaignModelId,
      modelBId: null,
      tournamentBracket: '',
      tournamentWinner: '',
      sliderScore: String(r.score),
      approveRejectApproved: '',
      bestOfNChosen: '',
      multiAxisScoresJson: '',
      qualitativeText: '',
      signalSummary: `score=${r.score}`,
    });
  }

  for (const r of inputs.approveRejectResponses) {
    events.push({
      createdAt: r.createdAt,
      mode: 'approve_reject',
      promptId: r.promptId,
      participantId: r.participantId,
      sessionId: r.sessionId,
      modelAId: r.campaignModelId,
      modelBId: null,
      tournamentBracket: '',
      tournamentWinner: '',
      sliderScore: '',
      approveRejectApproved: r.approved ? 'true' : 'false',
      bestOfNChosen: '',
      multiAxisScoresJson: '',
      qualitativeText: '',
      signalSummary: r.approved ? 'approved' : 'rejected',
    });
  }

  for (const r of inputs.bestOfNResponses) {
    const chosen = inputs.modelsById.get(r.chosenCampaignModelId);
    events.push({
      createdAt: r.createdAt,
      mode: 'best_of_n',
      promptId: r.promptId,
      participantId: r.participantId,
      sessionId: r.sessionId,
      modelAId: r.chosenCampaignModelId,
      modelBId: null,
      tournamentBracket: '',
      tournamentWinner: '',
      sliderScore: '',
      approveRejectApproved: '',
      bestOfNChosen: 'true',
      multiAxisScoresJson: '',
      qualitativeText: '',
      signalSummary: `chosen: ${chosen?.displayName ?? '(unknown)'}`,
    });
  }

  for (const r of inputs.multiAxisResponses) {
    const scoresJson = JSON.stringify(r.scores);
    events.push({
      createdAt: r.createdAt,
      mode: 'multi_axis',
      promptId: r.promptId,
      participantId: r.participantId,
      sessionId: r.sessionId,
      modelAId: r.campaignModelId,
      modelBId: null,
      tournamentBracket: '',
      tournamentWinner: '',
      sliderScore: '',
      approveRejectApproved: '',
      bestOfNChosen: '',
      multiAxisScoresJson: scoresJson,
      qualitativeText: '',
      signalSummary: scoresJson,
    });
  }

  for (const r of inputs.qualitativeResponses) {
    const excerpt =
      r.text.length > 60 ? r.text.slice(0, 60) + '…' : r.text;
    events.push({
      createdAt: r.createdAt,
      mode: 'qualitative',
      promptId: r.promptId,
      participantId: r.participantId,
      sessionId: r.sessionId,
      modelAId: r.campaignModelId,
      modelBId: null,
      tournamentBracket: '',
      tournamentWinner: '',
      sliderScore: '',
      approveRejectApproved: '',
      bestOfNChosen: '',
      multiAxisScoresJson: '',
      qualitativeText: r.text,
      signalSummary: `text: ${excerpt}`,
    });
  }

  // Chronological sort — easier to read and matches the "stream of events"
  // mental model operators have when auditing a campaign.
  events.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const headers = csvHeadersForKind(inputs.campaign.kind);
  const header = [
    'campaign_name',
    'share_slug',
    'created_at',
    'mode',
    'prompt_order',
    'prompt_id',
    'prompt_category_tags',
    'participant_id',
    'email',
    'session_id',
    headers.modelADisplay,
    headers.modelAProviderId,
    headers.modelBDisplay,
    headers.modelBProviderId,
    'tournament_bracket',
    'tournament_winner',
    'slider_score',
    'approve_reject_approved',
    'best_of_n_chosen',
    'multi_axis_scores_json',
    'qualitative_text',
    'signal_summary',
  ];

  const rows = events.map((e) => {
    const prompt = inputs.promptsById.get(e.promptId);
    const participant = inputs.participantsById.get(e.participantId);
    const modelA = e.modelAId
      ? inputs.modelsById.get(e.modelAId)
      : undefined;
    const modelB = e.modelBId
      ? inputs.modelsById.get(e.modelBId)
      : undefined;
    return [
      inputs.campaign.name,
      inputs.campaign.shareSlug,
      e.createdAt.toISOString(),
      e.mode,
      prompt?.orderIndex ?? '',
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

  return [header, ...rows]
    .map((row) => row.map(escapeCsvCell).join(','))
    .join('\n');
}

function modelLabel(
  inputs: ResponsesExportInputs,
  campaignModelId: string | undefined,
): string {
  if (!campaignModelId) return '(unknown)';
  return inputs.modelsById.get(campaignModelId)?.displayName ?? '(unknown)';
}
