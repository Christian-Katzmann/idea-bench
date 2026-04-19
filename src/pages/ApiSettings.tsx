import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Database,
  Info,
  Key,
  Loader2,
  Lock,
  Sparkles,
} from 'lucide-react';
import { AppShell } from '../components/layout/app-shell';
import { PageHeader } from '../components/ui/page-header';
import { StatusBadge } from '../components/ui/status-badge';
import {
  ApiError,
  apiFetch,
  type ApiSettingsSummary,
} from '../lib/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const SECRET_META: Record<
  keyof ApiSettingsSummary['secrets'],
  { icon: React.ComponentType<{ className?: string }>; title: string }
> = {
  database: { icon: Database, title: 'Database' },
  auth: { icon: Lock, title: 'Auth' },
  operator: { icon: Key, title: 'Operator' },
  openrouter: { icon: Sparkles, title: 'OpenRouter' },
};

export default function ApiSettings() {
  const navigate = useNavigate();
  useDocumentTitle('API Settings');

  const { data, isLoading, error } = useQuery({
    queryKey: ['api-settings'],
    queryFn: () => apiFetch<ApiSettingsSummary>('/api/settings/api'),
  });

  if (error instanceof ApiError && error.status === 401) {
    navigate('/login', { state: { from: '/settings/api' }, replace: true });
  }

  const isFetchError =
    error && !(error instanceof ApiError && error.status === 401);

  return (
    <AppShell breadcrumb={[{ label: 'API Settings' }]}>
      <PageHeader
        title="API Settings"
        description="Read-only configuration health for the services this app depends on."
      />

      {isFetchError && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{error instanceof Error ? error.message : String(error)}</span>
        </div>
      )}

      {isLoading && !data && (
        <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading API settings…
        </div>
      )}

      {data && (
        <div className="mt-6 flex flex-col gap-6">
          {/* Configuration health — compact status strip matching the KPI
              rhythm on /dashboard. Four semantic groups, each a mini-card
              with an uppercase label and a status chip. */}
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <HealthTile
              label="Database"
              ready={data.configurationHealth.databaseConfigured}
            />
            <HealthTile
              label="Auth"
              ready={data.configurationHealth.authConfigured}
            />
            <HealthTile
              label="Operator"
              ready={data.configurationHealth.operatorConfigured}
            />
            <HealthTile
              label="OpenRouter"
              ready={data.configurationHealth.openrouterConfigured}
            />
          </section>

          {/* Secret rows — mirrors GitSlip's Security section pattern:
              leading icon tile, title + label, trailing chip. */}
          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <header className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="font-heading text-sm font-semibold text-foreground">
                Secret status
              </h2>
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {Object.values(data.secrets).filter((s) => s.configured).length}
                {' / '}
                {Object.keys(data.secrets).length} configured
              </span>
            </header>
            <ul className="divide-y divide-border/60">
              {(Object.entries(data.secrets) as Array<
                [keyof ApiSettingsSummary['secrets'], ApiSettingsSummary['secrets'][keyof ApiSettingsSummary['secrets']]]
              >).map(([key, value]) => {
                const meta = SECRET_META[key];
                const Icon = meta.icon;
                return (
                  <li
                    key={key}
                    className="flex items-center justify-between gap-4 px-5 py-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-highlight text-muted-foreground">
                        <Icon className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground">
                          {meta.title}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {value.label}
                        </div>
                      </div>
                    </div>
                    <StatusBadge
                      state={value.configured ? 'live' : 'draft'}
                      label={value.configured ? 'Configured' : 'Missing'}
                    />
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Notes — info rows with soft dashed separators. */}
          {data.notes.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <header className="flex items-center gap-2 border-b border-border px-5 py-3">
                <Info className="size-3.5 text-muted-foreground" />
                <h2 className="font-heading text-sm font-semibold text-foreground">
                  Notes
                </h2>
              </header>
              <ul className="divide-y divide-border/60 text-sm text-muted-foreground">
                {data.notes.map((note) => (
                  <li key={note} className="px-5 py-3">
                    {note}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}

function HealthTile({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="min-w-0">
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="mt-1.5 text-sm font-medium text-foreground">
          {ready ? 'Configured' : 'Missing'}
        </div>
      </div>
      <StatusBadge state={ready ? 'live' : 'draft'} label={ready ? 'Ready' : 'Missing'} />
    </div>
  );
}
