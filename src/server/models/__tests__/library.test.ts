import { buildModelLibrary, updateRegistryModel } from '../library';

function createSnapshot() {
  return {
    registry: [
      {
        id: 'registry-gpt5',
        providerModelId: 'openai/gpt-5',
        displayName: 'GPT-5',
        enabled: true,
        legacy: false,
      },
      {
        id: 'registry-sonnet',
        providerModelId: 'anthropic/claude-sonnet-4-6',
        displayName: 'Claude Sonnet 4.6',
        enabled: true,
        legacy: false,
      },
    ],
    campaigns: [
      {
        id: 'campaign-active',
        name: 'Active Campaign',
        status: 'active',
      },
      {
        id: 'campaign-completed',
        name: 'Completed Campaign',
        status: 'completed',
      },
    ],
    campaignModels: [
      {
        id: 'cm-gpt5-a',
        campaignId: 'campaign-active',
        providerModelId: 'openai/gpt-5',
        displayName: 'GPT-5',
      },
      {
        id: 'cm-sonnet-a',
        campaignId: 'campaign-active',
        providerModelId: 'anthropic/claude-sonnet-4-6',
        displayName: 'Claude Sonnet 4.6',
      },
      {
        id: 'cm-sonnet-c',
        campaignId: 'campaign-completed',
        providerModelId: 'anthropic/claude-sonnet-4-6',
        displayName: 'Claude Sonnet 4.6',
      },
    ],
    generations: [
      { id: 'gen-gpt5-a', campaignModelId: 'cm-gpt5-a' },
      { id: 'gen-sonnet-a', campaignModelId: 'cm-sonnet-a' },
      { id: 'gen-sonnet-c', campaignModelId: 'cm-sonnet-c' },
    ],
    votes: [
      {
        generationAId: 'gen-sonnet-a',
        generationBId: 'gen-gpt5-a',
        winner: 'A',
      },
      {
        generationAId: 'gen-sonnet-c',
        generationBId: 'gen-gpt5-a',
        winner: 'A',
      },
    ],
    ratings: [
      {
        campaignId: 'campaign-active',
        campaignModelId: 'cm-gpt5-a',
        category: 'overall',
        rating: 1010,
        gameCount: 2,
      },
      {
        campaignId: 'campaign-active',
        campaignModelId: 'cm-sonnet-a',
        category: 'overall',
        rating: 1175,
        gameCount: 2,
      },
      {
        campaignId: 'campaign-completed',
        campaignModelId: 'cm-sonnet-c',
        category: 'overall',
        rating: 1150,
        gameCount: 1,
      },
    ],
  };
}

describe('model library helpers', () => {
  it('returns model rows with availability, usage, win signal, and recommendation tags', async () => {
    const library = await buildModelLibrary(createSnapshot(), {
      search: '',
      status: 'all',
      sort: 'usage',
    });

    expect(library.rows[0]).toMatchObject({
      displayName: 'Claude Sonnet 4.6',
      enabled: true,
    });
    expect(library.rows[0].usage.campaigns).toBeGreaterThan(0);
    expect(library.rows[0].recommendation).toBeTruthy();
  });

  it('updates enabled state by registry id', async () => {
    const updated = await updateRegistryModel(createSnapshot(), 'registry-gpt5', {
      enabled: false,
    });
    expect(updated.enabled).toBe(false);
  });
});
