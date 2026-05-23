import { buildActivityFeed } from '../feed';
import { buildApiSettingsSummary } from '../../settings/apiHealth';

describe('activity and api settings helpers', () => {
  it('builds a lightweight activity feed from existing records', async () => {
    const feed = await buildActivityFeed({
      campaigns: [
        {
          id: 'campaign-1',
          name: 'Campaign 1',
          status: 'active',
          createdAt: new Date('2026-04-16T10:00:00.000Z'),
        },
      ],
      participants: [
        {
          id: 'participant-1',
          campaignId: 'campaign-1',
          finishedAt: new Date('2026-04-16T11:00:00.000Z'),
        },
      ],
      ratings: [
        {
          id: 'rating-1',
          campaignId: 'campaign-1',
          computedAt: new Date('2026-04-16T11:05:00.000Z'),
        },
      ],
      votes: [{ id: 'vote-1', campaignId: 'campaign-1' }],
    });

    expect(feed.events[0]).toHaveProperty('kind');

    const participantEvent = feed.events.find(
      (event) => event.kind === 'participant_finished',
    );
    expect(participantEvent?.label).toBe(
      'Campaign 1 — a participant finished voting',
    );
  });

  it('falls back to a generic label when the campaign name is unknown', async () => {
    const feed = await buildActivityFeed({
      campaigns: [],
      participants: [
        {
          id: 'participant-orphan',
          campaignId: 'missing-campaign',
          finishedAt: new Date('2026-04-16T11:00:00.000Z'),
        },
      ],
      ratings: [],
      votes: [],
    });

    const participantEvent = feed.events.find(
      (event) => event.kind === 'participant_finished',
    );
    expect(participantEvent?.label).toBe('A participant finished voting');
  });

  it('reports configuration presence without exposing secret values', () => {
    const summary = buildApiSettingsSummary({
      OPENROUTER_API_KEY: 'secret',
      DATABASE_URL: 'postgres://example',
      AUTH_SECRET: 'secret-auth',
      OPERATOR_PASSWORD: 'demo1234',
    });

    expect(summary.secrets.openrouter.configured).toBe(true);
    expect(summary.secrets.openrouter.value).toBeUndefined();
    expect(summary.secrets.openrouter.state).toBe('configured');
  });

  it('surfaces GitHub OAuth and Resend status alongside the core secrets', () => {
    const summary = buildApiSettingsSummary({});
    expect(summary.secrets.github.state).toBe('missing');
    expect(summary.secrets.resend.state).toBe('missing');
    expect(summary.configurationHealth.githubConfigured).toBe(false);
    expect(summary.configurationHealth.resendConfigured).toBe(false);
  });

  it('flags GitHub OAuth as partial when only some env vars are set', () => {
    const summary = buildApiSettingsSummary({
      GITHUB_OAUTH_CLIENT_ID: 'id',
      GITHUB_OAUTH_CLIENT_SECRET: 'secret',
      // OPERATOR_GITHUB_LOGINS intentionally missing.
    });
    expect(summary.secrets.github.state).toBe('partial');
    expect(summary.secrets.github.configured).toBe(false);
    expect(summary.secrets.github.label).toContain('OPERATOR_GITHUB_LOGINS');
  });

  it('marks GitHub OAuth and Resend as configured when full env set is present', () => {
    const summary = buildApiSettingsSummary({
      GITHUB_OAUTH_CLIENT_ID: 'id',
      GITHUB_OAUTH_CLIENT_SECRET: 'secret',
      OPERATOR_GITHUB_LOGINS: 'octocat',
      RESEND_API_KEY: 'rk',
      OPERATOR_EMAILS: 'alice@example.com',
    });
    expect(summary.secrets.github.state).toBe('configured');
    expect(summary.secrets.resend.state).toBe('configured');
    expect(summary.configurationHealth.githubConfigured).toBe(true);
    expect(summary.configurationHealth.resendConfigured).toBe(true);
  });
});
