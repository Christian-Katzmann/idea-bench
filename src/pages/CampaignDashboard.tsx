import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from '@/lib/relative-time';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  ExternalLink,
  HelpCircle,
  Info,
  Loader2,
  Pencil,
  RefreshCw,
  StopCircle,
  Trash2,
} from 'lucide-react';
import { AppShell } from '../components/layout/app-shell';
import { ConfirmDestructive } from '../components/modals/confirm-destructive';
import { EditCampaignDialog } from '../components/modals/edit-campaign';
import {
  ArenaOnboarding,
  arenaOnboardingStorageKey,
} from '../components/onboarding/arena-onboarding';
import type { ArenaKind } from '../lib/arena-kind';
import {
  HeatmapLeaderboard,
  type HeatmapCell as HeatmapCellInput,
  type HeatmapPrompt as HeatmapPromptInput,
} from '../components/heatmap/HeatmapLeaderboard';
import { Button } from '../components/ui/button';
import { EntityIcon } from '../components/ui/entity-icon';
import { ModelLogo } from '../components/ui/model-logo';
import { PageHeader } from '../components/ui/page-header';
import { Skeleton } from '../components/ui/skeleton';
import { StatusBadge, type StatusState } from '../components/ui/status-badge';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../components/ui/tabs';
import { toast } from '../components/ui/toast';
import { ApiError, apiFetch, type CampaignDetail, type Persona, type PromptMode, type RatingSource, type VotingMode } from '../lib/api';
import { QualitativeReader } from '../components/dashboard/QualitativeReader';
import { SimulatedRunPanel } from '../components/dashboard/SimulatedRunPanel';
import { STABILITY_LABELS, type Stability } from '../lib/stability';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { cn } from '../lib/utils';

/** Short human-readable labels for each evaluation mode — used in the
 *  Ratings tab composition summary and the per-panel ModeBadge. Kept in
 *  sync with the matching object in the voter-side ModeIndicator. */
const MODE_DISPLAY_NAMES: Record<string, string> = {
  tournament: 'Tournament',
  slider: 'Slider',
  approve_reject: 'Approve / reject',
  best_of_n: 'Best of N',
  multi_axis: 'Multi-axis',
  qualitative: 'Qualitative',
};

/** Small pill badge identifying an evaluation mode. Sits in each
 *  per-mode leaderboard panel's header so operators can scan panels
 *  without reading the copy. */
function ModeBadge({ mode }: { mode: PromptMode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-surface-highlight px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {MODE_DISPLAY_NAMES[mode] ?? mode}
    </span>
  );
}

/**
 * Plan 04 — operator-only "kind pill" in the dashboard header.
 * Voters never see this. Subtle styling on purpose: the header
 * already carries name + status + onboarding controls.
 */
const KIND_PILL_LABELS: Record<ArenaKind, string> = {
  model: 'Model arena',
  prompt: 'Prompt arena',
  system_prompt: 'System-prompt arena',
};

/**
 * Per-kind label for the campaign-detail tab strip's "Prompts" tab.
 * Kept in sync with the wizard's Step 3 label (`stepsForKind` in
 * CreateCampaign.tsx) and Plan 04's export headers — see PRD Plan 05
 * "Per-kind labelling helpers". Tab semantics (which prompts the tab
 * lists) are unchanged; only the visible label varies. Operator-only —
 * voters never see these tabs.
 */
const KIND_TAB_LABELS: Record<ArenaKind, string> = {
  model: 'Prompts',
  prompt: 'Inputs',
  system_prompt: 'Test prompts',
};

/**
 * Per-kind labels for the Overview panel's public-voting card. Mirrors
 * the wizard's Step 2/3 labels and the Plan 04 export header rename
 * (model_* → variant_*) so wizard, dashboard, Overview, and exports
 * agree. `contestants` covers what was historically "Models";
 * `testCases` covers what was historically "Prompts".
 */
const KIND_STAT_LABELS: Record<
  ArenaKind,
  { contestants: string; testCases: string }
> = {
  model: { contestants: 'Models', testCases: 'Prompts' },
  prompt: { contestants: 'Variants', testCases: 'Inputs' },
  system_prompt: { contestants: 'Variants', testCases: 'Test prompts' },
};

function KindPill({ kind }: { kind: ArenaKind }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-border bg-surface-highlight px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {KIND_PILL_LABELS[kind]}
    </span>
  );
}

