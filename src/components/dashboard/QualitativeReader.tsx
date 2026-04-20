import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, MessageSquare, AlertTriangle } from 'lucide-react';
import { apiFetch, type QualitativeResponsesData } from '../../lib/api';
import { cn } from '../../lib/utils';

/**
 * Qualitative comments reader — loads all free-text responses for a
 * campaign and renders them grouped by (prompt, model). The collapse
 * state is per-group so operators can focus on one comparison at a
 * time without scrolling through everything.
 *
 * Loads lazily: the query only fires once the tab is mounted (parent
 * controls this via `enabled`). Data size can be large for a noisy
 * campaign — 4 000-char cap per response + hundreds of voters — so we
 * render inside the tab rather than eagerly alongside the ratings
 * leaderboard.
 */
export function QualitativeReader({ campaignId }: { campaignId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['campaign-qualitative', campaignId],
    queryFn: () =>
      apiFetch<QualitativeResponsesData>(
        `/api/campaigns/${campaignId}/qualitative-responses`,
      ),
    // Comments are read-heavy, write-rare — match the campaign detail
    // polling cadence so new comments appear in place without being
    // aggressive about refetches.
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });

  // Group responses by prompt, then by model. Both levels sort by
  // orderIndex / displayName so the reader is stable across visits.
  const grouped = useMemo(() => {
    if (!data) return [];
    const qualitativePrompts = data.prompts.filter(
      (p) => p.mode === 'qualitative',
    );
    const modelsById = new Map(data.models.map((m) => [m.id, m]));
    return qualitativePrompts
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((prompt) => {
        const responsesForPrompt = data.responses.filter(
          (r) => r.promptId === prompt.id,
        );
        const byModel = new Map<
          string,
          typeof data.responses
        >();
        for (const r of responsesForPrompt) {
          if (!byModel.has(r.campaignModelId))
            byModel.set(r.campaignModelId, []);
          byModel.get(r.campaignModelId)!.push(r);
        }
        const modelGroups = Array.from(byModel.entries())
          .map(([modelId, responses]) => ({
            model: modelsById.get(modelId) ?? {
              id: modelId,
              displayName: '(unknown model)',
              providerModelId: modelId,
            },
            responses: responses.sort(
              (a, b) =>
                new Date(a.createdAt).getTime() -
                new Date(b.createdAt).getTime(),
            ),
          }))
          .sort((a, b) =>
            a.model.displayName.localeCompare(b.model.displayName),
          );
        return { prompt, modelGroups };
      });
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading comments…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div>
          <div className="font-medium text-foreground">
            Failed to load comments
          </div>
          <div className="mt-0.5 text-xs">
            {error instanceof Error ? error.message : String(error)}
          </div>
        </div>
      </div>
    );
  }

  if (!data || grouped.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
        No qualitative prompts in this campaign.
      </div>
    );
  }

  const totalComments = data.responses.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-xl border border-border bg-card px-5 py-3">
        <div>
          <h2 className="font-heading text-sm font-semibold text-foreground">
            Qualitative feedback
          </h2>
          <p className="text-[11px] text-muted-foreground">
            Free-text comments voters left on qualitative-mode prompts.
            Grouped by prompt, then by model.
          </p>
        </div>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {totalComments} comment{totalComments === 1 ? '' : 's'}
        </span>
      </div>

      {grouped.map((group) => (
        <PromptSection
          key={group.prompt.id}
          prompt={group.prompt}
          modelGroups={group.modelGroups}
        />
      ))}
    </div>
  );
}

function PromptSection({
  prompt,
  modelGroups,
}: {
  prompt: QualitativeResponsesData['prompts'][number];
  modelGroups: Array<{
    model: QualitativeResponsesData['models'][number];
    responses: QualitativeResponsesData['responses'];
  }>;
}) {
  const totalComments = modelGroups.reduce(
    (n, g) => n + g.responses.length,
    0,
  );
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Prompt {prompt.orderIndex + 1}
          </div>
          <p className="mt-1 text-sm font-medium text-foreground line-clamp-3">
            {prompt.text}
          </p>
        </div>
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          {totalComments}
        </span>
      </header>
      {totalComments === 0 ? (
        <div className="px-5 py-4 text-sm text-muted-foreground">
          No comments yet for this prompt.
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border/60">
          {modelGroups.map((group) => (
            <ModelGroup
              key={group.model.id}
              model={group.model}
              responses={group.responses}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ModelGroup({
  model,
  responses,
}: {
  model: QualitativeResponsesData['models'][number];
  responses: QualitativeResponsesData['responses'];
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center justify-between gap-3 bg-surface-highlight/40 px-5 py-2 text-left transition-colors hover:bg-surface-highlight/70"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2">
          <MessageSquare className="size-3.5 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">
            {model.displayName}
          </span>
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {responses.length}
          </span>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">
          {expanded ? '—' : '+'}
        </span>
      </button>
      {expanded && (
        <ul className="flex flex-col divide-y divide-border/60">
          {responses.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-1 px-5 py-3 text-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <span
                  className={cn(
                    'text-[11px] text-muted-foreground',
                    r.email
                      ? 'font-mono'
                      : 'italic text-muted-foreground/70',
                  )}
                >
                  {r.email ?? 'anonymous'}
                </span>
                <time
                  dateTime={r.createdAt}
                  className="font-mono text-[10px] tabular-nums text-muted-foreground/80"
                >
                  {new Date(r.createdAt).toLocaleString()}
                </time>
              </div>
              <p className="whitespace-pre-wrap text-foreground">
                {r.text}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
