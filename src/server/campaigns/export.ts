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
    ],
    ...rows,
  ]
    .map((row) => row.map(escapeCsvCell).join(','))
    .join('\n');
}

function escapeCsvCell(value: unknown): string {
  const text = String(value ?? '');
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}
