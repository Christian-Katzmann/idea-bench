import { buildDashboardSummary } from '../summary';

function createSnapshot() {
  return {
    registry: [
      {
        id: 'registry-gpt5',
        providerModelId: 'openai/gpt-5',
        displayName: 'GPT-5',
        enabled: true,
        legacy: false,
      },
      {
        id: 'registry-sonnet',
        providerModelId: 'anthropic/claude-sonnet-4-6',
        displayName: 'Claude Sonnet 4.6',
        enabled: false,
        legacy: false,
      },
    ],
    campaigns: [
      {
        id: 'campaign-active',
        name: 'Active Campaign',
        shareSlug: 'active-slug',
        description: '',
        status: 'active',
        createdAt: new Date('2026-04-16T10:00:00.000Z'),
      },
      {
        id: 'campaign-draft',
        name: 'Draft Campaign',
        shareSlug: 'draft-slug',
        description: '',
        status: 'draft',
        createdAt: new Date('2026-04-17T10:00:00.000Z'),
      },
    ],
    prompts: [
      { id: 'prompt-active', campaignId: 'campaign-active' },
      { id: 'prompt-draft', campaignId: 'campaign-draft' },
    ],
    participants: [
      {
        id: 'participant-1',
        campaignId: 'campaign-active',
        startedAt: new Date('2026-04-16T11:00:00.000Z'),
        finishedAt: new Date('2026-04-16T11:15:00.000Z'),
      },
    ],
    campaignModels: [
      {
        id: 'cm-active-gpt5',
        campaignId: 'campaign-active',
        providerModelId: 'openai/gpt-5',
        displayName: 'GPT-5',
      },
      {
        id: 'cm-active-sonnet',
        campaignId: 'campaign-active',
        providerModelId: 'anthropic/claude-sonnet-4-6',
        displayName: 'Claude Sonnet 4.6',
      },
      {
        id: 'cm-draft-gpt5',
        campaignId: 'campaign-draft',
        providerModelId: 'openai/gpt-5',
        displayName: 'GPT-5',
      },
      {
        id: 'cm-draft-sonnet',
        campaignId: 'campaign-draft',
        providerModelId: 'anthropic/claude-sonnet-4-6',
        displayName: 'Claude Sonnet 4.6',
      },
      {
        id: 'cm-draft-gemini',
        campaignId: 'campaign-draft',
        providerModelId: 'google/gemini-2.5-pro',
        displayName: 'Gemini 2.5 Pro',
      },
      {
        id: 'cm-draft-haiku',
        campaignId: 'campaign-draft',
        providerModelId: 'anthropic/claude-haiku-4-5',
        displayName: 'Claude Haiku 4.5',
      },
    ],
    generations: [
      {
        id: 'gen-a-gpt5',
        campaignModelId: 'cm-active-gpt5',
        promptId: 'prompt-active',
        output: 'good',
        error: null,
      },
      {
        id: 'gen-a-sonnet',
        campaignModelId: 'cm-active-sonnet',
        promptId: 'prompt-active',
        output: 'ok',
        error: null,
      },
      {
        id: 'gen-d-gpt5',
        campaignModelId: 'cm-draft-gpt5',
        promptId: 'prompt-draft',
        output: 'ready',
        error: null,
      },
      {
        id: 'gen-d-sonnet',
        campaignModelId: 'cm-draft-sonnet',
        promptId: 'prompt-draft',
        output: 'ready',
        error: null,
      },
      {
        id: 'gen-d-gemini',
        campaignModelId: 'cm-draft-gemini',
        promptId: 'prompt-draft',
        output: 'ready',
        error: null,
      },
      {
        id: 'gen-d-haiku',
        campaignModelId: 'cm-draft-haiku',
        promptId: 'prompt-draft',
        output: 'ready',
        error: null,
      },
    ],
    votes: [
      {
        id: 'vote-1',
        campaignId: 'campaign-active',
        generationAId: 'gen-a-gpt5',
        generationBId: 'gen-a-sonnet',
        winner: 'A',
        createdAt: new Date('2026-04-16T11:10:00.000Z'),
      },
      {
        id: 'vote-2',
        campaignId: 'campaign-active',
        generationAId: 'gen-a-gpt5',
        generationBId: 'gen-a-sonnet',
        winner: 'tie',
        createdAt: new Date('2026-04-16T11:12:00.000Z'),
      },
    ],
    ratings: [
      {
        campaignId: 'campaign-active',
        campaignModelId: 'cm-active-gpt5',
        category: 'overall',
        rating: 1180,
        seRating: 22,
        ciLow: 1135,
        ciHigh: 1225,
        gameCount: 2,
        computedAt: new Date('2026-04-16T11:13:00.000Z'),
      },
      {
        campaignId: 'campaign-active',
        campaignModelId: 'cm-active-sonnet',
        category: 'overall',
        rating: 980,
        seRating: 22,
        ciLow: 935,
        ciHigh: 1025,
        gameCount: 2,
        computedAt: new Date('2026-04-16T11:13:00.000Z'),
      },
    ],
  };
}

describe('buildDashboardSummary', () => {
  it('builds counts, attention buckets, and a cross-campaign leaderboard from operator data', async () => {
    const summary = await buildDashboardSummary(createSnapshot());

    expect(summary.kpis.activeCampaigns).toBe(1);
    expect(summary.kpis.draftCampaigns).toBe(1);
    expect(summary.kpis.totalVotes).toBe(2);
    expect(summary.attention.readyToLaunch).toHaveLength(1);
    expect(summary.leaderboard[0]).toMatchObject({
      displayName: 'GPT-5',
      availability: 'enabled',
    });
  });

  it('emits a featured leaderboard per active campaign, sorted by rating desc, with CI bounds and tier', async () => {
    const summary = await buildDashboardSummary(createSnapshot());

    expect(summary.leaderboards).toHaveLength(1);
    const [featured] = summary.leaderboards;
    expect(featured.id).toBe('campaign-active');
    expect(featured.name).toBe('Active Campaign');
    expect(featured.totalVotes).toBe(2);
    expect(featured.updatedAt).toBe('2026-04-16T11:13:00.000Z');
    expect(featured.ratings.map((row) => row.displayName)).toEqual([
      'GPT-5',
      'Claude Sonnet 4.6',
    ]);
    expect(featured.ratings[0]).toMatchObject({
      rating: 1180,
      ciLow: 1135,
      ciHigh: 1225,
      gameCount: 2,
      stability: 'directional',
    });
  });

  it('returns an empty leaderboards array when there are no active campaigns with signal', async () => {
    const snapshot = createSnapshot();
    snapshot.campaigns = snapshot.campaigns.filter(
      (c) => c.status !== 'active',
    );
    const summary = await buildDashboardSummary(snapshot);
    expect(summary.leaderboards).toEqual([]);
  });
});
