/**
 * Fixed catalog of models available in this ModelArena instance.
 *
 * Rationale: there is no global models table in the DB — per-campaign
 * model rows store `provider_model_id` as a string. Cross-campaign
 * aggregation (e.g. a future "how has Claude Opus performed across all
 * campaigns" view) relies on string equality of that id.
 *
 * If operators could free-type model ids, a typo like `anthropic/claude-opus`
 * vs `anthropic/claude-opus-4-6` would silently split a model across two
 * identities. Keeping the catalog here forces the UI and API to validate
 * against a canonical list.
 *
 * When OpenRouter ships a new model we want to support:
 *  1. Add a row here.
 *  2. Existing campaigns are unaffected (they only see models selected at
 *     their creation time).
 *  3. Removing a row is a breaking change for any campaign that uses it —
 *     prefer deprecation (mark it as legacy) over deletion.
 */

export interface ModelCatalogEntry {
  /** OpenRouter model identifier, e.g. "anthropic/claude-opus-4-6". */
  providerModelId: string;
  /** Human-friendly name shown in the UI. */
  displayName: string;
  /**
   * If true, hidden from the model-selection UI but still valid for
   * existing campaigns. Use to retire a model without orphaning history.
   */
  legacy?: boolean;
}

export const AVAILABLE_MODELS = [
  {
    providerModelId: 'anthropic/claude-opus-4-6',
    displayName: 'Claude Opus 4.6',
  },
  {
    providerModelId: 'anthropic/claude-sonnet-4-6',
    displayName: 'Claude Sonnet 4.6',
  },
  {
    providerModelId: 'anthropic/claude-haiku-4-5',
    displayName: 'Claude Haiku 4.5',
  },
  {
    providerModelId: 'openai/gpt-5',
    displayName: 'GPT-5',
  },
  {
    providerModelId: 'openai/gpt-5-mini',
    displayName: 'GPT-5 mini',
  },
  {
    providerModelId: 'google/gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro',
  },
  {
    providerModelId: 'google/gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
  },
  {
    providerModelId: 'meta-llama/llama-4',
    displayName: 'Llama 4',
  },
  {
    providerModelId: 'deepseek/deepseek-v3',
    displayName: 'DeepSeek V3',
  },
] as const satisfies readonly ModelCatalogEntry[];

export type ProviderModelId = (typeof AVAILABLE_MODELS)[number]['providerModelId'];

// Widened view for runtime iteration. `as const` narrows each entry to
// its literal-typed shape (useful for `ProviderModelId`), but for
// functions that accept arbitrary strings we need the wider type.
const ALL: readonly ModelCatalogEntry[] = AVAILABLE_MODELS;

const catalogMap = new Map<string, ModelCatalogEntry>(
  ALL.map((m) => [m.providerModelId, m]),
);

/** Returns the catalog entry for a provider model id, or undefined if unknown. */
export function lookupModel(
  providerModelId: string,
): ModelCatalogEntry | undefined {
  return catalogMap.get(providerModelId);
}

/** Validates a provider model id against the catalog. Use in API handlers. */
export function isKnownModel(providerModelId: string): boolean {
  return catalogMap.has(providerModelId);
}

/** Models shown in the selection UI (excludes legacy). */
export function activeModels(): readonly ModelCatalogEntry[] {
  return ALL.filter((m) => !m.legacy);
}
