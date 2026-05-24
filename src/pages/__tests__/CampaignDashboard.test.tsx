import { screen, render, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CampaignDashboard from '../CampaignDashboard';
import { installMockFetch } from '../../test/mockFetch';
import { arenaOnboardingStorageKey } from '../../components/onboarding/arena-onboarding';

// Suppress the first-visit arena onboarding for every test in this
// file — it's covered by its own component test and would otherwise
// auto-open over the dashboard, intercepting `findByRole('dialog')`
// queries that target action confirmations.
beforeEach(() => {
  window.localStorage.setItem(
    arenaOnboardingStorageKey('model'),
    new Date().toISOString(),
  );
});

afterEach(() => {
  window.localStorage.clear();
});

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

function createCampaignDetail(
  status: 'active' | 'completed' = 'active',
  kind: 'model' | 'prompt' | 'system_prompt' = 'model',
) {
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
      // Plan 04 — kind pill in the header reads from this field.
      kind,
      pinnedProviderModelId:
        kind === 'model' ? null : 'anthropic/claude-opus-4-6',
      pinnedSystemPrompt: null,
      standaloneVariants: false,
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
        variantText: null,
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
    perInputBestOfN: [],
  };
}

/**
 * Plan 05 P1-B fixture — prompt-arena detail with two variant
 * contestants, two inputs (Best-of-N mode), and per-input pick counts
 * that diverge so cell content can be asserted distinctly.
 */
function createPromptArenaDetail(opts: {
  longVariant?: boolean;
} = {}) {
  const longBody =
    'You are a senior translator. ' + 'x'.repeat(2100) + ' {{input}}';
  const variantA = opts.longVariant
    ? longBody
    : 'You are a senior translator. {{input}}';
  return {
    campaign: {
      id: 'campaign-1',
      shareSlug: 'prompt-iter',
      name: 'Prompt iteration',
      description: 'Compare phrasings on GPT-5',
      categories: ['translation'],
      status: 'active' as const,
      votingMode: 'hybrid' as const,
      emailPromptMessage: null,
      createdAt: '2026-04-17T09:00:00.000Z',
      closedAt: null,
      kind: 'prompt' as const,
      pinnedProviderModelId: 'openai/gpt-5',
      pinnedSystemPrompt: null,
      standaloneVariants: false,
    },
    stats: {
      promptCount: 2,
      modelCount: 2,
      totalVotes: 8,
      uniqueParticipants: 4,
      finishedParticipants: 4,
      identifiedParticipants: 2,
      anonymousParticipants: 2,
    },
    models: [
      {
        id: 'cm-1',
        providerModelId: '',
        displayName: 'Senior',
        variantText: variantA,
      },
      {
        id: 'cm-2',
        providerModelId: '',
        displayName: 'Junior',
        variantText: 'You are a junior translator. {{input}}',
      },
    ],
    prompts: [
      {
        id: 'p-1',
        orderIndex: 0,
        text: 'Translate: hello world.',
        context: null,
        categoryTags: [],
        mode: 'best_of_n' as const,
      },
      {
        id: 'p-2',
        orderIndex: 1,
        text: 'Translate: how are you today?',
        context: null,
        categoryTags: [],
        mode: 'best_of_n' as const,
      },
    ],
    ratings: [
      {
        category: 'overall',
        source: 'both' as const,
        personaId: null,
        rating: 62,
        seRating: null,
        btStrength: null,
        ciLow: 50,
        ciHigh: 74,
        gameCount: 8,
        gamesPlayed: 8,
        winCount: 5,
        lossCount: 3,
        tieCount: 0,
        winRate: 0.625,
        stability: 'preliminary' as const,
        computedAt: '2026-04-17T10:00:00.000Z',
        campaignModelId: 'cm-1',
        providerModelId: 'openai/gpt-5',
        displayName: 'Senior',
      },
      {
        category: 'overall',
        source: 'both' as const,
        personaId: null,
        rating: 38,
        seRating: null,
        btStrength: null,
        ciLow: 26,
        ciHigh: 50,
        gameCount: 8,
        gamesPlayed: 8,
        winCount: 3,
        lossCount: 5,
        tieCount: 0,
        winRate: 0.375,
        stability: 'preliminary' as const,
        computedAt: '2026-04-17T10:00:00.000Z',
        campaignModelId: 'cm-2',
        providerModelId: 'openai/gpt-5',
        displayName: 'Junior',
      },
    ],
    perInputBestOfN: [
      // Input 1: Senior wins 3 of 4
      { promptId: 'p-1', campaignModelId: 'cm-1', pickCount: 3 },
      { promptId: 'p-1', campaignModelId: 'cm-2', pickCount: 1 },
      // Input 2: split evenly
      { promptId: 'p-2', campaignModelId: 'cm-1', pickCount: 2 },
      { promptId: 'p-2', campaignModelId: 'cm-2', pickCount: 2 },
    ],
  };
}

