import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Crown,
  Info,
  Loader2,
  Share2,
} from 'lucide-react';
import { ParticipantShell } from '../components/layout/participant-shell';
import { Button } from '../components/ui/button';
import { EntityIcon } from '../components/ui/entity-icon';
import { StatusBadge } from '../components/ui/status-badge';
import { toast } from '../components/ui/toast';
import { apiFetch, type PersonalResults } from '../lib/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { cn } from '../lib/utils';

export default function PersonalResultsPage() {
  const { slug } = useParams();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['personal-results', slug],
    queryFn: () => apiFetch<PersonalResults>(`/api/vote/${slug}/results`),
    enabled: !!slug,
  });

  useDocumentTitle(
    data ? `Your results · ${data.campaign.name}` : 'Your results',
  );

  if (isLoading) {
    return (
      <ParticipantShell contentClassName="flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading your results…
        </div>
      </ParticipantShell>
    );
  }

  if (error || !data) {
    return (
      <ParticipantShell contentClassName="flex items-center justify-center px-4 py-12">
        <div className="flex w-full max-w-sm items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            {error instanceof Error ? error.message : 'Failed to load results'}
          </span>
        </div>
      </ParticipantShell>
    );
  }

  const {
    campaign,
    totals,
    perPrompt,
    campaignRanking,
    groupAgreement,
    honesty,
  } = data;
  const top = campaignRanking[0];

  const handleShare = () => {
    const line = top
      ? `My top pick for "${campaign.name}" is ${top.displayName}.`
      : `I voted in "${campaign.name}" on ModelArena.`;
    navigator.clipboard.writeText(line);
    toast.success('Summary copied to clipboard');
  };

  return (
    <ParticipantShell label={campaign.name} contentClassName="px-4 py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {/* Header */}
        <header className="flex flex-col gap-3 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-accent/25 bg-accent/10 text-accent">
            <Crown className="size-5" />
          </div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            Your results
          </h1>
          <p className="text-sm text-muted-foreground">
            Based on your{' '}
            <span className="font-mono text-foreground">
              {totals.battlesPlayed}
            </span>{' '}
            battle{totals.battlesPlayed === 1 ? '' : 's'} across{' '}
            <span className="font-mono text-foreground">
              {totals.tournamentsComplete}
            </span>{' '}
            prompt{totals.tournamentsComplete === 1 ? '' : 's'}.
          </p>
        </header>

        {honesty.directional && (
          <div className="flex items-start gap-2.5 rounded-lg border border-warning/25 bg-warning/10 px-4 py-3 text-xs text-warning">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <div>
              <div className="font-medium text-foreground">
                Your sample is small — treat this as directional.
              </div>
              <div className="mt-0.5 opacity-90">
                With fewer than 20 battles, personal rankings have wide
                uncertainty. Top picks are generally preferred by you, but
                exact orderings might shift with more data.
              </div>
            </div>
          </div>
        )}

        {/* Overall ranking */}
        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <header className="border-b border-border px-5 py-3">
            <h2 className="font-heading text-sm font-semibold text-foreground">
              Your overall preferences
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Bradley-Terry scored against your own votes.
            </p>
          </header>
          {campaignRanking.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              No completed tournaments yet.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-[32px_1.4fr_1fr_80px_90px_100px] items-center gap-3 border-b border-border bg-surface-highlight/40 px-5 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <div>#</div>
                <div>Model</div>
                <div>Rating · ±CI</div>
                <div>Win rate</div>
                <div>1sts / seen</div>
                <div>Tier</div>
              </div>
              <ul className="divide-y divide-border/60">
                {campaignRanking.map((r, idx) => (
                  <li key={r.campaignModelId}>
                    <PersonalRatingRow rank={idx + 1} row={r} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* Per-prompt rankings */}
        {perPrompt.length > 0 && (
          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <header className="border-b border-border px-5 py-3">
              <h2 className="font-heading text-sm font-semibold text-foreground">
                Per-prompt rankings
              </h2>
              <p className="text-[11px] text-muted-foreground">
                How each model placed inside a single prompt's tournament.
              </p>
            </header>
            <ul className="divide-y divide-border/60">
              {perPrompt.map((p) => (
                <li key={p.promptId} className="flex flex-col gap-3 px-5 py-4">
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {p.promptText}
                  </p>
                  {p.complete ? (
                    <ol className="flex flex-col gap-1">
                      {p.ranking.map((r) => (
                        <li
                          key={`${r.rank}-${r.models
                            .map((m) => m.displayName)
                            .join(',')}`}
                          className="flex items-baseline gap-3 text-sm"
                        >
                          <span className="w-5 text-right font-mono text-[11px] font-semibold text-muted-foreground">
                            {r.rank}
                          </span>
                          <span className="text-foreground">
                            {r.models.map((m) => m.displayName).join(' & ')}
                            {r.models.length > 1 && (
                              <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                tied
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      In progress — {p.battlesPlayed} battle
                      {p.battlesPlayed === 1 ? '' : 's'} played
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Group alignment */}
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h3 className="font-heading text-sm font-semibold text-foreground">
            Group alignment
          </h3>
          {groupAgreement.fraction != null ? (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              You aligned with the majority on{' '}
              <span className="font-mono text-foreground">
                {Math.round(groupAgreement.fraction * 100)}%
              </span>{' '}
              of the{' '}
              <span className="font-mono text-foreground">
                {groupAgreement.samples}
              </span>{' '}
              pair{groupAgreement.samples === 1 ? '' : 's'} where enough other
              voters had weighed in.
            </p>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Not enough other votes on your pairs yet to compute agreement.
              Check back once more people have voted.
            </p>
          )}
        </section>

        {/* Footer actions */}
        <div className="flex flex-col items-center justify-center gap-2 border-t border-border pt-6 sm:flex-row">
          <Button
            variant="outline"
            size="sm"
            onClick={handleShare}
            className="w-full sm:w-auto"
          >
            <Share2 className="size-3.5" />
            Copy summary
          </Button>
          <Button
            size="sm"
            onClick={() => navigate(`/vote/${slug}`)}
            className="w-full sm:w-auto"
          >
            Back to landing
            <ArrowRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </ParticipantShell>
  );
}

function PersonalRatingRow({
  rank,
  row,
}: {
  rank: number;
  row: PersonalResults['campaignRanking'][number];
}) {
  const ciSpread =
    row.ciLow != null && row.ciHigh != null
      ? Math.round((row.ciHigh - row.ciLow) / 2)
      : null;
  return (
    <div
      className={cn(
        'grid grid-cols-[32px_1.4fr_1fr_80px_90px_100px] items-center gap-3 px-5 py-3 text-sm transition-colors',
        row.stability === 'directional' && 'opacity-70',
        rank === 1 && 'bg-surface-highlight/50',
      )}
    >
      <div className="font-mono text-xs text-muted-foreground">
        {rank.toString().padStart(2, '0')}
      </div>
      <div className="flex min-w-0 items-center gap-2.5">
        <EntityIcon name={row.displayName} size="sm" />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium text-foreground">
              {row.displayName}
            </span>
            {rank === 1 && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-accent">
                Top pick
              </span>
            )}
          </div>
          <div className="truncate font-mono text-[11px] text-muted-foreground">
            {row.providerModelId}
          </div>
        </div>
      </div>
      <div className="flex items-baseline gap-1.5 font-mono">
        <span className="font-semibold text-foreground">{row.rating}</span>
        {ciSpread != null && (
          <span className="text-[11px] text-muted-foreground">±{ciSpread}</span>
        )}
      </div>
      <div className="font-mono text-foreground">
        {row.winRate != null ? `${Math.round(row.winRate * 100)}%` : '—'}
      </div>
      <div className="font-mono text-[11px] text-muted-foreground">
        <span className="text-foreground">{row.firstPlaceCount}</span> /{' '}
        {row.appearances}
      </div>
      <div>
        <StatusBadge state={row.stability} />
      </div>
    </div>
  );
}
