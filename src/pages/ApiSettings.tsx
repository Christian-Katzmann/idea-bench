import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import OperatorLayout from '../components/layout/OperatorLayout';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { ApiError, apiFetch, type ApiSettingsSummary } from '../lib/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

function statusBadge(ready: boolean) {
  return ready ? (
    <Badge className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20">Configured</Badge>
  ) : (
    <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/10">
      Missing
    </Badge>
  );
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

  if (isLoading) {
    return (
      <OperatorLayout>
        <div className="text-sm text-muted-foreground">Loading API settings...</div>
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
          <h1 className="text-[28px] font-semibold tracking-tight">API Settings</h1>
          <p className="text-sm text-muted-foreground">
            Read-only configuration health for the services this app depends on.
          </p>
        </div>

        <Card className="border-border bg-card rounded-xl shadow-none">
          <CardHeader className="border-b border-border/80 pb-4">
            <CardTitle className="text-lg">Configuration Health</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 pt-5 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-border bg-background/60 p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Database</div>
              {statusBadge(data.configurationHealth.databaseConfigured)}
            </div>
            <div className="rounded-xl border border-border bg-background/60 p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Auth</div>
              {statusBadge(data.configurationHealth.authConfigured)}
            </div>
            <div className="rounded-xl border border-border bg-background/60 p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Operator</div>
              {statusBadge(data.configurationHealth.operatorConfigured)}
            </div>
            <div className="rounded-xl border border-border bg-background/60 p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">OpenRouter</div>
              {statusBadge(data.configurationHealth.openrouterConfigured)}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card rounded-xl shadow-none">
          <CardHeader className="border-b border-border/80 pb-4">
            <CardTitle className="text-lg">Secret Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-5">
            {Object.entries(data.secrets).map(([key, value]) => (
              <div
                key={key}
                className="flex items-center justify-between rounded-xl border border-border bg-background/60 px-4 py-3"
              >
                <div>
                  <div className="font-medium capitalize text-foreground">{key}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{value.label}</div>
                </div>
                {statusBadge(value.configured)}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border bg-card rounded-xl shadow-none">
          <CardHeader className="border-b border-border/80 pb-4">
            <CardTitle className="text-lg">Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-5 text-sm text-muted-foreground">
            {data.notes.map((note) => (
              <div key={note} className="rounded-lg border border-dashed border-border px-3 py-3">
                {note}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </OperatorLayout>
  );
}
