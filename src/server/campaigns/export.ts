import type { CampaignDetailData } from './detail.js';

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

  return [
    [
      'campaign_name',
      'campaign_status',
      'share_slug',
      'rank',
      'model_display_name',
      'provider_model_id',
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
