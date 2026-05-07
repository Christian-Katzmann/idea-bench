/**
 * Personas library — browse, create, edit, duplicate-and-edit, and
 * delete saved voter profiles. Operators use personas as judges in
 * Plan 02 persona-panel simulated runs; a curated set here is the
 * product wedge over generic LLM-as-judge.
 *
 * Phase 2 deliberately ships with an empty starter library. Writing a
 * convincing persona is editorial craft — a mediocre auto-seeded set
 * would poison the first-run experience. The empty state explains
 * this up front.
 *
 * The authoring dialog uses structured fields (priorities, anti-
 * patterns, tags) rather than a single free-text prompt so the
 * operator is guided toward good personas without friction.
 */
import { useMemo, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Copy,
  Loader2,
  Pencil,
  PlayCircle,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { AppShell } from '../components/layout/app-shell';
import { PageHeader } from '../components/ui/page-header';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Skeleton } from '../components/ui/skeleton';
import { Textarea } from '../components/ui/textarea';
import { EmptyState } from '../components/ui/empty-state';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { ConfirmDestructive } from '../components/modals/confirm-destructive';
import { toast } from '../components/ui/toast';
import {
  ApiError,
  apiFetch,
  type Persona,
  type PersonaInput,
  type PersonaTestResult,
} from '../lib/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { cn } from '../lib/utils';

