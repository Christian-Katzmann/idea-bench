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
  it('renders KPI cards, recent campaigns, and the cross-campaign leaderboard', async () => {
    installMockFetch([{ url: '/api/dashboard', body: dashboardFixture }]);

    renderWithRouter(<OperatorDashboard />);

    expect(await screen.findByText(/active campaigns/i)).toBeInTheDocument();
    expect(screen.getByText(/top models/i)).toBeInTheDocument();
    expect(screen.getByText(/needs attention/i)).toBeInTheDocument();
    expect(document.title).toBe('Dashboard · ModelArena');
  });
});
