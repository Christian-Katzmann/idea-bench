import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { ArrowRight, Plus, Trophy, Activity } from 'lucide-react';
import OperatorLayout from '../components/layout/OperatorLayout';
import KpiCard from '../components/dashboard/KpiCard';
import AttentionPanel from '../components/dashboard/AttentionPanel';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { ApiError, apiFetch, type DashboardSummary } from '../lib/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function OperatorDashboard() {
  const navigate = useNavigate();
  useDocumentTitle('Dashboard');
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiFetch<DashboardSummary>('/api/dashboard'),
  });

  if (error instanceof ApiError && error.status === 401) {
    navigate('/login', { state: { from: '/dashboard' }, replace: true });
  }

  if (isLoading) {
    return (
      <OperatorLayout>
        <div className="text-sm text-muted-foreground">Loading dashboard...</div>
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
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Operator health, recent movement, and cross-campaign model signal.
          </p>
        </div>
        <Button onClick={() => navigate('/campaign/new')} className="h-9 px-4">
          <Plus className="mr-2 h-4 w-4" />
          New Campaign
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Active Campaigns" value={data.kpis.activeCampaigns} />
        <KpiCard label="Draft Campaigns" value={data.kpis.draftCampaigns} />
        <KpiCard label="Total Votes" value={data.kpis.totalVotes} />
        <KpiCard label="Unique Participants" value={data.kpis.uniqueParticipants} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-border bg-card rounded-xl shadow-none">
          <CardHeader className="border-b border-border/80 pb-4">
            <div className="flex items-center justify-between gap-4">
              <CardTitle className="text-lg">Recent Campaigns</CardTitle>
              <Badge variant="outline" className="border-border text-muted-foreground">
                {data.recentCampaigns.length} tracked
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-5">
            {data.recentCampaigns.map((campaign) => (
              <button
                key={campaign.id}
                type="button"
                onClick={() => navigate(`/campaign/${campaign.id}`)}
                className="flex w-full items-center justify-between rounded-xl border border-border bg-background/60 px-4 py-3 text-left transition-colors hover:bg-background"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{campaign.name}</span>
                    <Badge variant="secondary" className="capitalize">
                      {campaign.status}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {campaign.createdAt
                      ? `Created ${formatDistanceToNow(new Date(campaign.createdAt), { addSuffix: true })}`
                      : 'Created recently'}
                  </div>
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  <div>{campaign.totalVotes} votes</div>
                  <div>{campaign.uniqueParticipants} participants</div>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border bg-card rounded-xl shadow-none">
          <CardHeader className="border-b border-border/80 pb-4">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-400" />
              <CardTitle className="text-lg">Top Models</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-5">
            {data.leaderboard.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => navigate(`/models?search=${encodeURIComponent(row.providerModelId)}`)}
                className="flex w-full items-center justify-between rounded-xl border border-border bg-background/60 px-4 py-3 text-left transition-colors hover:bg-background"
              >
                <div>
                  <div className="font-medium text-foreground">{row.displayName}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {row.campaigns} campaigns · {row.comparisons} comparisons
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm text-foreground">
                    {row.winRate != null ? `${Math.round(row.winRate * 100)}%` : '—'}
                  </div>
                  <div className="text-xs capitalize text-muted-foreground">{row.availability}</div>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <AttentionPanel
          sections={[
            {
              title: 'Drafts Needing Generation',
              emptyLabel: 'Every draft has at least one generated output.',
              items: data.attention.draftsNeedingGeneration.map((item) => ({
                ...item,
                onSelect: () => navigate(`/campaign/${item.id}`),
              })),
            },
            {
              title: 'Ready To Launch',
              emptyLabel: 'Nothing is fully staged right now.',
              items: data.attention.readyToLaunch.map((item) => ({
                ...item,
                onSelect: () => navigate(`/campaign/${item.id}`),
              })),
            },
            {
              title: 'Low Vote Volume',
              emptyLabel: 'Active campaigns have healthy vote volume.',
              items: data.attention.lowVoteVolume.map((item) => ({
                ...item,
                meta: `${item.totalVotes} votes so far`,
                onSelect: () => navigate(`/campaign/${item.id}`),
              })),
            },
          ]}
        />

        <Card className="border-border bg-card rounded-xl shadow-none">
          <CardHeader className="border-b border-border/80 pb-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-400" />
              <CardTitle className="text-lg">Recent Movement</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-5">
            {data.recentMovement.map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between rounded-xl border border-border bg-background/60 px-4 py-3"
              >
                <div>
                  <div className="font-medium text-foreground">{event.label}</div>
                  <div className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
                    {event.kind.replaceAll('_', ' ')}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(event.at), { addSuffix: true })}
                </div>
              </div>
            ))}
            <Button variant="ghost" className="w-full justify-between" onClick={() => navigate('/team-activity')}>
              Open Team Activity
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </OperatorLayout>
  );
}
