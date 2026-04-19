import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import type {
  DashboardLeaderboardCampaign,
  DashboardLeaderboardRow,
} from '@/lib/api';
import { LeaderboardLegend } from './LeaderboardLegend';
import { LeaderboardTable } from './LeaderboardTable';
import { LiveTicker } from './LiveTicker';

/**
 * Dashboard-level rich leaderboard. Each tab is one active campaign; the
 * body is a full Bradley-Terry table with CI bars, votes, win rate, and
 * stability chip per row.
 *
 * Liveness: this component is dumb — it renders whatever its parent fetches.
 * The parent (`OperatorDashboard`) drives refresh via React Query's
 * `refetchInterval`. We diff `ratings` across renders to detect which rows
 * changed and flash them briefly. Flash state is keyed by campaign so
 * switching tabs doesn't spuriously fire animations.
 */
export function Leaderboard({
  leaderboards,
}: {
  leaderboards: DashboardLeaderboardCampaign[];
}) {
  const navigate = useNavigate();
  const [activeId, setActiveId] = useState<string | null>(
    leaderboards[0]?.id ?? null,
  );

  // If the parent swaps which campaigns are featured (e.g., another one took
  // the vote lead), keep the active tab stable when possible; fall back to
  // the first entry.
  useEffect(() => {
    if (leaderboards.length === 0) {
      if (activeId !== null) setActiveId(null);
      return;
    }
    if (!activeId || !leaderboards.some((c) => c.id === activeId)) {
      setActiveId(leaderboards[0].id);
    }
  }, [leaderboards, activeId]);

  // Track last-seen rating/gameCount per (campaignId, campaignModelId) so we
  // can highlight rows that tick between polls. Stored as a ref so updates
  // don't retrigger the effect that computes them.
  const previousRef = useRef<Map<string, { rating: number; gameCount: number }>>(
    new Map(),
  );
  const [updatedKeys, setUpdatedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    const next = new Map<string, { rating: number; gameCount: number }>();
    const changed = new Set<string>();
    for (const campaign of leaderboards) {
      for (const row of campaign.ratings) {
        const key = rowKey(campaign.id, row);
        next.set(key, { rating: row.rating, gameCount: row.gameCount });
        const prev = previousRef.current.get(key);
        if (
          prev &&
          (prev.rating !== row.rating || prev.gameCount !== row.gameCount)
        ) {
          changed.add(key);
        }
      }
    }
    previousRef.current = next;
    if (changed.size === 0) return;
    setUpdatedKeys(changed);
    const timeout = window.setTimeout(() => setUpdatedKeys(new Set()), 1200);
    return () => window.clearTimeout(timeout);
  }, [leaderboards]);

  // Split updatedKeys by campaign for cheap prop-drilling to the table.
  const updatedByCampaign = useMemo(() => {
    const result = new Map<string, Set<string>>();
    for (const key of updatedKeys) {
      const [campaignId, campaignModelId] = splitKey(key);
      const set = result.get(campaignId) ?? new Set<string>();
      set.add(campaignModelId);
      result.set(campaignId, set);
    }
    return result;
  }, [updatedKeys]);

  if (leaderboards.length === 0) {
    return <LeaderboardEmpty onCreate={() => navigate('/campaign/new')} />;
  }

  const activeCampaign =
    leaderboards.find((c) => c.id === activeId) ?? leaderboards[0];
  const emptyRowSet = EMPTY_SET;

  return (
    <section aria-label="Live leaderboard" className="flex flex-col">
      <Tabs
        value={activeCampaign.id}
        onValueChange={(v) => {
          if (typeof v === 'string') setActiveId(v);
        }}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <TabsList
            variant="pill"
            className="h-auto gap-1 border border-border bg-transparent p-0"
          >
            {leaderboards.map((campaign) => (
              <TabsTrigger
                key={campaign.id}
                value={campaign.id}
                className="h-7 rounded-md px-3 text-[13px] font-normal data-active:border data-active:border-border data-active:bg-card data-active:shadow-sm"
                title={campaign.name}
              >
                <span className="max-w-[200px] truncate">{campaign.name}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          <LiveTicker
            totalVotes={activeCampaign.totalVotes}
            updatedAt={activeCampaign.updatedAt}
          />
        </div>

        {leaderboards.map((campaign) => (
          <TabsContent key={campaign.id} value={campaign.id}>
            {campaign.ratings.length === 0 ? (
              <LeaderboardCampaignEmpty campaign={campaign} />
            ) : (
              <LeaderboardTable
                campaign={campaign}
                updatedRowIds={
                  updatedByCampaign.get(campaign.id) ?? emptyRowSet
                }
              />
            )}
          </TabsContent>
        ))}
      </Tabs>

      <LeaderboardLegend />
    </section>
  );
}

const EMPTY_SET: Set<string> = new Set();

function rowKey(campaignId: string, row: DashboardLeaderboardRow): string {
  return `${campaignId}::${row.campaignModelId}`;
}

function splitKey(key: string): [string, string] {
  const idx = key.indexOf('::');
  return [key.slice(0, idx), key.slice(idx + 2)];
}

function LeaderboardEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border bg-card/60 px-6 py-8">
      <div>
        <h3 className="font-heading text-sm font-semibold text-foreground">
          No active evaluations yet
        </h3>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          A live leaderboard appears here once you launch a campaign and it
          starts collecting votes.
        </p>
      </div>
      <Button size="sm" onClick={onCreate}>
        <Plus className="size-3.5" />
        New campaign
      </Button>
    </div>
  );
}

function LeaderboardCampaignEmpty({
  campaign,
}: {
  campaign: DashboardLeaderboardCampaign;
}) {
  const navigate = useNavigate();
  const voteUrl = campaign.shareSlug ? `/vote/${campaign.shareSlug}` : null;
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border bg-card/60 px-6 py-8">
      <div>
        <h3 className="font-heading text-sm font-semibold text-foreground">
          No votes yet for {campaign.name}
        </h3>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Share the campaign link to start collecting preferences — the
          leaderboard updates as votes arrive.
        </p>
      </div>
      <div className="flex items-center gap-2">
        {voteUrl && (
          <Button
            size="sm"
            onClick={() => {
              navigator.clipboard
                .writeText(`${window.location.origin}${voteUrl}`)
                .catch(() => {
                  /* ignore — clipboard errors are non-fatal here */
                });
            }}
          >
            <Share2 className="size-3.5" />
            Copy share link
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/campaign/${campaign.id}`)}
        >
          Open campaign
        </Button>
      </div>
    </div>
  );
}
