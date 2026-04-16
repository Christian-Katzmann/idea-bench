import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import OperatorLayout from '../components/layout/OperatorLayout';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { formatDistanceToNow } from 'date-fns';
import { Copy, ExternalLink, Users, Vote, Clock, AlertTriangle, Download, StopCircle, CheckCircle2 } from 'lucide-react';
import { useState, useMemo } from 'react';

export default function CampaignDashboard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const campaign = useStore(state => state.campaigns.find(c => c.id === id));
  const allRatings = useStore(state => state.ratings);
  const ratings = useMemo(() => allRatings.filter(r => r.campaignId === id), [allRatings, id]);
  const votes = useStore(state => state.votes); // In a real app, filter by campaign
  const [copied, setCopied] = useState(false);

  if (!campaign) {
    return (
      <OperatorLayout>
        <div className="text-center py-12">Campaign not found</div>
      </OperatorLayout>
    );
  }

  const handleCopyLink = () => {
    navigator.clipboard.writeText(campaign.shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sortedRatings = [...ratings].sort((a, b) => b.elo - a.elo);
  const totalVotes = votes.length; // Mock
  const uniqueParticipants = 12; // Mock

  return (
    <OperatorLayout>
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-[28px] font-semibold tracking-tight">{campaign.name}</h1>
            <span className={`text-xs px-2.5 py-1 rounded-full border ${campaign.status === 'active' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-foreground/5 text-muted-foreground border-border'}`}>
              {campaign.status === 'active' ? 'LIVE' : 'CLOSED'}
            </span>
          </div>
          <p className="text-muted-foreground text-sm">{campaign.description}</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button onClick={handleCopyLink} className="bg-foreground text-background hover:bg-foreground/90 font-semibold h-9 px-4 rounded-md">
            {copied ? <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-500" /> : <Copy className="w-4 h-4 mr-2" />}
            {copied ? 'Copied!' : 'Copy Share Link'}
          </Button>
          <Button variant="outline" onClick={() => window.open(`/vote/${campaign.id}`, '_blank')} className="border-border text-foreground hover:bg-foreground/5 h-9 px-4 rounded-md">
            <ExternalLink className="w-4 h-4 mr-2" />
            Preview
          </Button>
          {campaign.status === 'active' && (
            <Button variant="outline" className="border-border text-red-400 hover:bg-red-500/10 hover:text-red-400 h-9 px-4 rounded-md">
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
          <div className="text-xs text-muted-foreground mb-2">Unique Participants</div>
          <div className="text-2xl font-semibold font-mono">{uniqueParticipants}</div>
        </div>
        <div className="bg-card border border-border p-5 rounded-xl">
          <div className="text-xs text-muted-foreground mb-2">Elapsed Time</div>
          <div className="text-2xl font-semibold font-mono">
            {formatDistanceToNow(new Date(campaign.createdAt))}
          </div>
        </div>
        <div className="bg-card border border-border p-5 rounded-xl flex items-center justify-center">
          <Button variant="ghost" className="w-full h-full text-muted-foreground hover:text-foreground hover:bg-foreground/5">
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="flex-1 bg-card border border-border rounded-xl flex flex-col overflow-hidden">
        {/* Main Leaderboard */}
        <div className="bg-foreground/5 px-6 py-3 border-b border-border grid grid-cols-[40px_1.5fr_1fr_1fr_1fr] text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <div>#</div>
          <div>Model Name</div>
          <div>Elo Rating</div>
          <div>95% CI</div>
          <div>Sample</div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {totalVotes < 100 && (
            <div className="m-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-md flex items-start gap-3 text-amber-500 text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Low sample size.</span> Confidence intervals are wide. Results may shift significantly with more votes.
              </div>
            </div>
          )}
          
          {sortedRatings.map((rating, idx) => {
            const model = useStore.getState().modelConfigs.find(m => m.modelId === rating.modelId);
            return (
              <div key={rating.modelId} className="px-6 py-4 border-b border-border grid grid-cols-[40px_1.5fr_1fr_1fr_1fr] items-center text-sm hover:bg-foreground/5 transition-colors">
                <div className="font-mono text-muted-foreground">{(idx + 1).toString().padStart(2, '0')}</div>
                <div className="font-semibold">{model?.modelName || rating.modelId}</div>
                <div className="font-mono font-semibold">{rating.elo}</div>
                <div className="font-mono text-xs text-muted-foreground">
                  ±{Math.round((rating.ci_high - rating.ci_low) / 2)}
                </div>
                <div className="text-[13px] text-muted-foreground">{rating.gameCount} votes</div>
              </div>
            );
          })}
          {sortedRatings.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No ratings available yet. Waiting for votes.
            </div>
          )}
        </div>

        <div className="mt-auto py-4 px-6 text-xs text-muted-foreground border-t border-border flex justify-between items-center">
          <div>
            <span className="text-amber-500 mr-1.5">⚠</span>
            <strong>Critical Warning:</strong> Preference ≠ correctness. For high-stakes outputs, spot-check winners manually.
          </div>
          <div>
            Campaign ID: <span className="font-mono">{campaign.id}</span>
          </div>
        </div>
      </div>
    </OperatorLayout>
  );
}
