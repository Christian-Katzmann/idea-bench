import {
  mergeCatalogIntoRegistry,
  selectableRegistryModels,
} from '../registry';

describe('model registry helpers', () => {
  it('treats enabled registry rows as the source of truth for future campaign selection', () => {
    const rows = [
      {
        providerModelId: 'openai/gpt-5',
        displayName: 'GPT-5',
        enabled: true,
        legacy: false,
      },
      {
        providerModelId: 'anthropic/claude-opus-4-6',
        displayName: 'Claude Opus 4.6',
        enabled: false,
        legacy: false,
      },
    ];

    expect(
      selectableRegistryModels(rows).map((row) => row.providerModelId),
    ).toEqual(['openai/gpt-5']);
  });

  it('preserves operator-managed flags while syncing the static catalog', () => {
    const existing = [
      {
        providerModelId: 'openai/gpt-5',
        displayName: 'GPT-5 old',
        enabled: false,
        legacy: false,
      },
    ];

    const synced = mergeCatalogIntoRegistry(
      [{ providerModelId: 'openai/gpt-5', displayName: 'GPT-5' }],
      existing,
    );

    expect(synced).toEqual([
      {
        providerModelId: 'openai/gpt-5',
        displayName: 'GPT-5',
        enabled: false,
        legacy: false,
      },
    ]);
  });
});