export default function PersonaLibrary() {
  useDocumentTitle('Personas');
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [authoring, setAuthoring] = useState<
    | { mode: 'closed' }
    | { mode: 'create'; seed: Partial<PersonaInput> | null }
    | { mode: 'edit'; persona: Persona }
  >({ mode: 'closed' });
  const [deleteTarget, setDeleteTarget] = useState<Persona | null>(null);

  const listQuery = useQuery({
    queryKey: ['personas', search],
    queryFn: () =>
      apiFetch<{ personas: Persona[] }>(
        `/api/personas${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ''}`,
      ),
  });

  const personas = listQuery.data?.personas ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: true; id: string }>(`/api/personas/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['personas'] });
      setDeleteTarget(null);
      toast.success('Persona deleted');
    },
    onError: (err) => {
      toast.error('Could not delete persona', {
        details:
          err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err),
      });
    },
  });

  return (
    <AppShell breadcrumb={[{ label: 'Personas' }]}>
      <PageHeader
        title="Personas"
        description="Saved voter profiles used in persona-panel simulated runs. Personas are editorial — budget real time for each."
        action={
          <Button onClick={() => setAuthoring({ mode: 'create', seed: null })}>
            <Plus className="size-4" /> New persona
          </Button>
        }
      />

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
        <Search className="size-4 text-muted-foreground" />
        <Input
          placeholder="Search personas by name or description"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border-none bg-transparent shadow-none focus-visible:ring-0"
        />
        {search ? (
          <Button variant="ghost" size="icon-sm" onClick={() => setSearch('')}>
            <X className="size-4" />
          </Button>
        ) : null}
      </div>

      <div className="mt-4">
        {listQuery.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        ) : personas.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title={search ? 'No personas match that search' : 'Your persona library is empty'}
            description={
              search
                ? 'Clear the filter or broaden your query.'
                : 'Write your first persona by hand. A specific role description, clear priorities, and a short anti-patterns list outperform generic prompts. Plan on ~30 minutes per persona.'
            }
            action={
              !search ? (
                <Button onClick={() => setAuthoring({ mode: 'create', seed: null })}>
                  <Plus className="size-4" /> Create your first persona
                </Button>
              ) : null
            }
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {personas.map((p) => (
              <PersonaCard
                key={p.id}
                persona={p}
                onEdit={() => setAuthoring({ mode: 'edit', persona: p })}
                onDuplicate={() =>
                  setAuthoring({
                    mode: 'create',
                    seed: {
                      name: `${p.name} (copy)`,
                      description: p.description,
                      systemPrompt: p.systemPrompt,
                      priorities: p.priorities,
                      antiPatterns: p.antiPatterns,
                      tags: p.tags,
                      derivedFromPersonaId: p.id,
                    },
                  })
                }
                onDelete={() => setDeleteTarget(p)}
              />
            ))}
          </ul>
        )}
      </div>

      <PersonaAuthoringDialog
        state={authoring}
        onClose={() => setAuthoring({ mode: 'closed' })}
        onSaved={() => {
          setAuthoring({ mode: 'closed' });
          qc.invalidateQueries({ queryKey: ['personas'] });
        }}
      />

      <ConfirmDestructive
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete persona?"
        description={
          deleteTarget
            ? `"${deleteTarget.name}" will be removed. Past simulated runs that used this persona keep their data, but the persona link goes dark.`
            : ''
        }
        confirmWord={deleteTarget?.name ?? ''}
        confirmLabel="Delete persona"
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
        isPending={deleteMutation.isPending}
      />
    </AppShell>
  );
}

function PersonaCard({
  persona,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  persona: Persona;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const visiblePriorities = persona.priorities.slice(0, 4);
  const visibleAntiPatterns = persona.antiPatterns.slice(0, 4);
  const hiddenSpineCount =
    Math.max(0, persona.priorities.length - visiblePriorities.length) +
    Math.max(0, persona.antiPatterns.length - visibleAntiPatterns.length);
  const hasSpine =
    persona.priorities.length > 0 || persona.antiPatterns.length > 0;
  const kickerTags = persona.tags.slice(0, 3);
  const extraTagCount = Math.max(0, persona.tags.length - kickerTags.length);
  const hasKicker =
    kickerTags.length > 0 || extraTagCount > 0 || persona.isStarter;

  return (
    <li className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-foreground/20 dark:hover:border-foreground/30">
      {hasKicker ? (
        <p className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
          {persona.isStarter ? (
            <span className="lowercase italic tracking-normal text-foreground/60">
              starter
              {kickerTags.length > 0 || extraTagCount > 0 ? (
                <span className="not-italic tracking-[0.14em] text-muted-foreground/70">
                  {' '}·{' '}
                </span>
              ) : null}
            </span>
          ) : null}
          {kickerTags.map((t, idx) => (
            <span key={t}>
              {idx > 0 ? ' · ' : ''}
              {t}
            </span>
          ))}
          {extraTagCount > 0 ? (
            <span className="text-muted-foreground/50">
              {kickerTags.length > 0 ? ' · ' : ''}+{extraTagCount}
            </span>
          ) : null}
        </p>
      ) : null}

      <div
        className={cn(
          'flex items-start justify-between gap-3',
          hasKicker && 'mt-1',
        )}
      >
        <h3 className="min-w-0 flex-1 break-words text-base font-semibold leading-snug tracking-[-0.015em] text-foreground">
          {persona.name}
        </h3>
        <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onEdit}
            aria-label="Edit persona"
          >
            <Pencil className="size-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onDuplicate}
            aria-label="Duplicate persona"
          >
            <Copy className="size-3" />
          </Button>
          {!persona.isStarter ? (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onDelete}
              aria-label="Delete persona"
            >
              <Trash2 className="size-3" />
            </Button>
          ) : null}
        </div>
      </div>

      <p
        className={cn(
          'mt-1.5 text-xs leading-relaxed text-muted-foreground',
          hasSpine ? 'line-clamp-2' : 'line-clamp-3',
        )}
      >
        {persona.description}
      </p>

      {hasSpine ? (
        <div className="mt-4 border-t border-border/60 pt-3">
          {visiblePriorities.length > 0 ? (
            <ul className="space-y-1.5">
              {visiblePriorities.map((p, i) => (
                <SpineRow key={`p-${i}`} mark="+" text={p} />
              ))}
            </ul>
          ) : null}
          {visibleAntiPatterns.length > 0 ? (
            <ul
              className={cn(
                'space-y-1.5',
                visiblePriorities.length > 0 && 'mt-2',
              )}
            >
              {visibleAntiPatterns.map((a, i) => (
                <SpineRow key={`a-${i}`} mark="−" text={a} />
              ))}
            </ul>
          ) : null}
          {hiddenSpineCount > 0 ? (
            <div className="mt-1.5 pl-4 font-mono text-[11px] text-muted-foreground/60">
              +{hiddenSpineCount} more
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function SpineRow({ mark, text }: { mark: string; text: string }) {
  return (
    <li className="grid grid-cols-[1rem_1fr] items-baseline gap-x-1">
      <span className="font-mono text-[12.5px] font-medium leading-[1.5] tabular-nums text-muted-foreground/60">
        {mark}
      </span>
      <span className="font-mono text-[12.5px] leading-[1.5] text-foreground">
        {text}
      </span>
    </li>
  );
}

function PersonaAuthoringDialog({
  state,
  onClose,
  onSaved,
}: {
  state:
    | { mode: 'closed' }
    | { mode: 'create'; seed: Partial<PersonaInput> | null }
    | { mode: 'edit'; persona: Persona };
  onClose: () => void;
  onSaved: () => void;
}) {
  const open = state.mode !== 'closed';
  const persona = state.mode === 'edit' ? state.persona : null;
  const seed =
    state.mode === 'create'
      ? state.seed
      : state.mode === 'edit'
        ? {
            name: state.persona.name,
            description: state.persona.description,
            systemPrompt: state.persona.systemPrompt,
            priorities: state.persona.priorities,
            antiPatterns: state.persona.antiPatterns,
            tags: state.persona.tags,
          }
        : null;

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {state.mode === 'edit' ? `Edit persona: ${persona?.name}` : 'New persona'}
          </DialogTitle>
          <DialogDescription>
            Persona quality drives leaderboard quality. Be specific — a
            real role, real priorities, real anti-patterns outperform
            generic prompts.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <PersonaAuthoringForm
            key={state.mode + (persona?.id ?? 'new')}
            mode={state.mode === 'edit' ? 'edit' : 'create'}
            personaId={persona?.id ?? null}
            seed={seed ?? undefined}
            onClose={onClose}
            onSaved={onSaved}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PersonaAuthoringForm({
  mode,
  personaId,
  seed,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  personaId: string | null;
  seed?: Partial<PersonaInput>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(seed?.name ?? '');
  const [description, setDescription] = useState(seed?.description ?? '');
  const [systemPrompt, setSystemPrompt] = useState(seed?.systemPrompt ?? '');
  const [priorities, setPriorities] = useState<string[]>(seed?.priorities ?? []);
  const [antiPatterns, setAntiPatterns] = useState<string[]>(
    seed?.antiPatterns ?? [],
  );
  const [tags, setTags] = useState<string[]>(seed?.tags ?? []);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: PersonaInput = {
        name: name.trim(),
        description: description.trim(),
        systemPrompt: systemPrompt.trim(),
        priorities,
        antiPatterns,
        tags,
      };
      if (mode === 'edit' && personaId) {
        return apiFetch<{ persona: Persona }>(`/api/personas/${personaId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      }
      return apiFetch<{ persona: Persona }>(`/api/personas`, {
        method: 'POST',
        body: JSON.stringify({
          ...payload,
          derivedFromPersonaId: seed?.derivedFromPersonaId ?? null,
        }),
      });
    },
    onSuccess: () => {
      toast.success(mode === 'edit' ? 'Persona updated' : 'Persona created');
      onSaved();
    },
    onError: (err) => {
      toast.error('Save failed', {
        details:
          err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err),
      });
    },
  });

  const canSave =
    !saveMutation.isPending &&
    name.trim().length > 0 &&
    description.trim().length > 0 &&
    systemPrompt.trim().length > 0;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) saveMutation.mutate();
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="persona-name" className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Name
        </Label>
        <Input
          id="persona-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Corporate Finance Manager"
          maxLength={80}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="persona-desc" className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Description
        </Label>
        <Input
          id="persona-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="One line shown in the persona picker"
          maxLength={280}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="persona-prompt" className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          System prompt
        </Label>
        <Textarea
          id="persona-prompt"
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={6}
          maxLength={4000}
          placeholder="You are a Corporate Finance Manager at a mid-market SaaS company. You spend your day…"
          className="font-mono text-xs"
        />
        <p className="text-[11px] text-muted-foreground">
          Prepended verbatim to every judge call this persona makes. Keep
          it specific; avoid marketing language.
        </p>
      </div>
      <BulletEditor
        label="Priorities"
        hint="What this persona cares about. One per line."
        value={priorities}
        onChange={setPriorities}
      />
      <BulletEditor
        label="Anti-patterns"
        hint="What this persona dislikes. One per line."
        value={antiPatterns}
        onChange={setAntiPatterns}
      />
      <TagEditor value={tags} onChange={setTags} />
      <PersonaTestPanel
        personaId={personaId}
        currentSystemPrompt={systemPrompt}
      />
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={saveMutation.isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={!canSave}>
          {saveMutation.isPending ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Create persona'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function BulletEditor({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const text = value.join('\n');
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </Label>
      <Textarea
        rows={3}
        value={text}
        onChange={(e) =>
          onChange(
            e.target.value
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean)
              .slice(0, 20),
          )
        }
        placeholder="One bullet per line"
      />
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function TagEditor({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const addTag = (raw: string) => {
    const t = raw.trim().toLowerCase();
    if (!t) return;
    if (value.includes(t)) return;
    onChange([...value, t].slice(0, 12));
    setDraft('');
  };
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        Tags
      </Label>
      <div
        className={cn(
          'flex flex-wrap items-center gap-1 rounded-md border border-border bg-background px-2 py-1.5',
        )}
      >
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-surface-highlight px-2 py-0.5 text-[11px]"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(value.filter((t) => t !== tag))}
              className="text-muted-foreground hover:text-foreground"
              aria-label={`Remove tag ${tag}`}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              addTag(draft);
            }
            if (e.key === 'Backspace' && !draft && value.length > 0) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => addTag(draft)}
          placeholder={value.length === 0 ? 'Add tags…' : ''}
          className="min-w-[120px] flex-1 border-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          maxLength={40}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Lowercase keywords for filtering: industry, role, seniority.
      </p>
    </div>
  );
}

