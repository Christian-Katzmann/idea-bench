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
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { AppShell } from '../components/layout/app-shell';
import { PageHeader } from '../components/ui/page-header';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
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
  return (
    <li className="flex flex-col rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{persona.name}</h3>
            {persona.isStarter ? (
              <Badge variant="secondary" className="text-[10px]">
                Starter
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {persona.description}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="icon-xs" onClick={onEdit} title="Edit">
            <Pencil className="size-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onDuplicate}
            title="Duplicate + edit"
          >
            <Copy className="size-3" />
          </Button>
          {!persona.isStarter ? (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onDelete}
              title="Delete"
            >
              <Trash2 className="size-3" />
            </Button>
          ) : null}
        </div>
      </div>
      {persona.tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {persona.tags.map((t) => (
            <span
              key={t}
              className="rounded-full border border-border bg-surface-highlight px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
            >
              {t}
            </span>
          ))}
        </div>
      ) : null}
      {persona.priorities.length > 0 || persona.antiPatterns.length > 0 ? (
        <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
          {persona.priorities.length > 0 ? (
            <div>
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Priorities
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
                {persona.priorities.slice(0, 3).map((s) => (
                  <li key={s} className="line-clamp-1">
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {persona.antiPatterns.length > 0 ? (
            <div>
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Dislikes
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
                {persona.antiPatterns.slice(0, 3).map((s) => (
                  <li key={s} className="line-clamp-1">
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
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