/**
 * Plan 06 fixture — system-prompt arena detail with two variants,
 * three slider-mode test prompts, populated heatmap cells, and
 * slider:overall ratings (the default per-mode aggregate). The
 * ratings include a per-persona row so the `personaGroups` widening
 * (P2-9) is exercised when the simulated source filter is on.
 */
function createSystemPromptArenaDetail() {
  return {
    campaign: {
      id: 'campaign-1',
      shareSlug: 'brand-voice',
      name: 'Brand voice',
      description: 'Compare voices on GPT-5',
      categories: ['support', 'tone'],
      status: 'active' as const,
      votingMode: 'hybrid' as const,
      emailPromptMessage: null,
      createdAt: '2026-04-17T09:00:00.000Z',
      closedAt: null,
      kind: 'system_prompt' as const,
      pinnedProviderModelId: 'openai/gpt-5',
      pinnedSystemPrompt: null,
      standaloneVariants: false,
    },
    stats: {
      promptCount: 3,
      modelCount: 2,
      totalVotes: 24,
      uniqueParticipants: 8,
      finishedParticipants: 6,
      identifiedParticipants: 4,
      anonymousParticipants: 4,
    },
    models: [
      {
        id: 'cm-1',
        providerModelId: '',
        displayName: 'Warm Pro',
        variantText: 'You are a warm, professional brand voice. Be concise.',
      },
      {
        id: 'cm-2',
        providerModelId: '',
        displayName: 'Playful',
        variantText: 'You are a playful, witty brand voice.',
      },
    ],
    prompts: [
      {
        id: 'p-1',
        orderIndex: 0,
        text: 'Draft a polite refusal to a refund request.',
        context: null,
        categoryTags: [],
        mode: 'slider' as const,
      },
      {
        id: 'p-2',
        orderIndex: 1,
        text: 'Reply to an angry customer about a late delivery.',
        context: null,
        categoryTags: [],
        mode: 'slider' as const,
      },
      {
        id: 'p-3',
        orderIndex: 2,
        text: 'Welcome a new subscriber to the newsletter.',
        context: null,
        categoryTags: [],
        mode: 'slider' as const,
      },
    ],
    ratings: [
      // Across-suite slider rollups (rating stored ×100 per ratings.ts).
      {
        category: 'slider:overall',
        source: 'both' as const,
        personaId: null,
        rating: 740,
        seRating: 12,
        btStrength: null,
        ciLow: 715,
        ciHigh: 765,
        gameCount: 18,
        gamesPlayed: 18,
        winCount: 0,
        lossCount: 0,
        tieCount: 0,
        winRate: null,
        stability: 'stable' as const,
        computedAt: '2026-04-17T10:00:00.000Z',
        campaignModelId: 'cm-1',
        providerModelId: 'openai/gpt-5',
        displayName: 'Warm Pro',
      },
      {
        category: 'slider:overall',
        source: 'both' as const,
        personaId: null,
        rating: 612,
        seRating: 18,
        btStrength: null,
        ciLow: 575,
        ciHigh: 649,
        gameCount: 18,
        gamesPlayed: 18,
        winCount: 0,
        lossCount: 0,
        tieCount: 0,
        winRate: null,
        stability: 'stable' as const,
        computedAt: '2026-04-17T10:00:00.000Z',
        campaignModelId: 'cm-2',
        providerModelId: 'openai/gpt-5',
        displayName: 'Playful',
      },
      // Per-persona slider rollup (P2-9 — must surface in PerPersonaRollup
      // under simulated source filter; pre-fix this row was filtered out
      // by the `category === 'overall'` constraint).
      {
        category: 'slider:overall',
        source: 'simulated' as const,
        personaId: 'persona-cfo',
        rating: 720,
        seRating: 14,
        btStrength: null,
        ciLow: 690,
        ciHigh: 750,
        gameCount: 9,
        gamesPlayed: 9,
        winCount: 0,
        lossCount: 0,
        tieCount: 0,
        winRate: null,
        stability: 'stable' as const,
        computedAt: '2026-04-17T10:00:00.000Z',
        campaignModelId: 'cm-1',
        providerModelId: 'openai/gpt-5',
        displayName: 'Warm Pro',
      },
    ],
    perInputBestOfN: [],
    heatmapCells: [
      // Warm Pro: solid scores across all three prompts.
      {
        promptId: 'p-1',
        campaignModelId: 'cm-1',
        score: 8.2,
        ciLow: 7.7,
        ciHigh: 8.7,
        sampleSize: 6,
      },
      {
        promptId: 'p-2',
        campaignModelId: 'cm-1',
        score: 7.5,
        ciLow: 6.9,
        ciHigh: 8.1,
        sampleSize: 6,
      },
      {
        promptId: 'p-3',
        campaignModelId: 'cm-1',
        score: 6.8,
        ciLow: 6.3,
        ciHigh: 7.3,
        sampleSize: 6,
      },
      // Playful: high on welcome, low on refusal.
      {
        promptId: 'p-1',
        campaignModelId: 'cm-2',
        score: 4.0,
        ciLow: 3.5,
        ciHigh: 4.5,
        sampleSize: 6,
      },
      {
        promptId: 'p-2',
        campaignModelId: 'cm-2',
        score: 5.6,
        ciLow: 5.1,
        ciHigh: 6.1,
        sampleSize: 6,
      },
      // p-3 deliberately missing for cm-2 — tests sparse-cell handling.
    ],
  };
}

