import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ChevronRight,
  Search,
  Users,
} from 'lucide-react';
import { AppShell } from '../components/layout/app-shell';
import { PageHeader } from '../components/ui/page-header';
import { Skeleton } from '../components/ui/skeleton';
import { EmptyState } from '../components/ui/empty-state';
import { EntityIcon } from '../components/ui/entity-icon';
import { StatusBadge } from '../components/ui/status-badge';
import { Input } from '../components/ui/input';
import { toast } from '../components/ui/toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Button } from '../components/ui/button';
import KpiCard from '../components/dashboard/KpiCard';
import ModelAvailabilityToggle from '../components/models/ModelAvailabilityToggle';
import ModelDetailPanel from '../components/models/ModelDetailPanel';
import {
  ApiError,
  apiFetch,
  type ModelLibraryData,
  type ModelLibraryRow,
} from '../lib/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { cn } from '../lib/utils';

function buildLibraryUrl(search: string, status: string, sort: string) {
  const params = new URLSearchParams({ status, sort });
  if (search.trim()) params.set('search', search.trim());
  return `/api/operator/models?${params.toString()}`;
}

function availabilityFromRow(
  row: Pick<ModelLibraryRow, 'enabled' | 'legacy'>,
): ModelLibraryRow['availability'] {
  if (row.legacy) return 'legacy';
  return row.enabled ? 'enabled' : 'disabled';
}

function applyRegistryPatch(
  data: ModelLibraryData,
  id: string,
  patch: { enabled?: boolean; legacy?: boolean },
): ModelLibraryData {
  const rows = data.rows.map((row) => {
    if (row.id !== id) return row;
    const enabled = patch.enabled ?? row.enabled;
    const legacy = patch.legacy ?? row.legacy;
    return {
      ...row,
      enabled,
      legacy,
      availability: availabilityFromRow({ enabled, legacy }),
    };
  });

  return {
    ...data,
    rows,
    summary: {
      totalModels: rows.length,
      enabled: rows.filter((row) => row.enabled && !row.legacy).length,
      disabled: rows.filter((row) => !row.enabled && !row.legacy).length,
      legacy: rows.filter((row) => row.legacy).length,
      inUse: rows.filter((row) => row.usage.campaigns > 0).length,
    },
  };
}

