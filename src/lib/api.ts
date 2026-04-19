/**
 * Thin fetch helpers for the client. All requests go through
 * `apiFetch` so errors are normalized and status-code handling is
 * uniform.
 *
 * Response shapes are duck-typed — the server routes are the source
 * of truth. If a route shape changes, the consumer-page compile break
 * is the canonical signal.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    // Embed status in message so TanStack Query's retry:false-for-4xx
    // default (see src/main.tsx) works off it.
    super(`${status} ${message}`);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const ct = res.headers.get('content-type') ?? '';
  const body = ct.includes('application/json')
    ? await res.json().catch(() => undefined)
    : await res.text().catch(() => undefined);

  if (!res.ok) {
    const msg =
      (body &&
        typeof body === 'object' &&
        'error' in body &&
        typeof (body as { error: unknown }).error === 'string' &&
        (body as { error: string }).error) ||
      (typeof body === 'string' ? body.slice(0, 200) : '') ||
      res.statusText;
    throw new ApiError(msg, res.status, body);
  }
  return body as T;
}

// --- Shared response types (duck-typed against the handlers) ---

export interface CampaignSummary {
  id: string;
  shareSlug: string;
  name: string;
  description: string;
  categories: string[];
  status: 'draft' | 'active' | 'completed';
  createdAt: string;
  closedAt: string | null;
}

export interface CampaignDetail {
  campaign: CampaignSummary;
  stats: {
    promptCount: number;
    modelCount: number;
    totalVotes: number;
    uniqueParticipants: number;
    finishedParticipants: number;
  };
  models: Array<{
    id: string;
    providerModelId: string;
    displayName: string;
  }>;
  ratings: Array<{
    category: string;
    rating: number;
    seRating: number | null;
    btStrength: number | null;
    ciLow: number | null;
    ciHigh: number | null;
    gameCount: number;
    gamesPlayed: number;
    winCount: number;
    lossCount: number;
    tieCount: number;
    winRate: number | null;
    stability: 'directional' | 'preliminary' | 'stable';
    computedAt: string;
    campaignModelId: string;
    providerModelId: string;
    displayName: string;
  }>;
}

export interface VoteLanding {
  shareSlug: string;
  name: string;
  description: string;
  categories: string[];
  status: 'draft' | 'active' | 'completed';
  promptCount: number;
  modelCount: number;
}

export interface NextBattleResponse {
  done: true;
}
export interface NextBattlePayload {
  done: false;
  tournament: { id: string; promptId: string };
  prompt: {
    id: string;
    text: string;
    context: string | null;
    categoryTags: string[];
  };
  battle: {
    position: 'b1' | 'b2' | 'b3' | 'b4' | 'b5';
    label: string;
    reason: string;
  };
  generationA: { id: string; output: string; tokensOut: number | null };
  generationB: { id: string; output: string; tokensOut: number | null };
  progress: { tournamentsTotal: number; tournamentsDone: number };
}

export interface PersonalResults {
  campaign: { name: string; shareSlug: string };
  totals: {
    battlesPlayed: number;
    tournamentsComplete: number;
    tournamentsStarted: number;
  };
  perPrompt: Array<{
    promptId: string;
    promptText: string;
    complete: boolean;
    battlesPlayed: number;
    ranking: Array<{
      rank: number;
      models: Array<{
        campaignModelId: string | null;
        displayName: string;
        providerModelId: string;
      }>;
    }>;
  }>;
  campaignRanking: Array<{
    campaignModelId: string;
    displayName: string;
    providerModelId: string;
    rating: number;
    seRating: number | null;
    ciLow: number | null;
    ciHigh: number | null;
    gameCount: number;
    winRate: number | null;
    stability: 'directional' | 'preliminary' | 'stable';
    firstPlaceCount: number;
    appearances: number;
  }>;
  personalBT: { iterations: number; converged: boolean };
  groupAgreement: { fraction: number | null; samples: number };
  honesty: { directional: boolean };
}

export interface ActivityEvent {
  id: string;
  kind: 'campaign_created' | 'participant_finished' | 'ratings_recomputed';
  label: string;
  at: string;
  campaignId?: string;
}

export interface DashboardLeaderboardRow {
  campaignModelId: string;
  providerModelId: string;
  displayName: string;
  rating: number;
  seRating: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  gameCount: number;
  winRate: number | null;
  stability: 'directional' | 'preliminary' | 'stable';
}

export interface DashboardLeaderboardCampaign {
  id: string;
  name: string;
  shareSlug: string;
  totalVotes: number;
  updatedAt: string | null;
  ratings: DashboardLeaderboardRow[];
}

export interface DashboardSummary {
  kpis: {
    activeCampaigns: number;
    draftCampaigns: number;
    totalVotes: number;
    uniqueParticipants: number;
  };
  recentCampaigns: Array<{
    id: string;
    name: string;
    status: string;
    shareSlug?: string;
    createdAt?: string;
    totalVotes: number;
    uniqueParticipants: number;
  }>;
  leaderboard: Array<{
    id: string;
    displayName: string;
    providerModelId: string;
    availability: 'enabled' | 'disabled' | 'legacy';
    campaigns: number;
    comparisons: number;
    winRate: number | null;
  }>;
  leaderboards: DashboardLeaderboardCampaign[];
  attention: {
    draftsNeedingGeneration: Array<{ id: string; name: string }>;
    readyToLaunch: Array<{ id: string; name: string }>;
    lowVoteVolume: Array<{ id: string; name: string; totalVotes: number }>;
  };
  recentMovement: ActivityEvent[];
}

export interface ModelLibraryRow {
  id: string;
  providerModelId: string;
  displayName: string;
  enabled: boolean;
  legacy: boolean;
  availability: 'enabled' | 'disabled' | 'legacy';
  usage: {
    campaigns: number;
    activeCampaigns: number;
    completedCampaigns: number;
  };
  performance: {
    wins: number;
    losses: number;
    ties: number;
    comparisons: number;
    winRate: number | null;
    averageRating: number | null;
  };
  footprint: Array<{
    campaignId: string;
    name: string;
    status: string;
  }>;
  recommendation: string;
}

export interface ModelLibraryData {
  rows: ModelLibraryRow[];
  summary: {
    totalModels: number;
    enabled: number;
    disabled: number;
    legacy: number;
    inUse: number;
  };
  guidance: {
    recommendedIds: string[];
    note: string;
  };
}

export interface ActivityFeed {
  summary: {
    activeCampaigns: number;
    completedCampaigns: number;
    totalVotes: number;
  };
  events: ActivityEvent[];
  topCampaigns: Array<{
    id: string;
    name: string;
    status: string;
  }>;
}

export interface ApiSettingsSummary {
  configurationHealth: {
    databaseConfigured: boolean;
    authConfigured: boolean;
    operatorConfigured: boolean;
    openrouterConfigured: boolean;
  };
  secrets: {
    database: { configured: boolean; label: string };
    auth: { configured: boolean; label: string };
    operator: { configured: boolean; label: string };
    openrouter: { configured: boolean; label: string };
  };
  notes: string[];
}
