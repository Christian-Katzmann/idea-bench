import { buildCampaignResultsCsv } from '../export';

describe('buildCampaignResultsCsv', () => {
  it('serializes leaderboard rows into a downloadable csv', () => {
    const csv = buildCampaignResultsCsv({
      campaign: {
        id: 'campaign-1',
        shareSlug: 'support-qa',
        name: 'Support QA',
        description: 'QA sweep',
        categories: ['quality'],
        status: 'active',
        createdAt: new Date('2026-04-17T09:00:00.000Z'),
        closedAt: null,
      },
      stats: {
        promptCount: 4,
        modelCount: 4,
        totalVotes: 12,
        uniqueParticipants: 5,
        finishedParticipants: 3,
      },
      models: [
        {
          id: 'cm-1',
          providerModelId: 'openai/gpt-5',
          displayName: 'GPT-5',
        },
      ],
      ratings: [
        {
          category: 'overall',
          campaignModelId: 'cm-1',
          providerModelId: 'openai/gpt-5',
          displayName: 'GPT-5',
          rating: 1102,
          seRating: null,
          btStrength: null,
          ciLow: 1078,
          ciHigh: 1126,
          winRate: 0.67,
          winCount: 4,
          lossCount: 1,
          tieCount: 1,
          gameCount: 6,
          gamesPlayed: 6,
          stability: 'stable',
          computedAt: new Date('2026-04-17T10:00:00.000Z'),
        },
      ],
    });

    expect(csv).toContain('campaign_name,campaign_status,share_slug');
    expect(csv).toContain('Support QA,active,support-qa');
    expect(csv).toContain('GPT-5');
    expect(csv).toContain('openai/gpt-5');
  });
});
