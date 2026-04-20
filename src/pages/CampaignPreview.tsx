import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertTriangle,
  ArrowRight,
  Crown,
  Eye,
  Loader2,
  X,
} from 'lucide-react';
import { ParticipantShell } from '../components/layout/participant-shell';
import { Button } from '../components/ui/button';
import { KeyHint } from '../components/ui/key-hint';
import { ApiError, apiFetch } from '../lib/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  advancerFor,
  finalRanking,
  nextBattle,
  sampleSeed,
  type BracketSeed,
  type NextBattle,
  type TournamentVote,
  type VoteWinner,
} from '../lib/tournament';
import { cn } from '../lib/utils';

interface PreviewSnapshot {
  campaign: {
    id: string;
    shareSlug: string;
    name: string;
    description: string;
    categories: string[];
    status: 'draft' | 'active' | 'completed';
  };
  prompts: Array<{
    id: string;
    text: string;
    context: string | null;
    categoryTags: string[];
    orderIndex: number;
  }>;
  models: Array<{
    id: string;
    providerModelId: string;
    displayName: string;
  }>;
  generations: Array<{
    id: string;
    promptId: string;
    campaignModelId: string;
    output: string;
    tokensOut: number | null;
  }>;
}

type Phase = 'intro' | 'playing' | 'done';

/**
 * Operator-only preview of the voting experience.
 *
 * Pulls a read-only snapshot of the campaign (models, prompts, cached
 * generations) from /api/campaigns/:id/preview, then runs a full
 * tournament client-side using src/lib/tournament.ts. No participant
 * row, no tournament row, no vote row — nothing persists.
 *
 * Visually mirrors the public voting flow (ParticipantShell, split-pane
 * battle, KeyHint pills, Bradley-Terry-style results) so operators see
 * exactly what voters see, with a sticky "Operator preview" banner that
 * makes the mode obvious.
 */
