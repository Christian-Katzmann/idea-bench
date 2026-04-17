import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import OperatorLayout from '../components/layout/OperatorLayout';
import KpiCard from '../components/dashboard/KpiCard';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { ApiError, apiFetch, type ActivityFeed } from '../lib/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

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

  if (isLoading) {
    return (
      <OperatorLayout>
        <div className="text-sm text-muted-foreground">Loading activity...</div>
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
          <h1 className="text-[28px] font-semibold tracking-tight">Team Activity</h1>
          <p className="text-sm text-muted-foreground">
            A lightweight operating view of what just happened across campaigns.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <KpiCard label="Active Campaigns" value={data.summary.activeCampaigns} />
          <KpiCard label="Completed Campaigns" value={data.summary.completedCampaigns} />
          <KpiCard label="Total Votes" value={data.summary.totalVotes} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-border bg-card rounded-xl shadow-none">
            <CardHeader className="border-b border-border/80 pb-4">
              <CardTitle className="text-lg">Recent Events</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-5">
              {data.events.map((event) => (
                <div
                  key={event.id}
                  className="rounded-xl border border-border bg-background/60 px-4 py-3"
                >
                  <div className="font-medium text-foreground">{event.label}</div>
                  <div className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
                    {event.kind.replaceAll('_', ' ')} · {formatDistanceToNow(new Date(event.at), { addSuffix: true })}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border bg-card rounded-xl shadow-none">
            <CardHeader className="border-b border-border/80 pb-4">
              <CardTitle className="text-lg">Top Campaigns</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-5">
              {data.topCampaigns.map((campaign) => (
                <div
                  key={campaign.id}
                  className="flex items-center justify-between rounded-xl border border-border bg-background/60 px-4 py-3"
                >
                  <span className="font-medium text-foreground">{campaign.name}</span>
                  <Badge variant="secondary" className="capitalize">
                    {campaign.status}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </OperatorLayout>
  );
}
