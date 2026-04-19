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

export default function OperatorLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

          {/* Alternative mechanisms — de-emphasized per Q6. Not wired up. */}
          <div className="flex flex-col gap-2 border-t border-border bg-surface-highlight/40 px-6 py-4">
            <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
              <span className="h-px flex-1 bg-border" />
              Or continue with
              <span className="h-px flex-1 bg-border" />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled
                className="flex-1"
                title="Not available yet"
              >
                <Github className="size-3.5" />
                GitHub
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled
                className="flex-1"
                title="Not available yet"
              >
                <Mail className="size-3.5" />
                Email link
              </Button>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Participant voting links don't require this.
        </p>
      </div>
    </div>
  );
}