export default function CampaignPreview() {
  const { id } = useParams();
  const navigate = useNavigate();
  useDocumentTitle('Preview');

  const { data, error, isLoading } = useQuery({
    queryKey: ['campaign-preview', id],
    queryFn: () => apiFetch<PreviewSnapshot>(`/api/campaigns/${id}/preview`),
    enabled: !!id,
    staleTime: 60_000,
  });

  const [phase, setPhase] = useState<Phase>('intro');
  const [promptIdx, setPromptIdx] = useState(0);
  const [seedByPrompt, setSeedByPrompt] = useState<Record<string, BracketSeed>>({});
  const [votesByPrompt, setVotesByPrompt] = useState<Record<string, TournamentVote[]>>({});

  // Redirect to login if the snapshot endpoint refuses operator auth.
  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) {
      navigate('/login', {
        state: { from: `/campaign/${id}/preview` },
        replace: true,
      });
    }
  }, [error, id, navigate]);

  const startPreview = useCallback(() => {
    if (!data) return;
    if (data.models.length < 4) return;
    const modelIds = data.models.map((m) => m.id);
    const seeds: Record<string, BracketSeed> = {};
    for (const prompt of data.prompts) {
      seeds[prompt.id] = sampleSeed(modelIds);
    }
    setSeedByPrompt(seeds);
    setVotesByPrompt({});
    setPromptIdx(0);
    setPhase('playing');
  }, [data]);

  // Maps used by the battle computation and the results view.
  const generationByPromptModel = useMemo(() => {
    const map: Record<string, Record<string, string>> = {};
    if (!data) return map;
    for (const g of data.generations) {
      if (!map[g.promptId]) map[g.promptId] = {};
      map[g.promptId][g.campaignModelId] = g.id;
    }
    return map;
  }, [data]);

  const generationById = useMemo(() => {
    const map = new Map<string, PreviewSnapshot['generations'][number]>();
    if (!data) return map;
    for (const g of data.generations) map.set(g.id, g);
    return map;
  }, [data]);

  const modelByGeneration = useMemo(() => {
    const map = new Map<string, PreviewSnapshot['models'][number]>();
    if (!data) return map;
    for (const g of data.generations) {
      const m = data.models.find((m) => m.id === g.campaignModelId);
      if (m) map.set(g.id, m);
    }
    return map;
  }, [data]);

  const activePrompt = data?.prompts[promptIdx];
  const seed = activePrompt ? seedByPrompt[activePrompt.id] : undefined;
  const votes = activePrompt ? (votesByPrompt[activePrompt.id] ?? []) : [];
  const battle: NextBattle | null = useMemo(() => {
    if (!activePrompt || !seed) return null;
    const generations = generationByPromptModel[activePrompt.id];
    if (!generations) return null;
    // Guard: if any seed model is missing a generation, drop this prompt.
    if (seed.some((modelId) => !generations[modelId])) return null;
    return nextBattle(seed, generations, votes);
  }, [activePrompt, seed, votes, generationByPromptModel]);

  // Auto-advance to the next prompt when current one completes.
  useEffect(() => {
    if (phase !== 'playing' || !activePrompt) return;
    if (battle) return;
    if (!data) return;
    const nextIdx = promptIdx + 1;
    if (nextIdx >= data.prompts.length) {
      setPhase('done');
    } else {
      setPromptIdx(nextIdx);
    }
  }, [phase, activePrompt, battle, data, promptIdx]);

  const handleVote = useCallback(
    (winner: VoteWinner) => {
      if (phase !== 'playing' || !activePrompt || !battle) return;
      const next: TournamentVote = {
        bracketPosition: battle.position,
        generationAId: battle.generationAId,
        generationBId: battle.generationBId,
        winner,
        advancedGenerationId:
          battle.position === 'b1' || battle.position === 'b2'
            ? advancerFor({
                generationAId: battle.generationAId,
                generationBId: battle.generationBId,
                winner,
              })
            : null,
      };
      setVotesByPrompt((prev) => ({
        ...prev,
        [activePrompt.id]: [...(prev[activePrompt.id] ?? []), next],
      }));
    },
    [phase, activePrompt, battle],
  );

  // Keyboard shortcuts mirror the real voting experience.
  useEffect(() => {
    if (phase !== 'playing') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') handleVote('A');
      else if (e.key === 'b' || e.key === 'B' || e.key === 'ArrowRight') handleVote('B');
      else if (e.key === 't' || e.key === 'T' || e.key === 'ArrowUp') handleVote('tie');
      else if (e.key === 'x' || e.key === 'X' || e.key === 'ArrowDown') handleVote('both_bad');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phase, handleVote]);

  const battleCount = useMemo(() => {
    const b3 = votes.find((v) => v.bracketPosition === 'b3');
    if (b3 && (b3.winner === 'tie' || b3.winner === 'both_bad')) return 5;
    return 4;
  }, [votes]);

  if (isLoading) {
    return (
      <ParticipantShell contentClassName="flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading preview…
        </div>
      </ParticipantShell>
    );
  }

  if (error || !data) {
    return (
      <ParticipantShell contentClassName="flex items-center justify-center px-4 py-12">
        <div className="flex w-full max-w-md items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <div className="font-medium text-foreground">
              Can't load this campaign
            </div>
            <div className="mt-0.5 text-xs">
              {error instanceof Error ? error.message : 'Unknown error'}
            </div>
          </div>
        </div>
      </ParticipantShell>
    );
  }

  const campaign = data.campaign;
  const modelCount = data.models.length;
  const promptCount = data.prompts.length;
  const canRun = modelCount >= 4 && promptCount > 0;

  // ---- Intro --------------------------------------------------------
  if (phase === 'intro') {
    return (
      <ParticipantShell contentClassName="flex flex-col gap-0">
        <PreviewBanner campaignId={campaign.id} />
        <div className="flex flex-1 items-center justify-center px-4 py-10">
          <div className="flex w-full max-w-md flex-col gap-5 text-center">
            <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">
              {campaign.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              You're about to play through this campaign's tournament yourself.
              Votes you cast are local-only — nothing is saved, nothing affects
              ratings.
            </p>
            <div className="mx-auto flex gap-6 text-xs text-muted-foreground">
              <span>
                <span className="font-mono text-foreground">{promptCount}</span>{' '}
                {promptCount === 1 ? 'prompt' : 'prompts'}
              </span>
              <span>
                <span className="font-mono text-foreground">{modelCount}</span>{' '}
                models
              </span>
            </div>
            {!canRun && (
              <div className="rounded-lg border border-warning/25 bg-warning/10 p-3 text-left text-xs text-warning">
                <span className="font-medium text-foreground">
                  Not ready for preview.
                </span>{' '}
                Need at least 4 models and 1 prompt with cached generations.
              </div>
            )}
            <Button
              onClick={startPreview}
              disabled={!canRun}
              className="mx-auto"
            >
              Start preview
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </ParticipantShell>
    );
  }

  // ---- Done ---------------------------------------------------------
  if (phase === 'done') {
    const modelScores = computeModelScores(data, votesByPrompt);
    return (
      <ParticipantShell contentClassName="flex flex-col gap-0">
        <PreviewBanner campaignId={campaign.id} />
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-full border border-accent/25 bg-accent/10 text-accent">
              <Crown className="size-5" />
            </div>
            <h1 className="font-heading text-2xl font-semibold text-foreground">
              Preview complete
            </h1>
            <p className="text-sm text-muted-foreground">
              Based on your{' '}
              <span className="font-mono text-foreground">
                {Object.values(votesByPrompt).reduce((n, v) => n + v.length, 0)}
              </span>{' '}
              battles across{' '}
              <span className="font-mono text-foreground">{promptCount}</span>{' '}
              {promptCount === 1 ? 'prompt' : 'prompts'}.
            </p>
          </div>
          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <header className="border-b border-border px-5 py-3">
              <h2 className="font-heading text-sm font-semibold text-foreground">
                Your podium
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Summed rank points across all prompts (lower is better).
              </p>
            </header>
            <ul className="divide-y divide-border/60">
              {modelScores.map((row, idx) => (
                <li
                  key={row.modelId}
                  className={cn(
                    'grid grid-cols-[48px_1fr_auto] items-center gap-4 px-5 py-3',
                    idx === 0 && 'bg-surface-highlight/50',
                  )}
                >
                  <div className="font-mono text-sm text-muted-foreground tabular-nums">
                    {String(idx + 1).padStart(2, '0')}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">
                      {row.displayName}
                    </div>
                    <div className="truncate font-mono text-[11px] text-muted-foreground">
                      {row.providerModelId}
                    </div>
                  </div>
                  <div className="font-mono text-xs text-foreground tabular-nums">
                    {row.points} pts
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" onClick={startPreview}>
              Run again
            </Button>
            <Link
              to={`/campaign/${campaign.id}`}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Back to dashboard
            </Link>
          </div>
        </div>
      </ParticipantShell>
    );
  }

  // ---- Playing ------------------------------------------------------
  if (!battle || !activePrompt) {
    return (
      <ParticipantShell contentClassName="flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Preparing battle…
        </div>
      </ParticipantShell>
    );
  }

  const genA = generationById.get(battle.generationAId);
  const genB = generationById.get(battle.generationBId);
  if (!genA || !genB) {
    return (
      <ParticipantShell contentClassName="flex items-center justify-center">
        <div className="text-sm text-destructive">
          Preview data missing — some generations weren't cached.
        </div>
      </ParticipantShell>
    );
  }

  const battleIndex = votes.length + 1;
  const pct = Math.round(((votes.length + 0.5) / battleCount) * 100);

  return (
    <ParticipantShell contentClassName="flex min-h-0 flex-1 flex-col">
      <PreviewBanner campaignId={campaign.id} />
      <section className="flex items-center justify-between gap-3 border-b border-border bg-background/60 px-4 py-2 backdrop-blur-sm md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="truncate text-xs font-medium text-muted-foreground">
            {`Battle ${battleIndex} of ${battleCount} · ${battle.reason}`}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {/* Progress bar is desktop-only — on mobile the "N/M" counter
              does the same job in less space. */}
          <div className="hidden h-1 w-32 overflow-hidden rounded-full bg-border sm:block">
            <div
              className="h-full bg-foreground transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {promptIdx + 1}/{promptCount}
          </span>
          <Link
            to={`/campaign/${campaign.id}`}
            aria-label="Exit preview"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-4" />
          </Link>
        </div>
      </section>

      <section className="px-4 py-3 md:px-6">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Prompt
          </span>
          {activePrompt.categoryTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex h-5 items-center rounded-full border border-border px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
        <p className="mt-1 text-lg leading-snug text-foreground">
          {activePrompt.text}
        </p>
        {activePrompt.context && (
          <div className="mt-2 rounded-lg border border-border bg-surface-highlight/40 p-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Context:</span>{' '}
            {activePrompt.context}
          </div>
        )}
      </section>

      {/* Battle area — mirrors VotingInterface's mobile treatment: desktop
          gets a viewport-filling pane with per-column scroll; mobile gets
          natural page scroll + the fixed MobileVoteBar. pb-28 reserves
          space for the bar on mobile. */}
      <section className="relative flex-1 bg-background px-4 pt-4 pb-28 md:overflow-hidden md:px-6 md:pb-4">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 md:h-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${activePrompt.id}:${battle.position}`}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.15 }}
              className="grid grid-cols-1 gap-3 md:min-h-0 md:flex-1 md:grid-cols-2"
            >
              <OutputColumn
                side="A"
                model={modelByGeneration.get(genA.id)}
                output={genA.output}
                tokens={genA.tokensOut}
                onVote={() => handleVote('A')}
              />
              <OutputColumn
                side="B"
                model={modelByGeneration.get(genB.id)}
                output={genB.output}
                tokens={genB.tokensOut}
                onVote={() => handleVote('B')}
              />
            </motion.div>
          </AnimatePresence>

          {/* Desktop tertiary row — hidden on mobile where Tie/Both bad
              live in the fixed bottom bar instead. */}
          <div className="hidden shrink-0 items-center justify-center gap-2 md:flex">
            <Button
              variant="outline"
              onClick={() => handleVote('tie')}
              className="h-11 gap-2 md:h-8 md:px-3 md:text-[13px]"
            >
              <span>Tie</span>
              <KeyHint>T</KeyHint>
            </Button>
            <Button
              variant="outline"
              onClick={() => handleVote('both_bad')}
              className="h-11 gap-2 md:h-8 md:px-3 md:text-[13px]"
            >
              <span>Both bad</span>
              <KeyHint>X</KeyHint>
            </Button>
          </div>
        </div>
      </section>

      <PreviewMobileVoteBar onVote={handleVote} />
    </ParticipantShell>
  );
}

/**
 * Mobile-only fixed bottom action bar for the preview battle. Mirrors
 * the MobileVoteBar in VotingInterface — four equal-width zones so every
 * decision is a single thumb-tap without scrolling back. Kept local to
 * avoid cross-importing from the participant page.
 */
function PreviewMobileVoteBar({
  onVote,
}: {
  onVote: (choice: 'A' | 'B' | 'tie' | 'both_bad') => void;
}) {
  return (
    <div
      role="group"
      aria-label="Vote"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <div className="grid grid-cols-4 gap-2 px-3 py-3">
        <Button
          onClick={() => onVote('A')}
          className="h-11 min-w-0 justify-center gap-1 px-0 text-[13px]"
        >
          A better
        </Button>
        <Button
          variant="outline"
          onClick={() => onVote('tie')}
          className="h-11 min-w-0 justify-center gap-1 px-0 text-[13px]"
        >
          Tie
        </Button>
        <Button
          variant="outline"
          onClick={() => onVote('both_bad')}
          className="h-11 min-w-0 justify-center gap-1 px-0 text-[13px]"
        >
          Both bad
        </Button>
        <Button
          onClick={() => onVote('B')}
          className="h-11 min-w-0 justify-center gap-1 px-0 text-[13px]"
        >
          B better
        </Button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Local primitives
// ────────────────────────────────────────────────────────────────────────────

function PreviewBanner({ campaignId }: { campaignId: string }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-warning/20 bg-warning/5 px-4 py-2 text-xs text-warning md:px-6">
      <div className="flex items-center gap-2">
        <Eye className="size-3.5" />
        <span>
          <span className="font-medium text-foreground">Operator preview.</span>{' '}
          Votes here are local-only. Nothing persists.
        </span>
      </div>
      <Link
        to={`/campaign/${campaignId}`}
        className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      >
        Exit
      </Link>
    </div>
  );
}

function OutputColumn({
  side,
  model,
  output,
  tokens,
  onVote,
}: {
  side: 'A' | 'B';
  model: { displayName: string; providerModelId: string } | undefined;
  output: string;
  tokens: number | null;
  onVote: () => void;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <header className="flex shrink-0 items-center justify-between border-b border-border bg-surface-highlight/40 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-5 items-center justify-center rounded-md border border-border bg-card font-mono text-[11px] font-semibold text-foreground">
            {side}
          </span>
          <span className="text-sm font-medium text-foreground">
            Model {side}
          </span>
          {model && (
            <span
              className="truncate font-mono text-[10px] text-muted-foreground"
              title={model.providerModelId}
            >
              · {model.displayName}
            </span>
          )}
        </div>
        <span className="font-mono text-[11px] text-muted-foreground">
          {tokens ?? '?'} tok
        </span>
      </header>
      {/* Desktop scrolls within cell; mobile flows with the page. */}
      <div className="flex-1 whitespace-pre-wrap px-4 py-4 text-[13px] leading-relaxed text-foreground md:overflow-y-auto">
        {output}
      </div>
      {/* Per-card vote button is desktop-only — mobile uses the fixed
          bottom PreviewMobileVoteBar below. */}
      <div className="hidden shrink-0 border-t border-border bg-surface-highlight/30 p-3 md:block">
        <Button
          onClick={onVote}
          size="lg"
          className={cn('w-full justify-center gap-2')}
        >
          <span>{side} is better</span>
          <KeyHint className="border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground/80">
            {side}
          </KeyHint>
        </Button>
      </div>
    </div>
  );
}

/**
 * Score each model using a simple rank-points system: rank 1 → 0 pts,
 * rank 2 → 1 pt, rank 3 → 2 pts, rank 4 → 3 pts. Summed across prompts
 * where the model appeared as a seed. Lower total = better. Ties split
 * points equally.
 */
function computeModelScores(
  data: PreviewSnapshot,
  votesByPrompt: Record<string, TournamentVote[]>,
): Array<{
  modelId: string;
  displayName: string;
  providerModelId: string;
  points: number;
}> {
  const points = new Map<string, number>();
  const appearances = new Map<string, number>();
  const genToModel = new Map<string, string>();
  for (const g of data.generations) genToModel.set(g.id, g.campaignModelId);

  for (const prompt of data.prompts) {
    const votes = votesByPrompt[prompt.id] ?? [];
    if (votes.length === 0) continue;
    const ranked = finalRanking(votes);
    if (ranked.length === 0) continue;
    for (const row of ranked) {
      const pointsForRank = row.rank - 1;
      const split = pointsForRank; // same for each tied entry (acceptable)
      for (const genId of row.generationIds) {
        const modelId = genToModel.get(genId);
        if (!modelId) continue;
        points.set(modelId, (points.get(modelId) ?? 0) + split);
        appearances.set(modelId, (appearances.get(modelId) ?? 0) + 1);
      }
    }
  }

  return data.models
    .map((m) => ({
      modelId: m.id,
      displayName: m.displayName,
      providerModelId: m.providerModelId,
      points: points.get(m.id) ?? 0,
    }))
    .filter((row) => (appearances.get(row.modelId) ?? 0) > 0)
    .sort((a, b) => a.points - b.points);
}
