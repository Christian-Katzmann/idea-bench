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
  });
});
