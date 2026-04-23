// Vendored from /Users/christiankatzmann/Dev/reuse-kit/ready/ai-budget-accounting/src/pricing.ts
//
// Note: ModelArena relies on OpenRouter's response `usage.cost` field for
// authoritative costs at commit time. This pricing table is only used for
// *preflight estimates* — we'd rather over-estimate than under-commit.
// The FALLBACK is intentionally conservative (high-end of typical rates).

export interface ModelPricing {
  inPer1k: number;
  outPer1k: number;
}

export type PricingTable = Record<string, ModelPricing>;

/**
 * Starter pricing table (USD per 1k tokens). Approximate and will drift;
 * override per consuming project. Keys are `${provider}:${model}`.
 */
export const DEFAULT_PRICING: PricingTable = {
  'openai:gpt-4o-mini': { inPer1k: 0.005, outPer1k: 0.015 },
  'openai:gpt-4o': { inPer1k: 0.005, outPer1k: 0.015 },
  'openai:o3-mini': { inPer1k: 0.01, outPer1k: 0.03 },
  'anthropic:claude-3-5-sonnet-latest': { inPer1k: 0.003, outPer1k: 0.015 },
  'anthropic:claude-3-5-haiku-latest': { inPer1k: 0.0008, outPer1k: 0.004 },
  'gemini:gemini-2.5-flash': { inPer1k: 0.00125, outPer1k: 0.005 },
  'gemini:gemini-1.5-flash': { inPer1k: 0.00125, outPer1k: 0.005 },
  'gemini:gemini-1.5-pro': { inPer1k: 0.0035, outPer1k: 0.01 },
};

export const FALLBACK_PRICING: ModelPricing = {
  inPer1k: 0.003,
  outPer1k: 0.009,
};

export function pricingKey(
  provider: string,
  model: string | undefined,
): string {
  return `${provider}:${model ?? ''}`;
}

export function estimateTokensFromText(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function estimateCostUSD(
  provider: string,
  model: string | undefined,
  tokensIn: number,
  tokensOut: number,
  table: PricingTable = DEFAULT_PRICING,
): number {
  const pricing = table[pricingKey(provider, model)] ?? FALLBACK_PRICING;
  const usd =
    (tokensIn / 1000) * pricing.inPer1k + (tokensOut / 1000) * pricing.outPer1k;
  return Number(usd.toFixed(6));
}
