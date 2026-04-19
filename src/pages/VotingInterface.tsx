import { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { AlertTriangle, HelpCircle, Loader2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ParticipantShell } from '../components/layout/participant-shell';
import { Button } from '../components/ui/button';
import { KeyHint } from '../components/ui/key-hint';
import {
  apiFetch,
  ApiError,
  type NextBattleResponse,
  type NextBattlePayload,
} from '../lib/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { cn } from '../lib/utils';

type NextResp = NextBattleResponse | NextBattlePayload;
type VoteChoice = 'A' | 'B' | 'tie' | 'both_bad';

export default function VotingInterface() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  useDocumentTitle('Vote');

  const nextQ = useQuery({
    queryKey: ['vote-next', slug],
    queryFn: () => apiFetch<NextResp>(`/api/vote/${slug}/next`),
    enabled: !!slug,
    staleTime: 0,
    gcTime: 0,
  });

  const submit = useMutation({
    mutationFn: async (args: {
      tournamentId: string;
      bracketPosition: 'b1' | 'b2' | 'b3' | 'b4' | 'b5';
      generationAId: string;
      generationBId: string;
      winner: VoteChoice;
    }) =>
      apiFetch<{
        ok: true;
        advancedGenerationId: string | null;
        coinFlipped: boolean;
      }>(`/api/vote/${slug}/submit`, {
        method: 'POST',
        body: JSON.stringify(args),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['vote-next', slug] });
    },
  });

  const handleVote = useCallback(
    (winner: VoteChoice) => {
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

  // Keyboard shortcuts. A/←, B/→, T/↑, X/↓.
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
      fetch(`/api/vote/${slug}/finish`, { method: 'POST' }).finally(() => {
        navigate(`/vote/${slug}/results`);
      });
    }
  }, [nextQ.data, navigate, slug]);

  // If /next returns 409 "not started", bounce back to landing.
  useEffect(() => {
    if (nextQ.error instanceof ApiError && nextQ.error.status === 409) {
      navigate(`/vote/${slug}`, { replace: true });
    }
  }, [nextQ.error, navigate, slug]);

  const progress = useMemo(() => {
    if (!nextQ.data || nextQ.data.done) return 100;
    const { tournamentsTotal, tournamentsDone } = (
      nextQ.data as NextBattlePayload
    ).progress;
    return tournamentsTotal > 0
      ? Math.round(((tournamentsDone + 0.5) / tournamentsTotal) * 100)
      : 0;
  }, [nextQ.data]);

  // ── Loading / error / finishing frames ────────────────────────────────
  if (nextQ.isLoading) {
    return (
      <ParticipantShell contentClassName="flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading next battle…
        </div>
      </ParticipantShell>
    );
  }

  if (
    nextQ.error &&
    !(nextQ.error instanceof ApiError && nextQ.error.status === 409)
  ) {
    return (
      <ParticipantShell contentClassName="flex items-center justify-center px-4 py-12">
        <div className="flex w-full max-w-sm items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <div className="font-medium text-foreground">
              Can't continue voting
            </div>
            <div className="mt-0.5 text-xs">
              {nextQ.error instanceof Error
                ? nextQ.error.message
                : String(nextQ.error)}
            </div>
          </div>
        </div>
      </ParticipantShell>
    );
  }

  if (!nextQ.data || nextQ.data.done) {
    return (
      <ParticipantShell contentClassName="flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Finishing up…
        </div>
      </ParticipantShell>
    );
  }

  // Strict-mode cast: the discriminated-union check above doesn't narrow
  // NextResp under tsconfig `strict: false`. Behaves like the original.
  const battle = nextQ.data as NextBattlePayload;

  return (
    <ParticipantShell
      label={`${battle.battle.label} · ${battle.battle.reason}`}
      rightSlot={
        <>
          <div className="hidden min-w-32 items-center gap-2 sm:flex">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-border">
              <div
                className="h-full bg-foreground transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
              {battle.progress.tournamentsDone}/
              {battle.progress.tournamentsTotal}
            </span>
          </div>
          <ShortcutsHelp />
          <button
            type="button"
            onClick={() => navigate(`/vote/${slug}/results`)}
            aria-label="Quit early"
            title="Quit and see your results"
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-highlight hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </>
      }
      contentClassName="flex flex-col overflow-hidden"
    >
      {/* Prompt strip */}
      <section className="border-b border-border bg-card px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Prompt
            </span>
            {battle.prompt.categoryTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex h-5 items-center rounded-full border border-border bg-surface-highlight px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
          <p className="text-[15px] font-medium leading-relaxed text-foreground">
            {battle.prompt.text}
          </p>
          {battle.prompt.context && (
            <div className="mt-1 rounded-md border border-border bg-surface-highlight/40 px-3 py-2 text-xs text-muted-foreground">
              <span className="mr-2 font-medium text-foreground">Context:</span>
              {battle.prompt.context}
            </div>
          )}
        </div>
      </section>

      {/* Battle area — side-by-side outputs + primary vote row + tie/both-bad row */}
      <section className="relative flex-1 overflow-hidden bg-background px-4 py-4 md:px-6">
        <div className="mx-auto flex h-full max-w-5xl flex-col gap-3">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${battle.tournament.id}:${battle.battle.position}`}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.15 }}
              className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-2"
            >
              <OutputColumn
                label="Model A"
                side="A"
                output={battle.generationA.output}
                tokens={battle.generationA.tokensOut}
                disabled={submit.isPending}
                onVote={() => handleVote('A')}
              />
              <OutputColumn
                label="Model B"
                side="B"
                output={battle.generationB.output}
                tokens={battle.generationB.tokensOut}
                disabled={submit.isPending}
                onVote={() => handleVote('B')}
              />
            </motion.div>
          </AnimatePresence>

          <div className="flex shrink-0 items-center justify-center gap-2">
            <TertiaryVoteButton
              disabled={submit.isPending}
              onClick={() => handleVote('tie')}
              hint="T"
            >
              Tie
            </TertiaryVoteButton>
            <TertiaryVoteButton
              disabled={submit.isPending}
              onClick={() => handleVote('both_bad')}
              hint="X"
            >
              Both bad
            </TertiaryVoteButton>
          </div>

          {submit.error && (
            <div className="shrink-0 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-xs text-destructive">
              {submit.error instanceof Error
                ? submit.error.message
                : 'Submit failed'}
            </div>
          )}
        </div>
      </section>
    </ParticipantShell>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Local primitives
// ────────────────────────────────────────────────────────────────────────────

function OutputColumn({
  label,
  side,
  output,
  tokens,
  disabled,
  onVote,
}: {
  label: string;
  side: 'A' | 'B';
  output: string;
  tokens: number | null;
  disabled: boolean;
  onVote: () => void;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <header className="flex shrink-0 items-center justify-between border-b border-border bg-surface-highlight/40 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-5 items-center justify-center rounded-md border border-border bg-card font-mono text-[11px] font-semibold text-foreground">
            {side}
          </span>
          <span className="text-sm font-medium text-foreground">{label}</span>
        </div>
        <span className="font-mono text-[11px] text-muted-foreground">
          {tokens ?? '?'} tok
        </span>
      </header>
      <div className="flex-1 overflow-y-auto whitespace-pre-wrap px-4 py-4 text-[13px] leading-relaxed text-foreground">
        {output}
      </div>
      <div className="shrink-0 border-t border-border bg-surface-highlight/30 p-3">
        <Button
          onClick={onVote}
          disabled={disabled}
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

function ShortcutsHelp() {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click. Also listen for `?` to toggle — matches
  // GitHub / GitLab convention for keyboard-shortcut help.
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setIsOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement | null;
        // Don't toggle while typing in a field — participants could have
        // a `?` in an email or a future comment input.
        if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') {
          return;
        }
        e.preventDefault();
        setIsOpen((v) => !v);
      } else if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    if (isOpen) window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-label="Keyboard shortcuts"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        title="Keyboard shortcuts (press ?)"
        className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-highlight hover:text-foreground"
      >
        <HelpCircle className="size-4" />
      </button>
      {isOpen && (
        <div
          role="dialog"
          aria-label="Keyboard shortcuts"
          className="absolute right-0 top-full z-20 mt-1 w-64 origin-top-right animate-in fade-in-0 slide-in-from-top-1 overflow-hidden rounded-lg border border-border bg-card shadow-xl duration-150"
        >
          <div className="border-b border-border px-4 py-2">
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Keyboard shortcuts
            </div>
          </div>
          <ul className="flex flex-col gap-1 px-4 py-3 text-xs">
            <ShortcutRow keys={['A', '←']} label="Model A is better" />
            <ShortcutRow keys={['B', '→']} label="Model B is better" />
            <ShortcutRow keys={['T', '↑']} label="Tie" />
            <ShortcutRow keys={['X', '↓']} label="Both bad" />
            <ShortcutRow keys={['?']} label="Toggle this help" />
          </ul>
        </div>
      )}
    </div>
  );
}

function ShortcutRow({
  keys,
  label,
}: {
  keys: string[];
  label: string;
}) {
  return (
    <li className="flex items-center justify-between gap-4 py-1">
      <span className="text-foreground">{label}</span>
      <span className="flex shrink-0 items-center gap-1">
        {keys.map((k, i) => (
          <span key={`${k}-${i}`} className="flex items-center gap-1">
            {i > 0 && (
              <span className="text-[10px] text-muted-foreground/70">or</span>
            )}
            <KeyHint>{k}</KeyHint>
          </span>
        ))}
      </span>
    </li>
  );
}

function TertiaryVoteButton({
  children,
  hint,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  hint: string;
  disabled: boolean;
  onClick: () => void;
}) {
  // Use default h-10 (40px) on mobile → sm (h-8) on md+. The mobile
  // bump keeps the tap target comfortably above 40px since voters are
  // often on phones and the A/B pills are the primary targets anyway.
  return (
    <Button
      variant="outline"
      onClick={onClick}
      disabled={disabled}
      className="h-11 gap-2 md:h-8 md:px-3 md:text-[13px]"
    >
      <span>{children}</span>
      <KeyHint>{hint}</KeyHint>
    </Button>
  );
}
