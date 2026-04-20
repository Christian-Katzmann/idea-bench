import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Combobox } from '@base-ui/react/combobox';
import { Check, ChevronDown, Plus, Search, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type {
  DashboardLeaderboardCampaign,
  DashboardLeaderboardRow,
} from '@/lib/api';
import { LeaderboardTable } from './LeaderboardTable';
import { LiveTicker } from './LiveTicker';
import { Matchups } from './Matchups';
import { Pulse } from './Pulse';

/**
 * Dashboard "Spotlight" — one campaign at a time, three tabs deep.
 *
 * Why one campaign instead of N tabs of campaigns: the dashboard is supposed
 * to give a cross-cutting health read, but pairwise model ratings can't be
 * merged across campaigns (different prompts, different models). So we let
 * the operator pick a single campaign and pivot through three views of it:
 *   - Leaderboard: BT ratings table (unchanged from before)
 *   - Matchups:    pairwise win-rate matrix
 *   - Pulse:       24h vote velocity + recent votes feed
 *
 * Default selection is whichever campaign the parent puts first, which the
 * server ranks by recent vote volume.
 */
export function Spotlight({
  leaderboards,
}: {
  leaderboards: DashboardLeaderboardCampaign[];
}) {
  const navigate = useNavigate();
  const [activeId, setActiveId] = useState<string | null>(
    leaderboards[0]?.id ?? null,
  );
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'matchups' | 'pulse'>(
    'leaderboard',
  );

  // Keep `activeId` valid as the parent's set rotates between polls.
  useEffect(() => {
    if (leaderboards.length === 0) {
      if (activeId !== null) setActiveId(null);
      return;
    }
    if (!activeId || !leaderboards.some((c) => c.id === activeId)) {
      setActiveId(leaderboards[0].id);
    }
  }, [leaderboards, activeId]);

  // Track row updates across polls for the leaderboard flash highlight.
  const previousRef = useRef<Map<string, { rating: number; gameCount: number }>>(
    new Map(),
  );
  const [updatedKeys, setUpdatedKeys] = useState<Set<string>>(new Set());
  useEffect(() => {
    const next = new Map<string, { rating: number; gameCount: number }>();
    const changed = new Set<string>();
    for (const campaign of leaderboards) {
      for (const row of campaign.ratings) {
        const key = `${campaign.id}::${row.campaignModelId}`;
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
    const t = window.setTimeout(() => setUpdatedKeys(new Set()), 1200);
    return () => window.clearTimeout(t);
  }, [leaderboards]);

  const updatedByCampaign = useMemo(() => {
    const result = new Map<string, Set<string>>();
    for (const key of updatedKeys) {
      const idx = key.indexOf('::');
      const campaignId = key.slice(0, idx);
      const campaignModelId = key.slice(idx + 2);
      const set = result.get(campaignId) ?? new Set<string>();
      set.add(campaignModelId);
      result.set(campaignId, set);
    }
    return result;
  }, [updatedKeys]);

  if (leaderboards.length === 0) {
    return <SpotlightEmpty onCreate={() => navigate('/campaign/new')} />;
  }

  const activeCampaign =
    leaderboards.find((c) => c.id === activeId) ?? leaderboards[0];

  const modelLabelById = new Map<string, DashboardLeaderboardRow>(
    activeCampaign.ratings.map((row) => [row.campaignModelId, row]),
  );

  return (
    <section aria-label="Campaign spotlight" className="flex flex-col">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CampaignPicker
            campaigns={leaderboards}
            value={activeCampaign.id}
            onChange={setActiveId}
          />
          <Tabs
            value={activeTab}
            onValueChange={(v) => {
              if (typeof v === 'string')
                setActiveTab(v as typeof activeTab);
            }}
          >
            <TabsList
              variant="pill"
              className="h-auto gap-1 border border-border bg-transparent p-0"
            >
              <TabsTrigger
                value="leaderboard"
                className="h-7 rounded-md px-3 text-[13px] font-normal data-active:border data-active:border-border data-active:bg-card data-active:shadow-sm"
              >
                Leaderboard
              </TabsTrigger>
              <TabsTrigger
                value="matchups"
                className="h-7 rounded-md px-3 text-[13px] font-normal data-active:border data-active:border-border data-active:bg-card data-active:shadow-sm"
              >
                Matchups
              </TabsTrigger>
              <TabsTrigger
                value="pulse"
                className="h-7 rounded-md px-3 text-[13px] font-normal data-active:border data-active:border-border data-active:bg-card data-active:shadow-sm"
              >
                Pulse
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <LiveTicker
          totalVotes={activeCampaign.totalVotes}
          updatedAt={activeCampaign.updatedAt}
        />
      </div>

      {activeTab === 'leaderboard' &&
        (activeCampaign.ratings.length === 0 ? (
          <LeaderboardCampaignEmpty campaign={activeCampaign} />
        ) : (
          <LeaderboardTable
            campaign={activeCampaign}
            updatedRowIds={
              updatedByCampaign.get(activeCampaign.id) ?? EMPTY_SET
            }
          />
        ))}

      {activeTab === 'matchups' && (
        <Matchups
          rows={activeCampaign.ratings}
          matchups={activeCampaign.matchups}
        />
      )}

      {activeTab === 'pulse' && (
        <Pulse
          buckets={activeCampaign.pulseBuckets}
          recentVotes={activeCampaign.recentVotes}
          modelLabelById={modelLabelById}
        />
      )}

    </section>
  );
}

const EMPTY_SET: Set<string> = new Set();

/**
 * Combobox-backed picker for the spotlight. Shows the selected campaign's
 * name in the trigger; opens a popup with a search input and filtered list.
 * Filtering is handled by base-ui via `itemToStringLabel`.
 */
function CampaignPicker({
  campaigns,
  value,
  onChange,
}: {
  campaigns: DashboardLeaderboardCampaign[];
  value: string;
  onChange: (id: string) => void;
}) {
  const items = useMemo(
    () => campaigns.map((c) => ({ value: c.id, label: c.name })),
    [campaigns],
  );
  const selected = items.find((i) => i.value === value) ?? items[0];

  return (
    <Combobox.Root
      items={items}
      value={selected}
      itemToStringLabel={(i) => i.label}
      isItemEqualToValue={(a, b) => a.value === b.value}
      onValueChange={(next) => {
        if (next && typeof next === 'object' && 'value' in next) {
          onChange(next.value);
        }
      }}
    >
      <Combobox.Trigger
        className={cn(
          'group/picker inline-flex h-7 max-w-[260px] items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-[13px] font-medium text-foreground shadow-sm outline-none transition-colors',
          'hover:bg-surface-highlight',
          'focus-visible:border-accent/60 focus-visible:ring-2 focus-visible:ring-accent/20',
          'data-popup-open:bg-surface-highlight',
        )}
      >
        <span className="truncate">
          <Combobox.Value>{selected.label}</Combobox.Value>
        </span>
        <Combobox.Icon
          render={
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-popup-open/picker:rotate-180" />
          }
        />
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} align="start" className="z-50">
          <Combobox.Popup
            className={cn(
              'w-[280px] origin-(--transform-origin) overflow-hidden rounded-lg border border-border bg-card text-foreground shadow-lg',
              'data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
            )}
          >
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Search className="size-3.5 shrink-0 text-muted-foreground" />
              <Combobox.Input
                placeholder="Search campaigns…"
                className="h-6 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
            </div>
            <Combobox.Empty className="px-3 py-6 text-center text-xs text-muted-foreground">
              No campaigns match.
            </Combobox.Empty>
            <Combobox.List className="max-h-72 overflow-y-auto p-1">
              {(item: { value: string; label: string }) => (
                <Combobox.Item
                  key={item.value}
                  value={item}
                  className={cn(
                    'flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground outline-none select-none',
                    'data-highlighted:bg-surface-highlight',
                    'data-disabled:pointer-events-none data-disabled:opacity-50',
                  )}
                >
                  <span className="flex-1 truncate">{item.label}</span>
                  <Combobox.ItemIndicator>
                    <Check className="size-3.5 text-muted-foreground" />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

function SpotlightEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border bg-card/60 px-6 py-8">
      <div>
        <h3 className="font-heading text-sm font-semibold text-foreground">
          No active evaluations yet
        </h3>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          A live spotlight appears here once you launch a campaign and it
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
                  /* clipboard errors are non-fatal here */
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