describe('CampaignDashboard', () => {
  // Plan 04 — kind pill on the dashboard header. The dashboard
  // component reads `data.campaign.kind` and renders a small badge
  // alongside the status badge. The fixture below stubs each of the
  // three kinds; the API still rejects creating prompt/system_prompt
  // campaigns in V1, but the dashboard component should handle the
  // payload shape so Plans 05/06 can light it up by flipping a flag.
  describe('kind pill in header', () => {
    it.each([
      ['model', 'Model arena'] as const,
      ['prompt', 'Prompt arena'] as const,
      ['system_prompt', 'System-prompt arena'] as const,
    ])('renders "%s" pill as %s', async (kind, expectedLabel) => {
      // Suppress onboarding for this kind too — the storage key is
      // kind-aware (`arenaOnboardingStorageKey('prompt')` etc.).
      window.localStorage.setItem(
        arenaOnboardingStorageKey(kind as 'model' | 'prompt' | 'system_prompt'),
        new Date().toISOString(),
      );
      installMockFetch([
        {
          url: '/api/campaigns/campaign-1',
          body: createCampaignDetail('active', kind),
        },
      ]);

      renderCampaignDashboard();

      // The pill renders the kind label as a static span; wait for it
      // to appear after the campaign data loads.
      expect(await screen.findByText(expectedLabel)).toBeInTheDocument();
    });
  });

  // F-002: invalid / deleted campaign id used to surface as an infinite
  // "Loading…" because the server crashed on the non-UUID. With the fixed
  // handler the client gets a single 404 and the dashboard renders a
  // dedicated empty state — no spinner, no retry storm, and an obvious
  // way back.
  it('renders a "Campaign not found" empty state when the API returns 404', async () => {
    installMockFetch([
      {
        url: '/api/campaigns/campaign-1',
        status: 404,
        body: { error: 'campaign_not_found' },
      },
    ]);

    renderCampaignDashboard();

    expect(
      await screen.findByRole('heading', { name: /campaign not found/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/may have been deleted, or the URL is wrong/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /back to campaigns/i }),
    ).toBeInTheDocument();
    // The skeleton must NOT also be on screen — the empty state is the
    // whole UI, not a layer on top of the loading shell.
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });

  // F-002 sister-case: a genuine 5xx should still render an error state,
  // but with a Retry button instead of silently hammering the API.
  it('renders an error state with a Retry button on 5xx', async () => {
    const user = userEvent.setup();
    let attempts = 0;
    installMockFetch([
      {
        url: '/api/campaigns/campaign-1',
        body: () => {
          attempts += 1;
          if (attempts === 1) return { error: 'internal_error' };
          return createCampaignDetail('active');
        },
        status: 500,
        // Flip to success after the first attempt by overriding status via
        // a second route definition is awkward in this mock; instead we
        // just verify the Retry button is wired and re-issues the GET.
      },
    ]);

    renderCampaignDashboard();

    expect(
      await screen.findByText(/failed to load campaign/i),
    ).toBeInTheDocument();
    const retryButton = screen.getByRole('button', { name: /retry/i });
    expect(retryButton).toBeInTheDocument();

    await user.click(retryButton);

    // Clicking Retry fires another fetch — assert via the attempt counter.
    await waitFor(() => {
      expect(attempts).toBeGreaterThan(1);
    });
  });

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
    expect(document.title).toBe('Support QA · ïdea Bench');
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
    expect(document.title).toBe('Support QA · ïdea Bench');
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

  // Plan 05 P1-B — prompt-arena dashboard surface (variant text panel
  // + per-input drilldown). The fixture above (`createPromptArenaDetail`)
  // is the only payload these tests need; ratings/dashboard plumbing
  // is shared with the model-arena tests.
  describe("prompt-arena surface (kind='prompt')", () => {
    beforeEach(() => {
      // Suppress prompt-arena onboarding for these cases.
      window.localStorage.setItem(
        arenaOnboardingStorageKey('prompt'),
        new Date().toISOString(),
      );
    });

    it('renders the variant text panel with each variant body and rank', async () => {
      installMockFetch([
        {
          url: '/api/campaigns/campaign-1',
          body: createPromptArenaDetail(),
        },
      ]);
      renderCampaignDashboard();

      // Land on the Ratings tab where the prompt-arena surface lives.
      fireEvent.click(
        await screen.findByRole('tab', { name: /ratings/i }),
      );

      // The "Variant text" header is the canonical proof the panel
      // mounted.
      expect(
        await screen.findByRole('heading', { name: /^variant text$/i }),
      ).toBeInTheDocument();

      // Both variant bodies render verbatim — `{{input}}` literal
      // included.
      const bodies = await screen.findAllByTestId('variant-text-body');
      expect(bodies).toHaveLength(2);
      expect(bodies[0]).toHaveTextContent(
        'You are a senior translator. {{input}}',
      );
      expect(bodies[1]).toHaveTextContent(
        'You are a junior translator. {{input}}',
      );
    });

    it('caps long variants with a max-height scroll instead of a Compare modal', async () => {
      installMockFetch([
        {
          url: '/api/campaigns/campaign-1',
          body: createPromptArenaDetail({ longVariant: true }),
        },
      ]);
      renderCampaignDashboard();

      fireEvent.click(
        await screen.findByRole('tab', { name: /ratings/i }),
      );

      const bodies = await screen.findAllByTestId('variant-text-body');
      // First body is the long variant; expect the max-height +
      // overflow-y-auto utility classes (deferring the focused
      // Compare modal per P1-B's allowance).
      expect(bodies[0].className).toMatch(/max-h-64/);
      expect(bodies[0].className).toMatch(/overflow-y-auto/);
      // The short variant gets neither.
      expect(bodies[1].className).not.toMatch(/max-h-64/);
    });

    it('renders the per-input drilldown table with Best-of-N pick counts', async () => {
      installMockFetch([
        {
          url: '/api/campaigns/campaign-1',
          body: createPromptArenaDetail(),
        },
      ]);
      renderCampaignDashboard();

      fireEvent.click(
        await screen.findByRole('tab', { name: /ratings/i }),
      );

      // The "By input" section heading.
      expect(
        await screen.findByRole('heading', { name: /^by input$/i }),
      ).toBeInTheDocument();

      // Row 1 → input p-1: Senior 3 (75%), Junior 1 (25%), Total 4
      const row1 = (
        await screen.findByText(/Translate: hello world\./)
      ).closest('tr');
      expect(row1).not.toBeNull();
      expect(within(row1 as HTMLElement).getByText(/^3$/)).toBeInTheDocument();
      expect(within(row1 as HTMLElement).getByText(/\(75%\)/)).toBeInTheDocument();
      expect(within(row1 as HTMLElement).getByText(/\(25%\)/)).toBeInTheDocument();
    });

    it('lazily fetches outputs when a drilldown row is clicked', async () => {
      const generationsRequests: string[] = [];
      installMockFetch([
        {
          url: '/api/campaigns/campaign-1',
          body: createPromptArenaDetail(),
        },
        {
          // Capture the URL so we can assert the promptId was forwarded.
          method: 'GET',
          url: (url) => {
            if (
              url.startsWith('/api/campaigns/campaign-1/generations?')
            ) {
              generationsRequests.push(url);
              return true;
            }
            return false;
          },
          body: {
            promptId: 'p-1',
            generations: [
              {
                id: 'g-1',
                campaignModelId: 'cm-1',
                output: 'Bonjour le monde.',
                error: null,
                tokensIn: 12,
                tokensOut: 4,
                latencyMs: 200,
                completedAt: '2026-04-17T10:00:00.000Z',
              },
              {
                id: 'g-2',
                campaignModelId: 'cm-2',
                output: 'Salut le monde !',
                error: null,
                tokensIn: 12,
                tokensOut: 4,
                latencyMs: 220,
                completedAt: '2026-04-17T10:00:00.000Z',
              },
            ],
          },
        },
      ]);
      renderCampaignDashboard();

      fireEvent.click(
        await screen.findByRole('tab', { name: /ratings/i }),
      );

      const row = (
        await screen.findByText(/Translate: hello world\./)
      ).closest('tr');
      fireEvent.click(row as HTMLElement);

      // Lazy-loaded outputs render side by side.
      expect(await screen.findByText('Bonjour le monde.')).toBeInTheDocument();
      expect(screen.getByText('Salut le monde !')).toBeInTheDocument();

      // The promptId was forwarded as a query param.
      expect(generationsRequests).toHaveLength(1);
      expect(generationsRequests[0]).toContain('promptId=p-1');
    });

    it('shows a friendly empty state when prompt-arena has no inputs', async () => {
      const detail = createPromptArenaDetail();
      detail.prompts = [];
      detail.perInputBestOfN = [];
      installMockFetch([
        { url: '/api/campaigns/campaign-1', body: detail },
      ]);
      renderCampaignDashboard();

      fireEvent.click(
        await screen.findByRole('tab', { name: /ratings/i }),
      );

      expect(
        await screen.findByText(/Standalone variants — no inputs/i),
      ).toBeInTheDocument();
    });
  });

  // Plan 06 P2-A/B regression coverage. The wedge surfaces
  // (heatmap toggle, suite-size badge, system-prompt variant text
  // panel, persona rollup widening) only render under
  // `kind='system_prompt'`. The component-level tests already pin
  // down each surface in isolation; this block is the integration
  // glue — confirms the dashboard mounts everything in the right
  // configuration for a real system-prompt-arena payload.
  describe("system-prompt-arena surface (kind='system_prompt')", () => {
    beforeEach(() => {
      // Suppress the kind-aware onboarding modal for this kind too.
      window.localStorage.setItem(
        arenaOnboardingStorageKey('system_prompt'),
        new Date().toISOString(),
      );
    });

    it('renders the leaderboard view toggle and the suite-size badge in the Ratings tab', async () => {
      installMockFetch([
        {
          url: '/api/campaigns/campaign-1',
          body: createSystemPromptArenaDetail(),
        },
      ]);
      renderCampaignDashboard();

      // Land on Ratings; the toggle + badge live there.
      fireEvent.click(
        await screen.findByRole('tab', { name: /ratings/i }),
      );

      // Toggle exposes both views; "Across suite" is the default.
      const tablist = await screen.findByRole('tablist', {
        name: /leaderboard view/i,
      });
      expect(
        within(tablist).getByRole('tab', { name: /across suite/i }),
      ).toHaveAttribute('aria-selected', 'true');
      expect(
        within(tablist).getByRole('tab', { name: /by prompt \(heatmap\)/i }),
      ).toHaveAttribute('aria-selected', 'false');

      // Suite-size badge announces N=3 (matches the fixture's 3 prompts).
      // Scope inside the badge's container — its title attribute is a
      // stable anchor for screen-reader explainer copy.
      const badge = document.querySelector('[title*="error bars"]');
      expect(badge).not.toBeNull();
      expect(badge!.textContent).toMatch(/based on/i);
      expect(badge!.textContent).toMatch(/3/);
      expect(badge!.textContent).toMatch(/test prompts/i);
    });

    it('switches to the heatmap view when the operator flips the toggle', async () => {
      const user = userEvent.setup();
      installMockFetch([
        {
          url: '/api/campaigns/campaign-1',
          body: createSystemPromptArenaDetail(),
        },
      ]);
      renderCampaignDashboard();

      fireEvent.click(
        await screen.findByRole('tab', { name: /ratings/i }),
      );
      // Default view: rollup. The slider scorecard's "Slider ratings"
      // header is the canonical proof we're on rollup.
      expect(
        await screen.findByRole('heading', { name: /slider ratings/i }),
      ).toBeInTheDocument();

      // Flip to heatmap.
      await user.click(
        screen.getByRole('tab', { name: /by prompt \(heatmap\)/i }),
      );

      // Rollup is unmounted; the heatmap header replaces it.
      expect(
        screen.queryByRole('heading', { name: /slider ratings/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: /per-prompt heatmap/i }),
      ).toBeInTheDocument();
      // Heatmap grid renders with the variant rows + populated cells.
      expect(screen.getByRole('grid')).toBeInTheDocument();
      expect(screen.getByText('Warm Pro')).toBeInTheDocument();
      expect(screen.getByText('Playful')).toBeInTheDocument();
      // Cell scores from the fixture render to one decimal.
      expect(screen.getByText('8.2')).toBeInTheDocument();
      expect(screen.getByText('4.0')).toBeInTheDocument();
      // p-3 × cm-2 was deliberately missing — surfaces as a sparse cell
      // (em-dash). At least one em-dash exists in the heatmap.
      expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    });

    it('mounts the variant text panel default-collapsed for system-prompt arenas', async () => {
      const user = userEvent.setup();
      installMockFetch([
        {
          url: '/api/campaigns/campaign-1',
          body: createSystemPromptArenaDetail(),
        },
      ]);
      renderCampaignDashboard();

      fireEvent.click(
        await screen.findByRole('tab', { name: /ratings/i }),
      );

      // The "Variant text" header is present, but the variant bodies
      // are not in the DOM — they're collapsed by default. Plan 05's
      // prompt-arena panel renders default-expanded; system-prompt
      // arenas open collapsed because variant bodies run long.
      expect(
        await screen.findByRole('heading', { name: /^variant text$/i }),
      ).toBeInTheDocument();
      // Collapsed: the variant body text isn't in the DOM.
      expect(
        screen.queryByText(/you are a warm, professional brand voice/i),
      ).not.toBeInTheDocument();

      // Click "Expand" to surface the variant bodies.
      await user.click(screen.getByRole('button', { name: /expand/i }));
      expect(
        await screen.findByText(/you are a warm, professional brand voice/i),
      ).toBeInTheDocument();
    });

    it('does NOT render the heatmap toggle on non-system-prompt arenas (regression)', async () => {
      installMockFetch([
        {
          url: '/api/campaigns/campaign-1',
          body: createCampaignDetail('active', 'model'),
        },
      ]);
      renderCampaignDashboard();

      fireEvent.click(
        await screen.findByRole('tab', { name: /ratings/i }),
      );

      // The leaderboard-view tablist is system-prompt-only.
      expect(
        screen.queryByRole('tablist', { name: /leaderboard view/i }),
      ).not.toBeInTheDocument();
      // Suite-size badge is too.
      expect(screen.queryByText(/^based on$/i)).not.toBeInTheDocument();
    });
  });
});
