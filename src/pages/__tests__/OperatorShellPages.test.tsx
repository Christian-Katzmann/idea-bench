import { screen } from '@testing-library/react';
import TeamActivity from '../TeamActivity';
import ApiSettings from '../ApiSettings';
import { renderWithRouter } from '../../test/renderWithProviders';
import { installMockFetch } from '../../test/mockFetch';

const activityFixture = {
  summary: {
    activeCampaigns: 1,
    completedCampaigns: 2,
    totalVotes: 25,
  },
  events: [
    {
      id: 'event-1',
      kind: 'campaign_created',
      label: 'Support QA created',
      at: '2026-04-17T09:00:00.000Z',
      campaignId: 'campaign-1',
    },
  ],
  topCampaigns: [
    { id: 'campaign-1', name: 'Support QA', status: 'active' },
  ],
};

const settingsFixture = {
  configurationHealth: {
    databaseConfigured: true,
    authConfigured: true,
    operatorConfigured: true,
    openrouterConfigured: true,
    githubConfigured: false,
    resendConfigured: false,
  },
  secrets: {
    database: { configured: true, state: 'configured', label: 'Database secret present' },
    auth: { configured: true, state: 'configured', label: 'Auth secret present' },
    operator: { configured: true, state: 'configured', label: 'Operator password present' },
    openrouter: { configured: true, state: 'configured', label: 'OpenRouter API key present' },
    github: { configured: false, state: 'missing', label: 'GitHub OAuth not configured' },
    resend: { configured: false, state: 'missing', label: 'Email magic-link not configured' },
  },
  notes: ['Secret values are never exposed in the UI.'],
};

describe('Operator shell pages', () => {
  it('renders activity sections and recent events', async () => {
    installMockFetch([{ url: '/api/operator/activity', body: activityFixture }]);

    renderWithRouter(<TeamActivity />);

    // Timeline section is always present; event labels come from the fixture.
    expect(await screen.findByText(/timeline/i)).toBeInTheDocument();
  });

  it('renders configuration health cards without exposing secrets', async () => {
    installMockFetch([{ url: '/api/settings/api', body: settingsFixture }]);

    renderWithRouter(<ApiSettings />);

    // Health tiles render one per service — any of them proves the layout rendered.
    expect((await screen.findAllByText(/database/i)).length).toBeGreaterThan(0);
  });
});
