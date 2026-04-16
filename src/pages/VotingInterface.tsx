import { useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
import { ChevronLeft, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ModeToggle } from '../components/ModeToggle';
import {
  apiFetch,
  ApiError,
  type NextBattleResponse,
  type NextBattlePayload,
} from '../lib/api';

type NextResp = NextBattleResponse | NextBattlePayload;

export default function VotingInterface() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const nextQ = useQuery({
    queryKey: ['vote-next', slug],
    queryFn: () => apiFetch<NextResp>(`/api/vote/${slug}/next`),
    enabled: !!slug,
    // Fresh on every visit — we don't want to cache a stale battle.
    staleTime: 0,
    gcTime: 0,
  });

  const submit = useMutation({
    mutationFn: async (args: {
      tournamentId: string;
      bracketPosition: 'b1' | 'b2' | 'b3' | 'b4' | 'b5';
      generationAId: string;
      generationBId: string;
      winner: 'A' | 'B' | 'tie' | 'both_bad';
    }) =>
      apiFetch<{ ok: true; advancedGenerationId: string | null; coinFlipped: boolean }>(
        `/api/vote/${slug}/submit`,
        { method: 'POST', body: JSON.stringify(args) },
      ),
    onSuccess: async () => {
      // Invalidate + refetch the next battle.
      await qc.invalidateQueries({ queryKey: ['vote-next', slug] });
    },
  });

  const handleVote = useCallback(
    (winner: 'A' | 'B' | 'tie' | 'both_bad') => {
      if (!nextQ.data || nextQ.data.done) return;
      if (submit.isPending) return;
      const b = nextQ.data as NextBattlePayload;
      submit.mutate({
        tournamentId: b.tournament.id,
        bracketPosition: b.battle.position,
        generationAId: b.generationA.id,
        generationBId: b.generationB.id,
        winner,
      });
    },
    [nextQ.data, submit],
  );

  // Keyboard shortcuts — match the existing 150ms transition UX from mocks.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft')
        handleVote('A');
      else if (e.key === 'b' || e.key === 'B' || e.key === 'ArrowRight')
        handleVote('B');
      else if (e.key === 't' || e.key === 'T' || e.key === 'ArrowUp')
        handleVote('tie');
      else if (e.key === 'x' || e.key === 'X' || e.key === 'ArrowDown')
        handleVote('both_bad');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleVote]);

  // Auto-redirect when the stream of battles ends.
  useEffect(() => {
    if (nextQ.data && nextQ.data.done) {
      // Mark participant as finished, then navigate to personal results.
      fetch(`/api/vote/${slug}/finish`, { method: 'POST' }).finally(() => {
        navigate(`/vote/${slug}/results`);
      });
    }
  }, [nextQ.data, navigate, slug]);

  // If the participant hit this page without going through landing,
  // /next returns 409 "participant not started" — bounce them back.
  useEffect(() => {
    if (nextQ.error instanceof ApiError && nextQ.error.status === 409) {
      navigate(`/vote/${slug}`, { replace: true });
    }
  }, [nextQ.error, navigate, slug]);

  const progress = useMemo(() => {
    if (!nextQ.data || nextQ.data.done) return 100;
    const payload = nextQ.data as NextBattlePayload;
    const { tournamentsTotal, tournamentsDone } = payload.progress;
    // Rough progress: completed tournaments contribute 1; current
    // partial tournament contributes 0.5 so the bar moves within a
    // tournament too. Fine for ballpark — the /next doesn't report
    // the per-battle index inside the current tournament.
    return tournamentsTotal > 0
      ? Math.round(((tournamentsDone + 0.5) / tournamentsTotal) * 100)
      : 0;
  }, [nextQ.data]);

  if (nextQ.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading next battle...
      </div>
    );
  }

  if (nextQ.error && !(nextQ.error instanceof ApiError && nextQ.error.status === 409)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-sm p-4 rounded-md bg-red-500/10 border border-red-500/30 text-red-500">
          <div className="font-semibold mb-1">Can't continue voting</div>
          <div className="text-sm">
            {nextQ.error instanceof Error
              ? nextQ.error.message
              : String(nextQ.error)}
          </div>
        </div>
      </div>
    );
  }

  if (!nextQ.data || nextQ.data.done) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> Finishing up...
      </div>
    );
  }

  // TODO(strict-mode): cast until tsconfig enables strict mode — the
  // discriminated-union check above doesn't narrow NextResp under
  // `strict: false`. See src/server/README.md and the Phase 2 notes.
  const battle = nextQ.data as NextBattlePayload;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      {/* Header */}
      <header className="bg-card border-b border-border px-4 h-14 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="text-muted-foreground hover:text-foreground hover:bg-foreground/5"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="font-medium text-foreground hidden sm:block">
            {battle.battle.label} — {battle.battle.reason}
          </div>
        </div>

        <div className="flex items-center gap-4 flex-1 max-w-md mx-4">
          <Progress value={progress} className="h-2 bg-border" />
          <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
            {battle.progress.tournamentsDone}/{battle.progress.tournamentsTotal}{' '}
            prompts
          </span>
        </div>

        <div className="flex items-center gap-2">
          <ModeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/vote/${slug}/results`)}
            className="text-muted-foreground hover:text-foreground hover:bg-foreground/5"
            title="Quit early"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
      </header>

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Prompt */}
        <div className="bg-card border-b border-border p-4 shrink-0 shadow-sm z-10">
          <div className="max-w-5xl mx-auto">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
              Prompt
              {battle.prompt.categoryTags.map((tag) => (
                <span
                  key={tag}
                  className="bg-foreground/5 text-muted-foreground border border-border px-2 py-0.5 rounded-full text-[10px]"
                >
                  {tag}
                </span>
              ))}
            </div>
            <p className="text-foreground font-medium text-lg leading-relaxed">
              {battle.prompt.text}
            </p>
            {battle.prompt.context && (
              <div className="mt-3 p-3 bg-background rounded text-sm text-muted-foreground border border-border">
                <span className="font-semibold text-foreground mr-2">
                  Context:
                </span>
                {battle.prompt.context}
              </div>
            )}
          </div>
        </div>

        {/* Battle area */}
        <div className="flex-1 overflow-hidden relative bg-background p-4">
          <div className="max-w-5xl mx-auto h-full flex flex-col">
            <AnimatePresence mode="wait">
              <motion.div
                // Key the transition on the specific battle pair —
                // animations trigger only when the pair actually changes.
                key={`${battle.tournament.id}:${battle.battle.position}`}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.02 }}
                transition={{ duration: 0.15 }}
                className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 min-h-0"
              >
                {/* A */}
                <div className="bg-card rounded-xl border border-border shadow-sm flex flex-col overflow-hidden">
                  <div className="bg-sidebar border-b border-border px-4 py-2 flex justify-between items-center shrink-0">
                    <span className="font-semibold text-foreground">
                      Model A
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {battle.generationA.tokensOut ?? '?'} tokens
                    </span>
                  </div>
                  <div className="p-4 overflow-y-auto flex-1 text-foreground whitespace-pre-wrap leading-relaxed">
                    {battle.generationA.output}
                  </div>
                  <div className="p-4 border-t border-border bg-sidebar shrink-0">
                    <Button
                      className="w-full h-12 text-lg font-medium bg-primary hover:bg-primary/90 text-primary-foreground"
                      onClick={() => handleVote('A')}
                      disabled={submit.isPending}
                    >
                      A is better{' '}
                      <span className="ml-2 text-primary-foreground/70 text-sm font-normal border border-primary-foreground/20 px-1.5 rounded">
                        A
                      </span>
                    </Button>
                  </div>
                </div>

                {/* B */}
                <div className="bg-card rounded-xl border border-border shadow-sm flex flex-col overflow-hidden">
                  <div className="bg-sidebar border-b border-border px-4 py-2 flex justify-between items-center shrink-0">
                    <span className="font-semibold text-foreground">
                      Model B
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {battle.generationB.tokensOut ?? '?'} tokens
                    </span>
                  </div>
                  <div className="p-4 overflow-y-auto flex-1 text-foreground whitespace-pre-wrap leading-relaxed">
                    {battle.generationB.output}
                  </div>
                  <div className="p-4 border-t border-border bg-sidebar shrink-0">
                    <Button
                      className="w-full h-12 text-lg font-medium bg-primary hover:bg-primary/90 text-primary-foreground"
                      onClick={() => handleVote('B')}
                      disabled={submit.isPending}
                    >
                      B is better{' '}
                      <span className="ml-2 text-primary-foreground/70 text-sm font-normal border border-primary-foreground/20 px-1.5 rounded">
                        B
                      </span>
                    </Button>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>

            <div className="mt-4 flex justify-center gap-4 shrink-0">
              <Button
                variant="outline"
                className="bg-card border-border text-foreground hover:bg-foreground/5 w-32"
                onClick={() => handleVote('tie')}
                disabled={submit.isPending}
              >
                Tie{' '}
                <span className="ml-2 text-muted-foreground text-xs border border-border px-1 rounded">
                  T
                </span>
              </Button>
              <Button
                variant="outline"
                className="bg-card border-border text-foreground hover:bg-foreground/5 w-32"
                onClick={() => handleVote('both_bad')}
                disabled={submit.isPending}
              >
                Both Bad{' '}
                <span className="ml-2 text-muted-foreground text-xs border border-border px-1 rounded">
                  X
                </span>
              </Button>
            </div>

            {submit.error && (
              <div className="mt-3 p-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-500 text-xs text-center">
                {submit.error instanceof Error
                  ? submit.error.message
                  : 'Submit failed'}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
