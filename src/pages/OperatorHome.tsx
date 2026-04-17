import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import OperatorLayout from '../components/layout/OperatorLayout';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import {
  Plus,
  Play,
  CheckCircle2,
  FileEdit,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import {
  ApiError,
  apiFetch,
  type CampaignSummary,
} from '../lib/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <Play className="w-4 h-4 text-emerald-500" />;
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-muted-foreground" />;
      case 'draft':
        return <FileEdit className="w-4 h-4 text-amber-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <Badge
            variant="default"
            className="bg-emerald-500 hover:bg-emerald-600"
          >
            Active
          </Badge>
        );
      case 'completed':
        return <Badge variant="secondary">Completed</Badge>;
      case 'draft':
        return (
          <Badge
            variant="outline"
            className="text-amber-500 border-amber-500/20 bg-amber-500/10"
          >
            Draft
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <OperatorLayout>
      <div className="flex items-end justify-between mb-2">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight mb-1">
            Campaigns
          </h1>
          <p className="text-muted-foreground text-sm">
            Manage your model evaluation campaigns.
          </p>
        </div>
        <Button
          onClick={() => navigate('/campaign/new')}
          className="bg-foreground text-background hover:bg-foreground/90 font-semibold h-9 px-4 rounded-md"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Campaign
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading campaigns...
        </div>
      )}

      {error && !(error instanceof ApiError && error.status === 401) && (
        <div className="p-3 rounded-md bg-red-500/10 border border-red-500/30 text-red-500 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error instanceof Error ? error.message : String(error)}</span>
        </div>
      )}

      <div className="grid gap-4">
        {campaigns.map((campaign) => (
          <Card
            key={campaign.id}
            className="bg-card border-border hover:bg-foreground/5 transition-colors cursor-pointer rounded-xl"
            onClick={() => navigate(`/campaign/${campaign.id}`)}
          >
            <CardContent className="p-6 flex items-center justify-between">
              <div className="flex items-start gap-4">
                <div className="mt-1">{getStatusIcon(campaign.status)}</div>
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-semibold text-lg">{campaign.name}</h3>
                    {getStatusBadge(campaign.status)}
                  </div>
                  <p className="text-muted-foreground text-sm mb-3 line-clamp-1">
                    {campaign.description}
                  </p>
                  <div className="flex items-center gap-2">
                    {campaign.categories.map((cat) => (
                      <Badge
                        key={cat}
                        variant="secondary"
                        className="text-xs font-normal bg-foreground/5 text-muted-foreground border-border"
                      >
                        {cat}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              <div className="text-right text-sm text-muted-foreground flex flex-col items-end gap-2">
                <div className="font-medium text-foreground">
                  {campaign.status === 'active'
                    ? 'Running'
                    : campaign.status === 'completed'
                      ? 'Closed'
                      : 'Not started'}
                </div>
                <div>
                  Created{' '}
                  {formatDistanceToNow(new Date(campaign.createdAt), {
                    addSuffix: true,
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {!isLoading && campaigns.length === 0 && (
          <div className="text-center py-12 border border-dashed border-border rounded-xl bg-card/50">
            <h3 className="text-lg font-medium text-foreground mb-1">
              No campaigns yet
            </h3>
            <p className="text-muted-foreground mb-4">
              Create your first campaign to start evaluating models.
            </p>
            <Button
              onClick={() => navigate('/campaign/new')}
              variant="outline"
              className="border-border text-foreground hover:bg-foreground/5"
            >
              Create Campaign
            </Button>
          </div>
        )}
      </div>
    </OperatorLayout>
  );
}