export default function ModelLibrary() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useDocumentTitle('Models');
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('usage');
  const [detailRow, setDetailRow] = useState<ModelLibraryRow | null>(null);

  const libraryUrl = useMemo(
    () => buildLibraryUrl(search, status, sort),
    [search, status, sort],
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ['models', status, sort, search],
    queryFn: () => apiFetch<ModelLibraryData>(libraryUrl),
  });

  const patchMutation = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: { enabled?: boolean; legacy?: boolean };
    }) =>
      apiFetch(`/api/models/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: ['models'] });
      const previous = queryClient.getQueriesData<ModelLibraryData>({
        queryKey: ['models'],
      });
      previous.forEach(([key, value]) => {
        if (value)
          queryClient.setQueryData(key, applyRegistryPatch(value, id, patch));
      });
      return { previous };
    },
    onError: (error, _variables, context) => {
      context?.previous.forEach(([key, value]) => {
        queryClient.setQueryData(key, value);
      });
      toast.error('Model update failed', {
        details: error instanceof Error ? error.message : String(error),
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['models'] });
    },
  });

  if (error instanceof ApiError && error.status === 401) {
    navigate('/login', { state: { from: '/models' }, replace: true });
  }

  const isFetchError =
    error && !(error instanceof ApiError && error.status === 401);

  return (
    <AppShell breadcrumb={[{ label: 'Models' }]}>
      <PageHeader
        title="Models"
        description="Availability, cross-campaign usage, and selection guidance."
      />

      {isFetchError && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{error instanceof Error ? error.message : String(error)}</span>
        </div>
      )}

      {isLoading && !data && (
        <div className="mt-6 flex flex-col gap-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm"
              >
                <Skeleton className="h-2.5 w-24" />
                <Skeleton className="h-8 w-10" />
              </div>
            ))}
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-8 w-64 rounded-lg" />
            </div>
            <ul className="divide-y divide-border">
              {Array.from({ length: 6 }).map((_, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-4 px-5 py-3.5"
                >
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-9 rounded-lg" />
                    <div className="flex flex-col gap-1.5">
                      <Skeleton className="h-3 w-32" />
                      <Skeleton className="h-2.5 w-48" />
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <Skeleton className="h-5 w-9 rounded-full" />
                    <Skeleton className="h-7 w-16 rounded-md" />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {data && (
        <div className="mt-6 flex flex-col gap-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Total models" value={data.summary.totalModels} />
            <KpiCard label="Enabled" value={data.summary.enabled} />
            <KpiCard label="Disabled" value={data.summary.disabled} />
            <KpiCard label="Legacy" value={data.summary.legacy} />
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <header className="flex flex-col gap-3 border-b border-border px-5 py-3 lg:flex-row lg:items-center lg:justify-between">
              <h2 className="font-heading text-sm font-semibold text-foreground">
                Catalog
              </h2>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search model or provider id"
                    className="h-9 w-full pl-9 sm:w-64"
                  />
                </div>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-9 w-full sm:w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="enabled">Enabled</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                    <SelectItem value="legacy">Legacy</SelectItem>
                    <SelectItem value="in-use">In use</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sort} onValueChange={setSort}>
                  <SelectTrigger className="h-9 w-full sm:w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="usage">Sort by usage</SelectItem>
                    <SelectItem value="winRate">Sort by win rate</SelectItem>
                    <SelectItem value="name">Sort by name</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </header>

            {data.rows.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No models match"
                description="Adjust the search or filter to see the catalog."
                className="m-5 border-dashed"
              />
            ) : (
              <ul className="divide-y divide-border/60">
                {data.rows.map((row) => (
                  <li key={row.id}>
                    <ModelRow
                      row={row}
                      pending={patchMutation.isPending}
                      onToggle={() =>
                        patchMutation.mutate({
                          id: row.id,
                          patch: { enabled: !row.enabled },
                        })
                      }
                      onOpen={() => setDetailRow(row)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {data.guidance.recommendedIds.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <header className="border-b border-border px-5 py-3">
                <h2 className="font-heading text-sm font-semibold text-foreground">
                  Selection guidance
                </h2>
              </header>
              <div className="flex flex-col gap-3 px-5 py-4 text-sm text-muted-foreground">
                <div className="flex flex-wrap gap-2">
                  {data.rows
                    .filter((row) =>
                      data.guidance.recommendedIds.includes(row.id),
                    )
                    .map((row) => (
                      <span
                        key={row.id}
                        className="inline-flex h-6 items-center gap-1.5 rounded-full border border-accent/25 bg-accent/10 px-2.5 text-[11px] font-medium text-accent"
                      >
                        {row.displayName}
                      </span>
                    ))}
                </div>
                <p>{data.guidance.note}</p>
              </div>
            </section>
          )}
        </div>
      )}

      <ModelDetailPanel
        row={detailRow}
        open={!!detailRow}
        pending={patchMutation.isPending}
        onOpenChange={(open) => {
          if (!open) setDetailRow(null);
        }}
        onToggleLegacy={(row, legacy) => {
          patchMutation.mutate({ id: row.id, patch: { legacy } });
        }}
      />
    </AppShell>
  );
}

function ModelRow({
  row,
  pending,
  onToggle,
  onOpen,
}: {
  row: ModelLibraryRow;
  pending: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const winRatePct =
    row.performance.winRate != null
      ? `${Math.round(row.performance.winRate * 100)}%`
      : '—';
  return (
    <div className="group flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-surface-highlight/40">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <EntityIcon name={row.displayName} size="md" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">
              {row.displayName}
            </span>
            {row.legacy && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Legacy
              </span>
            )}
          </div>
          <div className="truncate font-mono text-[11px] text-muted-foreground">
            {row.providerModelId}
          </div>
        </div>
      </div>

      <div className="hidden shrink-0 items-center gap-8 md:flex lg:gap-12">
        <MetricCell
          label="campaigns"
          value={row.usage.campaigns}
          muted={row.usage.campaigns === 0}
        />
        <MetricCell
          label="win rate"
          value={winRatePct}
          muted={row.performance.winRate == null}
        />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {row.recommendation}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <ModelAvailabilityToggle
          checked={row.enabled && !row.legacy}
          label={row.displayName}
          disabled={pending || row.legacy}
          onChange={onToggle}
        />
        <Button variant="ghost" size="sm" onClick={onOpen} className="gap-1">
          Details
          <ChevronRight
            className={cn(
              'size-3.5 transition-transform group-hover:translate-x-0.5',
            )}
          />
        </Button>
      </div>
    </div>
  );
}

function MetricCell({
  label,
  value,
  muted,
}: {
  label: string;
  value: string | number;
  muted?: boolean;
}) {
  return (
    <div className="text-right">
      <div
        className={cn(
          'font-mono text-sm tabular-nums',
          muted ? 'text-muted-foreground' : 'text-foreground',
        )}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
