import { screen, render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CampaignDashboard from '../CampaignDashboard';
import { installMockFetch } from '../../test/mockFetch';

function renderCampaignDashboard(route = '/campaign/campaign-1') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/campaign/:id" element={<CampaignDashboard />} />
          <Route path="/login" element={<div>login</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function createCampaignDetail(status: 'active' | 'completed' = 'active') {
  return {
    campaign: {
      id: 'campaign-1',
      shareSlug: 'support-qa',
      name: 'Support QA',
      description: 'QA sweep',
      categories: ['quality'],
      status,
      createdAt: '2026-04-17T09:00:00.000Z',
      closedAt:
        status === 'completed' ? '2026-04-17T10:00:00.000Z' : null,
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
        rating: 1102,
        seRating: 8.2,
        btStrength: 1.2,
        ciLow: 1078,
        ciHigh: 1126,
        gameCount: 6,
        gamesPlayed: 6,
        winCount: 4,
        lossCount: 1,
        tieCount: 1,
        winRate: 0.67,
        stability: 'stable',
        computedAt: '2026-04-17T10:00:00.000Z',
        campaignModelId: 'cm-1',
        providerModelId: 'openai/gpt-5',
        displayName: 'GPT-5',
      },
    ],
  };
}

describe('CampaignDashboard', () => {
  it('closes an active campaign from the operator page', async () => {
    const user = userEvent.setup();
    let isClosed = false;

    installMockFetch([
      {
        url: '/api/campaigns/campaign-1',
        body: () => createCampaignDetail(isClosed ? 'completed' : 'active'),
      },
      {
        method: 'POST',
        url: '/api/campaigns/campaign-1/close',
        body: () => {
          isClosed = true;
          return { ok: true, status: 'completed', closedAt: '2026-04-17T10:00:00.000Z' };
        },
      },
    ]);

    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderCampaignDashboard();

    await user.click(await screen.findByRole('button', { name: /^close$/i }));

    await waitFor(() => {
      expect(screen.getByText(/closed/i)).toBeInTheDocument();
    });
  });

  it('opens the csv export endpoint from the operator page', async () => {
    const user = userEvent.setup();
    installMockFetch([
      {
        url: '/api/campaigns/campaign-1',
        body: createCampaignDetail('active'),
      },
    ]);
    const openSpy = vi
      .spyOn(window, 'open')
      .mockImplementation(() => null);

    renderCampaignDashboard();

    await user.click(await screen.findByRole('button', { name: /export csv/i }));

    expect(openSpy).toHaveBeenCalledWith(
      '/api/campaigns/campaign-1/export',
      '_blank',
      'noopener',
    );
  });
});
