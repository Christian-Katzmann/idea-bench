import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import OperatorLayout from '../components/layout/OperatorLayout';
import KpiCard from '../components/dashboard/KpiCard';
import ModelAvailabilityToggle from '../components/models/ModelAvailabilityToggle';
import ModelDetailPanel from '../components/models/ModelDetailPanel';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  ApiError,
  apiFetch,
  type ModelLibraryData,
  type ModelLibraryRow,
} from '../lib/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

function buildLibraryUrl(search: string, status: string, sort: string) {
  const params = new URLSearchParams({ status, sort });
  if (search.trim()) params.set('search', search.trim());
  return `/api/models?${params.toString()}`;
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
  useDocumentTitle('Model Library');
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
    mutationFn: ({ id, patch }: { id: string; patch: { enabled?: boolean; legacy?: boolean } }) =>
      apiFetch(`/api/models/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: ['models'] });
      const previous = queryClient.getQueriesData<ModelLibraryData>({ queryKey: ['models'] });
      previous.forEach(([key, value]) => {
        if (value) queryClient.setQueryData(key, applyRegistryPatch(value, id, patch));
      });
      return { previous };
    },
    onError: (_error, _variables, context) => {
      context?.previous.forEach(([key, value]) => {
        queryClient.setQueryData(key, value);
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['models'] });
    },
  });

  if (error instanceof ApiError && error.status === 401) {
    navigate('/login', { state: { from: '/models' }, replace: true });
  }

  if (isLoading) {
    return (
      <OperatorLayout>
        <div className="text-sm text-muted-foreground">Loading model library...</div>
      </OperatorLayout>
    );
  }

  if (error && !(error instanceof ApiError && error.status === 401)) {
    return (
      <OperatorLayout>
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error instanceof Error ? error.message : String(error)}
        </div>
      </OperatorLayout>
    );
  }

  if (!data) return null;

  return (
    <OperatorLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight">Model Library</h1>
          <p className="text-sm text-muted-foreground">
            Live availability controls, cross-campaign usage, and practical guidance for the next campaign.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Total Models" value={data.summary.totalModels} />
          <KpiCard label="Enabled" value={data.summary.enabled} />
          <KpiCard label="Disabled" value={data.summary.disabled} />
          <KpiCard label="Legacy" value={data.summary.legacy} />
        </div>

        <Card className="border-border bg-card rounded-xl shadow-none">
          <CardHeader className="border-b border-border/80 pb-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <CardTitle className="text-lg">Catalog</CardTitle>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by model name or provider ID"
                  className="min-w-[260px] bg-background"
                />
                <select
                  aria-label="Model status filter"
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  className="h-8 rounded-lg border border-input bg-background px-3 text-sm"
                >
                  <option value="all">All statuses</option>
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                  <option value="legacy">Legacy</option>
                  <option value="in-use">In use</option>
                </select>
                <select
                  aria-label="Model sort order"
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                  className="h-8 rounded-lg border border-input bg-background px-3 text-sm"
                >
                  <option value="usage">Sort by usage</option>
                  <option value="winRate">Sort by win rate</option>
                  <option value="name">Sort by name</option>
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead>Availability</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Win Signal</TableHead>
                  <TableHead>Recommendation</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium text-foreground">{row.displayName}</div>
                        <div className="mt-1 text-xs text-muted-foreground font-mono">
                          {row.providerModelId}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <ModelAvailabilityToggle
                          checked={row.enabled && !row.legacy}
                          label={row.displayName}
                          onChange={() =>
                            patchMutation.mutate({
                              id: row.id,
                              patch: { enabled: !row.enabled },
                            })
                          }
                        />
                        <Badge variant="outline" className="capitalize border-border text-muted-foreground">
                          {row.availability}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.usage.campaigns} campaigns
                    </TableCell>
                    <TableCell>
                      {row.performance.winRate != null
                        ? `${Math.round(row.performance.winRate * 100)}%`
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{row.recommendation}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setDetailRow(row)}>
                        Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-border bg-card rounded-xl shadow-none">
          <CardHeader className="border-b border-border/80 pb-4">
            <CardTitle className="text-lg">Selection Guidance</CardTitle>
          </CardHeader>
          <CardContent className="pt-5">
            <div className="flex flex-wrap gap-2 mb-3">
              {data.rows
                .filter((row) => data.guidance.recommendedIds.includes(row.id))
                .map((row) => (
                  <Badge key={row.id} variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                    {row.displayName}
                  </Badge>
                ))}
            </div>
            <p className="text-sm text-muted-foreground">{data.guidance.note}</p>
          </CardContent>
        </Card>
      </div>

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
    </OperatorLayout>
  );
}
