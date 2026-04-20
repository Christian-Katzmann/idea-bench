import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AlertTriangle, Github, Loader2, Mail } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { BrandMark } from '../components/ui/brand-mark';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useTheme } from '../components/ThemeProvider';
import { Moon, Sun } from 'lucide-react';

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_invalid_state: 'Sign-in link expired — try again.',
  oauth_state_mismatch: 'Sign-in link couldn’t be verified — try again.',
  oauth_token_exchange_failed: 'GitHub didn’t return a token. Try again.',
  oauth_no_access_token: 'GitHub didn’t return a token. Try again.',
  oauth_user_fetch_failed: 'Couldn’t reach GitHub. Try again.',
  oauth_allowlist_empty: 'Server missing OPERATOR_GITHUB_LOGINS.',
  oauth_forbidden: 'This GitHub account isn’t on the operator allowlist.',
  magic_invalid: 'That magic link isn’t valid.',
  magic_expired: 'That magic link has expired. Request a new one.',
  magic_consumed: 'That magic link was already used. Request a new one.',
  magic_not_configured: 'Email sign-in isn’t configured on this server.',
};

function messageFor(code: string | null): string | null {
  if (!code) return null;
  return OAUTH_ERROR_MESSAGES[code] ?? `Sign-in failed (${code}).`;
}

export default function OperatorLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const initialError = messageFor(params.get('error'));
  const emailSent = params.get('sent') === '1';
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [emailMode, setEmailMode] = useState(false);
  const [email, setEmail] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailNotice, setEmailNotice] = useState<string | null>(
    emailSent ? 'Check your inbox — the link expires in 15 minutes.' : null,
  );
  const { theme, setTheme } = useTheme();

  useDocumentTitle('Sign in');

  const returnTo =
    (location.state as { from?: string } | null)?.from ?? '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        navigate(returnTo, { replace: true });
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? `login failed (${res.status})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'network error');
    } finally {
      setBusy(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || emailBusy) return;
    setEmailBusy(true);
    setError(null);
    try {
      await fetch('/api/auth/email-send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      // Always show the same notice — allowlist hits and misses look identical.
      setEmailNotice('Check your inbox — the link expires in 15 minutes.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'network error');
    } finally {
      setEmailBusy(false);
    }
  };

  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4 font-sans text-foreground">
      <button
        type="button"
        onClick={() => setTheme(nextTheme)}
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        className="absolute right-4 top-4 flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-highlight hover:text-foreground"
      >
        {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>

      <div className="flex w-full max-w-sm flex-col gap-6">
        {/* Brand header — mark + product name, nothing else */}
        <div className="flex flex-col items-center gap-3 text-center">
          <BrandMark size="xl" />
          <div>
            <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">
              ModelArena
            </h1>
            <p className="text-sm text-muted-foreground">
              Operator sign in
            </p>
          </div>
        </div>

        {/* Primary card — password is the dominant affordance (Q6). */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6">
            <div className="flex flex-col gap-2">
              <Label
                htmlFor="pw"
                className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                Password
              </Label>
              <Input
                id="pw"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                placeholder="••••••••"
              />
            </div>
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <Button
              type="submit"
              disabled={!password.trim() || busy}
              className="w-full"
            >
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </Button>
          </form>

          {/* Alternative mechanisms — de-emphasized per Q6. */}
          <div className="flex flex-col gap-2 border-t border-border bg-surface-highlight/40 px-6 py-4">
            <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
              <span className="h-px flex-1 bg-border" />
              Or continue with
              <span className="h-px flex-1 bg-border" />
            </div>
            {emailNotice && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-foreground">
                {emailNotice}
              </div>
            )}
            {!emailMode ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    window.location.href = '/api/auth/github';
                  }}
                >
                  <Github className="size-3.5" />
                  GitHub
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setEmailMode(true)}
                >
                  <Mail className="size-3.5" />
                  Email link
                </Button>
              </div>
            ) : (
              <form onSubmit={handleEmailSubmit} className="flex flex-col gap-2" noValidate>
                <Input
                  type="email"
                  autoComplete="email"
                  autoFocus
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      setEmailMode(false);
                      setEmail('');
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!email.trim() || emailBusy}
                    className="flex-1"
                  >
                    {emailBusy ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" />
                        Sending…
                      </>
                    ) : (
                      'Send link'
                    )}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Participant voting links don't require this.
        </p>
      </div>
    </div>
  );
}
