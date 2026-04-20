import {
  buildCampaignResultsCsv,
  buildCampaignParticipantsCsv,
} from '../export';

const CAMPAIGN = {
  id: 'campaign-1',
  shareSlug: 'support-qa',
  name: 'Support QA',
  description: 'QA sweep',
  categories: ['quality'],
  status: 'active' as const,
  votingMode: 'hybrid' as const,
  emailPromptMessage: null,
  createdAt: new Date('2026-04-17T09:00:00.000Z'),
  closedAt: null,
};

describe('buildCampaignResultsCsv', () => {
  it('serializes leaderboard rows into a downloadable csv', () => {
    const csv = buildCampaignResultsCsv({
      campaign: CAMPAIGN,
      stats: {
        promptCount: 4,
        modelCount: 4,
        totalVotes: 12,
        uniqueParticipants: 5,
        finishedParticipants: 3,
        identifiedParticipants: 2,
        anonymousParticipants: 3,
      },
      models: [
        {
          id: 'cm-1',
          providerModelId: 'openai/gpt-5',
          displayName: 'GPT-5',
        },
      ],
      prompts: [],
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
    expect(csv).toContain('identified_participants,anonymous_participants');
    expect(csv).toContain('Support QA,active,support-qa');
    expect(csv).toContain('GPT-5');
    expect(csv).toContain('openai/gpt-5');
    // Aggregate identified/anonymous counts are appended after existing stats
    expect(csv.trim().split('\n')[1]?.endsWith(',3,2,3')).toBe(true);
  });
});

describe('buildCampaignParticipantsCsv', () => {
  it('emits one row per participant, blank email for anonymous voters', () => {
    const csv = buildCampaignParticipantsCsv(CAMPAIGN, [
      {
        participantId: 'p-1',
        email: 'alice@acme.com',
        startedAt: new Date('2026-04-17T09:00:00.000Z'),
        finishedAt: new Date('2026-04-17T09:05:00.000Z'),
        votesCast: 16,
        isFinished: true,
      },
      {
        participantId: 'p-2',
        email: null,
        startedAt: new Date('2026-04-17T09:02:00.000Z'),
        finishedAt: null,
        votesCast: 4,
        isFinished: false,
      },
    ]);

    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe(
      'campaign_name,share_slug,participant_id,email,identity,started_at,finished_at,is_finished,votes_cast',
    );
    expect(lines[1]).toContain('alice@acme.com');
    expect(lines[1]).toContain('identified');
    expect(lines[1]).toContain('true');
    expect(lines[2]).toContain(',,anonymous,');
    expect(lines[2]).toContain('false');
  });

  it('handles empty participant list (header only)', () => {
    const csv = buildCampaignParticipantsCsv(CAMPAIGN, []);
    expect(csv.split('\n')).toHaveLength(1);
    expect(csv).toContain('participant_id');
  });
});
