import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  Trophy,
  ArrowRight,
  AlertTriangle,
  Share2,
  Loader2,
} from 'lucide-react';
import { ModeToggle } from '../components/ModeToggle';
import { apiFetch, type PersonalResults } from '../lib/api';

export default function PersonalResultsPage() {
  const { slug } = useParams();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['personal-results', slug],
    queryFn: () => apiFetch<PersonalResults>(`/api/vote/${slug}/results`),
    enabled: !!slug,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading your results...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-sm p-4 rounded-md bg-red-500/10 border border-red-500/30 text-red-500">
          {error instanceof Error ? error.message : 'Failed to load results'}
        </div>
      </div>
    );
  }

  const { campaign, totals, perPrompt, campaignRanking, groupAgreement, honesty } =
    data;
  const top = campaignRanking[0];

  return (
    <div className="min-h-screen bg-background py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex justify-end">
          <ModeToggle />
        </div>

        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Trophy className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Your Results
          </h1>
          <p className="text-lg text-muted-foreground">
            Based on your {totals.battlesPlayed} battles across{' '}
            {totals.tournamentsComplete} prompt
            {totals.tournamentsComplete === 1 ? '' : 's'} in{' '}
            <span className="font-medium text-foreground">{campaign.name}</span>
          </p>
        </div>

        {honesty.directional && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-3 text-amber-500">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">
                Your sample is small — treat this as directional.
              </span>
              <p className="text-sm mt-1 opacity-90">
                With fewer than 20 battles, your personal rankings have wide
                uncertainty. The models at the top are generally preferred by
                you, but exact orderings might shift with more data.
              </p>
            </div>
          </div>
        )}

        {/* Campaign-level ranking */}
        <Card className="shadow-md border-border overflow-hidden">
          <CardHeader className="bg-card text-card-foreground border-b border-border">
            <CardTitle className="text-xl">Your Overall Preferences</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-16 text-center">Rank</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">1st places</TableHead>
                  <TableHead className="text-right">Seen in</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaignRanking.map((r, idx) => (
                  <TableRow
                    key={r.campaignModelId}
                    className={idx === 0 ? 'bg-primary/5' : ''}
                  >
                    <TableCell className="text-center font-medium">
                      {idx === 0 ? (
                        <span className="text-primary text-lg">1</span>
                      ) : (
                        <span className="text-muted-foreground">
                          {idx + 1}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium text-foreground">
                      {r.displayName}
                      {idx === 0 && (
                        <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-normal">
                          Top Pick
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {r.firstPlaceCount}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground text-sm">
                      {r.appearances} / {perPrompt.length}
                    </TableCell>
                  </TableRow>
                ))}
                {campaignRanking.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center text-muted-foreground py-6"
                    >
                      No completed tournaments yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Per-prompt rankings */}
        {perPrompt.length > 0 && (
          <Card>
            <CardHeader className="border-b border-border">
              <CardTitle className="text-lg">Per-Prompt Rankings</CardTitle>
            </CardHeader>
            <CardContent className="p-0 divide-y divide-border">
              {perPrompt.map((p) => (
                <div key={p.promptId} className="p-5">
                  <div className="text-sm text-muted-foreground mb-3 line-clamp-2">
                    {p.promptText}
                  </div>
                  {p.complete ? (
                    <ol className="space-y-1.5">
                      {p.ranking.map((r) => (
                        <li
                          key={r.rank + r.models.map((m) => m.displayName).join(',')}
                          className="flex items-baseline gap-3 text-sm"
                        >
                          <span className="font-mono font-semibold text-muted-foreground w-6 text-right">
                            {r.rank}.
                          </span>
                          <span className="text-foreground">
                            {r.models.map((m) => m.displayName).join(' & ')}
                            {r.models.length > 1 && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                (tied)
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      In progress — {p.battlesPlayed} battle(s) played
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Group alignment */}
        <Card>
          <CardContent className="p-6">
            <h3 className="font-semibold text-foreground mb-2">
              Group Alignment
            </h3>
            {groupAgreement.fraction != null ? (
              <p className="text-muted-foreground text-sm leading-relaxed">
                You aligned with the majority on{' '}
                <span className="font-medium text-emerald-500 text-lg">
                  {Math.round(groupAgreement.fraction * 100)}%
                </span>{' '}
                of the {groupAgreement.samples} pair
                {groupAgreement.samples === 1 ? '' : 's'} where enough other
                voters had weighed in.
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">
                Not enough other votes on your pairs yet to compute agreement.
                Check back once more people have voted.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8 border-t border-border">
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => {
              const line = top
                ? `My top pick for "${campaign.name}" is ${top.displayName}.`
                : `I voted in "${campaign.name}" on ModelArena.`;
              navigator.clipboard.writeText(line);
            }}
          >
            <Share2 className="w-4 h-4 mr-2" />
            Copy summary
          </Button>
          <Button
            className="w-full sm:w-auto"
            onClick={() => navigate(`/vote/${slug}`)}
          >
            Back to landing
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}
