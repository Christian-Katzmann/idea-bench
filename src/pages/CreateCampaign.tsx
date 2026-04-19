import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Loader2,
  Play,
  Plus,
  Rocket,
  Trash2,
  XCircle,
} from 'lucide-react';
import { AppShell } from '../components/layout/app-shell';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { PageHeader } from '../components/ui/page-header';
import { ApiError, apiFetch, type ModelLibraryData } from '../lib/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { cn } from '../lib/utils';

const SUGGESTED_TAGS = [
  'translation',
  'summarization',
  'code',
  'creative writing',
  'data extraction',
  'reasoning',
  'structured output',
];

const MIN_MODELS = 4; // Tournament requires exactly 4 per bracket.

const STEPS = [
  { n: 1, label: 'Basics' },
  { n: 2, label: 'Prompts' },
  { n: 3, label: 'Models' },
  { n: 4, label: 'Generate' },
  { n: 5, label: 'Launch' },
] as const;

interface SlotOkEvent {
  promptId: string;
  campaignModelId: string;
  modelDisplayName: string;
  status: 'ok';
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number;
  costUsd: number | null;
  output: string;
}
interface SlotErrorEvent {
  promptId: string;
  campaignModelId: string;
  modelDisplayName: string;
  status: 'error';
  kind: string;
  message: string;
  latencyMs: number;
}
type SlotEvent = SlotOkEvent | SlotErrorEvent;

interface CreatedCampaign {
  id: string;
  shareSlug: string;
  prompts: Array<{ id: string; orderIndex: number }>;
  models: Array<{ id: string; providerModelId: string; displayName: string }>;
}

