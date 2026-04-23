// Vendored from /Users/christiankatzmann/Dev/reuse-kit/ready/ai-budget-accounting/src/budget.ts
// Two-phase budget tracker: preflightAllow → commitUsage.

import {
  DEFAULT_PRICING,
  estimateCostUSD,
  type PricingTable,
} from './pricing.js';

export interface BudgetContext {
  userId?: string;
  orgId?: string;
  provider: string;
  model?: string;
}

export interface TokenCost {
  tokensIn: number;
  tokensOut: number;
  usd: number;
}

export interface BudgetLimits {
  perUserUsd?: number;
  perOrgUsd?: number;
  perUserTokens?: number;
  perOrgTokens?: number;
}

export interface BudgetAllow {
  allow: true;
}

export interface BudgetDeny {
  allow: false;
  reason: 'USER_USD' | 'USER_TOKENS' | 'ORG_USD' | 'ORG_TOKENS';
}

export type BudgetDecision = BudgetAllow | BudgetDeny;

interface Usage {
  usd: number;
  tokens: number;
}

export interface BudgetTrackerOptions {
  limits: BudgetLimits;
  pricing?: PricingTable;
  now?: () => Date;
}

export class BudgetTracker {
  private readonly userDaily = new Map<string, Usage>();
  private readonly orgDaily = new Map<string, Usage>();
  private currentDay: string;

  constructor(private readonly opts: BudgetTrackerOptions) {
    this.currentDay = this.dayKey();
  }

  private dayKey(): string {
    const d = this.opts.now?.() ?? new Date();
    return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
  }

  private maybeRotate(): void {
    const now = this.dayKey();
    if (now !== this.currentDay) {
      this.userDaily.clear();
      this.orgDaily.clear();
      this.currentDay = now;
    }
  }

  private getOr(map: Map<string, Usage>, key: string): Usage {
    let v = map.get(key);
    if (!v) {
      v = { usd: 0, tokens: 0 };
      map.set(key, v);
    }
    return v;
  }

  preflightAllow(
    ctx: BudgetContext,
    expected: { tokensIn: number; tokensOut: number },
  ): BudgetDecision {
    this.maybeRotate();

    const pricing = this.opts.pricing ?? DEFAULT_PRICING;
    const usd = estimateCostUSD(
      ctx.provider,
      ctx.model,
      expected.tokensIn,
      expected.tokensOut,
      pricing,
    );
    const { perUserUsd, perOrgUsd, perUserTokens, perOrgTokens } =
      this.opts.limits;

    if (ctx.userId) {
      const u = this.getOr(this.userDaily, ctx.userId);
      if (perUserUsd !== undefined && u.usd + usd > perUserUsd) {
        return { allow: false, reason: 'USER_USD' };
      }
      if (
        perUserTokens !== undefined &&
        u.tokens + expected.tokensIn + expected.tokensOut > perUserTokens
      ) {
        return { allow: false, reason: 'USER_TOKENS' };
      }
    }
    if (ctx.orgId) {
      const o = this.getOr(this.orgDaily, ctx.orgId);
      if (perOrgUsd !== undefined && o.usd + usd > perOrgUsd) {
        return { allow: false, reason: 'ORG_USD' };
      }
      if (
        perOrgTokens !== undefined &&
        o.tokens + expected.tokensIn + expected.tokensOut > perOrgTokens
      ) {
        return { allow: false, reason: 'ORG_TOKENS' };
      }
    }
    return { allow: true };
  }

  commitUsage(ctx: BudgetContext, actual: TokenCost): void {
    this.maybeRotate();
    if (ctx.userId) {
      const u = this.getOr(this.userDaily, ctx.userId);
      u.usd += actual.usd;
      u.tokens += actual.tokensIn + actual.tokensOut;
    }
    if (ctx.orgId) {
      const o = this.getOr(this.orgDaily, ctx.orgId);
      o.usd += actual.usd;
      o.tokens += actual.tokensIn + actual.tokensOut;
    }
  }

  getUsage(kind: 'user' | 'org', id: string): Usage {
    this.maybeRotate();
    const map = kind === 'user' ? this.userDaily : this.orgDaily;
    return { ...(map.get(id) ?? { usd: 0, tokens: 0 }) };
  }
}
