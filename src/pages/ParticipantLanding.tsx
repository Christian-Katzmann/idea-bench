import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Activity, Clock, Layers, AlertTriangle, Loader2 } from 'lucide-react';
import { ModeToggle } from '../components/ModeToggle';
import { apiFetch, type VoteLanding } from '../lib/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function ParticipantLanding() {
  const { slug } = useParams();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');

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

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (start.isPending) return;
    start.mutate(email.trim() ? { email: email.trim() } : {});
  };

  if (landing.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading campaign...
      </div>
    );
  }

  if (landing.error || !landing.data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-sm p-4 rounded-md bg-red-500/10 border border-red-500/30 text-red-500">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Can't load this campaign</div>
              <div className="text-sm mt-1">
                {landing.error instanceof Error
                  ? landing.error.message
                  : 'Unknown error'}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const campaign = landing.data;
  const notActive = campaign.status !== 'active';

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 font-sans text-foreground relative">
      <div className="absolute top-4 right-4">
        <ModeToggle />
      </div>
      <div className="w-full max-w-md bg-card rounded-2xl shadow-2xl overflow-hidden border border-border">
        <div className="p-8 text-center border-b border-border bg-sidebar text-foreground">
          <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center mx-auto mb-4 border border-primary/30">
            <Activity className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mb-2">
            {campaign.name}
          </h1>
          <p className="text-muted-foreground text-sm">
            Model Evaluation Campaign
          </p>
        </div>

        <div className="p-8">
          <p className="text-muted-foreground mb-6 text-center leading-relaxed">
            {campaign.description}
          </p>

          <div className="flex items-center justify-center gap-6 mb-8 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span>~3-5 mins</span>
            </div>
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4" />
              <span>
                {campaign.promptCount * 4}-{campaign.promptCount * 5} battles
              </span>
            </div>
          </div>

          {notActive && (
            <div className="mb-4 p-3 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-500 text-sm flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                {campaign.status === 'completed'
                  ? 'This campaign is closed. Voting is no longer accepted.'
                  : 'This campaign is still in draft — not yet accepting votes.'}
              </span>
            </div>
          )}

          <form onSubmit={handleStart} className="space-y-4">
            <div>
              <Input
                type="text"
                placeholder="Enter your email (optional)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 text-center text-lg bg-background border-border"
                autoFocus
                disabled={notActive}
              />
            </div>
            {start.error && (
              <div className="p-3 rounded-md bg-red-500/10 border border-red-500/30 text-red-500 text-sm">
                {start.error instanceof Error
                  ? start.error.message
                  : 'Failed to start'}
              </div>
            )}
            <Button
              type="submit"
              className="w-full h-12 text-lg font-medium bg-primary hover:bg-primary/90 text-primary-foreground"
              disabled={notActive || start.isPending}
            >
              {start.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Start Voting'
              )}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center mt-6">
            Email is optional — it just helps the operator know who you are.
          </p>
        </div>
      </div>
    </div>
  );
}
