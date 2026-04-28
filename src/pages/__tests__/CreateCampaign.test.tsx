import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreateCampaign from '../CreateCampaign';
import { renderWithRouter } from '../../test/renderWithProviders';
import { installMockFetch } from '../../test/mockFetch';

const modelsFixture = {
  rows: [
    {
      id: '1',
      displayName: 'GPT-5',
      providerModelId: 'openai/gpt-5',
      enabled: true,
      legacy: false,
      availability: 'enabled',
      usage: { campaigns: 1, activeCampaigns: 1, completedCampaigns: 0 },
      performance: {
        wins: 1,
        losses: 0,
        ties: 0,
        comparisons: 1,
        winRate: 1,
        averageRating: 1100,
      },
      footprint: [],
      recommendation: 'Strong generalist',
    },
    {
      id: '2',
      displayName: 'Llama 4',
      providerModelId: 'meta-llama/llama-4',
      enabled: false,
      legacy: false,
      availability: 'disabled',
      usage: { campaigns: 0, activeCampaigns: 0, completedCampaigns: 0 },
      performance: {
        wins: 0,
        losses: 0,
        ties: 0,
        comparisons: 0,
        winRate: null,
        averageRating: null,
      },
      footprint: [],
      recommendation: 'Untested',
    },
  ],
  summary: {
    totalModels: 2,
    enabled: 1,
    disabled: 1,
    legacy: 0,
    inUse: 1,
  },
  guidance: {
    recommendedIds: ['1'],
    note: 'Keep GPT-5 enabled.',
  },
};

describe('CreateCampaign', () => {
  it('only shows enabled non-legacy models in the campaign model selector', async () => {
    const user = userEvent.setup();
    installMockFetch([{ url: '/api/operator/models?status=enabled&sort=name', body: modelsFixture }]);

    renderWithRouter(<CreateCampaign />);

    // Step 0 (Plan 04) — Kind picker. `Model arena` is selected by
    // default, so a single Next click advances to Basics without
    // changing anything else.
    await user.click(screen.getByRole('button', { name: /next/i }));

    await user.type(screen.getByLabelText(/campaign name/i), 'Test campaign');
    await user.click(screen.getByRole('button', { name: /next/i }));
    // Simple is the default authoring mode now; the "Prompt text"
    // textarea is what populates `text` for the LLM. Advanced mode
    // exposes Instructions / Input / Output-format as separate fields,
    // but it's opt-in.
    await user.type(
      screen.getByLabelText(/prompt text/i),
      'Compare these responses',
    );
    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(await screen.findByText(/^GPT-5$/)).toBeInTheDocument();
    expect(screen.queryByText(/llama 4/i)).not.toBeInTheDocument();
  });

  // Plan 04 — Step 0 surface tests. The kind picker is the wizard's
  // first step; only `model` is selectable in V1 while Plans 05/06
  // ship the editors that drive the other kinds.
  describe('Step 0 — kind picker', () => {
    it('renders all three arena kinds with prompt/system_prompt disabled', async () => {
      installMockFetch([
        { url: '/api/operator/models?status=enabled&sort=name', body: modelsFixture },
      ]);
      renderWithRouter(<CreateCampaign />);

      const modelOption = screen.getByRole('radio', { name: /model arena/i });
      const promptOption = screen.getByRole('radio', { name: /^prompt arena/i });
      const sysPromptOption = screen.getByRole('radio', {
        name: /system-prompt arena/i,
      });

      expect(modelOption).toBeEnabled();
      expect(modelOption).toHaveAttribute('aria-checked', 'true');
      expect(promptOption).toBeDisabled();
      expect(sysPromptOption).toBeDisabled();

      // Two "Coming soon" badges — one per disabled card.
      expect(screen.getAllByText(/coming soon/i)).toHaveLength(2);
    });

    it('does not let the operator move past Step 0 with a non-model kind selected', async () => {
      const user = userEvent.setup();
      installMockFetch([
        { url: '/api/operator/models?status=enabled&sort=name', body: modelsFixture },
      ]);
      renderWithRouter(<CreateCampaign />);

      // Click the disabled prompt-arena card — it should not change
      // the selection (still "Model arena"), and Next should still
      // advance to Basics on the next click.
      const promptOption = screen.getByRole('radio', { name: /^prompt arena/i });
      await user.click(promptOption);
      expect(
        screen.getByRole('radio', { name: /model arena/i }),
      ).toHaveAttribute('aria-checked', 'true');

      await user.click(screen.getByRole('button', { name: /next/i }));
      // Step 1 (Basics) — campaign name field is the canonical proof
      // we advanced past Step 0.
      expect(screen.getByLabelText(/campaign name/i)).toBeInTheDocument();
    });
  });
});