/**
 * Inline persona preview — takes a sample prompt + output, runs one
 * real judge call using the CURRENT form state's system prompt, and
 * shows the reply. Lets the operator iterate on the prompt without
 * saving or launching a full simulated run.
 *
 * Costs one judge call (~$0.001 on the cheap tier). No DB writes,
 * no ratings impact.
 */
function PersonaTestPanel({
  personaId,
  currentSystemPrompt,
}: {
  personaId: string | null;
  currentSystemPrompt: string;
}) {
  const [open, setOpen] = useState(false);
  const [promptText, setPromptText] = useState(
    'Write a short internal memo to a senior stakeholder recommending a vendor switch. Keep it under 150 words.',
  );
  const [output, setOutput] = useState('');

  const testMutation = useMutation({
    mutationFn: () => {
      // `__draft` routes through the test endpoint using the CURRENT
      // form state's system prompt rather than anything saved. Works
      // for both brand-new personas and unsaved edits to existing ones.
      const id = personaId ?? '__draft';
      return apiFetch<PersonaTestResult>(
        `/api/personas/${id}?action=test`,
        {
          method: 'POST',
          body: JSON.stringify({
            promptText: promptText.trim(),
            output: output.trim(),
            systemPromptOverride: currentSystemPrompt.trim() || undefined,
          }),
        },
      );
    },
  });

  const canRun =
    !testMutation.isPending &&
    promptText.trim().length > 0 &&
    output.trim().length > 0 &&
    currentSystemPrompt.trim().length > 0;

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
      >
        <span className="inline-flex items-center gap-2">
          <PlayCircle className="size-3.5" />
          Preview this persona
        </span>
        <span
          className={cn(
            'text-muted-foreground transition-transform',
            open && 'rotate-90',
          )}
          aria-hidden
        >
          &rsaquo;
        </span>
      </button>
      {open ? (
        <div className="space-y-3 border-t border-border p-3">
          <p className="text-[11px] text-muted-foreground">
            One live judge call using your current system prompt. Costs
            ~$0.001 on the cheap tier; no DB writes.
          </p>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Sample prompt
            </Label>
            <Textarea
              rows={2}
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              maxLength={4000}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Sample model output
            </Label>
            <Textarea
              rows={4}
              value={output}
              onChange={(e) => setOutput(e.target.value)}
              placeholder="Paste a candidate response to evaluate"
              maxLength={4000}
            />
          </div>
          <div className="flex items-center justify-between">
            <Button
              type="button"
              size="sm"
              onClick={() => testMutation.mutate()}
              disabled={!canRun}
            >
              {testMutation.isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" /> Judging…
                </>
              ) : (
                'Run preview'
              )}
            </Button>
            {testMutation.data && 'ok' in testMutation.data && testMutation.data.ok ? (
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                {testMutation.data.judgeDisplayName} ·{' '}
                {testMutation.data.latencyMs}ms ·{' '}
                ${testMutation.data.costUsd.toFixed(4)}
              </span>
            ) : null}
          </div>
          <PersonaTestResult
            result={testMutation.data}
            error={
              testMutation.error instanceof ApiError
                ? testMutation.error.message
                : testMutation.error instanceof Error
                  ? testMutation.error.message
                  : null
            }
          />
        </div>
      ) : null}
    </div>
  );
}

function PersonaTestResult({
  result,
  error,
}: {
  result: PersonaTestResult | undefined;
  error: string | null;
}) {
  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
        {error}
      </div>
    );
  }
  if (!result) return null;
  if (!result.ok) {
    // strict:false narrowing doesn't survive this boundary.
    const fail = result as Extract<PersonaTestResult, { ok: false }>;
    return (
      <div className="rounded-md border border-border bg-surface-highlight p-2 text-xs text-muted-foreground">
        Judge couldn&rsquo;t produce output — {fail.reason}:{' '}
        <span className="font-mono">{fail.message}</span>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        Judge reply
      </Label>
      <div className="whitespace-pre-wrap rounded-md border border-border bg-background p-3 text-xs leading-relaxed">
        {result.reply}
      </div>
    </div>
  );
}
