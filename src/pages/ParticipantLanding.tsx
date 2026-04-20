import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { AlertTriangle, Clock, Layers, Loader2 } from 'lucide-react';
import { ParticipantShell } from '../components/layout/participant-shell';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { BrandMark } from '../components/ui/brand-mark';
import { apiFetch, type VoteLanding } from '../lib/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

// Permissive enough for hand-typed addresses (one `@`, a domain with at least
// one dot). The server is the authority; we only catch obvious typos before
// they cost the participant a round-trip.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ParticipantLanding() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);

  const landing = useQuery({
    queryKey: ['vote-landing', slug],
    queryFn: () => apiFetch<VoteLanding>(`/api/vote/${slug}`),
    enabled: !!slug,
  });

  useDocumentTitle(landing.data?.name ?? 'Vote');

  const start = useMutation({
    mutationFn: (payload: { email?: string }) =>
      apiFetch<{ participantId: string; shareSlug: string; name: string }>(
        `/api/vote/${slug}`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      ),
    onSuccess: () => {
      navigate(`/vote/${slug}/play`);
    },
  });

  // Submit with email. Validates the shape client-side so we don't waste a
  // round-trip on a transparently-bad address.
  const submitWithEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (start.isPending) return;
    const trimmed = email.trim();
    if (!trimmed) {
      setEmailError('Please enter your email.');
      return;
    }
    if (!EMAIL_RE.test(trimmed)) {
      setEmailError('Please enter a valid email address.');
      return;
    }
    setEmailError(null);
    start.mutate({ email: trimmed });
  };

  // Submit anonymously — works in `anonymous` (no email field rendered) and
  // `hybrid` (user pressed the "Vote as anonymous" button).
  const submitAnonymous = () => {
    if (start.isPending) return;
    setEmailError(null);
    start.mutate({});
  };

  if (landing.isLoading) {
    return (
      <ParticipantShell contentClassName="flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading campaign…
        </div>
      </ParticipantShell>
    );
  }

  if (landing.error || !landing.data) {
    return (
      <ParticipantShell contentClassName="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <ErrorCard
            title="Can't load this campaign"
            detail={
              landing.error instanceof Error
                ? landing.error.message
                : 'Unknown error'
            }
          />
        </div>
      </ParticipantShell>
    );
  }

  const campaign = landing.data;
  const notActive = campaign.status !== 'active';
  const minBattles = campaign.promptCount * 4;
  const maxBattles = campaign.promptCount * 5;
  const mode = campaign.votingMode;

  // Footer microcopy. Mode dictates what we tell the voter below the card.
  const footerCopy =
    mode === 'anonymous'
      ? 'Your vote is anonymous. No email is collected.'
      : mode === 'email_required'
        ? 'Your email is required to vote on this campaign.'
        : 'Email helps the operator know who you are. Prefer not to share? Vote anonymously.';

  return (
    <ParticipantShell contentClassName="flex items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-md flex-col gap-6">
        {/* Brand + campaign title */}
        <div className="flex flex-col items-center gap-3 text-center">
          <BrandMark size="xl" />
          <div className="flex flex-col gap-1">
            <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">
              {campaign.name}
            </h1>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Model evaluation · blind vote
            </p>
          </div>
        </div>

        {/* Campaign card */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex flex-col gap-4 px-6 py-5">
            <p className="text-sm leading-relaxed text-muted-foreground">
              {campaign.description}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <StatTile icon={Clock} label="Time" value="~3–5 min" />
              <StatTile
                icon={Layers}
                label="Battles"
                value={`${minBattles}–${maxBattles}`}
              />
            </div>
          </div>

          {notActive && (
            <div className="mx-6 mb-5 flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/10 p-3 text-xs text-warning">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {campaign.status === 'completed'
                  ? 'This campaign is closed. Voting is no longer accepted.'
                  : 'This campaign is in draft — not yet accepting votes.'}
              </span>
            </div>
          )}

          {/* Mode-driven entry form. Three branches — kept inline so the
              shared loading/error UI is in one place. */}
          {mode === 'anonymous' ? (
            <div
              className="flex flex-col gap-3 border-t border-border bg-surface-highlight/40 px-6 py-5"
              data-testid="vote-start-anonymous-only"
            >
              {start.error && (
                <ErrorCard
                  detail={
                    start.error instanceof Error
                      ? start.error.message
                      : 'Failed to start'
                  }
                />
              )}
              <Button
                type="button"
                className="w-full"
                disabled={notActive || start.isPending}
                onClick={submitAnonymous}
                autoFocus
              >
                {start.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Starting…
                  </>
                ) : (
                  'Start voting'
                )}
              </Button>
            </div>
          ) : (
            <form
              onSubmit={submitWithEmail}
              noValidate
              className="flex flex-col gap-3 border-t border-border bg-surface-highlight/40 px-6 py-5"
              data-testid={
                mode === 'email_required'
                  ? 'vote-start-email-required'
                  : 'vote-start-hybrid'
              }
            >
              {campaign.emailPromptMessage && (
                <p className="rounded-md border border-border bg-surface-highlight/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                  {campaign.emailPromptMessage}
                </p>
              )}
              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor="email"
                  className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Email
                  {mode === 'hybrid' ? (
                    <span className="text-muted-foreground/70"> (optional)</span>
                  ) : (
                    <span className="text-destructive"> *</span>
                  )}
                </Label>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  spellCheck={false}
                  autoCapitalize="none"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailError) setEmailError(null);
                  }}
                  disabled={notActive}
                  autoFocus
                  required={mode === 'email_required'}
                  aria-invalid={emailError ? true : undefined}
                  aria-describedby={emailError ? 'email-error' : undefined}
                />
                {emailError && (
                  <p
                    id="email-error"
                    className="text-[11px] text-destructive"
                  >
                    {emailError}
                  </p>
                )}
              </div>
              {start.error && (
                <ErrorCard
                  detail={
                    start.error instanceof Error
                      ? start.error.message
                      : 'Failed to start'
                  }
                />
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={notActive || start.isPending}
              >
                {start.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Starting…
                  </>
                ) : (
                  'Start voting'
                )}
              </Button>
              {mode === 'hybrid' && (
                <>
                  <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    <span className="h-px flex-1 bg-border" />
                    or
                    <span className="h-px flex-1 bg-border" />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={notActive || start.isPending}
                    onClick={submitAnonymous}
                  >
                    Vote as anonymous
                  </Button>
                </>
              )}
            </form>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          {footerCopy}
        </p>
      </div>
    </ParticipantShell>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface-highlight/40 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </div>
      <div className="font-mono text-sm text-foreground">{value}</div>
    </div>
  );
}

function ErrorCard({
  title,
  detail,
}: {
  title?: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>
        {title && (
          <div className="font-medium text-foreground">{title}</div>
        )}
        <div className={title ? 'mt-0.5 text-xs' : 'text-xs'}>{detail}</div>
      </div>
    </div>
  );
}
