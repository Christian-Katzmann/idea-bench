import { screen } from '@testing-library/react';
import OperatorDashboard from '../OperatorDashboard';
import { renderWithRouter } from '../../test/renderWithProviders';
import { installMockFetch } from '../../test/mockFetch';

const dashboardFixture = {
  kpis: {
    activeCampaigns: 2,
    draftCampaigns: 1,
    totalVotes: 42,
    uniqueParticipants: 12,
  },
  recentCampaigns: [
    {
      id: 'campaign-1',
      name: 'Support QA',
      status: 'active',
      shareSlug: 'support-qa',
      createdAt: '2026-04-17T09:00:00.000Z',
      totalVotes: 20,
      uniqueParticipants: 6,
    },
  ],
  leaderboard: [
    {
      id: 'registry-gpt5',
      displayName: 'GPT-5',
      providerModelId: 'openai/gpt-5',
      availability: 'enabled',
      campaigns: 3,
      comparisons: 28,
      winRate: 0.68,
    },
  ],
  leaderboards: [
    {
      id: 'campaign-1',
      name: 'Support QA',
      shareSlug: 'support-qa',
      totalVotes: 20,
      updatedAt: '2026-04-17T09:30:00.000Z',
      ratings: [
        {
          campaignModelId: 'cm-1-gpt5',
          providerModelId: 'openai/gpt-5',
          displayName: 'GPT-5',
          rating: 1188,
          seRating: 24,
          ciLow: 1140,
          ciHigh: 1236,
          gameCount: 260,
          winRate: 0.6,
          stability: 'stable',
        },
        {
          campaignModelId: 'cm-1-sonnet',
          providerModelId: 'anthropic/claude-sonnet-4-6',
          displayName: 'Claude Sonnet 4.6',
          rating: 1020,
          seRating: 40,
          ciLow: 960,
          ciHigh: 1080,
          gameCount: 120,
          winRate: 0.45,
          stability: 'preliminary',
        },
      ],
    },
  ],
  attention: {
    draftsNeedingGeneration: [{ id: 'draft-1', name: 'Draft One' }],
    readyToLaunch: [{ id: 'draft-2', name: 'Launch Me' }],
    lowVoteVolume: [{ id: 'active-1', name: 'Quiet Campaign', totalVotes: 3 }],
  },
  recentMovement: [
    {
      id: 'event-1',
      kind: 'campaign_created',
      label: 'Support QA created',
      at: '2026-04-17T09:00:00.000Z',
      campaignId: 'campaign-1',
    },
  ],
};

describe('OperatorDashboard', () => {
  it('renders KPI cards, the live leaderboard, recent campaigns, and attention', async () => {
    installMockFetch([{ url: '/api/operator/dashboard', body: dashboardFixture }]);

    renderWithRouter(<OperatorDashboard />);

    expect(await screen.findByText(/active campaigns/i)).toBeInTheDocument();
    // Rich leaderboard: the featured campaign name appears as the tab label,
    // and the top model surfaces with its Bradley-Terry rating.
    expect(
      await screen.findAllByText(/Support QA/i),
    ).not.toHaveLength(0);
    expect(screen.getByText('1188')).toBeInTheDocument();
    expect(screen.getByText(/needs attention/i)).toBeInTheDocument();
    expect(document.title).toBe('Dashboard · ModelArena');
  });
});
