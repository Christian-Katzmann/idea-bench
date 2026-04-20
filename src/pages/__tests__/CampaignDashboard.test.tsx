import { screen, render, waitFor, within, fireEvent } from '@testing-library/react';
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
    prompts: [
      {
        id: 'p-1',
        orderIndex: 0,
        text: 'Summarize this support ticket in two sentences.',
        context: 'You are a support quality auditor.',
        categoryTags: ['summarization'],
      },
      {
        id: 'p-2',
        orderIndex: 1,
        text: 'Reply professionally to the customer.',
        context: null,
        categoryTags: [],
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

    renderCampaignDashboard();

    // Close campaign lives under the Settings tab, not the default Overview.
    // Base-UI's tab activation runs on mousedown/pointerdown, so fireEvent
    // beats userEvent.click here — userEvent's pointer sequence doesn't
    // always flip the tab in jsdom.
    fireEvent.click(
      await screen.findByRole('tab', { name: /settings/i }),
    );

    // Open the destructive confirmation modal from the Actions list.
    await user.click(
      await screen.findByRole('button', { name: /close campaign/i }),
    );

    // Modal pops with a typed-name guard; confirm is disabled until match.
    const dialog = await screen.findByRole('dialog');
    const confirmButton = within(dialog).getByRole('button', {
      name: /close campaign/i,
    });
    expect(confirmButton).toBeDisabled();

    await user.type(
      within(dialog).getByRole('textbox'),
      'Support QA',
    );
    expect(confirmButton).toBeEnabled();
    await user.click(confirmButton);

    // After the mutation, the refetched campaign status flips to completed
    // and the header badge shows COMPLETED (toast isn't mounted in this
    // minimal test harness; the badge is the stable signal).
    await waitFor(() => {
      expect(screen.getAllByText(/completed/i).length).toBeGreaterThan(0);
    });
    expect(document.title).toBe('Support QA · ModelArena');
  });

  it('renders prompt text + tags + collapsible context on the Prompts tab', async () => {
    const user = userEvent.setup();
    installMockFetch([
      {
        url: '/api/campaigns/campaign-1',
        body: createCampaignDetail('active'),
      },
    ]);

    renderCampaignDashboard();

    fireEvent.click(
      await screen.findByRole('tab', { name: /prompts/i }),
    );

    expect(
      await screen.findByText(
        /summarize this support ticket in two sentences\./i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/reply professionally to the customer\./i),
    ).toBeInTheDocument();
    expect(screen.getByText('summarization')).toBeInTheDocument();

    // Context is hidden behind a "Show context" toggle. The auditor copy
    // shouldn't be visible until the user expands it.
    expect(
      screen.queryByText(/you are a support quality auditor\./i),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /show context/i }),
    );

    expect(
      await screen.findByText(/you are a support quality auditor\./i),
    ).toBeInTheDocument();
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

    // Export lives under the Settings tab.
    fireEvent.click(
      await screen.findByRole('tab', { name: /settings/i }),
    );

    // ActionRow renders a row with the descriptive title + a short button
    // label ("Export"). findByRole matches the button's accessible name.
    await user.click(
      await screen.findByRole('button', { name: /^export$/i }),
    );

    expect(openSpy).toHaveBeenCalledWith(
      '/api/campaigns/campaign-1/export',
      '_blank',
      'noopener',
    );
    expect(document.title).toBe('Support QA · ModelArena');
  });
});
