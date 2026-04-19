import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle,
  ChevronRight,
  FilePlus2,
  Loader2,
  RefreshCw,
  UserCheck,
} from 'lucide-react';
import { AppShell } from '../components/layout/app-shell';
import KpiCard from '../components/dashboard/KpiCard';
import { EntityIcon } from '../components/ui/entity-icon';
import { EmptyState } from '../components/ui/empty-state';
import { PageHeader } from '../components/ui/page-header';
import { StatusBadge, type StatusState } from '../components/ui/status-badge';
import {
  ApiError,
  apiFetch,
  type ActivityEvent,
  type ActivityFeed,
} from '../lib/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { cn } from '../lib/utils';

const EVENT_META: Record<
  ActivityEvent['kind'],
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  campaign_created: { label: 'Campaign created', icon: FilePlus2 },
  participant_finished: { label: 'Participant finished', icon: UserCheck },
  ratings_recomputed: { label: 'Ratings recomputed', icon: RefreshCw },
};

function campaignStatusToState(status: string): StatusState {
  if (status === 'active' || status === 'draft' || status === 'completed') {
    return status;
  }
  return 'directional';
}

export default function TeamActivity() {
  const navigate = useNavigate();
  useDocumentTitle('Team Activity');

  const { data, isLoading, error } = useQuery({
    queryKey: ['activity'],
    queryFn: () => apiFetch<ActivityFeed>('/api/activity'),
  });

  if (error instanceof ApiError && error.status === 401) {
    navigate('/login', { state: { from: '/team-activity' }, replace: true });
  }

  const isFetchError =
    error && !(error instanceof ApiError && error.status === 401);

  return (
    <AppShell breadcrumb={[{ label: 'Team Activity' }]}>
      <PageHeader
        title="Team Activity"
        description="What just moved across campaigns — creations, finishes, and recomputes."
      />

      {isFetchError && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{error instanceof Error ? error.message : String(error)}</span>
        </div>
      )}

      {isLoading && !data && (
        <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading activity…
        </div>
      )}

      {data && (
        <div className="mt-6 flex flex-col gap-6">
          <div className="grid gap-4 md:grid-cols-3">
            <KpiCard
              label="Active campaigns"
              value={data.summary.activeCampaigns}
            />
            <KpiCard
              label="Completed campaigns"
              value={data.summary.completedCampaigns}
            />
            <KpiCard label="Total votes" value={data.summary.totalVotes} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
            <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <header className="border-b border-border px-5 py-3">
                <h2 className="font-heading text-sm font-semibold text-foreground">
                  Timeline
                </h2>
              </header>
              {data.events.length === 0 ? (
                <EmptyState
                  icon={RefreshCw}
                  title="Nothing recent"
                  description="Activity will show up here as campaigns run and votes land."
                  className="m-5 border-dashed"
                />
              ) : (
                <ol className="relative flex flex-col px-5 py-5">
                  {/* Vertical rail */}
                  <span
                    aria-hidden
                    className="absolute left-[29px] top-6 bottom-6 w-px bg-border"
                  />
                  {data.events.map((event, idx) => (
                    <TimelineRow
                      key={event.id}
                      event={event}
                      last={idx === data.events.length - 1}
                    />
                  ))}
                </ol>
              )}
            </section>

            <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <header className="border-b border-border px-5 py-3">
                <h2 className="font-heading text-sm font-semibold text-foreground">
                  Top campaigns
                </h2>
              </header>
              {data.topCampaigns.length === 0 ? (
                <div className="px-5 py-6 text-sm text-muted-foreground">
                  No campaigns yet.
                </div>
              ) : (
                <ul className="divide-y divide-border/60">
                  {data.topCampaigns.map((campaign) => (
                    <li key={campaign.id}>
                      <Link
                        to={`/campaign/${campaign.id}`}
                        className="group flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-surface-highlight/40"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <EntityIcon name={campaign.name} size="sm" />
                          <span className="truncate text-sm text-foreground">
                            {campaign.name}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <StatusBadge
                            state={campaignStatusToState(campaign.status)}
                          />
                          <ChevronRight className="size-3.5 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function TimelineRow({
  event,
  last,
}: {
  event: ActivityEvent;
  last: boolean;
}) {
  const meta = EVENT_META[event.kind];
  const Icon = meta.icon;

  const body = (
    <div className="flex items-start gap-4">
      <span
        className={cn(
          'relative z-[1] mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground',
          'group-hover:text-foreground',
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <div className="flex min-w-0 flex-1 items-start justify-between gap-3 pb-4">
        <div className="min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {meta.label}
          </div>
          <div className="mt-0.5 truncate text-sm text-foreground">
            {event.label}
          </div>
        </div>
        <div className="shrink-0 text-[11px] text-muted-foreground">
          {formatDistanceToNow(new Date(event.at), { addSuffix: true })}
        </div>
      </div>
    </div>
  );

  const className = cn(
    'group block rounded-md transition-colors',
    !last && 'border-b border-transparent',
  );

  return (
    <li className="relative">
      {event.campaignId ? (
        <Link to={`/campaign/${event.campaignId}`} className={className}>
          {body}
        </Link>
      ) : (
        <div className={className}>{body}</div>
      )}
    </li>
  );
}
