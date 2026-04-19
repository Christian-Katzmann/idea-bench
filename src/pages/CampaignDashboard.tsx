import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Info,
  Loader2,
  RefreshCw,
  StopCircle,
} from 'lucide-react';
import { AppShell } from '../components/layout/app-shell';
import { ConfirmDestructive } from '../components/modals/confirm-destructive';
import { Button } from '../components/ui/button';
import { EntityIcon } from '../components/ui/entity-icon';
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
import { ApiError, apiFetch, type CampaignDetail } from '../lib/api';
import { STABILITY_LABELS, type Stability } from '../lib/stability';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { cn } from '../lib/utils';

export default function CampaignDashboard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [isCloseOpen, setIsCloseOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => apiFetch<CampaignDetail>(`/api/campaigns/${id}`),
    enabled: !!id,
  });

  useDocumentTitle(data?.campaign.name ?? 'Campaign');

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

  const sortedRatings = useMemo(() => {
    if (!data) return [];
    return [...data.ratings]
      .filter((r) => r.category === 'overall')
      .sort((a, b) => b.rating - a.rating);
  }, [data]);

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
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <div className="font-medium text-foreground">
              Failed to load campaign
            </div>
            <div className="mt-0.5 text-xs">
              {error instanceof Error ? error.message : String(error)}
            </div>
          </div>
        </div>
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
            {sortedRatings.length > 0 && (
              <span className="ml-1 font-mono text-[10px] tabular-nums text-muted-foreground/80">
                {sortedRatings.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="prompts">
            Prompts
            {stats.promptCount > 0 && (
              <span className="ml-1 font-mono text-[10px] tabular-nums text-muted-foreground/80">
                {stats.promptCount}
              </span>
            )}
          </TabsTrigger>
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
              <KeyValue label="Models">
                <span className="font-mono text-xs tabular-nums text-foreground">
                  {stats.modelCount}
                </span>
              </KeyValue>
              <KeyValue label="Prompts">
                <span className="font-mono text-xs tabular-nums text-foreground">
                  {stats.promptCount}
                </span>
              </KeyValue>
              <KeyValue label="Finished participants">
                <span className="font-mono text-xs tabular-nums text-foreground">
                  {stats.finishedParticipants}
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
          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
              <div>
                <h2 className="font-heading text-sm font-semibold text-foreground">
                  Model ratings
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  Bradley-Terry strength with 95% confidence intervals.
                </p>
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
                <div className="grid grid-cols-[32px_1.5fr_1fr_80px_100px_120px] items-center gap-3 border-b border-border bg-surface-highlight/40 px-5 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
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
                      <RatingRow rating={rating} rank={idx + 1} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </TabsContent>

        {/* Prompts ----------------------------------------------------- */}
        <TabsContent value="prompts" className="flex flex-col gap-4">
          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <header className="border-b border-border px-5 py-3">
              <h2 className="font-heading text-sm font-semibold text-foreground">
                Prompts
              </h2>
              <p className="text-[11px] text-muted-foreground">
                The questions voters see. One tournament runs per prompt.
              </p>
            </header>
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-surface-highlight text-muted-foreground">
                <FileText className="size-5" />
              </div>
              <div className="max-w-sm">
                <div className="text-sm font-medium text-foreground">
                  {stats.promptCount}{' '}
                  {stats.promptCount === 1 ? 'prompt' : 'prompts'} configured
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Full prompt content isn't returned by{' '}
                  <code className="font-mono text-[11px] text-foreground">
                    /api/campaigns/:id
                  </code>{' '}
                  yet. Extending the detail endpoint to include prompt
                  bodies will light up this view.
                </p>
              </div>
            </div>
          </section>
        </TabsContent>

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
                title="Export votes as CSV"
                description="Download every vote with participant, tournament, and prompt IDs."
                actionLabel="Export"
                onClick={handleExportCsv}
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
    </AppShell>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Local primitives
// ────────────────────────────────────────────────────────────────────────────

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
      <div className="min-w-0">
        <div className="truncate font-medium text-foreground">
          {rating.displayName}
        </div>
        <div className="truncate font-mono text-[11px] text-muted-foreground">
          {rating.providerModelId}
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