export default function CampaignDashboard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [isCloseOpen, setIsCloseOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  // Help button ref so the onboarding modal can restore focus there
  // after dismiss — important for keyboard / SR users who'd otherwise
  // land on <body>.
  const helpButtonRef = useRef<HTMLButtonElement>(null);
  /**
   * Plan 02 source filter. Default 'both' (combined human + simulated
   * signal). When the campaign has no simulated runs, every `both` row
   * is identical to the `human` row — so the default view matches the
   * pre-Plan-02 leaderboard exactly.
   */
  const [ratingsSource, setRatingsSource] = useState<RatingSource>('both');
  /**
   * Plan 06 P2-A — leaderboard view for system-prompt arenas. The
   * across-suite rollup is the default (matches the existing slider
   * scorecard). Operators flip to 'heatmap' to see per-(variant,
   * prompt) cells. Only meaningful when `arenaKind === 'system_prompt'`;
   * other kinds ignore this state entirely.
   */
  const [leaderboardView, setLeaderboardView] = useState<
    'rollup' | 'heatmap'
  >('rollup');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => apiFetch<CampaignDetail>(`/api/campaigns/${id}`),
    enabled: !!id,
    // Mirror OperatorDashboard's polling so single-campaign ratings tick in
    // place as votes arrive. Background tabs pause; mutations
    // (recompute/close) still invalidate immediately via onSuccess.
    // Polling pauses while the query is in an error state — otherwise a
    // bogus/deleted campaign id keeps the request log noisy with retries
    // the operator can't see.
    refetchInterval: (query) =>
      query.state.status === 'error' ? false : 5_000,
    refetchIntervalInBackground: false,
  });

  useDocumentTitle(data?.campaign.name ?? 'Campaign');

  // Plan 04 — pulled from the campaign payload (default 'model' until
  // the query resolves; the 0012 migration backfilled every existing
  // row to 'model'). Drives the onboarding storage key + the
  // dashboard kind pill in the header. The cast accommodates a
  // transient state where the Tanstack Query cache holds a payload
  // from a pre-deploy build that didn't ship `kind` yet — the next
  // refetch fixes it.
  const arenaKind: ArenaKind =
    (data?.campaign.kind as ArenaKind | undefined) ?? 'model';

  // First-visit auto-open. Deferred until campaign data has landed so
  // the operator at least sees the dashboard scaffolding for one frame
  // before the modal pops on top of it. The ref guards against the
  // 5s polling refetch re-triggering the open every interval.
  const autoOpenConsideredRef = useRef(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!data) return;
    if (autoOpenConsideredRef.current) return;
    autoOpenConsideredRef.current = true;
    try {
      const dismissed = window.localStorage.getItem(
        arenaOnboardingStorageKey(arenaKind),
      );
      if (!dismissed) setIsOnboardingOpen(true);
    } catch {
      // localStorage can throw in private windows / strict cookie modes —
      // silently no-op auto-open. Help button still works as the manual
      // entry point.
    }
  }, [arenaKind, data]);

  const recompute = useMutation({
    mutationFn: () =>
      apiFetch<{
        ok: true;
        totalVotes: number;
        rowsWritten: number;
        iterations: number | null;
        converged: boolean | null;
        elapsedMs: number;
      }>(`/api/campaigns/${id}/recompute`, { method: 'POST' }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['campaign', id] });
      toast.success(
        `Recomputed in ${result.elapsedMs}ms`,
        {
          details: `${result.totalVotes} votes · ${
            result.iterations != null
              ? `${result.iterations} iterations${result.converged ? ' (converged)' : ' (max)'}`
              : 'no iterations'
          }`,
        },
      );
    },
    onError: (err) => {
      toast.error(
        'Recompute failed',
        { details: err instanceof Error ? err.message : String(err) },
      );
    },
  });

  const editCampaign = useMutation({
    mutationFn: (patch: {
      name: string;
      description: string;
      categories: string[];
      votingMode: VotingMode;
      emailPromptMessage: string | null;
    }) =>
      apiFetch<{ ok: true; campaign: CampaignDetail['campaign'] }>(
        `/api/campaigns/${id}`,
        {
          method: 'PATCH',
          body: JSON.stringify(patch),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaign', id] });
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
      setIsEditOpen(false);
      toast.success('Campaign updated');
    },
    onError: (err) => {
      toast.error('Update failed', {
        details: err instanceof Error ? err.message : String(err),
      });
    },
  });

  const deleteCampaign = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: true; deletedAt: string; alreadyDeleted?: boolean }>(
        `/api/campaigns/${id}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
      setIsDeleteOpen(false);
      toast.success('Campaign deleted', {
        details: 'Recoverable for 30 days before permanent purge.',
      });
      navigate('/', { replace: true });
    },
    onError: (err) => {
      toast.error('Delete failed', {
        details: err instanceof Error ? err.message : String(err),
      });
    },
  });

  const closeCampaign = useMutation({
    mutationFn: () =>
      apiFetch<{
        ok: true;
        status: 'completed';
        closedAt: string;
        alreadyClosed?: boolean;
      }>(`/api/campaigns/${id}/close`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaign', id] });
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
      setIsCloseOpen(false);
      toast.success('Campaign closed', {
        details: 'New participants can no longer start voting.',
      });
    },
    onError: (err) => {
      toast.error(
        'Close failed',
        { details: err instanceof Error ? err.message : String(err) },
      );
    },
  });

  if (error instanceof ApiError && error.status === 401) {
    navigate('/login', {
      state: { from: `/campaign/${id}` },
      replace: true,
    });
  }

  // Main per-mode rollups. Always restrict to persona-agnostic rows
  // (`personaId === null`) — per-persona rows show up in the "By
  // persona" section below when source='simulated'.
  const sortedRatings = useMemo(() => {
    if (!data) return [];
    return [...data.ratings]
      .filter(
        (r) =>
          r.category === 'overall' &&
          r.source === ratingsSource &&
          r.personaId === null,
      )
      .sort((a, b) => b.rating - a.rating);
  }, [data, ratingsSource]);

  // Per-mode overall rollups (Phase 1: slider + approve_reject). Each is
  // a list of models sorted by rating descending, pulled from category
  // `slider:overall` / `approve_reject:overall`. If the campaign has no
  // prompts of that mode, the array stays empty and the panel is hidden.
  const sortedSliderRatings = useMemo(() => {
    if (!data) return [];
    return [...data.ratings]
      .filter(
        (r) =>
          r.category === 'slider:overall' &&
          r.source === ratingsSource &&
          r.personaId === null &&
          r.gameCount > 0,
      )
      .sort((a, b) => b.rating - a.rating);
  }, [data, ratingsSource]);

  const sortedApproveRejectRatings = useMemo(() => {
    if (!data) return [];
    return [...data.ratings]
      .filter(
        (r) =>
          r.category === 'approve_reject:overall' &&
          r.source === ratingsSource &&
          r.personaId === null &&
          r.gameCount > 0,
      )
      .sort((a, b) => b.rating - a.rating);
  }, [data, ratingsSource]);

  const sortedBestOfNRatings = useMemo(() => {
    if (!data) return [];
    return [...data.ratings]
      .filter(
        (r) =>
          r.category === 'best_of_n:overall' &&
          r.source === ratingsSource &&
          r.personaId === null &&
          r.gameCount > 0,
      )
      .sort((a, b) => b.rating - a.rating);
  }, [data, ratingsSource]);

  /**
   * Per-mode prompt count for the "campaign composition" summary. The
   * Ratings tab leads with this when more than one mode is in play, so
   * the operator knows why some panels appear and others don't.
   */
  const promptsByMode = useMemo(() => {
    if (!data) return new Map<string, number>();
    const counts = new Map<string, number>();
    for (const p of data.prompts) {
      counts.set(p.mode, (counts.get(p.mode) ?? 0) + 1);
    }
    return counts;
  }, [data]);

  /**
   * Total count of models-in-any-leaderboard across all modes. Drives
   * the Ratings tab badge (so tournament-only campaigns keep the old
   * number, but mixed-mode campaigns show the full total).
   */
  const totalRatingCount =
    sortedRatings.length +
    sortedSliderRatings.length +
    sortedApproveRejectRatings.length +
    sortedBestOfNRatings.length;

  /**
   * Multi-axis ratings grouped by dimension. Categories are encoded as
   * `multi_axis:<dim>:<category>`; here we pull every row whose
   * secondary category segment is `overall`, bucket by dimension, and
   * sort each bucket's models by rating desc.
   */
  const multiAxisByDimension = useMemo(() => {
    if (!data) return [];
    const groups = new Map<string, CampaignDetail['ratings']>();
    for (const r of data.ratings) {
      if (r.gameCount === 0) continue;
      if (r.source !== ratingsSource) continue;
      if (r.personaId !== null) continue;
      if (!r.category.startsWith('multi_axis:')) continue;
      const rest = r.category.slice('multi_axis:'.length);
      const colonIdx = rest.indexOf(':');
      if (colonIdx < 0) continue;
      const dim = rest.slice(0, colonIdx);
      const subCat = rest.slice(colonIdx + 1);
      if (subCat !== 'overall') continue;
      if (!groups.has(dim)) groups.set(dim, []);
      groups.get(dim)!.push(r);
    }
    return Array.from(groups.entries())
      .map(([dim, rows]) => ({
        dimension: dim,
        rows: [...rows].sort((a, b) => b.rating - a.rating),
      }))
      .sort((a, b) => a.dimension.localeCompare(b.dimension));
  }, [data, ratingsSource]);

  /**
   * Per-persona rollups — one leaderboard per persona that contributed
   * simulated responses. Grouped from the `source='simulated'` rows
   * that carry a non-null personaId. Only rendered when the source
   * filter is set to 'simulated'; for 'human' / 'both' views the
   * per-persona rows don't exist and this stays empty.
   */
  const personaGroups = useMemo(() => {
    if (!data) return [];
    const groups = new Map<string, CampaignDetail['ratings']>();
    // Plan 06 P2-9 — accept the campaign-aggregate row for any mode the
    // ratings pipeline emits: bare 'overall' (tournament/BT) plus the
    // per-mode prefixed variants (`slider:overall`, `approve_reject:overall`,
    // `best_of_n:overall`). System-prompt arenas default to slider so
    // their per-persona aggregate lands under `slider:overall` — without
    // matching that prefix this rollup stayed empty for the wedge kind.
    const PERSONA_AGGREGATE_CATEGORIES = new Set([
      'overall',
      'slider:overall',
      'approve_reject:overall',
      'best_of_n:overall',
    ]);
    for (const r of data.ratings) {
      if (r.source !== 'simulated') continue;
      if (r.personaId == null) continue;
      if (!PERSONA_AGGREGATE_CATEGORIES.has(r.category)) continue;
      if (!groups.has(r.personaId)) groups.set(r.personaId, []);
      groups.get(r.personaId)!.push(r);
    }
    return Array.from(groups.entries()).map(([pid, rows]) => ({
      personaId: pid,
      rows: [...rows].sort((a, b) => b.rating - a.rating),
    }));
  }, [data]);

  const personasQuery = useQuery({
    queryKey: ['personas-for-dashboard'],
    queryFn: () => apiFetch<{ personas: Persona[] }>('/api/personas'),
    enabled: personaGroups.length > 0,
    staleTime: 60_000,
  });

  const shareLink = useMemo(() => {
    if (!data) return '';
    return `${window.location.origin}/vote/${data.campaign.shareSlug}`;
  }, [data]);

  const handleCopyLink = () => {
    if (!shareLink) return;
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCloseCampaign = () => {
    setIsCloseOpen(true);
  };

  const handleExportCsv = () => {
    window.open(`/api/campaigns/${id}/export`, '_blank', 'noopener');
  };

  const handleExportParticipantsCsv = () => {
    window.open(
      `/api/campaigns/${id}/export-participants`,
      '_blank',
      'noopener',
    );
  };

  const handleExportResponsesCsv = () => {
    window.open(
      `/api/campaigns/${id}/export-responses`,
      '_blank',
      'noopener',
    );
  };

  const handleExportXlsx = () => {
    window.open(
      `/api/campaigns/${id}/export-xlsx`,
      '_blank',
      'noopener',
    );
  };

  if (error instanceof ApiError && error.status === 404) {
    return (
      <AppShell
        breadcrumb={[
          { label: 'Campaigns', to: '/' },
          { label: 'Not found' },
        ]}
      >
        <CampaignNotFound />
      </AppShell>
    );
  }

  if (isLoading) {
    return (
      <AppShell
        breadcrumb={[{ label: 'Campaigns', to: '/' }, { label: 'Loading…' }]}
      >
        <CampaignDashboardSkeleton />
      </AppShell>
    );
  }

  if (error && !(error instanceof ApiError && error.status === 401)) {
    return (
      <AppShell
        breadcrumb={[{ label: 'Campaigns', to: '/' }, { label: 'Error' }]}
      >
        <CampaignLoadError
          message={error instanceof Error ? error.message : String(error)}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  if (!data) return null;

  const { campaign, stats } = data;

  return (
    <AppShell
      breadcrumb={[
        { label: 'Campaigns', to: '/' },
        { label: campaign.name },
      ]}
    >
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <EntityIcon name={campaign.name} size="lg" />
            <span className="min-w-0 truncate">{campaign.name}</span>
            <StatusBadge state={campaign.status as StatusState} />
            <KindPill kind={arenaKind} />
            <Button
              ref={helpButtonRef}
              variant="ghost"
              size="sm"
              onClick={() => setIsOnboardingOpen(true)}
              aria-label="Show arena onboarding"
              title="Re-open the onboarding"
              className="shrink-0"
            >
              <HelpCircle className="size-3.5" />
              <span className="hidden sm:inline">How it works</span>
            </Button>
          </span>
        }
        description={campaign.description || undefined}
        size="lg"
        action={
          campaign.status === 'active' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                window.open(
                  `/vote/${campaign.shareSlug}`,
                  '_blank',
                  'noopener,noreferrer',
                )
              }
            >
              <ExternalLink className="size-3.5" />
              Preview public page
            </Button>
          ) : undefined
        }
      />

      <Tabs defaultValue="overview" className="mt-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="ratings">
            Ratings
            {totalRatingCount > 0 && (
              <span className="ml-1 font-mono text-[10px] tabular-nums text-muted-foreground/80">
                {totalRatingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="prompts">
            {KIND_TAB_LABELS[arenaKind]}
            {stats.promptCount > 0 && (
              <span className="ml-1 font-mono text-[10px] tabular-nums text-muted-foreground/80">
                {stats.promptCount}
              </span>
            )}
          </TabsTrigger>
          {/* Comments tab — only shown when the campaign has at least one
              qualitative prompt. For tournament-only campaigns the tab is
              invisible so the UI stays focused. */}
          {data.prompts.some((p) => p.mode === 'qualitative') && (
            <TabsTrigger value="comments">Comments</TabsTrigger>
          )}
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* Overview ---------------------------------------------------- */}
        <TabsContent value="overview" className="flex flex-col gap-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label="Total votes" value={stats.totalVotes} />
            <StatTile
              label="Unique participants"
              value={stats.uniqueParticipants}
            />
            <StatTile
              label="Elapsed"
              value={formatDistanceToNow(new Date(campaign.createdAt))}
              mono={false}
            />
          </div>

          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <header className="border-b border-border px-5 py-3">
              <h3 className="font-heading text-sm font-semibold text-foreground">
                Public voting
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Share this link with voters — they don't need an account.
              </p>
            </header>
            <div className="flex flex-col gap-4 px-5 py-4">
              <KeyValue label="Share link">
                <code className="truncate font-mono text-xs text-foreground">
                  {campaign.shareSlug}
                </code>
              </KeyValue>
              <KeyValue label={KIND_STAT_LABELS[arenaKind].contestants}>
                <span className="font-mono text-xs tabular-nums text-foreground">
                  {stats.modelCount}
                </span>
              </KeyValue>
              <KeyValue label={KIND_STAT_LABELS[arenaKind].testCases}>
                <span className="font-mono text-xs tabular-nums text-foreground">
                  {stats.promptCount}
                </span>
              </KeyValue>
              <KeyValue label="Finished participants">
                <span className="font-mono text-xs tabular-nums text-foreground">
                  {stats.finishedParticipants}
                </span>
              </KeyValue>
              <KeyValue label="Identified · anonymous">
                <span className="font-mono text-xs tabular-nums text-foreground">
                  {stats.identifiedParticipants} · {stats.anonymousParticipants}
                </span>
              </KeyValue>
              <div className="flex flex-col gap-2 pt-2 sm:flex-row">
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleCopyLink}
                  disabled={campaign.status === 'draft'}
                  className="sm:flex-1"
                >
                  {copied ? (
                    <Check className="size-3.5" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                  {copied ? 'Copied' : 'Copy share link'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={campaign.status === 'draft'}
                  onClick={() =>
                    window.open(
                      `/vote/${campaign.shareSlug}`,
                      '_blank',
                      'noopener,noreferrer',
                    )
                  }
                  className="sm:flex-1"
                >
                  <ExternalLink className="size-3.5" />
                  Open voting page
                </Button>
              </div>
            </div>
          </section>

          <div className="flex items-start gap-2.5 rounded-lg border border-warning/20 bg-warning/5 px-4 py-3 text-xs text-warning">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <div>
              <span className="font-medium text-foreground">
                Preference ≠ correctness.
              </span>{' '}
              For high-stakes outputs, spot-check winners manually. Ratings
              reflect blind preference, not verified accuracy.
            </div>
          </div>
        </TabsContent>

        {/* Ratings ----------------------------------------------------- */}
        <TabsContent value="ratings" className="flex flex-col gap-4">
          {/* Plan 02: simulated-run launch + monitor. Lives at the top
              of the Ratings tab because simulated signal feeds into
              every leaderboard below via the source filter. */}
          <SimulatedRunPanel campaignId={campaign.id} />

          {/* Source filter pills (Plan 02). Always rendered — even for
              campaigns without simulated runs, the default 'Both' view
              equals 'Human' and the pills teach the concept. */}
          <SourceFilter
            value={ratingsSource}
            onChange={setRatingsSource}
            simulatedAvailable={data.ratings.some(
              (r) => r.source === 'simulated' && r.gameCount > 0,
            )}
          />

          {/* Plan 06 P2-A — leaderboard-view toggle (system-prompt
              arenas only). Default 'rollup' matches the legacy
              behavior; 'heatmap' swaps the per-mode panels for the
              per-(variant, prompt) cell grid.
              Plan 06 P2-7 — suite-size badge surfaces "based on N
              test prompts" alongside the toggle so the across-suite
              sample size is visible regardless of which view the
              operator picks. The badge replaces an upper-bound
              warning per PRD; CIs in the data carry the
              sample-size-thinness signal further. */}
          {arenaKind === 'system_prompt' && (
            <div className="flex flex-wrap items-center gap-3">
              <div
                role="tablist"
                aria-label="Leaderboard view"
                className="inline-flex h-9 items-center rounded-md border border-border bg-card p-0.5 text-[12px] font-medium"
              >
                {(
                  [
                    { id: 'rollup', label: 'Across suite (default)' },
                    { id: 'heatmap', label: 'By prompt (heatmap)' },
                  ] as const
                ).map((opt) => {
                  const active = leaderboardView === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setLeaderboardView(opt.id)}
                      className={cn(
                        'h-full rounded-[5px] px-3 transition-colors',
                        active
                          ? 'bg-foreground text-background'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <SuiteSizeBadge promptCount={data.prompts.length} />
            </div>
          )}

          {/* Composition summary — only shown when the campaign has more
              than one evaluation mode in play. Orients the operator
              before they scroll through the stacked per-mode panels
              below. Single-mode campaigns stay clean; no row added. */}
          {promptsByMode.size > 1 && (
            <section className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-[11px] text-muted-foreground">
              <span className="font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Campaign composition
              </span>
              {Array.from(promptsByMode.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([mode, count]) => (
                  <span
                    key={mode}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-highlight px-2 py-0.5 font-medium text-foreground"
                  >
                    {MODE_DISPLAY_NAMES[mode] ?? mode}
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                      {count}
                    </span>
                  </span>
                ))}
            </section>
          )}

          {arenaKind === 'system_prompt' && leaderboardView === 'heatmap' && (
            <SystemPromptHeatmapSection
              models={data.models}
              prompts={data.prompts}
              cells={data.heatmapCells ?? []}
            />
          )}

          {(arenaKind !== 'system_prompt' || leaderboardView === 'rollup') && (<>
          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
              <div className="flex items-center gap-2">
                <ModeBadge mode="tournament" />
                <div>
                  <h2 className="font-heading text-sm font-semibold text-foreground">
                    Model ratings
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    Bradley-Terry strength with 95% confidence intervals.
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => recompute.mutate()}
                disabled={
                  recompute.isPending || campaign.status === 'draft'
                }
                title="Run the Bradley-Terry solver + Fisher-info CIs over the full vote log"
              >
                {recompute.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                Recompute
              </Button>
            </header>

            {sortedRatings.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                {campaign.status === 'draft'
                  ? 'Activate the campaign and collect votes to populate the leaderboard.'
                  : stats.totalVotes === 0
                  ? 'No votes yet. Share the link and come back once people have voted.'
                  : 'No ratings yet — hit Recompute to run the Bradley-Terry solver.'}
              </div>
            ) : (
              <>
                {/* Desktop: fixed 6-column grid header. Hidden below sm —
                    the grid tracks sum to ~332px of fixed width + fluid,
                    which overflows on a 360px phone. */}
                <div className="hidden grid-cols-[32px_1.5fr_1fr_80px_100px_120px] items-center gap-3 border-b border-border bg-surface-highlight/40 px-5 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:grid">
                  <div>#</div>
                  <div>Model</div>
                  <div>Rating · ±CI</div>
                  <div>Win rate</div>
                  <div>Sample</div>
                  <div>Stability</div>
                </div>
                <ul className="divide-y divide-border/60">
                  {sortedRatings.map((rating, idx) => (
                    <li key={rating.campaignModelId}>
                      {/* Desktop grid row */}
                      <div className="hidden sm:block">
                        <RatingRow rating={rating} rank={idx + 1} />
                      </div>
                      {/* Mobile card row — same fields, flow layout */}
                      <div className="sm:hidden">
                        <RatingRowMobile rating={rating} rank={idx + 1} />
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {/* Slider results — shown only if the campaign has slider prompts
              with ratings. Rating is stored ×100 on the server, so divide
              here for display. */}
          {sortedSliderRatings.length > 0 && (
            <ModeScorecard
              mode="slider"
              title="Slider ratings"
              description="Mean score per model, higher is better. Error bars are ±1.96·SE."
              rows={sortedSliderRatings}
              format={(r) => (r.rating / 100).toFixed(2)}
              formatRange={(r) =>
                r.ciLow != null && r.ciHigh != null
                  ? `${(r.ciLow / 100).toFixed(2)} – ${(r.ciHigh / 100).toFixed(2)}`
                  : null
              }
              sampleLabel="ratings"
            />
          )}

          {sortedApproveRejectRatings.length > 0 && (
            <ModeScorecard
              mode="approve_reject"
              title="Approve / reject results"
              description="Pass rate per model (share of approvals). Bounds are Wilson 95% intervals."
              rows={sortedApproveRejectRatings}
              format={(r) => `${r.rating}%`}
              formatRange={(r) =>
                r.ciLow != null && r.ciHigh != null
                  ? `${r.ciLow}% – ${r.ciHigh}%`
                  : null
              }
              sampleLabel="decisions"
            />
          )}

          {sortedBestOfNRatings.length > 0 && (
            <ModeScorecard
              mode="best_of_n"
              title={
                arenaKind === 'prompt'
                  ? 'Across all inputs (Best-of-N rollup)'
                  : 'Best-of-N results'
              }
              description={
                arenaKind === 'prompt'
                  ? 'Pick rate per variant across every input. Bounds are Wilson 95% intervals. Drill into the per-input table below to see where each variant wins.'
                  : 'Win rate per model (share of times picked). Bounds are Wilson 95% intervals.'
              }
              rows={sortedBestOfNRatings}
              format={(r) => `${r.rating}%`}
              formatRange={(r) =>
                r.ciLow != null && r.ciHigh != null
                  ? `${r.ciLow}% – ${r.ciHigh}%`
                  : null
              }
              sampleLabel="shown"
            />
          )}

          {/* Plan 05 P1-B — prompt-arena surface: variant text panel +
              per-input drilldown. Renders only on kind='prompt' and
              only when there are variants to show. */}
          {arenaKind === 'prompt' && data.models.length > 0 && (
            <VariantTextPanel
              models={data.models}
              ratings={sortedBestOfNRatings}
            />
          )}

          {arenaKind === 'prompt' && (
            <PerInputDrilldown
              campaignId={campaign.id}
              prompts={data.prompts}
              models={data.models}
              perInputBestOfN={data.perInputBestOfN ?? []}
            />
          )}

          {/* Plan 06 P2-8 — variant-text side panel for system-prompt
              arenas. Collapsed by default (system prompts run long;
              the operator opens it intentionally to read the
              winner's full text). Sorted by slider rating across the
              suite — same rollup the slider scorecard above uses. */}
          {arenaKind === 'system_prompt' && data.models.length > 0 && (
            <VariantTextPanel
              models={data.models}
              ratings={sortedSliderRatings}
              defaultCollapsed
              ratingFormat="slider"
            />
          )}

          {multiAxisByDimension.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <header className="flex items-start gap-2 border-b border-border px-5 py-3">
                <ModeBadge mode="multi_axis" />
                <div>
                  <h2 className="font-heading text-sm font-semibold text-foreground">
                    Multi-axis ratings
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    Mean score per model on each dimension, higher is better.
                    Error bars are ±1.96·SE.
                  </p>
                </div>
              </header>
              <div className="flex flex-col gap-4 p-4">
                {multiAxisByDimension.map((group) => (
                  <div key={group.dimension} className="flex flex-col gap-2">
                    <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {group.dimension}
                    </h3>
                    <ul className="divide-y divide-border/60 rounded-lg border border-border">
                      {group.rows.map((r, idx) => {
                        const rangeLow = r.ciLow != null ? (r.ciLow / 100).toFixed(2) : null;
                        const rangeHigh = r.ciHigh != null ? (r.ciHigh / 100).toFixed(2) : null;
                        return (
                          <li
                            key={r.campaignModelId}
                            className="flex items-center justify-between gap-3 px-4 py-2"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="w-4 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                                {idx + 1}
                              </span>
                              <span className="truncate text-sm font-medium text-foreground">
                                {r.displayName}
                              </span>
                            </div>
                            <div className="flex items-baseline gap-3 shrink-0">
                              <span className="font-mono text-sm tabular-nums text-foreground">
                                {(r.rating / 100).toFixed(2)}
                              </span>
                              {rangeLow != null && rangeHigh != null && (
                                <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                                  {rangeLow} – {rangeHigh}
                                </span>
                              )}
                              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                                n={r.gameCount}
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Plan 02 Phase 2: per-persona rollups. Rendered only when
              the Simulated filter is selected AND the campaign has at
              least one persona-panel run on record. Each block is a
              tiny per-persona leaderboard — the main panels above
              continue to show the combined "all simulated" view. */}
          {ratingsSource === 'simulated' && personaGroups.length > 0 && (
            <PerPersonaRollup
              groups={personaGroups}
              personas={personasQuery.data?.personas ?? []}
              loading={personasQuery.isLoading}
            />
          )}
          </>)}
        </TabsContent>

        {/* Prompts ----------------------------------------------------- */}
        <TabsContent value="prompts" className="flex flex-col gap-4">
          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
              <div>
                <h2 className="font-heading text-sm font-semibold text-foreground">
                  Prompts
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  The questions voters see. One tournament runs per prompt.
                </p>
              </div>
              <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                {data.prompts.length}{' '}
                {data.prompts.length === 1 ? 'prompt' : 'prompts'}
              </span>
            </header>
            {data.prompts.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                No prompts configured yet.
              </div>
            ) : (
              <ol className="divide-y divide-border/60">
                {data.prompts.map((prompt) => (
                  <li key={prompt.id}>
                    <PromptRow prompt={prompt} index={prompt.orderIndex + 1} />
                  </li>
                ))}
              </ol>
            )}
          </section>
        </TabsContent>

        {/* Comments ---------------------------------------------------- */}
        {data.prompts.some((p) => p.mode === 'qualitative') && (
          <TabsContent value="comments" className="flex flex-col gap-4">
            <QualitativeReader campaignId={campaign.id} />
          </TabsContent>
        )}

        {/* Settings ---------------------------------------------------- */}
        <TabsContent value="settings" className="flex flex-col gap-4">
          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <header className="border-b border-border px-5 py-3">
              <h2 className="font-heading text-sm font-semibold text-foreground">
                Status
              </h2>
              <p className="text-[11px] text-muted-foreground">
                When the campaign was created and closed, plus current
                state.
              </p>
            </header>
            <dl className="grid gap-3 px-5 py-4 sm:grid-cols-2">
              <KeyValue label="Status">
                <StatusBadge state={campaign.status as StatusState} />
              </KeyValue>
              <KeyValue label="Created">
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(campaign.createdAt), {
                    addSuffix: true,
                  })}
                </span>
              </KeyValue>
              <KeyValue label="Closed">
                <span className="text-xs text-muted-foreground">
                  {campaign.closedAt
                    ? formatDistanceToNow(new Date(campaign.closedAt), {
                        addSuffix: true,
                      })
                    : '—'}
                </span>
              </KeyValue>
              <KeyValue label="Share slug">
                <code className="font-mono text-xs text-foreground">
                  {campaign.shareSlug}
                </code>
              </KeyValue>
            </dl>
          </section>

          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <header className="border-b border-border px-5 py-3">
              <h2 className="font-heading text-sm font-semibold text-foreground">
                Actions
              </h2>
            </header>
            <ul className="divide-y divide-border/60">
              <ActionRow
                icon={<Pencil className="size-4" />}
                title="Edit details"
                description="Rename, rewrite the description, or adjust the category tags."
                actionLabel="Edit"
                onClick={() => setIsEditOpen(true)}
                disabled={editCampaign.isPending}
              />
              <ActionRow
                icon={<RefreshCw className="size-4" />}
                title="Recompute ratings"
                description="Run the Bradley-Terry solver + Fisher-info CIs over the full vote log."
                actionLabel="Recompute"
                pendingLabel="Recomputing…"
                onClick={() => recompute.mutate()}
                disabled={
                  recompute.isPending || campaign.status === 'draft'
                }
                isPending={recompute.isPending}
              />
              <ActionRow
                icon={<Download className="size-4" />}
                title="Export results as CSV"
                description="Per-model leaderboard with ratings, win/loss counts, and aggregate participant counts."
                actionLabel="Export"
                onClick={handleExportCsv}
              />
              <ActionRow
                icon={<Download className="size-4" />}
                title="Export participants as CSV"
                description="One row per voter: email (blank for anonymous), start/finish time, votes cast."
                actionLabel="Export"
                onClick={handleExportParticipantsCsv}
              />
              <ActionRow
                icon={<Download className="size-4" />}
                title="Export responses as CSV"
                description="One row per response event across all evaluation modes — tournament votes, slider scores, approve/reject decisions, best-of-N picks, multi-axis scores, qualitative comments. Use this for external analysis."
                actionLabel="Export"
                onClick={handleExportResponsesCsv}
              />
              <ActionRow
                icon={<Download className="size-4" />}
                title="Export results as Excel"
                description="Multi-sheet workbook: overview, leaderboard, participants, and responses. Numeric columns typed as numbers for pivot tables."
                actionLabel="Export Excel"
                onClick={handleExportXlsx}
              />
              {campaign.status === 'active' && (
                <ActionRow
                  icon={<StopCircle className="size-4" />}
                  title="Close campaign"
                  description="Stop accepting new participants. Already-started voters can finish."
                  actionLabel="Close campaign"
                  pendingLabel="Closing…"
                  onClick={handleCloseCampaign}
                  disabled={closeCampaign.isPending}
                  isPending={closeCampaign.isPending}
                />
              )}
              <ActionRow
                icon={<Trash2 className="size-4" />}
                title="Delete campaign"
                description="Soft-delete; recoverable for 30 days before the daily cron purges it permanently."
                actionLabel="Delete"
                pendingLabel="Deleting…"
                onClick={() => setIsDeleteOpen(true)}
                disabled={deleteCampaign.isPending}
                isPending={deleteCampaign.isPending}
              />
            </ul>
          </section>
        </TabsContent>
      </Tabs>

      <ConfirmDestructive
        open={isCloseOpen}
        onOpenChange={setIsCloseOpen}
        title="Close campaign"
        description={
          <>
            New participants will no longer be able to start voting on{' '}
            <span className="font-medium text-foreground">{campaign.name}</span>.
            Participants already in progress can finish, and you can still
            recompute ratings and export votes afterward.
          </>
        }
        confirmWord={campaign.name}
        confirmLabel="Close campaign"
        isPending={closeCampaign.isPending}
        onConfirm={() => closeCampaign.mutate()}
      />

      <ConfirmDestructive
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title="Delete campaign"
        description={
          <>
            <span className="font-medium text-foreground">{campaign.name}</span>{' '}
            will disappear from your dashboards and the public voting link
            will return 404. Vote history, generations, and ratings are
            preserved for 30 days; after that the daily cron purges them
            permanently.
          </>
        }
        confirmWord={campaign.name}
        confirmLabel="Delete campaign"
        isPending={deleteCampaign.isPending}
        onConfirm={() => deleteCampaign.mutate()}
      />

      <ArenaOnboarding
        kind={arenaKind}
        open={isOnboardingOpen}
        triggerRef={helpButtonRef}
        onDismiss={() => {
          setIsOnboardingOpen(false);
          // Persist on every dismissal — the operator's mental model
          // is "I closed it, it should stay gone." Re-entry is via
          // the Help button in the page header.
          try {
            window.localStorage.setItem(
              arenaOnboardingStorageKey(arenaKind),
              new Date().toISOString(),
            );
          } catch {
            // Ignore — see the auto-open effect for the rationale.
          }
        }}
      />

      <EditCampaignDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        initial={{
          name: campaign.name,
          description: campaign.description ?? '',
          categories: campaign.categories ?? [],
          votingMode: campaign.votingMode,
          emailPromptMessage: campaign.emailPromptMessage,
        }}
        isPending={editCampaign.isPending}
        errorMessage={
          editCampaign.error instanceof Error
            ? editCampaign.error.message
            : null
        }
        onSave={(patch) => editCampaign.mutate(patch)}
      />
    </AppShell>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Local primitives
// ────────────────────────────────────────────────────────────────────────────

/**
 * Empty state for a campaign id that doesn't resolve — bogus URL, stale
 * bookmark, or a campaign the operator just deleted in another tab. We
 * deliberately don't echo the id back: the breadcrumb already disambiguates,
 * and the URL bar is right there if the operator wants to double-check.
 */
function CampaignNotFound() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto flex max-w-md flex-col items-start gap-3 rounded-xl border border-border bg-card p-6 text-sm shadow-sm">
      <h1 className="font-heading text-lg font-semibold text-foreground">
        Campaign not found
      </h1>
      <p className="text-muted-foreground">
        This campaign may have been deleted, or the URL is wrong.
      </p>
      <Button
        variant="default"
        size="sm"
        onClick={() => navigate('/')}
        className="mt-1"
      >
        Back to campaigns
      </Button>
    </div>
  );
}

/**
 * Error state for genuine load failures (5xx, network). Keeps the technical
 * message in the body so the operator can copy it into a bug report, but
 * surfaces an explicit Retry so they don't have to refresh the page.
 */
function CampaignLoadError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div className="flex flex-col gap-1">
          <div className="font-medium text-foreground">
            Failed to load campaign
          </div>
          <div className="text-xs">{message}</div>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onRetry}
        className="self-start"
      >
        <RefreshCw className="size-3.5" />
        Retry
      </Button>
    </div>
  );
}

function CampaignDashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Skeleton className="size-11 rounded-lg" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-64" />
        </div>
      </div>
      <div className="flex gap-6 border-b border-border">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-16" />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-sm"
          >
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-7 w-12" />
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-7 w-24 rounded-md" />
        </div>
        <div className="flex flex-col gap-3 px-5 py-5">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="mt-1 h-9 w-full rounded-full" />
        </div>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: string | number;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          'mt-2 text-2xl font-semibold tracking-tight text-foreground',
          mono && 'font-mono tabular-nums',
        )}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * Plan 02 Phase 2: compact per-persona leaderboard grid. One card per
 * persona whose responses contributed, sorted by the persona's
 * alphabetical name. Each card shows the top 4 models by rating — a
 * tight summary, not a full scorecard. Operators click through to a
 * persona-only view in a follow-up (Phase 3).
 */
function PerPersonaRollup({
  groups,
  personas,
  loading,
}: {
  groups: Array<{
    personaId: string;
    rows: CampaignDetail['ratings'];
  }>;
  personas: Persona[];
  loading: boolean;
}) {
  const personaById = useMemo(
    () => new Map(personas.map((p) => [p.id, p])),
    [personas],
  );
  const ordered = useMemo(
    () =>
      [...groups].sort((a, b) => {
        const nameA = personaById.get(a.personaId)?.name ?? a.personaId;
        const nameB = personaById.get(b.personaId)?.name ?? b.personaId;
        return nameA.localeCompare(nameB);
      }),
    [groups, personaById],
  );
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <ModeBadge mode="tournament" />
          <div>
            <h2 className="font-heading text-sm font-semibold text-foreground">
              By persona
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {groups.length} persona{groups.length === 1 ? '' : 's'} —
              what each simulated audience thinks.
            </p>
          </div>
        </div>
      </header>
      <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
        {ordered.map((g) => {
          const persona = personaById.get(g.personaId);
          return (
            <div
              key={g.personaId}
              className="rounded-lg border border-border bg-background p-3"
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="inline-flex size-6 items-center justify-center rounded-full bg-surface-highlight text-xs font-semibold">
                  {(persona?.name ?? '?').charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    Simulated{' '}
                    {persona?.name ??
                      (loading ? 'Loading…' : '(Deleted persona)')}
                  </p>
                  {persona?.description ? (
                    <p className="truncate text-[11px] text-muted-foreground">
                      {persona.description}
                    </p>
                  ) : null}
                </div>
              </div>
              {/* Honesty guard from Plan 02's risk list: persona results
                  are a model's imagination of the role, not real-person
                  data. The label plus this footnote keeps that
                  distinction visible on every per-persona card. */}
              <p className="mb-2 text-[10px] text-muted-foreground">
                LLM-judged from the persona&rsquo;s perspective — not a real
                survey.
              </p>
              <ul className="space-y-1">
                {g.rows.slice(0, 4).map((r, i) => (
                  <li
                    key={r.campaignModelId}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {i + 1}
                      </span>
                      <span className="truncate">{r.displayName}</span>
                    </span>
                    <span className="font-mono tabular-nums">{r.rating}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Plan 02 source filter pills. Drives `ratingsSource` state — each
 * memoized leaderboard list filters on it. Kept compact; no per-pill
 * badges or tooltips because the Simulated Runs panel above already
 * explains the semantics.
 */
function SourceFilter({
  value,
  onChange,
  simulatedAvailable,
}: {
  value: RatingSource;
  onChange: (next: RatingSource) => void;
  simulatedAvailable: boolean;
}) {
  const options: Array<{ value: RatingSource; label: string; hint: string }> = [
    { value: 'both', label: 'Both', hint: 'Humans + simulated (default)' },
    { value: 'human', label: 'Humans', hint: 'Real voters only' },
    {
      value: 'simulated',
      label: 'Simulated',
      hint: simulatedAvailable
        ? 'LLM judges only'
        : 'No simulated runs yet',
    },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-[11px] text-muted-foreground">
      <span className="font-semibold uppercase tracking-[0.14em]">
        Signal
      </span>
      <div
        role="tablist"
        aria-label="Rating signal source"
        className="flex items-center gap-1"
      >
        {options.map((opt) => {
          const active = opt.value === value;
          const disabled = opt.value === 'simulated' && !simulatedAvailable;
          return (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={disabled}
              onClick={() => onChange(opt.value)}
              title={opt.hint}
              className={cn(
                'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition',
                active
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-surface-highlight text-foreground hover:border-foreground/50',
                disabled && 'cursor-not-allowed opacity-40 hover:border-border',
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function KeyValue({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="flex min-h-[20px] items-center">{children}</div>
    </div>
  );
}

function RatingRow({
  rating,
  rank,
}: {
  rating: CampaignDetail['ratings'][number];
  rank: number;
}) {
  const ciSpread =
    rating.ciLow != null && rating.ciHigh != null
      ? Math.round((rating.ciHigh - rating.ciLow) / 2)
      : null;
  return (
    <div
      className={cn(
        'grid grid-cols-[32px_1.5fr_1fr_80px_100px_120px] items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-surface-highlight/40',
        rating.stability === 'directional' && 'opacity-70',
        rank === 1 && 'bg-surface-highlight/30',
      )}
    >
      <div className="font-mono text-xs text-muted-foreground">
        {rank.toString().padStart(2, '0')}
      </div>
      <div className="flex min-w-0 items-center gap-2.5">
        <ModelLogo
          providerModelId={rating.providerModelId}
          name={rating.displayName}
          size="sm"
        />
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">
            {rating.displayName}
          </div>
          <div className="truncate font-mono text-[11px] text-muted-foreground">
            {rating.providerModelId}
          </div>
        </div>
      </div>
      <div className="flex items-baseline gap-1.5 font-mono">
        <span className="font-semibold text-foreground">{rating.rating}</span>
        {ciSpread != null && (
          <span className="text-[11px] text-muted-foreground">±{ciSpread}</span>
        )}
      </div>
      <div className="font-mono text-foreground">
        {rating.winRate != null
          ? `${Math.round(rating.winRate * 100)}%`
          : '—'}
      </div>
      <div className="text-[11px] text-muted-foreground">
        <span className="font-mono text-foreground">{rating.gameCount}</span>{' '}
        games
      </div>
      <div>
        <StabilityChip tier={rating.stability} />
      </div>
    </div>
  );
}

/**
 * Mobile-only rating row. Same fields as RatingRow but in flow layout:
 *   header: [##] displayName                      [stability chip]
 *   line 2:       providerModelId (mono, muted)
 *   line 3:       rating ±CI (mono) · winRate% · gameCount games
 *
 * Resolves the overflow of the fixed-width 6-column grid on 360px phones
 * without hiding any data.
 */
function RatingRowMobile({
  rating,
  rank,
}: {
  rating: CampaignDetail['ratings'][number];
  rank: number;
}) {
  const ciSpread =
    rating.ciLow != null && rating.ciHigh != null
      ? Math.round((rating.ciHigh - rating.ciLow) / 2)
      : null;
  const winRateLabel =
    rating.winRate != null
      ? `${Math.round(rating.winRate * 100)}%`
      : '—';
  return (
    <div
      className={cn(
        'flex flex-col gap-1 px-4 py-3 text-sm transition-colors hover:bg-surface-highlight/40',
        rating.stability === 'directional' && 'opacity-70',
        rank === 1 && 'bg-surface-highlight/30',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {rank.toString().padStart(2, '0')}
        </span>
        <ModelLogo
          providerModelId={rating.providerModelId}
          name={rating.displayName}
          size="sm"
        />
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">
          {rating.displayName}
        </span>
        <span className="shrink-0">
          <StabilityChip tier={rating.stability} />
        </span>
      </div>
      <div className="truncate pl-[3.25rem] font-mono text-[11px] text-muted-foreground">
        {rating.providerModelId}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pl-7 font-mono text-[12px] text-muted-foreground">
        <span className="inline-flex items-baseline gap-1">
          <span className="font-semibold text-foreground">{rating.rating}</span>
          {ciSpread != null && (
            <span className="text-[11px]">±{ciSpread}</span>
          )}
        </span>
        <span aria-hidden className="text-border">·</span>
        <span className="text-foreground">{winRateLabel}</span>
        <span aria-hidden className="text-border">·</span>
        <span>
          <span className="text-foreground">{rating.gameCount}</span> games
        </span>
      </div>
    </div>
  );
}

function ActionRow({
  icon,
  title,
  description,
  actionLabel,
  pendingLabel,
  onClick,
  disabled = false,
  isPending = false,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  pendingLabel?: string;
  onClick: () => void;
  disabled?: boolean;
  isPending?: boolean;
}) {
  return (
    <li className="flex items-center gap-4 px-5 py-4">
      <div
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-highlight text-muted-foreground"
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{title}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onClick}
        disabled={disabled}
        className="shrink-0"
      >
        {isPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : null}
        {isPending && pendingLabel ? pendingLabel : actionLabel}
      </Button>
    </li>
  );
}

function PromptRow({
  prompt,
  index,
}: {
  prompt: CampaignDetail['prompts'][number];
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasContext = !!prompt.context && prompt.context.trim().length > 0;
  return (
    <article className="flex gap-4 px-5 py-4">
      <div className="font-mono text-xs text-muted-foreground tabular-nums">
        {index.toString().padStart(2, '0')}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {prompt.text}
        </p>
        {prompt.categoryTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {prompt.categoryTags.map((tag) => (
              <span
                key={tag}
                className="rounded-md border border-border bg-surface-highlight/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        {hasContext && (
          <div>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
            >
              {expanded ? 'Hide context' : 'Show context'}
            </button>
            {expanded && (
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-surface-highlight/40 px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground">
                {prompt.context}
              </pre>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Plan 05 P1-B — Prompt-arena dashboard surface.
//
// Two components:
//   - `VariantTextPanel` — always-visible (default-expanded) list of
//     each variant's full text alongside its rank. Long variants
//     collapse to a max-height with overflow scroll; the "Compare"
//     focused-pair modal is deferred per the P1-B batch's allowance.
//   - `PerInputDrilldown` — table of (input × variant) Best-of-N pick
//     counts. Click a row to expand; on expansion, lazily fetch
//     /api/campaigns/:id/generations?promptId=… to show the actual
//     output text for that input. Tournament/slider/approve_reject/
//     multi_axis prompts render placeholder cells in V1.
// ────────────────────────────────────────────────────────────────────────────

const LONG_VARIANT_THRESHOLD = 2000;

/**
 * Plan 06 P2-A — wrapper around `HeatmapLeaderboard` that adapts the
 * server's `CampaignDetail` payload to the component's input contract.
 * Renames `campaignModelId` to `variantId`, builds a truncated label
 * for each prompt's column header, and surfaces a small "Slider scores
 * 1–10" caption so operators don't have to remember which range the
 * cell colours encode against.
 *
 * No persona-axis filtering yet — V1 aggregates across all responses
 * (human + simulated combined). Per-persona heatmap views are a
 * follow-up if operators ask for them.
 */
function SystemPromptHeatmapSection({
  models,
  prompts,
  cells,
}: {
  models: CampaignDetail['models'];
  prompts: CampaignDetail['prompts'];
  cells: CampaignDetail['heatmapCells'];
}) {
  const heatmapPrompts: HeatmapPromptInput[] = useMemo(
    () =>
      prompts.map((p) => ({
        id: p.id,
        // Header label = first line of prompt, truncated to 40 chars.
        // The full text shows up in the column-header `title` tooltip.
        label: truncatePromptLabel(p.text),
        text: p.text,
        orderIndex: p.orderIndex,
      })),
    [prompts],
  );
  const heatmapCells: HeatmapCellInput[] = useMemo(
    () =>
      cells.map((c) => ({
        variantId: c.campaignModelId,
        promptId: c.promptId,
        score: c.score,
        ciLow: c.ciLow,
        ciHigh: c.ciHigh,
        sampleSize: c.sampleSize,
      })),
    [cells],
  );
  const heatmapVariants = useMemo(
    () => models.map((m) => ({ id: m.id, displayName: m.displayName })),
    [models],
  );
  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center justify-between gap-3 px-1">
        <div>
          <h2 className="font-heading text-sm font-semibold text-foreground">
            Per-prompt heatmap
          </h2>
          <p className="text-[11px] text-muted-foreground">
            Slider score per (variant, suite prompt). Hover a cell for
            the 95% CI and sample size. Greyed cells haven't been voted
            on yet.
          </p>
        </div>
      </header>
      <HeatmapLeaderboard
        variants={heatmapVariants}
        suitePrompts={heatmapPrompts}
        cells={heatmapCells}
      />
    </section>
  );
}

function truncatePromptLabel(text: string): string {
  const firstLine = text.split('\n', 1)[0]?.trim() ?? '';
  if (firstLine.length <= 40) return firstLine || '(empty)';
  return `${firstLine.slice(0, 40).trim()}…`;
}

/**
 * Plan 06 P2-7 — "based on N test prompts" badge. The PRD frames this
 * as the primary self-correcting nudge for thin suites: warnings get
 * dismissed; confidence intervals don't. The badge is small + neutral
 * so it sits next to the leaderboard view toggle without competing
 * with the data; the hover tooltip carries the explainer copy.
 *
 * The single-N model assumes every variant was scored against the
 * same suite, which is true for V1 system-prompt arenas — the suite
 * is campaign-level. If a future flow lets variants opt out of
 * specific prompts, this badge becomes per-variant and moves into
 * the row instead.
 */
export function SuiteSizeBadge({ promptCount }: { promptCount: number }) {
  const tooltip =
    'Wider error bars on the leaderboard mean less confidence. Add more test prompts to your suite to tighten the bounds.';
  return (
    <span
      title={tooltip}
      className="inline-flex h-9 items-center rounded-md border border-dashed border-border bg-card px-3 text-[11px] text-muted-foreground"
    >
      based on{' '}
      <span className="ml-1 font-mono tabular-nums text-foreground">
        {promptCount}
      </span>
      <span className="ml-1">
        test prompt{promptCount === 1 ? '' : 's'}
      </span>
    </span>
  );
}

function VariantTextPanel({
  models,
  ratings,
  defaultCollapsed = false,
  ratingFormat = 'percent',
}: {
  models: CampaignDetail['models'];
  ratings: CampaignDetail['ratings'];
  /**
   * Plan 06 P2-8 — system-prompt arenas open the panel collapsed.
   * Variant bodies run long and the leaderboard above already
   * communicates the ranking; the side panel is for "read the
   * winner's text" not "see all variants at a glance".
   */
  defaultCollapsed?: boolean;
  /**
   * How to render each variant's headline rating.
   *   - 'percent'  (default) — Plan 05 prompt-arena pick rate, e.g. "37%".
   *   - 'slider'              — Plan 06 system-prompt-arena slider score
   *                             (ratings are stored ×100; we render the
   *                             plain mean to two decimals).
   */
  ratingFormat?: 'percent' | 'slider';
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  // Map campaignModelId → rating row to read the rank/score for each
  // variant. Across-input rollup ratings are already sorted desc by
  // rating in the parent; using their order gives us per-variant rank.
  const ratingByModel = useMemo(() => {
    const map = new Map<string, { rank: number; rating: number }>();
    ratings.forEach((r, idx) => {
      map.set(r.campaignModelId, { rank: idx + 1, rating: r.rating });
    });
    return map;
  }, [ratings]);

  // Order: ranked-by-rating first; unranked variants (0 votes yet) at
  // the end, in their definition order from `models`.
  const orderedModels = useMemo(() => {
    return [...models].sort((a, b) => {
      const ra = ratingByModel.get(a.id);
      const rb = ratingByModel.get(b.id);
      if (ra && rb) return ra.rank - rb.rank;
      if (ra) return -1;
      if (rb) return 1;
      return 0;
    });
  }, [models, ratingByModel]);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div>
          <h2 className="font-heading text-sm font-semibold text-foreground">
            Variant text
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {ratingFormat === 'slider'
              ? 'The full body of each system-prompt variant, ranked by across-suite slider score.'
              : 'The full body of each variant, ranked by across-input pick rate.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          className="text-[10px] uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
        >
          {collapsed ? 'Expand' : 'Collapse'}
        </button>
      </header>
      {!collapsed && (
        <ul className="divide-y divide-border/60">
          {orderedModels.map((model) => {
            const rating = ratingByModel.get(model.id);
            const text = model.variantText ?? '';
            const isLong = text.length > LONG_VARIANT_THRESHOLD;
            return (
              <li
                key={model.id}
                className="flex flex-col gap-2 px-5 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="w-4 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                      {rating?.rank ?? '—'}
                    </span>
                    <span className="truncate text-sm font-medium text-foreground">
                      {model.displayName}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-3 shrink-0">
                    {rating != null && (
                      <span className="font-mono text-sm tabular-nums text-foreground">
                        {ratingFormat === 'slider'
                          ? (rating.rating / 100).toFixed(2)
                          : `${rating.rating}%`}
                      </span>
                    )}
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                      {text.length} chars
                    </span>
                  </div>
                </div>
                <div
                  className={cn(
                    'whitespace-pre-wrap rounded-md border border-border bg-surface-highlight/30 px-3 py-2 font-mono text-[12px] leading-relaxed text-foreground',
                    isLong && 'max-h-64 overflow-y-auto',
                  )}
                  data-testid="variant-text-body"
                >
                  {text || (
                    <span className="text-muted-foreground/60">
                      (empty variant body)
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function PerInputDrilldown({
  campaignId,
  prompts,
  models,
  perInputBestOfN,
}: {
  campaignId: string;
  prompts: CampaignDetail['prompts'];
  models: CampaignDetail['models'];
  perInputBestOfN: CampaignDetail['perInputBestOfN'];
}) {
  // Index pickCount by `${promptId}:${campaignModelId}` for O(1) cell
  // lookup. Per-input total picks is the row sum.
  const pickByCell = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of perInputBestOfN) {
      map.set(`${row.promptId}:${row.campaignModelId}`, row.pickCount);
    }
    return map;
  }, [perInputBestOfN]);

  const totalPicksByPrompt = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of perInputBestOfN) {
      map.set(
        row.promptId,
        (map.get(row.promptId) ?? 0) + row.pickCount,
      );
    }
    return map;
  }, [perInputBestOfN]);

  const [expandedPromptId, setExpandedPromptId] = useState<string | null>(null);

  if (prompts.length === 0) {
    return (
      <section className="rounded-xl border border-border bg-card px-5 py-6 text-center text-sm text-muted-foreground shadow-sm">
        Standalone variants — no inputs. Each variant's score in the
        across-input rollup above reflects all votes equally.
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <header className="border-b border-border px-5 py-3">
        <h2 className="font-heading text-sm font-semibold text-foreground">
          By input
        </h2>
        <p className="text-[11px] text-muted-foreground">
          Pick count per (input × variant) for Best-of-N prompts. Click a row
          to read each variant's actual output for that input.
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12px]">
          <thead className="bg-surface-highlight/40 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Input</th>
              {models.map((m) => (
                <th
                  key={m.id}
                  className="px-3 py-2 text-right font-medium"
                  scope="col"
                >
                  {m.displayName}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {prompts.map((prompt) => {
              const isBestOfN = prompt.mode === 'best_of_n';
              const totalPicks = totalPicksByPrompt.get(prompt.id) ?? 0;
              const expanded = expandedPromptId === prompt.id;
              return (
                <>
                  <tr
                    key={prompt.id}
                    onClick={() =>
                      setExpandedPromptId(expanded ? null : prompt.id)
                    }
                    className="cursor-pointer transition-colors hover:bg-surface-highlight/30"
                  >
                    <td className="px-3 py-2">
                      <span className="line-clamp-2 text-foreground">
                        {prompt.text}
                      </span>
                      {!isBestOfN && (
                        <span className="ml-2 inline-flex items-center rounded-full border border-border bg-surface-highlight px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {MODE_DISPLAY_NAMES[prompt.mode] ?? prompt.mode}
                        </span>
                      )}
                    </td>
                    {models.map((m) => {
                      if (!isBestOfN) {
                        return (
                          <td
                            key={m.id}
                            className="px-3 py-2 text-right text-muted-foreground/60"
                          >
                            —
                          </td>
                        );
                      }
                      const picks =
                        pickByCell.get(`${prompt.id}:${m.id}`) ?? 0;
                      const pct =
                        totalPicks > 0
                          ? Math.round((picks / totalPicks) * 100)
                          : 0;
                      return (
                        <td
                          key={m.id}
                          className="px-3 py-2 text-right font-mono tabular-nums"
                        >
                          {totalPicks > 0 ? (
                            <span className="text-foreground">
                              {picks}{' '}
                              <span className="text-muted-foreground/70">
                                ({pct}%)
                              </span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground/60">0</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
                      {isBestOfN ? totalPicks : '—'}
                    </td>
                  </tr>
                  {expanded && (
                    <tr key={`${prompt.id}-expanded`} className="bg-surface-highlight/20">
                      <td colSpan={models.length + 2} className="px-3 py-3">
                        <PromptOutputs
                          campaignId={campaignId}
                          promptId={prompt.id}
                          models={models}
                        />
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
      <footer className="border-t border-border px-5 py-2 text-[10px] text-muted-foreground">
        Per-input scores are available for Best-of-N in V1; other modes
        ship in a follow-up batch.
      </footer>
    </section>
  );
}

/**
 * Lazy-loads `/api/campaigns/:id/generations?promptId=…` when the
 * operator expands a row. Renders one card per variant with the
 * actual output (or error) for the selected input.
 */
function PromptOutputs({
  campaignId,
  promptId,
  models,
}: {
  campaignId: string;
  promptId: string;
  models: CampaignDetail['models'];
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['campaign-generations', campaignId, promptId],
    queryFn: () =>
      apiFetch<import('../lib/api').GenerationsByPromptResponse>(
        `/api/campaigns/${campaignId}/generations?promptId=${encodeURIComponent(promptId)}`,
      ),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        Loading outputs…
      </div>
    );
  }
  if (error) {
    return (
      <div className="text-[11px] text-destructive">
        {error instanceof Error ? error.message : String(error)}
      </div>
    );
  }
  if (!data) return null;

  const generationByModel = new Map(
    data.generations.map((g) => [g.campaignModelId, g]),
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {models.map((m) => {
        const gen = generationByModel.get(m.id);
        return (
          <div
            key={m.id}
            className="flex flex-col gap-1 rounded-md border border-border bg-card px-3 py-2"
          >
            <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
              <span className="truncate">{m.displayName}</span>
              {gen?.tokensOut != null && (
                <span className="font-mono">{gen.tokensOut} tok</span>
              )}
            </div>
            {gen?.error ? (
              <div className="text-[11px] text-destructive">{gen.error}</div>
            ) : gen?.output ? (
              <div className="max-h-48 overflow-y-auto whitespace-pre-wrap text-[12px] leading-relaxed text-foreground">
                {gen.output}
              </div>
            ) : (
              <div className="text-[11px] text-muted-foreground/60">
                (no generation yet)
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StabilityChip({ tier }: { tier: Stability }) {
  const labels = {
    stable:
      'Fewer than 50 comparisons. Rating is directional only — treat with caution.',
    preliminary:
      'Between 50 and 200 comparisons. Rating is directionally correct but CIs are still wide.',
    directional:
      '200+ comparisons. Rating has tightened up; treat as stable.',
  } satisfies Record<Stability, string>;

  return (
    <StatusBadge
      state={tier}
      label={STABILITY_LABELS[tier]}
      className="cursor-default"
      // Title lives on the inner element via aria-describedby in future;
      // using native title here is acceptable for a read-only hint.
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ModeScorecard — compact leaderboard panel used for slider + approve/
// reject results. Mirrors the top B-T leaderboard's chrome but without
// the stability + win-rate columns (neither applies to these modes).
// Phase 1 scope: simple and readable; Phase 2 can grow full CI bars.
// ─────────────────────────────────────────────────────────────────────────

function ModeScorecard({
  mode,
  title,
  description,
  rows,
  format,
  formatRange,
  sampleLabel,
}: {
  mode: PromptMode;
  title: string;
  description: string;
  rows: CampaignDetail['ratings'];
  format: (r: CampaignDetail['ratings'][number]) => string;
  formatRange: (r: CampaignDetail['ratings'][number]) => string | null;
  sampleLabel: string;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <header className="flex items-start gap-2 border-b border-border px-5 py-3">
        <ModeBadge mode={mode} />
        <div>
          <h2 className="font-heading text-sm font-semibold text-foreground">
            {title}
          </h2>
          <p className="text-[11px] text-muted-foreground">{description}</p>
        </div>
      </header>
      <ul className="divide-y divide-border/60">
        {rows.map((r, idx) => {
          const range = formatRange(r);
          return (
            <li
              key={r.campaignModelId}
              className="flex items-center justify-between gap-3 px-5 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-5 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                  {idx + 1}
                </span>
                <span className="truncate text-sm font-medium text-foreground">
                  {r.displayName}
                </span>
              </div>
              <div className="flex items-baseline gap-3 shrink-0">
                <span className="font-mono text-sm tabular-nums text-foreground">
                  {format(r)}
                </span>
                {range && (
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                    {range}
                  </span>
                )}
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                  n={r.gameCount}{' '}
                  <span className="opacity-70">{sampleLabel}</span>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
