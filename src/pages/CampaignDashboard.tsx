import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import OperatorLayout from '../components/layout/OperatorLayout';
import { Button } from '../components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import {
  Copy,
  ExternalLink,
  AlertTriangle,
  Download,
  StopCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { ApiError, apiFetch, type CampaignDetail } from '../lib/api';
import { STABILITY_LABELS, type Stability } from '../lib/stability';

export default function CampaignDashboard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => apiFetch<CampaignDetail>(`/api/campaigns/${id}`),
    enabled: !!id,
  });

  const recompute = useMutation({
    mutationFn: () =>
      apiFetch<{
        ok: true;
        totalVotes: number;
        rowsWritten: number;
        iterations: number | null;
        converged: boolean | null;
        elapsedMs: number;
      }>(`/api/campaigns/${id}/recompute`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaign', id] });
    },
  });

  if (error instanceof ApiError && error.status === 401) {
    navigate('/login', {
      state: { from: `/campaign/${id}` },
      replace: true,
    });
  }

  const sortedRatings = useMemo(() => {
    if (!data) return [];
    return [...data.ratings]
      .filter((r) => r.category === 'overall')
      .sort((a, b) => b.rating - a.rating);
  }, [data]);

  const shareLink = useMemo(() => {
    if (!data) return '';
    return `${window.location.origin}/vote/${data.campaign.shareSlug}`;
  }, [data]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <OperatorLayout>
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading campaign...
        </div>
      </OperatorLayout>
    );
  }

  if (error && !(error instanceof ApiError && error.status === 401)) {
    return (
      <OperatorLayout>
        <div className="p-4 rounded-md bg-red-500/10 border border-red-500/30 text-red-500">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Failed to load campaign</div>
              <div className="text-sm mt-1">
                {error instanceof Error ? error.message : String(error)}
              </div>
            </div>
          </div>
        </div>
      </OperatorLayout>
    );
  }

  if (!data) return null;

  function StabilityBadge({ tier }: { tier: Stability }) {
    const styles: Record<Stability, string> = {
      stable:
        'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
      preliminary:
        'bg-amber-500/10 text-amber-500 border-amber-500/30',
      directional:
        'bg-muted text-muted-foreground border-border',
    };
    return (
      <span
        className={`text-[10px] uppercase tracking-wider font-medium px-2 py-1 rounded border ${styles[tier]}`}
        title={
          tier === 'directional'
            ? 'Fewer than 50 comparisons. Rating is directional only — treat with caution.'
            : tier === 'preliminary'
              ? 'Between 50 and 200 comparisons. Rating is directionally correct but confidence intervals are still wide.'
              : '200+ comparisons. Rating has tightened up; treat as stable.'
        }
      >
        {STABILITY_LABELS[tier]}
      </span>
    );
  }

  const { campaign, stats } = data;
  const totalVotes = stats.totalVotes;
  const uniqueParticipants = stats.uniqueParticipants;

  return (
    <OperatorLayout>
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-[28px] font-semibold tracking-tight">
              {campaign.name}
            </h1>
            <span
              className={`text-xs px-2.5 py-1 rounded-full border ${
                campaign.status === 'active'
                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                  : campaign.status === 'draft'
                    ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                    : 'bg-foreground/5 text-muted-foreground border-border'
              }`}
            >
              {campaign.status === 'active'
                ? 'LIVE'
                : campaign.status === 'draft'
                  ? 'DRAFT'
                  : 'CLOSED'}
            </span>
          </div>
          <p className="text-muted-foreground text-sm">
            {campaign.description}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={handleCopyLink}
            disabled={campaign.status === 'draft'}
            className="bg-foreground text-background hover:bg-foreground/90 font-semibold h-9 px-4 rounded-md disabled:opacity-50"
          >
            {copied ? (
              <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-500" />
            ) : (
              <Copy className="w-4 h-4 mr-2" />
            )}
            {copied ? 'Copied!' : 'Copy Share Link'}
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              window.open(`/vote/${campaign.shareSlug}`, '_blank')
            }
            disabled={campaign.status === 'draft'}
            className="border-border text-foreground hover:bg-foreground/5 h-9 px-4 rounded-md disabled:opacity-50"
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Preview
          </Button>
          {campaign.status === 'active' && (
            <Button
              variant="outline"
              className="border-border text-red-400 hover:bg-red-500/10 hover:text-red-400 h-9 px-4 rounded-md"
            >
              <StopCircle className="w-4 h-4 mr-2" />
              Close
            </Button>
          )}
        </div>
      </div>

      {/* Stats Strip */}
      <div className="grid grid-cols-4 gap-5">
        <div className="bg-card border border-border p-5 rounded-xl">
          <div className="text-xs text-muted-foreground mb-2">Total Votes</div>
          <div className="text-2xl font-semibold font-mono">{totalVotes}</div>
        </div>
        <div className="bg-card border border-border p-5 rounded-xl">
          <div className="text-xs text-muted-foreground mb-2">
            Unique Participants
          </div>
          <div className="text-2xl font-semibold font-mono">
            {uniqueParticipants}
          </div>
        </div>
        <div className="bg-card border border-border p-5 rounded-xl">
          <div className="text-xs text-muted-foreground mb-2">Elapsed</div>
          <div className="text-2xl font-semibold font-mono">
            {formatDistanceToNow(new Date(campaign.createdAt))}
          </div>
        </div>
        <div className="bg-card border border-border p-5 rounded-xl flex items-center justify-center">
          <Button
            variant="ghost"
            className="w-full h-full text-muted-foreground hover:text-foreground hover:bg-foreground/5"
          >
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="flex-1 bg-card border border-border rounded-xl flex flex-col overflow-hidden">
        <div className="bg-foreground/5 px-6 py-3 border-b border-border flex items-center justify-between gap-4">
          <div className="grid grid-cols-[40px_1.5fr_1fr_1fr_1fr_140px] flex-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <div>#</div>
            <div>Model</div>
            <div>Rating · 95% CI</div>
            <div>Win rate</div>
            <div>Sample</div>
            <div>Tier</div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => recompute.mutate()}
            disabled={recompute.isPending || campaign.status === 'draft'}
            className="text-muted-foreground hover:text-foreground"
            title="Run the Bradley-Terry solver + Fisher-info CIs over the full vote log"
          >
            {recompute.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            <span className="ml-2 text-xs">Recompute</span>
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {sortedRatings.map((rating, idx) => (
            <div
              key={rating.campaignModelId}
              className={`px-6 py-4 border-b border-border grid grid-cols-[40px_1.5fr_1fr_1fr_1fr_140px] items-center text-sm hover:bg-foreground/5 transition-colors ${
                rating.stability === 'directional' ? 'opacity-60' : ''
              }`}
            >
              <div className="font-mono text-muted-foreground">
                {(idx + 1).toString().padStart(2, '0')}
              </div>
              <div className="font-semibold">{rating.displayName}</div>
              <div className="font-mono text-sm">
                <span className="font-semibold">{rating.rating}</span>
                {rating.ciLow != null && rating.ciHigh != null && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ±{Math.round((rating.ciHigh - rating.ciLow) / 2)}
                  </span>
                )}
              </div>
              <div className="font-mono">
                {rating.winRate != null
                  ? `${Math.round(rating.winRate * 100)}%`
                  : '—'}
              </div>
              <div className="text-[13px] text-muted-foreground">
                <span className="font-mono">{rating.gameCount}</span> comparisons
              </div>
              <div>
                <StabilityBadge tier={rating.stability} />
              </div>
            </div>
          ))}
          {sortedRatings.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              {campaign.status === 'draft'
                ? 'Activate the campaign and collect votes to populate the leaderboard.'
                : totalVotes === 0
                  ? 'No votes yet. Share the link and come back once people have voted.'
                  : 'No ratings yet — hit Recompute to run the Bradley-Terry solver.'}
            </div>
          )}
          {recompute.data && (
            <div className="px-6 py-3 border-b border-border text-xs text-muted-foreground bg-foreground/5">
              Recomputed in {recompute.data.elapsedMs}ms · {recompute.data.totalVotes} votes ·
              {' '}
              {recompute.data.iterations != null
                ? `${recompute.data.iterations} iters${recompute.data.converged ? ' (converged)' : ' (max)'}`
                : '—'}
            </div>
          )}
          {recompute.error && (
            <div className="mx-4 my-3 p-3 bg-red-500/10 border border-red-500/30 text-red-500 text-sm rounded-md flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Recompute failed:{' '}
                {recompute.error instanceof Error
                  ? recompute.error.message
                  : String(recompute.error)}
              </span>
            </div>
          )}
        </div>

        <div className="mt-auto py-4 px-6 text-xs text-muted-foreground border-t border-border flex justify-between items-center">
          <div>
            <span className="text-amber-500 mr-1.5">⚠</span>
            <strong>Critical Warning:</strong> Preference ≠ correctness. For
            high-stakes outputs, spot-check winners manually.
          </div>
          <div>
            Slug: <span className="font-mono">{campaign.shareSlug}</span>
          </div>
        </div>
      </div>
    </OperatorLayout>
  );
}
