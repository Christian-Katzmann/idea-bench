import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from '@/lib/relative-time';
import {
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  Plus,
} from 'lucide-react';
import { AppShell } from '../components/layout/app-shell';
import { Button } from '../components/ui/button';
import { EntityIcon } from '../components/ui/entity-icon';
import { PageHeader } from '../components/ui/page-header';
import { Skeleton } from '../components/ui/skeleton';
import { StatusBadge, type StatusState } from '../components/ui/status-badge';
import KpiCard from '../components/dashboard/KpiCard';
import { Spotlight } from '../components/dashboard/leaderboard/Spotlight';
import { LeaderboardSkeleton } from '../components/dashboard/leaderboard/LeaderboardSkeleton';
import {
  ApiError,
  apiFetch,
  type ActivityEvent,
  type DashboardSummary,
} from '../lib/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { cn } from '../lib/utils';

const ATTENTION_SECTIONS = [
  {
    key: 'draftsNeedingGeneration' as const,
    title: 'Drafts needing generation',
    empty: 'Every draft has at least one generated output.',
  },
  {
    key: 'readyToLaunch' as const,
    title: 'Ready to launch',
    empty: 'Nothing is fully staged right now.',
  },
  {
    key: 'lowVoteVolume' as const,
    title: 'Low vote volume',
    empty: 'Active campaigns have healthy vote volume.',
  },
];

