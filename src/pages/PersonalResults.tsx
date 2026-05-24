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
import { ModelLogo } from '../components/ui/model-logo';
import { StatusBadge } from '../components/ui/status-badge';
import { toast } from '../components/ui/toast';
import { apiFetch, type PersonalResults, type PromptMode } from '../lib/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { cn } from '../lib/utils';

/**
 * Human labels for the six evaluation modes. Displayed in the
 * "What you contributed" section on personal results.
 */
const MODE_LABELS: Record<PromptMode, string> = {
  tournament: 'Tournament',
  slider: 'Slider',
  approve_reject: 'Approve / reject',
  best_of_n: 'Best of N',
  multi_axis: 'Multi-axis',
  qualitative: 'Qualitative',
};

/**
 * Render a one-liner describing a contribution. Each mode has its own
 * copy; falls back to "N prompts" when no mode-specific extras exist.
 */
function describeContribution(
  c: PersonalResults['contributionsByMode'][number],
): string {
  const promptText = `${c.promptsCount} prompt${c.promptsCount === 1 ? '' : 's'}`;
  if (c.mode === 'slider') {
    const avg = c.extra?.averageScore;
    return avg != null
      ? `${promptText} · your average score: ${avg}`
      : promptText;
  }
  if (c.mode === 'approve_reject') {
    const approved = c.extra?.approvedCount ?? 0;
    const rejected = c.extra?.rejectedCount ?? 0;
    return `${promptText} · ${approved} approved, ${rejected} rejected`;
  }
  if (c.mode === 'best_of_n') return promptText;
  if (c.mode === 'multi_axis') return promptText;
  if (c.mode === 'qualitative') {
    return `${promptText} · ${c.responseCount} comment${c.responseCount === 1 ? '' : 's'} left`;
  }
  return promptText;
}

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
    contributionsByMode,
  } = data;
  const top = campaignRanking[0];
  const hasTournamentActivity = totals.battlesPlayed > 0;
  const hasNonTournamentActivity =
    (contributionsByMode?.length ?? 0) > 0 || totals.nonTournamentResponses > 0;

  const handleShare = () => {
    const line = top
      ? `My top pick for "${campaign.name}" is ${top.displayName}.`
      : `I voted in "${campaign.name}" on ïdea Bench.`;
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
            {hasTournamentActivity && hasNonTournamentActivity ? (
              <>
                Based on your{' '}
                <span className="font-mono text-foreground">
                  {totals.battlesPlayed}
                </span>{' '}
                battle{totals.battlesPlayed === 1 ? '' : 's'} and{' '}
                <span className="font-mono text-foreground">
                  {totals.nonTournamentResponses}
                </span>{' '}
                other response
                {totals.nonTournamentResponses === 1 ? '' : 's'}.
              </>
            ) : hasTournamentActivity ? (
              <>
                Based on your{' '}
                <span className="font-mono text-foreground">
                  {totals.battlesPlayed}
                </span>{' '}
                battle{totals.battlesPlayed === 1 ? '' : 's'} across{' '}
                <span className="font-mono text-foreground">
                  {totals.tournamentsStarted}
                </span>{' '}
                prompt{totals.tournamentsStarted === 1 ? '' : 's'}
                {totals.tournamentsStarted > totals.tournamentsComplete && (
                  <> (still in progress)</>
                )}
                .
              </>
            ) : hasNonTournamentActivity ? (
              <>
                Based on your{' '}
                <span className="font-mono text-foreground">
                  {totals.nonTournamentResponses}
                </span>{' '}
                response
                {totals.nonTournamentResponses === 1 ? '' : 's'}.
              </>
            ) : (
              <>You haven't voted yet.</>
            )}
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
                With fewer than 20 responses, personal rankings have wide
                uncertainty. Top picks are generally preferred by you, but
                exact orderings might shift with more data.
              </div>
            </div>
          </div>
        )}

        {/* Overall B-T ranking — tournament-derived, so skip the whole
            section for participants who only did non-tournament modes.
            The `contributionsByMode` section below surfaces their work
            instead. Also soften the copy when honesty is in a good
            place: the "Bradley-Terry" label is meaningful to operators
            but mostly jargon to voters. */}
        {hasTournamentActivity && (
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
              {/* Header is desktop-only — on mobile each row stacks its
                  metrics under contextual labels, so a separate header
                  band would be redundant noise. */}
              <div className="hidden grid-cols-[32px_1.4fr_1fr_80px_90px_100px] items-center gap-3 border-b border-border bg-surface-highlight/40 px-5 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:grid">
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
        )}

        {/* What you contributed — non-tournament modes.
            Rendered when the participant interacted with any mode other
            than tournament. Tournament activity is summarized by the
            B-T ranking above; this section fills in the rest so a
            participant who only did slider/approve-reject/etc. doesn't
            see an empty page. */}
        {contributionsByMode && contributionsByMode.length > 0 && (
          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <header className="border-b border-border px-5 py-3">
              <h2 className="font-heading text-sm font-semibold text-foreground">
                What you contributed
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Your responses on non-tournament prompts in this campaign.
              </p>
            </header>
            <ul className="divide-y divide-border/60">
              {contributionsByMode.map((c) => (
                <li
                  key={c.mode}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-foreground">
                      {MODE_LABELS[c.mode] ?? c.mode}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {describeContribution(c)}
                    </span>
                  </div>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {c.responseCount} response
                    {c.responseCount === 1 ? '' : 's'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

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
            <GroupAlignmentBody
              fraction={groupAgreement.fraction}
              samples={groupAgreement.samples}
            />
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

/**
 * Body of the "Group alignment" card. The raw fraction by itself
 * (e.g. "62% on 18 pairs") is correct but flat — operators and
 * participants both struggle to interpret it without an anchor.
 *
 * Tiers:
 *   ≥ 70% → "Strong" (you mostly tracked the consensus)
 *   45–70% → "Mixed" (your taste partly diverges from the cohort)
 *   < 45% → "Distinct" (your preferences are notably different)
 *
 * Thresholds are picked for readability, not statistical significance.
 * The directional honesty banner above already covers small-sample
 * uncertainty; this section's job is to give the participant a one-
 * sentence take on what their alignment number *means*.
 *
 * A thin bar visualises position along the 0–100% spectrum so the
 * reader can see headroom in either direction at a glance.
 */
function GroupAlignmentBody({
  fraction,
  samples,
}: {
  fraction: number;
  samples: number;
}) {
  const pct = Math.round(fraction * 100);
  const tier =
    fraction >= 0.7 ? 'strong' : fraction >= 0.45 ? 'mixed' : 'distinct';
  const tierLabel =
    tier === 'strong' ? 'Strong alignment'
    : tier === 'mixed' ? 'Mixed alignment'
    : 'Distinct preferences';
  const tierTone =
    tier === 'strong'
      ? 'border-success/25 bg-success/10 text-success'
      : tier === 'mixed'
        ? 'border-border bg-surface-highlight text-foreground'
        : 'border-warning/25 bg-warning/10 text-warning';
  const interpretation =
    tier === 'strong'
      ? 'You mostly tracked the cohort’s preferences — your top picks line up with how the group voted overall.'
      : tier === 'mixed'
        ? 'Your taste partly tracks the cohort and partly diverges — strong agreement on some pairs, distinct preferences on others.'
        : 'Your preferences differ notably from the cohort. The group leaned the other way on most of the pairs you voted on.';
  const barTone =
    tier === 'strong'
      ? 'bg-success'
      : tier === 'mixed'
        ? 'bg-foreground'
        : 'bg-warning';
  return (
    <div className="mt-2 flex flex-col gap-3">
      <div className="flex items-baseline gap-2.5">
        <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">
          {pct}%
        </span>
        <span
          className={cn(
            'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            tierTone,
          )}
        >
          {tierLabel}
        </span>
      </div>
      <div
        className="h-1 overflow-hidden rounded-full bg-border"
        aria-hidden="true"
      >
        <div
          className={cn('h-full transition-all duration-500', barTone)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {interpretation}
      </p>
      <p className="text-[11px] text-muted-foreground/80">
        Computed across the{' '}
        <span className="font-mono text-foreground">{samples}</span> pair
        {samples === 1 ? '' : 's'} where enough other voters had weighed in.
      </p>
    </div>
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
        'flex flex-col gap-2 px-5 py-3 text-sm transition-colors sm:grid sm:grid-cols-[32px_1.4fr_1fr_80px_90px_100px] sm:items-center sm:gap-3',
        row.stability === 'directional' && 'opacity-70',
        rank === 1 && 'bg-surface-highlight/50',
      )}
    >
      {/* Rank + model name + rating live on the first row (mobile) and
          inline (desktop). On mobile the rating is right-aligned so the
          eye lands on the score immediately after the model name. */}
      <div className="flex items-center gap-3 sm:contents">
        <div className="font-mono text-xs text-muted-foreground">
          {rank.toString().padStart(2, '0')}
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <ModelLogo
            providerModelId={row.providerModelId}
            name={row.displayName}
            size="sm"
          />
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
        <div className="flex shrink-0 items-baseline gap-1.5 font-mono sm:flex-none">
          {/* When stability is 'directional' (gameCount < 50 per model)
              the rating point estimate is noisier than the gap between
              top and bottom — printing "1461 ± 2438" looks authoritative
              but the CI spans values the rating system doesn't support.
              Hide the number; the tier badge on the right already says
              "Directional", and win-rate carries the comparable signal. */}
          {row.stability === 'directional' ? (
            <span
              className="text-muted-foreground"
              title="Not enough comparisons yet to estimate a reliable rating"
            >
              —
            </span>
          ) : (
            <>
              <span className="font-semibold text-foreground">{row.rating}</span>
              {ciSpread != null && (
                <span className="text-[11px] text-muted-foreground">
                  ±{ciSpread}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Secondary stats — shown inline on desktop, stacked under the
          model row on mobile with explicit labels (since the header
          band is hidden below sm). */}
      <div className="ml-9 flex items-center justify-between gap-3 text-[11px] text-muted-foreground sm:contents sm:ml-0 sm:text-sm">
        <MobileStat label="Win rate">
          <span className="font-mono text-foreground sm:text-foreground">
            {row.winRate != null ? `${Math.round(row.winRate * 100)}%` : '—'}
          </span>
        </MobileStat>
        <MobileStat label="1sts / seen">
          <span className="font-mono">
            <span className="text-foreground">{row.firstPlaceCount}</span> /{' '}
            {row.appearances}
          </span>
        </MobileStat>
        <div className="sm:contents">
          <StatusBadge state={row.stability} />
        </div>
      </div>
    </div>
  );
}

function MobileStat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:contents">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:hidden">
        {label}
      </span>
      {children}
    </div>
  );
}
