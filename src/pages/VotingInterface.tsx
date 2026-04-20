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
import { PromptDisplay } from '../components/prompt/PromptDisplay';
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
    onSuccess: () => {
      // Fire-and-forget the invalidation. Awaiting it keeps `submit.isPending`
      // truthy through the entire next-battle refetch (~150–300 ms extra),
      // which makes the new battle's vote buttons mount in their disabled
      // state and re-enable visibly. Letting it run in the background lets
      // the mutation settle the moment the server acks; the buttons stay
      // disabled via `nextQ.isFetching` until the new battle is on screen.
      qc.invalidateQueries({ queryKey: ['vote-next', slug] });
    },
  });

  const isBusy = submit.isPending || nextQ.isFetching;

  const handleVote = useCallback(
    (winner: VoteChoice) => {
      if (!nextQ.data || nextQ.data.done) return;
      if (submit.isPending || nextQ.isFetching) return;
      const b = nextQ.data as NextBattlePayload;
      submit.mutate({
        tournamentId: b.tournament.id,
        bracketPosition: b.battle.position,
        generationAId: b.generationA.id,
        generationBId: b.generationB.id,
        winner,
      });
    },
    [nextQ.data, nextQ.isFetching, submit],
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

  const tournamentCurrent = Math.min(
    battle.progress.tournamentsDone + 1,
    battle.progress.tournamentsTotal,
  );

  // Label node: on desktop, the battle's semantic label (e.g. "Semis · 2 of 3").
  // On mobile, the desktop right-side progress bar is hidden to save topbar
  // real estate, so the label slot carries a compact "Prompt N of M" + bar
  // instead — the voter otherwise has no sense of depth through a session.
  const shellLabel = (
    <>
      <span className="hidden sm:inline">
        {battle.battle.label} · {battle.battle.reason}
      </span>
      <span className="flex items-center gap-2 sm:hidden">
        <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
          Prompt{' '}
          <span className="text-foreground">{tournamentCurrent}</span> of{' '}
          {battle.progress.tournamentsTotal}
        </span>
        <div className="h-1 w-16 overflow-hidden rounded-full bg-border/60">
          <div
            className="h-full bg-foreground transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </span>
    </>
  );

  return (
    <ParticipantShell
      label={shellLabel}
      rightSlot={
        <>
          <div className="hidden min-w-40 items-center gap-2 sm:flex">
            <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
              Prompt{' '}
              <span className="text-foreground">{tournamentCurrent}</span> of{' '}
              {battle.progress.tournamentsTotal}
            </span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-border/60">
              <div
                className="h-full bg-foreground transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
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
      contentClassName="flex flex-col md:overflow-hidden"
    >
      {/* Prompt strip */}
      <section className="border-b border-border bg-card px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Prompt
            </span>
            {battle.prompt.categoryTags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {battle.prompt.categoryTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex h-5 items-center rounded-full border border-border bg-surface-highlight px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="max-w-[72ch]">
            <PromptDisplay prompt={battle.prompt} collapsible />
          </div>
        </div>
      </section>

      {/* Battle area — side-by-side outputs + primary vote row + tie/both-bad row.
          On desktop the section is a viewport-filling pane: each output column
          scrolls inside a clamped grid cell. On mobile the section flows with
          the page — the voter scrolls through A then B naturally and votes via
          the fixed bottom action bar (see MobileVoteBar below). pb-24 reserves
          space so the last line of output isn't hidden under the bar. */}
      <section className="relative flex-1 bg-background px-4 pt-6 pb-28 md:overflow-hidden md:px-6 md:pb-4">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 md:h-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${battle.tournament.id}:${battle.battle.position}`}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.15 }}
              className="grid grid-cols-1 gap-3 md:min-h-0 md:flex-1 md:grid-cols-2"
            >
              <OutputColumn
                label="Model A"
                side="A"
                output={battle.generationA.output}
                tokens={battle.generationA.tokensOut}
                disabled={isBusy}
                onVote={() => handleVote('A')}
              />
              <OutputColumn
                label="Model B"
                side="B"
                output={battle.generationB.output}
                tokens={battle.generationB.tokensOut}
                disabled={isBusy}
                onVote={() => handleVote('B')}
              />
            </motion.div>
          </AnimatePresence>

          {/* Desktop tertiary row — hidden on mobile where these actions live
              in the fixed bottom bar instead. */}
          <div className="hidden shrink-0 items-center justify-center gap-2 border-t border-border/50 pt-3 md:flex">
            <TertiaryVoteButton
              disabled={isBusy}
              onClick={() => handleVote('tie')}
              hint="T"
            >
              Tie
            </TertiaryVoteButton>
            <TertiaryVoteButton
              disabled={isBusy}
              onClick={() => handleVote('both_bad')}
              hint="X"
            >
              Both bad
            </TertiaryVoteButton>
          </div>

          {submit.error && (
            <div
              role="alert"
              className="shrink-0 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-xs text-destructive"
            >
              {submit.error instanceof Error
                ? submit.error.message
                : 'Submit failed'}
            </div>
          )}

          {/* Screen-reader-only status: announces submission state and the
              new battle. Visually hidden so sighted users see only the
              choreographed transition; keyboard + screen-reader users get
              the otherwise-silent state changes verbally. */}
          <div className="sr-only" aria-live="polite" aria-atomic="true">
            {submit.isPending
              ? 'Submitting vote.'
              : nextQ.isFetching
              ? 'Loading next battle.'
              : `Battle ${battle.battle.label}. ${battle.battle.reason}.`}
          </div>
        </div>
      </section>

      <MobileVoteBar disabled={isBusy} onVote={handleVote} />
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
          <span className="inline-flex size-5 items-center justify-center rounded-md bg-foreground font-mono text-[11px] font-semibold text-background">
            {side}
          </span>
          <span className="text-sm font-semibold text-foreground">{label}</span>
        </div>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {tokens != null ? tokens.toLocaleString() : '—'}
          <span className="ml-1 opacity-70">tokens</span>
        </span>
      </header>
      {/* On desktop the body is a scrollable pane within a clamped grid cell;
          on mobile it flows with the page so the voter scrolls naturally
          through A then B and votes via the fixed bottom bar. */}
      <div className="flex-1 whitespace-pre-wrap px-4 py-4 text-[14px] leading-[1.65] text-foreground md:overflow-y-auto">
        {output}
      </div>
      {/* Per-card "A/B is better" footer — desktop only. On mobile, the
          unified MobileVoteBar at the bottom of the page owns all four
          decisions so voters never have to scroll back to vote. */}
      <div className="hidden shrink-0 border-t border-border bg-surface-highlight/30 p-3 md:block">
        <Button
          onClick={onVote}
          disabled={disabled}
          size="lg"
          className={cn('w-full justify-center gap-2')}
        >
          <KeyHint className="border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground/80">
            {side}
          </KeyHint>
          <span>{side} is better</span>
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

/**
 * Fixed bottom action bar — mobile only. Four equal-width zones so every
 * decision is a single thumb-tap without scrolling back. A/B get primary
 * style (most-chosen outcome), Tie / Both bad get outline (secondary but
 * still first-class). Height clears the Apple HIG 44px minimum; the bar
 * pads env(safe-area-inset-bottom) so it floats above the home indicator.
 *
 * Hidden on md+ where the per-card footer buttons + desktop tertiary row
 * remain the primary interaction pattern.
 */
function MobileVoteBar({
  disabled,
  onVote,
}: {
  disabled: boolean;
  onVote: (choice: VoteChoice) => void;
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
          disabled={disabled}
          className="h-11 min-w-0 justify-center gap-1 px-0 text-[13px]"
        >
          A better
        </Button>
        <Button
          variant="outline"
          onClick={() => onVote('tie')}
          disabled={disabled}
          className="h-11 min-w-0 justify-center gap-1 px-0 text-[13px]"
        >
          Tie
        </Button>
        <Button
          variant="outline"
          onClick={() => onVote('both_bad')}
          disabled={disabled}
          className="h-11 min-w-0 justify-center gap-1 px-0 text-[13px]"
        >
          Both bad
        </Button>
        <Button
          onClick={() => onVote('B')}
          disabled={disabled}
          className="h-11 min-w-0 justify-center gap-1 px-0 text-[13px]"
        >
          B better
        </Button>
      </div>
    </div>
  );
}
