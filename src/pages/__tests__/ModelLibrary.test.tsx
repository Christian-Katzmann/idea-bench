import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModelLibrary from '../ModelLibrary';
import { renderWithRouter } from '../../test/renderWithProviders';
import { installMockFetch } from '../../test/mockFetch';

const libraryFixture = {
  rows: [
    {
      id: 'registry-1',
      providerModelId: 'openai/gpt-5',
      displayName: 'GPT-5',
      enabled: true,
      legacy: false,
      availability: 'enabled',
      usage: { campaigns: 3, activeCampaigns: 1, completedCampaigns: 2 },
      performance: {
        wins: 12,
        losses: 4,
        ties: 2,
        comparisons: 18,
        winRate: 0.72,
        averageRating: 1180,
      },
      footprint: [{ campaignId: 'campaign-1', name: 'Support QA', status: 'active' }],
      recommendation: 'Strong generalist',
    },
  ],
  summary: {
    totalModels: 1,
    enabled: 1,
    disabled: 0,
    legacy: 0,
    inUse: 1,
  },
  guidance: {
    recommendedIds: ['registry-1'],
    note: 'Keep GPT-5 in the next campaign mix.',
  },
};

describe('ModelLibrary', () => {
  it('renders model rows and toggles availability optimistically', async () => {
    const user = userEvent.setup();
    let modelReads = 0;
    installMockFetch([
      {
        url: '/api/operator/models?status=all&sort=usage',
        body: () => {
          modelReads += 1;
          return modelReads > 1
            ? { ...libraryFixture, rows: [{ ...libraryFixture.rows[0], enabled: false, availability: 'disabled' }] }
            : libraryFixture;
        },
      },
      {
        method: 'PATCH',
        url: '/api/models/registry-1',
        body: {
          id: 'registry-1',
          providerModelId: 'openai/gpt-5',
          displayName: 'GPT-5',
          enabled: false,
          legacy: false,
        },
      },
    ]);

    renderWithRouter(<ModelLibrary />);

    const toggle = await screen.findByRole('switch', { name: /gpt-5 availability/i });
    await user.click(toggle);

    await waitFor(() => {
      expect(toggle).toHaveAttribute('aria-checked', 'false');
    });
  });
});
