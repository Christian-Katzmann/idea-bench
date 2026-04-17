import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Activity, Loader2 } from 'lucide-react';
import { ModeToggle } from '../components/ModeToggle';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function OperatorLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useDocumentTitle('Operator Sign In');

  // Where to bounce back to after login; defaults to operator home.
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

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 font-sans text-foreground relative">
      <div className="absolute top-4 right-4">
        <ModeToggle />
      </div>
      <div className="w-full max-w-sm bg-card rounded-2xl shadow-2xl overflow-hidden border border-border">
        <div className="p-8 text-center border-b border-border bg-sidebar">
          <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center mx-auto mb-4 border border-primary/30">
            <Activity className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">ModelArena</h1>
          <p className="text-muted-foreground text-sm mt-1">Operator sign-in</p>
        </div>
        <div className="p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label
                htmlFor="pw"
                className="text-muted-foreground text-xs uppercase tracking-wider"
              >
                Password
              </Label>
              <Input
                id="pw"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 bg-background border-border"
                autoFocus
              />
            </div>
            {error && (
              <div className="p-3 rounded-md bg-red-500/10 border border-red-500/30 text-red-500 text-sm">
                {error}
              </div>
            )}
            <Button
              type="submit"
              disabled={!password.trim() || busy}
              className="w-full h-12 text-lg font-medium bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sign in'}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground text-center mt-6">
            Participant voting links don't require this.
          </p>
        </div>
      </div>
    </div>
  );
}
