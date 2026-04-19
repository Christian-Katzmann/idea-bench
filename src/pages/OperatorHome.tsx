import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle,
  Boxes,
  ChevronRight,
  ExternalLink,
  Plus,
} from 'lucide-react';
import { AppShell } from '../components/layout/app-shell';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { EntityIcon } from '../components/ui/entity-icon';
import { EmptyState } from '../components/ui/empty-state';
import { PageHeader } from '../components/ui/page-header';
import { Skeleton } from '../components/ui/skeleton';
import { StatusBadge } from '../components/ui/status-badge';
import {
  ApiError,
  apiFetch,
  type CampaignSummary,
} from '../lib/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { cn } from '../lib/utils';

export default function OperatorHome() {
  const navigate = useNavigate();
  useDocumentTitle('Campaigns');

  const { data, isLoading, error } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () =>
      apiFetch<{ campaigns: CampaignSummary[] }>('/api/campaigns').then(
        (d) => d.campaigns,
      ),
  });

  // 401 → operator isn't logged in. Bounce to /login.
  if (error instanceof ApiError && error.status === 401) {
    navigate('/login', { state: { from: '/' }, replace: true });
  }

  const campaigns = data ?? [];
  const isFetchError =
    error && !(error instanceof ApiError && error.status === 401);

  return (
    <AppShell breadcrumb={[{ label: 'Campaigns' }]}>
      <PageHeader
        title="Campaigns"
        description="Run blind pairwise evaluations across models."
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

      <div className="mt-6">
        {isLoading && <CampaignListSkeleton />}

        {!isLoading && !isFetchError && campaigns.length === 0 && (
          <EmptyState
            icon={Boxes}
            title="No campaigns yet"
            description="Create a campaign to start evaluating models pairwise."
            action={
              <Button onClick={() => navigate('/campaign/new')}>
                <Plus className="size-4" />
                Create campaign
              </Button>
            }
          />
        )}

        {!isLoading && campaigns.length > 0 && (
          <div className="scanline-bg relative overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <ul className="relative z-[1] divide-y divide-border">
              {campaigns.map((campaign) => (
                <li key={campaign.id}>
                  <CampaignRow campaign={campaign} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function CampaignRow({ campaign }: { campaign: CampaignSummary }) {
  const inlineLabel = campaign.categories[0] ?? 'Evaluation';
  const subtitle =
    campaign.description?.trim() ||
    `/vote/${campaign.shareSlug}`;

  return (
    <Link
      to={`/campaign/${campaign.id}`}
      className="group flex items-center justify-between gap-4 px-4 py-3.5 transition-colors hover:bg-surface-highlight/40 md:px-5 md:py-4"
    >
      <div className="flex min-w-0 items-center gap-4">
        <EntityIcon name={campaign.name} size="md" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-foreground">
              {campaign.name}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {inlineLabel}
            </span>
            {/* Public share-link quick access — visible on hover. Rendered
                as a <button> because the whole row is already an <a> via
                react-router's <Link>; nesting anchors fails hydration. */}
            {campaign.status === 'active' && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  window.open(
                    `/vote/${campaign.shareSlug}`,
                    '_blank',
                    'noopener,noreferrer',
                  );
                }}
                aria-label="Open public voting page"
                className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
              >
                <ExternalLink className="size-3" />
              </button>
            )}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {subtitle}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-4 md:gap-8 lg:gap-12">
        {/* Secondary categories — hidden on mobile to keep the row tight */}
        <div className="hidden items-center gap-1.5 lg:flex">
          {campaign.categories.slice(1, 3).map((cat) => (
            <Badge
              key={cat}
              variant="outline"
              className="text-[10px] tracking-wide"
            >
              {cat}
            </Badge>
          ))}
        </div>
        <div className="hidden text-right md:block">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {campaign.status === 'active'
              ? 'Running'
              : campaign.status === 'completed'
              ? 'Closed'
              : 'Not started'}
          </div>
          <div className="text-[11px] text-muted-foreground/80">
            {formatDistanceToNow(new Date(campaign.createdAt), {
              addSuffix: true,
            })}
          </div>
        </div>
        <StatusBadge state={campaign.status} />
        <ChevronRight
          className={cn(
            'size-4 text-muted-foreground/40 transition-all',
            'group-hover:translate-x-0.5 group-hover:text-muted-foreground',
          )}
        />
      </div>
    </Link>
  );
}

function CampaignListSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <ul className="divide-y divide-border">
        {Array.from({ length: 4 }).map((_, i) => (
          <li
            key={i}
            className="flex items-center justify-between gap-4 px-4 py-3.5 md:px-5 md:py-4"
          >
            <div className="flex min-w-0 items-center gap-4">
              <Skeleton className="size-9 rounded-lg" />
              <div className="flex flex-col gap-2">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-2.5 w-64" />
              </div>
            </div>
            <div className="hidden items-center gap-6 md:flex">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
