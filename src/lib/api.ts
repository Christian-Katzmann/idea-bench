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
    public requestId?: string,
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
    // The observability wrapper attaches X-Request-Id; the body also
    // carries `id` when the wrapper normalized the error. Header wins
    // because it's always present; the body `id` is a fallback.
    const requestId =
      res.headers.get('x-request-id') ||
      (body &&
      typeof body === 'object' &&
      'id' in body &&
      typeof (body as { id: unknown }).id === 'string'
        ? (body as { id: string }).id
        : undefined);
    throw new ApiError(msg, res.status, body, requestId);
  }
  return body as T;
}

// --- Shared response types (duck-typed against the handlers) ---

export type VotingMode = 'anonymous' | 'email_required' | 'hybrid';

export interface CampaignSummary {
  id: string;
  shareSlug: string;
  name: string;
  description: string;
  categories: string[];
  status: 'draft' | 'active' | 'completed';
  votingMode: VotingMode;
  emailPromptMessage: string | null;
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
    identifiedParticipants: number;
    anonymousParticipants: number;
  };
  models: Array<{
    id: string;
    providerModelId: string;
    displayName: string;
  }>;
  prompts: Array<{
    id: string;
    orderIndex: number;
    text: string;
    context: string | null;
    categoryTags: string[];
    mode: PromptMode;
  }>;
  ratings: Array<{
    category: string;
    /**
     * Which signal source aggregated this row — Plan 02 splits
     * responses into `human` / `simulated` / `both` views so operators
     * can strip out LLM-judge votes. Default filter on the dashboard
     * is `both`; pre-Plan-02 campaigns only have `both` rows and read
     * identically to before.
     */
    source: RatingSource;
    /**
     * Plan 02 Phase 2: non-null for per-persona simulated rollups.
     * The dashboard's "By persona" view filters on this; `null` +
     * `source='simulated'` is the combined "all simulated" rollup.
     */
    personaId: string | null;
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

export type RatingSource = 'human' | 'simulated' | 'both';
export type PanelType = 'generic' | 'persona';
export type SimulatedRunStatus =
  | 'pending'
  | 'running'
  | 'complete'
  | 'failed'
  | 'aborted';
export type SimulatedParticipantStatus =
  | 'pending'
  | 'running'
  | 'complete'
  | 'failed';

export interface SimulatedRunSummary {
  id: string;
  campaignId: string;
  panelType: PanelType;
  voterCount: number;
  modelMix: Array<{ providerModelId: string; weight: number }>;
  personaIds: string[] | null;
  status: SimulatedRunStatus;
  costEstimateUsd: number | null;
  costActualUsd: number;
  costCeilingUsd: number | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface SimulatedRunDetail {
  run: SimulatedRunSummary & { maxConcurrency: number };
  seatsByStatus: Record<SimulatedParticipantStatus, number>;
  seatsTotal: number;
  seats: Array<{
    id: string;
    seatIndex: number;
    judgeModelId: string;
    personaId: string | null;
    status: SimulatedParticipantStatus;
    error: string | null;
    completedAt: string | null;
  }>;
}

export interface SimulatedRunCostEstimate {
  estimatedUsd: number;
  lowUsd: number;
  highUsd: number;
  totalCalls: number;
  perMode: Record<string, { calls: number; usd: number }>;
}

export interface Persona {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  priorities: string[];
  antiPatterns: string[];
  tags: string[];
  isStarter: boolean;
  derivedFromPersonaId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PersonaInput {
  name: string;
  description: string;
  systemPrompt: string;
  priorities?: string[];
  antiPatterns?: string[];
  tags?: string[];
  derivedFromPersonaId?: string | null;
}

export type PersonaTestResult =
  | {
      ok: true;
      reply: string;
      judgeModelId: string;
      judgeDisplayName: string;
      costUsd: number;
      latencyMs: number;
      persona: { id: string; name: string };
    }
  | {
      ok: false;
      reason: string;
      message: string;
      latencyMs?: number;
    };

/**
 * Payload from GET /api/campaigns/:id/qualitative-responses — powers
 * the Comments tab on the campaign dashboard.
 */
export interface QualitativeResponsesData {
  campaign: { id: string; name: string; shareSlug: string };
  prompts: Array<{
    id: string;
    orderIndex: number;
    text: string;
    mode: PromptMode;
  }>;
  models: Array<{ id: string; displayName: string; providerModelId: string }>;
  responses: Array<{
    id: string;
    promptId: string;
    campaignModelId: string;
    email: string | null;
    text: string;
    createdAt: string;
  }>;
}

export interface VoteLanding {
  shareSlug: string;
  name: string;
  description: string;
  categories: string[];
  status: 'draft' | 'active' | 'completed';
  votingMode: VotingMode;
  emailPromptMessage: string | null;
  promptCount: number;
  modelCount: number;
}

export interface PromptStructured {
  instructions: string;
  input?: string;
  outputFormat?: string;
}

/**
 * Evaluation modes a prompt can be configured in. Server-side enum lives
 * in src/server/db/schema.ts as `promptModeEnum`. Kept in sync manually —
 * if a new mode is added, update both places + the `VoteStep` union.
 */
export type PromptMode =
  | 'tournament'
  | 'slider'
  | 'approve_reject'
  | 'best_of_n'
  | 'multi_axis'
  | 'qualitative';

/**
 * Discriminated union returned by `GET /api/vote/:slug/next`. Each variant
 * describes a single step the participant needs to complete.
 *
 * Phase 2 supports all six evaluation modes plus the terminal `done`.
 * Clients MUST switch on `stepType` before reading mode-specific fields.
 */
export type VoteStep =
  | TournamentBattleStep
  | SliderStep
  | ApproveRejectStep
  | BestOfNStep
  | MultiAxisStep
  | QualitativeStep
  | DoneStep;

export interface DoneStep {
  done: true;
  stepType: 'done';
}

/**
 * Shared shape across all non-tournament step types. Tournament keeps its
 * bespoke `tournamentsTotal`/`tournamentsDone` progress aliases for back-
 * compat; new modes only use the mode-agnostic names.
 */
export interface StepPrompt {
  id: string;
  text: string;
  context: string | null;
  structured: PromptStructured | null;
  categoryTags: string[];
  mode: PromptMode;
}

/**
 * Progress for modes that rate each of the campaign's N models per prompt
 * (slider, approve_reject, eventually multi_axis/qualitative). The
 * `withinPrompt` block tells the client "you're 2 of 4 through this
 * prompt's ratings."
 */
export interface PerModelProgress {
  promptsTotal: number;
  promptsDone: number;
  withinPrompt: { total: number; done: number };
}

export interface TournamentBattleStep {
  done: false;
  stepType: 'tournament_battle';
  tournament: { id: string; promptId: string };
  prompt: StepPrompt;
  battle: {
    position: 'b1' | 'b2' | 'b3' | 'b4' | 'b5';
    label: string;
    reason: string;
  };
  generationA: { id: string; output: string; tokensOut: number | null };
  generationB: { id: string; output: string; tokensOut: number | null };
  /**
   * Both `tournamentsTotal`/`tournamentsDone` (legacy) and
   * `promptsTotal`/`promptsDone` (mode-agnostic) are emitted. Prefer the
   * latter — non-tournament modes only emit the mode-agnostic names.
   */
  progress: {
    tournamentsTotal: number;
    tournamentsDone: number;
    promptsTotal: number;
    promptsDone: number;
  };
}

/**
 * Mode-config shape for a slider prompt. `min`/`max` default to 1/10 when
 * the server emits `null` (legacy prompts, or prompts created without
 * explicit config).
 */
export interface SliderModeConfig {
  min: number;
  max: number;
  minLabel?: string;
  maxLabel?: string;
}

export interface SliderStep {
  done: false;
  stepType: 'slider';
  prompt: StepPrompt;
  modeConfig: SliderModeConfig | null;
  target: {
    campaignModelId: string;
    generation: { id: string; output: string; tokensOut: number | null };
  };
  progress: PerModelProgress;
}

export interface ApproveRejectModeConfig {
  approveLabel?: string;
  rejectLabel?: string;
}

export interface ApproveRejectStep {
  done: false;
  stepType: 'approve_reject';
  prompt: StepPrompt;
  modeConfig: ApproveRejectModeConfig | null;
  target: {
    campaignModelId: string;
    generation: { id: string; output: string; tokensOut: number | null };
  };
  progress: PerModelProgress;
}

/**
 * Best-of-N step: a single step per prompt that shows every model's
 * output at once. Distinct from the per-model modes — one step, one
 * submission, one winner. `progress` has no `withinPrompt` subtotal
 * (one step == one prompt).
 */
export interface BestOfNStep {
  done: false;
  stepType: 'best_of_n';
  prompt: StepPrompt;
  modeConfig: Record<string, never> | null;
  targets: Array<{
    campaignModelId: string;
    generation: { id: string; output: string; tokensOut: number | null };
  }>;
  progress: {
    promptsTotal: number;
    promptsDone: number;
  };
}

/**
 * Multi-axis dimension definition. `key` is the stable identifier used
 * in both the submission payload and the ratings category encoding
 * (`multi_axis:<key>:<tag>`). `label` is the human-friendly name.
 */
export interface MultiAxisDimension {
  key: string;
  label: string;
  min: number;
  max: number;
}

export interface MultiAxisModeConfig {
  dimensions: MultiAxisDimension[];
}

export interface MultiAxisStep {
  done: false;
  stepType: 'multi_axis';
  prompt: StepPrompt;
  modeConfig: MultiAxisModeConfig | null;
  target: {
    campaignModelId: string;
    generation: { id: string; output: string; tokensOut: number | null };
  };
  progress: PerModelProgress;
}

export interface QualitativeModeConfig {
  prompt?: string;
  required: boolean;
}

export interface QualitativeStep {
  done: false;
  stepType: 'qualitative';
  prompt: StepPrompt;
  modeConfig: QualitativeModeConfig | null;
  target: {
    campaignModelId: string;
    generation: { id: string; output: string; tokensOut: number | null };
  };
  progress: PerModelProgress;
}

/**
 * @deprecated Use `DoneStep` (via `VoteStep` discrimination). Alias kept
 * for the existing import in VotingInterface.tsx; remove once all call
 * sites discriminate on `stepType`.
 */
export type NextBattleResponse = DoneStep;

/**
 * @deprecated Use `TournamentBattleStep` (via `VoteStep` discrimination).
 * Alias kept for the existing import in VotingInterface.tsx; remove once
 * all call sites discriminate on `stepType`.
 */
export type NextBattlePayload = TournamentBattleStep;

export interface PersonalResults {
  campaign: { name: string; shareSlug: string };
  totals: {
    battlesPlayed: number;
    tournamentsComplete: number;
    tournamentsStarted: number;
    /**
     * Count of responses the participant left on non-tournament prompts
     * (slider, approve_reject, best_of_n, multi_axis, qualitative).
     * Zero for tournament-only campaigns.
     */
    nonTournamentResponses: number;
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
  /**
   * What the participant contributed on non-tournament prompts, grouped
   * by mode. Empty for tournament-only campaigns. The server omits modes
   * with zero responses so the client can just iterate this array.
   */
  contributionsByMode: Array<{
    mode: PromptMode;
    promptsCount: number;
    responseCount: number;
    /** Mode-specific extras: slider has averageScore; approve_reject has
     *  approvedCount + rejectedCount. Others have no extras in Phase 3. */
    extra?: Record<string, number | string>;
  }>;
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

export interface CampaignMatchup {
  aCampaignModelId: string;
  bCampaignModelId: string;
  aWins: number;
  bWins: number;
  ties: number;
}

export interface CampaignPulseBucket {
  hour: string;
  votes: number;
}

export interface CampaignRecentVote {
  at: string;
  aCampaignModelId: string;
  bCampaignModelId: string;
  winnerCampaignModelId: string | null;
  isTie: boolean;
}

export interface DashboardLeaderboardCampaign {
  id: string;
  name: string;
  shareSlug: string;
  totalVotes: number;
  updatedAt: string | null;
  ratings: DashboardLeaderboardRow[];
  matchups: CampaignMatchup[];
  pulseBuckets: CampaignPulseBucket[];
  recentVotes: CampaignRecentVote[];
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
