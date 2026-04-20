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
      votingMode: 'hybrid' as const,
      emailPromptMessage: null,
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

  it('soft-deletes a campaign and bounces back to the campaigns list', async () => {
    const user = userEvent.setup();
    let isDeleted = false;

    installMockFetch([
      {
        url: '/api/campaigns/campaign-1',
        body: () => createCampaignDetail('active'),
      },
      {
        method: 'DELETE',
        url: '/api/campaigns/campaign-1',
        body: () => {
          isDeleted = true;
          return { ok: true, deletedAt: '2026-04-19T11:00:00.000Z' };
        },
      },
    ]);

    renderCampaignDashboard();

    fireEvent.click(
      await screen.findByRole('tab', { name: /settings/i }),
    );

    await user.click(
      await screen.findByRole('button', { name: /^delete$/i }),
    );

    const dialog = await screen.findByRole('dialog');
    const confirmButton = within(dialog).getByRole('button', {
      name: /delete campaign/i,
    });
    expect(confirmButton).toBeDisabled();

    await user.type(within(dialog).getByRole('textbox'), 'Support QA');
    expect(confirmButton).toBeEnabled();
    await user.click(confirmButton);

    await waitFor(() => {
      expect(isDeleted).toBe(true);
    });
  });

  it('PATCHes campaign metadata when the operator saves Edit details', async () => {
    const user = userEvent.setup();
    let lastPatchBody: { name?: string; description?: string } | null = null;

    installMockFetch([
      {
        url: '/api/campaigns/campaign-1',
        body: () => createCampaignDetail('active'),
      },
      {
        method: 'PATCH',
        url: '/api/campaigns/campaign-1',
        body: () => ({
          ok: true,
          campaign: { ...createCampaignDetail('active').campaign, name: 'Renamed' },
        }),
      },
    ]);

    // Capture the PATCH body for assertion (mockFetch doesn't expose init by
    // route; intercept via the global fetch one level deeper).
    const realFetch = window.fetch;
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH' && typeof init.body === 'string') {
        lastPatchBody = JSON.parse(init.body);
      }
      return realFetch(input, init);
    }) as typeof fetch;

    renderCampaignDashboard();

    fireEvent.click(
      await screen.findByRole('tab', { name: /settings/i }),
    );

    await user.click(
      await screen.findByRole('button', { name: /^edit$/i }),
    );

    const dialog = await screen.findByRole('dialog');
    const nameInput = within(dialog).getByLabelText(/^name$/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Renamed');

    await user.click(
      within(dialog).getByRole('button', { name: /save changes/i }),
    );

    await waitFor(() => {
      expect(lastPatchBody).toMatchObject({ name: 'Renamed' });
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

    // Export lives under the Settings tab.
    fireEvent.click(
      await screen.findByRole('tab', { name: /settings/i }),
    );

    // Two rows now share the "Export" button label; disambiguate via the
    // row title.
    const resultsRow = (await screen.findByText(/export results as csv/i))
      .closest('li') as HTMLElement;
    await user.click(
      within(resultsRow).getByRole('button', { name: /^export$/i }),
    );

    expect(openSpy).toHaveBeenCalledWith(
      '/api/campaigns/campaign-1/export',
      '_blank',
      'noopener',
    );
    expect(document.title).toBe('Support QA · ModelArena');
  });

  it('opens the participants csv endpoint from the operator page', async () => {
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

    fireEvent.click(
      await screen.findByRole('tab', { name: /settings/i }),
    );

    const participantsRow = (
      await screen.findByText(/export participants as csv/i)
    ).closest('li') as HTMLElement;
    await user.click(
      within(participantsRow).getByRole('button', { name: /^export$/i }),
    );

    expect(openSpy).toHaveBeenCalledWith(
      '/api/campaigns/campaign-1/export-participants',
      '_blank',
      'noopener',
    );
  });
});
