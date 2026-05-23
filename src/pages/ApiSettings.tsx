import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Database,
  Github,
  Info,
  Key,
  Loader2,
  Lock,
  Mail,
  Sparkles,
} from 'lucide-react';
import { AppShell } from '../components/layout/app-shell';
import { PageHeader } from '../components/ui/page-header';
import { StatusBadge, type StatusState } from '../components/ui/status-badge';
import {
  ApiError,
  apiFetch,
  type ApiSettingsSummary,
  type SecretState,
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
  github: { icon: Github, title: 'GitHub OAuth' },
  resend: { icon: Mail, title: 'Resend (email link)' },
};

// Map our 3-state secret model onto the shared StatusBadge palette.
// `partial` reads as "needs attention" (warning tone); `missing` is
// archival grey — present but inert — so it doesn't compete visually
// with the partials, which actually need a deployer's eyes.
function secretBadge(state: SecretState): { state: StatusState; label: string } {
  if (state === 'configured') return { state: 'live', label: 'Configured' };
  if (state === 'partial') return { state: 'draft', label: 'Partial' };
  return { state: 'directional', label: 'Not configured' };
}

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
              rhythm on /dashboard. One tile per secret group, each a
              mini-card with an uppercase label and a status chip. Lays
              out as 2-up on tablet, 3-up on wide screens — six tiles fit
              cleanly in a 2×3 / 3×2 / 1×6 rhythm. */}
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <HealthTile label="Database" state={data.secrets.database.state} />
            <HealthTile label="Auth" state={data.secrets.auth.state} />
            <HealthTile label="Operator" state={data.secrets.operator.state} />
            <HealthTile label="OpenRouter" state={data.secrets.openrouter.state} />
            <HealthTile label="GitHub OAuth" state={data.secrets.github.state} />
            <HealthTile label="Resend" state={data.secrets.resend.state} />
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
                    {(() => {
                      const badge = secretBadge(value.state);
                      return <StatusBadge state={badge.state} label={badge.label} />;
                    })()}
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

function HealthTile({ label, state }: { label: string; state: SecretState }) {
  const badge = secretBadge(state);
  const summary =
    state === 'configured' ? 'Configured' : state === 'partial' ? 'Partial' : 'Not configured';
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="min-w-0">
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="mt-1.5 text-sm font-medium text-foreground">{summary}</div>
      </div>
      <StatusBadge state={badge.state} label={badge.label} />
    </div>
  );
}