export default function OperatorDashboard() {
  const navigate = useNavigate();
  useDocumentTitle('Dashboard');

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiFetch<DashboardSummary>('/api/operator/dashboard'),
    // Keep the live leaderboard's vote ticker and row-flash animations
    // fed by fresh data. The endpoint is Runtime-Cache-backed (5min TTL) and
    // invalidated on vote-submit / recompute, so the effective cadence is
    // "as fast as the server has new numbers." 5 s is the leaderboard's
    // perceptual "live" floor — closer to vote-arrival latency than the
    // earlier 20 s. Background tabs pause to avoid wasted serverless calls.
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });

  if (error instanceof ApiError && error.status === 401) {
    navigate('/login', { state: { from: '/dashboard' }, replace: true });
  }

  const isFetchError =
    error && !(error instanceof ApiError && error.status === 401);

  return (
    <AppShell breadcrumb={[{ label: 'Dashboard' }]}>
      <PageHeader
        title="Dashboard"
        description="Operator health, recent movement, and cross-campaign model signal."
        action={
          <Button onClick={() => navigate('/campaign/new')}>
            <Plus className="size-4" />
            New campaign
          </Button>
        }
      />

      {isFetchError && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{error instanceof Error ? error.message : String(error)}</span>
        </div>
      )}

      {isLoading && !data && <DashboardSkeleton />}

      {data && (
        <div className="mt-6 flex flex-col gap-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Active campaigns" value={data.kpis.activeCampaigns} />
            <KpiCard label="Draft campaigns" value={data.kpis.draftCampaigns} />
            <KpiCard label="Total votes" value={data.kpis.totalVotes} />
            <KpiCard label="Unique participants" value={data.kpis.uniqueParticipants} />
          </div>

          <Spotlight leaderboards={data.leaderboards} />

          <Panel
            title="Recent campaigns"
            rightSlot={
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {data.recentCampaigns.length} tracked
              </span>
            }
          >
            {data.recentCampaigns.length === 0 ? (
              <PanelEmpty>No campaigns yet.</PanelEmpty>
            ) : (
              <PanelList>
                {data.recentCampaigns.map((campaign) => (
                  <Link
                    key={campaign.id}
                    to={`/campaign/${campaign.id}`}
                    className="group flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-surface-highlight/40"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <EntityIcon name={campaign.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="min-w-0 truncate text-sm font-medium text-foreground">
                            {campaign.name}
                          </span>
                          <span className="shrink-0">
                            <StatusBadge
                              state={campaign.status as StatusState}
                            />
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {campaign.createdAt
                            ? `Created ${formatDistanceToNow(new Date(campaign.createdAt), { addSuffix: true })}`
                            : 'Created recently'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="font-mono text-sm tabular-nums text-foreground">
                          {campaign.totalVotes}
                        </div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          votes · {campaign.uniqueParticipants}p
                        </div>
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
                    </div>
                  </Link>
                ))}
              </PanelList>
            )}
          </Panel>

          <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <Panel title="Needs attention">
              <div className="flex flex-col gap-5 px-5 py-4">
                {ATTENTION_SECTIONS.map(({ key, title, empty }) => {
                  const items = data.attention[key];
                  return (
                    <section key={key} className="flex flex-col gap-1.5">
                      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {title}
                      </div>
                      {items.length === 0 ? (
                        <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                          {empty}
                        </div>
                      ) : (
                        <ul className="flex flex-col gap-1">
                          {items.map((item) => (
                            <li key={item.id}>
                              <Link
                                to={`/campaign/${item.id}`}
                                className="group flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-surface-highlight/60"
                              >
                                <div className="min-w-0 truncate text-foreground">
                                  {item.name}
                                </div>
                                {'totalVotes' in item && (
                                  <div className="font-mono text-[11px] text-muted-foreground">
                                    {item.totalVotes} votes
                                  </div>
                                )}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  );
                })}
              </div>
            </Panel>

            <Panel
              title="Recent movement"
              rightSlot={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/team-activity')}
                  className="-mr-2"
                >
                  Open activity
                  <ArrowRight className="size-3.5" />
                </Button>
              }
            >
              {data.recentMovement.length === 0 ? (
                <PanelEmpty>No recent movement.</PanelEmpty>
              ) : (
                <ul className="flex flex-col">
                  {data.recentMovement.map((event) => (
                    <MovementRow key={event.id} event={event} />
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      )}
    </AppShell>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Dashboard primitives — used only here, so kept local rather than exported.
// Panel: titled card with optional icon + right slot. PanelList: stacked rows
// with dividers, matches the OperatorHome list rhythm at lower density.
// ────────────────────────────────────────────────────────────────────────────

function Panel({
  title,
  icon,
  rightSlot,
  children,
  className,
}: {
  title: string;
  icon?: React.ReactNode;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="font-heading text-sm font-semibold text-foreground">
            {title}
          </h2>
        </div>
        {rightSlot}
      </div>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}

function PanelList({ children }: { children: React.ReactNode }) {
  return (
    <ul className="flex flex-col divide-y divide-border/60">
      {Array.isArray(children)
        ? children.map((child, idx) => (
            <li key={idx} className="contents">
              {child}
            </li>
          ))
        : children}
    </ul>
  );
}

function PanelEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 py-6 text-sm text-muted-foreground">{children}</div>
  );
}

const MOVEMENT_LABEL: Record<ActivityEvent['kind'], string> = {
  campaign_created: 'Campaign created',
  participant_finished: 'Participant finished',
  ratings_recomputed: 'Ratings recomputed',
};

function DashboardSkeleton() {
  return (
    <div className="mt-6 flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm"
          >
            <Skeleton className="h-2.5 w-28" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>
      <LeaderboardSkeleton />
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-16" />
        </div>
        <ul className="divide-y divide-border">
          {Array.from({ length: 4 }).map((_, j) => (
            <li
              key={j}
              className="flex items-center justify-between gap-3 px-5 py-3"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="size-7 rounded-md" />
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-3 w-36" />
                  <Skeleton className="h-2.5 w-24" />
                </div>
              </div>
              <Skeleton className="h-3 w-10" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function MovementRow({ event }: { event: ActivityEvent }) {
  const content = (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <div className="min-w-0">
        <div className="truncate text-sm text-foreground">{event.label}</div>
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {MOVEMENT_LABEL[event.kind]}
        </div>
      </div>
      <div className="shrink-0 text-[11px] text-muted-foreground">
        {formatDistanceToNow(new Date(event.at), { addSuffix: true })}
      </div>
    </div>
  );

  if (event.campaignId) {
    return (
      <li>
        <Link
          to={`/campaign/${event.campaignId}`}
          className="block border-t border-border/60 first:border-t-0 hover:bg-surface-highlight/40"
        >
          {content}
        </Link>
      </li>
    );
  }
  return (
    <li className="border-t border-border/60 first:border-t-0">{content}</li>
  );
}