export default function CreateCampaign() {
  const navigate = useNavigate();
  useDocumentTitle('New Campaign');
  const [step, setStep] = useState(1);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [prompts, setPrompts] = useState([{ text: '', context: '' }]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);

  const [createError, setCreateError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationDone, setGenerationDone] = useState(false);
  const [campaign, setCampaign] = useState<CreatedCampaign | null>(null);
  const [slotTotal, setSlotTotal] = useState(0);
  const [slots, setSlots] = useState<Record<string, SlotEvent>>({});
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [activateError, setActivateError] = useState<string | null>(null);
  const [isActivating, setIsActivating] = useState(false);

  const {
    data: modelLibrary,
    error: modelsError,
    isLoading: modelsLoading,
  } = useQuery({
    queryKey: ['models', 'enabled', 'name', 'campaign-create'],
    queryFn: () =>
      apiFetch<ModelLibraryData>('/api/operator/models?status=enabled&sort=name'),
  });

  useEffect(() => {
    const selectableIds = new Set(
      (modelLibrary?.rows ?? []).map((row) => row.providerModelId),
    );
    if (selectableIds.size === 0) return;
    setSelectedModels((prev) =>
      prev.filter((providerModelId) => selectableIds.has(providerModelId)),
    );
  }, [modelLibrary]);

  if (modelsError instanceof ApiError && modelsError.status === 401) {
    navigate('/login', { state: { from: '/campaign/new' }, replace: true });
  }

  const toggleCategory = (cat: string) => {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  };

  const toggleModel = (providerModelId: string) => {
    setSelectedModels((prev) =>
      prev.includes(providerModelId)
        ? prev.filter((m) => m !== providerModelId)
        : [...prev, providerModelId],
    );
  };

  const handleGenerate = useCallback(async () => {
    if (isGenerating) return;
    setCreateError(null);
    setGenerateError(null);
    setSlots({});
    setGenerationDone(false);
    setIsGenerating(true);

    try {
      const createRes = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          categories,
          prompts: prompts
            .filter((p) => p.text.trim())
            .map((p) => ({
              text: p.text,
              context: p.context.trim() ? p.context : undefined,
            })),
          providerModelIds: selectedModels,
        }),
      });
      if (createRes.status === 401) {
        navigate('/login', {
          state: { from: '/campaign/new' },
          replace: true,
        });
        return;
      }
      if (!createRes.ok) {
        const body = (await createRes.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `create failed (${createRes.status})`);
      }
      const created = (await createRes.json()) as CreatedCampaign;
      setCampaign(created);

      await runGeneration(created.id, {
        onStart: (total) => setSlotTotal(total),
        onSlot: (ev) =>
          setSlots((prev) => ({
            ...prev,
            [slotKey(ev.promptId, ev.campaignModelId)]: ev,
          })),
        onDone: () => setGenerationDone(true),
        onError: (msg) => setGenerateError(msg),
      });
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setIsGenerating(false);
    }
  }, [
    isGenerating,
    name,
    description,
    categories,
    prompts,
    selectedModels,
    navigate,
  ]);

  const handleLaunch = async () => {
    if (!campaign || isActivating) return;
    setActivateError(null);
    setIsActivating(true);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/activate`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `activate failed (${res.status})`);
      }
      navigate(`/campaign/${campaign.id}`);
    } catch (err) {
      setActivateError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsActivating(false);
    }
  };

  const slotValues: SlotEvent[] = Object.values(slots);
  const slotsReceived = slotValues.length;
  const succeeded = slotValues.filter((s) => s.status === 'ok').length;
  const failed = slotValues.filter((s) => s.status === 'error').length;
  const pct = slotTotal ? Math.round((slotsReceived / slotTotal) * 100) : 0;

  const MODELS = (modelLibrary?.rows ?? []).filter(
    (model) => model.enabled && !model.legacy,
  );

  const canProgress =
    (step === 1 && !!name) ||
    (step === 2 && prompts[0].text.trim().length > 0) ||
    (step === 3 && selectedModels.length >= MIN_MODELS) ||
    (step === 4 && generationDone) ||
    step === 5;

  return (
    <AppShell
      breadcrumb={[{ label: 'Campaigns', to: '/' }, { label: 'New' }]}
    >
      <PageHeader
        title="New campaign"
        description="Configure the evaluation, generate outputs, and activate the share link."
      />

      <div className="mx-auto mt-6 w-full max-w-3xl">
        <Stepper activeStep={step} />

        <div className="mt-8 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="px-6 py-7 md:px-8 md:py-8">
            {step === 1 && (
              <StepBasics
                name={name}
                description={description}
                categories={categories}
                onName={setName}
                onDescription={setDescription}
                onToggleCategory={toggleCategory}
              />
            )}

            {step === 2 && (
              <StepPrompts
                prompts={prompts}
                onChange={setPrompts}
              />
            )}

            {step === 3 && (
              <StepModels
                models={MODELS}
                selected={selectedModels}
                loading={modelsLoading}
                error={modelsError}
                onToggle={toggleModel}
              />
            )}

            {step === 4 && (
              <StepGenerate
                promptCount={prompts.filter((p) => p.text.trim()).length}
                modelCount={selectedModels.length}
                isGenerating={isGenerating}
                generationDone={generationDone}
                slotsReceived={slotsReceived}
                slotTotal={slotTotal}
                succeeded={succeeded}
                failed={failed}
                pct={pct}
                slotValues={slotValues}
                createError={createError}
                generateError={generateError}
                onStart={handleGenerate}
              />
            )}

            {step === 5 && (
              <StepLaunch
                name={name}
                succeeded={succeeded}
                failed={failed}
                activateError={activateError}
              />
            )}
          </div>

          <footer className="flex items-center justify-between border-t border-border bg-surface-highlight/30 px-6 py-4 md:px-8">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1 || isGenerating}
            >
              <ArrowLeft className="size-3.5" />
              Back
            </Button>
            {step < 5 ? (
              <Button
                size="sm"
                onClick={() => setStep((s) => Math.min(5, s + 1))}
                disabled={!canProgress || isGenerating}
              >
                Next
                <ArrowRight className="size-3.5" />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleLaunch}
                disabled={isActivating || failed > 0}
                title={
                  failed > 0
                    ? 'Fix failed generations before launching'
                    : undefined
                }
              >
                {isActivating ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Activating…
                  </>
                ) : (
                  <>
                    <Rocket className="size-3.5" />
                    Launch campaign
                  </>
                )}
              </Button>
            )}
          </footer>
        </div>
      </div>
    </AppShell>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Stepper
// ────────────────────────────────────────────────────────────────────────────

function Stepper({ activeStep }: { activeStep: number }) {
  return (
    <ol
      aria-label="Wizard progress"
      className="relative flex items-center justify-between"
    >
      <span
        aria-hidden
        className="absolute left-4 right-4 top-3.5 -z-10 h-px bg-border"
      />
      {STEPS.map(({ n, label }) => {
        const isActive = activeStep === n;
        const isDone = activeStep > n;
        return (
          <li
            key={n}
            className="flex flex-col items-center gap-1.5 bg-background px-2"
          >
            <div
              aria-current={isActive ? 'step' : undefined}
              className={cn(
                'flex size-7 items-center justify-center rounded-full border text-xs font-medium transition-colors',
                isDone
                  ? 'border-foreground bg-foreground text-background'
                  : isActive
                    ? 'border-foreground bg-card text-foreground ring-4 ring-foreground/10'
                    : 'border-border bg-card text-muted-foreground',
              )}
            >
              {isDone ? <Check className="size-3.5" /> : n}
            </div>
            <span
              className={cn(
                'text-[10px] font-medium uppercase tracking-wide',
                activeStep >= n ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Steps
// ────────────────────────────────────────────────────────────────────────────

function StepBasics({
  name,
  description,
  categories,
  onName,
  onDescription,
  onToggleCategory,
}: {
  name: string;
  description: string;
  categories: string[];
  onName: (v: string) => void;
  onDescription: (v: string) => void;
  onToggleCategory: (t: string) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <StepHeader
        title="Campaign basics"
        description="Name it, describe it, tag it."
      />
      <div className="flex flex-col gap-2">
        <Label htmlFor="name" className="text-[10px] uppercase tracking-wide">
          Campaign name
        </Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder="e.g. Customer support response quality"
          autoFocus
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="desc" className="text-[10px] uppercase tracking-wide">
          Description <span className="text-muted-foreground/70">(shown to voters)</span>
        </Label>
        <Textarea
          id="desc"
          value={description}
          onChange={(e) => onDescription(e.target.value)}
          placeholder="Briefly explain what voters should look for…"
          className="min-h-24"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label className="text-[10px] uppercase tracking-wide">Categories</Label>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED_TAGS.map((tag) => {
            const on = categories.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => onToggleCategory(tag)}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[11px] font-medium transition-colors',
                  on
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground',
                )}
              >
                {on && <Check className="size-3" />}
                {tag}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StepPrompts({
  prompts,
  onChange,
}: {
  prompts: Array<{ text: string; context: string }>;
  onChange: (p: Array<{ text: string; context: string }>) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <StepHeader
        title="Prompts & context"
        description="Add the prompts you want to evaluate. Each prompt runs against every selected model."
      />
      <div className="flex flex-col gap-4">
        {prompts.map((prompt, idx) => (
          <div
            key={idx}
            className="group relative flex flex-col gap-3 rounded-lg border border-border bg-surface-highlight/30 p-4"
          >
            {prompts.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  onChange(prompts.filter((_, i) => i !== idx))
                }
                aria-label="Remove prompt"
                className="absolute right-2 top-2 rounded-md p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-card hover:text-foreground group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor={`prompt-text-${idx}`}
                className="text-[10px] uppercase tracking-wide"
              >
                Prompt {idx + 1}
              </Label>
              <Textarea
                id={`prompt-text-${idx}`}
                value={prompt.text}
                onChange={(e) => {
                  const next = [...prompts];
                  next[idx].text = e.target.value;
                  onChange(next);
                }}
                placeholder="Enter the prompt text…"
                className="min-h-20 bg-card"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor={`prompt-context-${idx}`}
                className="text-[10px] uppercase tracking-wide"
              >
                Context <span className="text-muted-foreground/70">(optional)</span>
              </Label>
              <Textarea
                id={`prompt-context-${idx}`}
                value={prompt.context}
                onChange={(e) => {
                  const next = [...prompts];
                  next[idx].context = e.target.value;
                  onChange(next);
                }}
                placeholder="Background info or system instructions…"
                className="min-h-16 bg-card text-sm"
              />
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...prompts, { text: '', context: '' }])}
          className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card py-3 text-sm text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
        >
          <Plus className="size-4" />
          Add another prompt
        </button>
      </div>
    </div>
  );
}

function StepModels({
  models,
  selected,
  loading,
  error,
  onToggle,
}: {
  models: ModelLibraryData['rows'];
  selected: string[];
  loading: boolean;
  error: unknown;
  onToggle: (id: string) => void;
}) {
  const isAuthError = error instanceof ApiError && error.status === 401;

  return (
    <div className="flex flex-col gap-6">
      <StepHeader
        title="Select models"
        description={`Pick the models to pit against each other. Tournaments require at least ${MIN_MODELS}.`}
      />
      {loading ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading available models…
        </div>
      ) : error && !isAuthError ? (
        <ErrorAlert>{error instanceof Error ? error.message : String(error)}</ErrorAlert>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {models.map((model) => {
            const on = selected.includes(model.providerModelId);
            return (
              <button
                key={model.providerModelId}
                type="button"
                onClick={() => onToggle(model.providerModelId)}
                className={cn(
                  'group flex items-center justify-between gap-3 rounded-lg border bg-card p-3 text-left transition-colors',
                  on
                    ? 'border-foreground bg-surface-highlight/60'
                    : 'border-border hover:border-foreground/20',
                )}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {model.displayName}
                  </div>
                  <div className="truncate font-mono text-[11px] text-muted-foreground">
                    {model.providerModelId}
                  </div>
                </div>
                <div
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-md border text-background transition-colors',
                    on
                      ? 'border-foreground bg-foreground'
                      : 'border-border bg-transparent',
                  )}
                >
                  {on && <Check className="size-3" />}
                </div>
              </button>
            );
          })}
        </div>
      )}
      <div className="text-[11px] text-muted-foreground">
        <span className="font-mono text-foreground">{selected.length}</span>{' '}
        selected · need at least{' '}
        <span className="font-mono">{MIN_MODELS}</span>
      </div>
    </div>
  );
}

function StepGenerate({
  promptCount,
  modelCount,
  isGenerating,
  generationDone,
  slotsReceived,
  slotTotal,
  succeeded,
  failed,
  pct,
  slotValues,
  createError,
  generateError,
  onStart,
}: {
  promptCount: number;
  modelCount: number;
  isGenerating: boolean;
  generationDone: boolean;
  slotsReceived: number;
  slotTotal: number;
  succeeded: number;
  failed: number;
  pct: number;
  slotValues: SlotEvent[];
  createError: string | null;
  generateError: string | null;
  onStart: () => void;
}) {
  const total = promptCount * modelCount;

  return (
    <div className="flex flex-col gap-6">
      <StepHeader
        title="Generate & preview"
        description="Running every prompt through every model via OpenRouter. Participants vote on these cached outputs."
      />

      <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface-highlight/30 p-5">
        <div className="grid grid-cols-3 gap-4 text-center">
          <Counter label="Prompts" value={promptCount} />
          <Counter label="Models" value={modelCount} />
          <Counter label="Generations" value={total} />
        </div>

        {!isGenerating && slotsReceived === 0 ? (
          <Button onClick={onStart} className="mx-auto" size="lg">
            <Play className="size-4" />
            Start generation
          </Button>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-muted-foreground">
                {isGenerating ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Generating…
                  </>
                ) : generationDone ? (
                  <>
                    <CheckCircle2 className="size-3.5 text-success" />
                    Complete
                  </>
                ) : null}
              </span>
              <span className="font-mono font-medium tabular-nums text-foreground">
                {slotsReceived}/{slotTotal} · {pct}%
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-border">
              <div
                className="h-full bg-foreground transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            {(succeeded > 0 || failed > 0) && (
              <div className="flex items-center gap-4 text-[11px]">
                <span className="flex items-center gap-1.5 text-success">
                  <CheckCircle2 className="size-3" />
                  {succeeded} succeeded
                </span>
                {failed > 0 && (
                  <span className="flex items-center gap-1.5 text-destructive">
                    <XCircle className="size-3" />
                    {failed} failed
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {createError && <ErrorAlert>{createError}</ErrorAlert>}
        {generateError && <ErrorAlert>{generateError}</ErrorAlert>}
      </div>

      {slotValues.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Outputs as they arrive
          </div>
          <ul className="flex max-h-96 flex-col gap-1.5 overflow-y-auto rounded-lg border border-border bg-card p-2">
            {slotValues.map((slot) => (
              <li
                key={slotKey(slot.promptId, slot.campaignModelId)}
                className={cn(
                  'rounded-md border px-3 py-2 text-xs',
                  slot.status === 'ok'
                    ? 'border-border bg-surface-highlight/40'
                    : 'border-destructive/30 bg-destructive/5',
                )}
              >
                <div className="mb-1 flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium text-foreground">
                    {slot.modelDisplayName}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {slot.status === 'ok'
                      ? `${slot.tokensOut ?? '?'} tok · ${slot.latencyMs}ms`
                      : `error · ${slot.latencyMs}ms`}
                  </span>
                </div>
                {slot.status === 'ok' ? (
                  <div className="line-clamp-3 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted-foreground">
                    {slot.output}
                  </div>
                ) : (
                  <div className="text-[11px] text-destructive">
                    <span className="font-mono uppercase">{slot.kind}</span>:{' '}
                    {slot.message}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StepLaunch({
  name,
  succeeded,
  failed,
  activateError,
}: {
  name: string;
  succeeded: number;
  failed: number;
  activateError: string | null;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-full border border-success/25 bg-success/10 text-success">
        <Check className="size-6" />
      </div>
      <div className="flex flex-col gap-1.5">
        <h2 className="font-heading text-xl font-semibold text-foreground">
          Ready to launch
        </h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Campaign <span className="font-medium text-foreground">"{name}"</span>{' '}
          is staged with{' '}
          <span className="font-mono text-foreground">{succeeded}</span>{' '}
          successful generation{succeeded === 1 ? '' : 's'}
          {failed > 0 ? (
            <>
              {' '}
              and{' '}
              <span className="font-mono text-destructive">{failed}</span>{' '}
              failure{failed === 1 ? '' : 's'} to review
            </>
          ) : null}
          . Launching activates the share link.
        </p>
      </div>
      {activateError && (
        <div className="w-full max-w-md text-left">
          <ErrorAlert>{activateError}</ErrorAlert>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Local primitives
// ────────────────────────────────────────────────────────────────────────────

function StepHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <h2 className="font-heading text-lg font-semibold text-foreground">
        {title}
      </h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="font-mono text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function ErrorAlert({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// SSE plumbing — unchanged from original. Fetch + ReadableStream instead of
// EventSource because EventSource is GET-only and /generate is POST.
// ────────────────────────────────────────────────────────────────────────────

function slotKey(promptId: string, campaignModelId: string): string {
  return `${promptId}:${campaignModelId}`;
}

async function runGeneration(
  campaignId: string,
  handlers: {
    onStart: (total: number) => void;
    onSlot: (ev: SlotEvent) => void;
    onDone: (summary: { succeeded: number; failed: number }) => void;
    onError: (msg: string) => void;
  },
): Promise<void> {
  const res = await fetch(`/api/campaigns/${campaignId}/generate`, {
    method: 'POST',
    headers: { accept: 'text/event-stream' },
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(
      text.slice(0, 300) || `generate request failed (${res.status})`,
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const parsed = parseFrame(frame);
      if (!parsed) continue;
      const { event, data } = parsed;
      if (event === 'start') {
        const { total } = data as { total: number };
        handlers.onStart(total);
      } else if (event === 'slot') {
        handlers.onSlot(data as SlotEvent);
      } else if (event === 'done') {
        handlers.onDone(data as { succeeded: number; failed: number });
      } else if (event === 'error') {
        const { message } = data as { message: string };
        handlers.onError(message);
      }
    }
  }
}

function parseFrame(
  frame: string,
): { event: string; data: unknown } | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith(':')) continue;
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return null;
  try {
    return { event, data: JSON.parse(dataLines.join('\n')) };
  } catch {
    return { event, data: dataLines.join('\n') };
  }
}
