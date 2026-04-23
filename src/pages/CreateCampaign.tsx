import { useState, useCallback, useEffect, useMemo } from 'react';
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
  RefreshCw,
  Rocket,
  Trash2,
  XCircle,
} from 'lucide-react';
import { AppShell } from '../components/layout/app-shell';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { LazyTiptapPromptEditor } from '../components/editors/LazyTiptapPromptEditor';
import { PageHeader } from '../components/ui/page-header';
import { PromptDisplay } from '../components/prompt/PromptDisplay';
import {
  ApiError,
  apiFetch,
  type ModelLibraryData,
  type PromptStructured,
} from '../lib/api';
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
interface SlotBudgetSkipEvent {
  promptId: string;
  campaignModelId: string;
  modelDisplayName: string;
  status: 'skipped_budget';
  reason: string;
  estimatedUsd: number;
  spentUsd: number;
  capUsd: number | null;
}
type SlotEvent = SlotOkEvent | SlotErrorEvent | SlotBudgetSkipEvent;

interface BudgetExceededEvent {
  reason: string;
  estimatedUsd: number;
  spentUsd: number;
  capUsd: number | null;
}

interface CreatedCampaign {
  id: string;
  shareSlug: string;
  prompts: Array<{ id: string; orderIndex: number }>;
  models: Array<{ id: string; providerModelId: string; displayName: string }>;
}

/**
 * Controls which AUTHORING UI the operator sees for a prompt's text.
 *   - 'simple'   plain textarea; the blob IS the prompt. Default.
 *   - 'advanced' instructions + input + output format fields; produces
 *                a PromptStructured payload on save so the voter UI can
 *                render each field with distinct typography.
 *
 * The on-screen label for 'advanced' used to be "Structured" — renamed
 * to "Advanced" so it reads as a progressive disclosure toggle rather
 * than a data-shape label. The PromptStructured data type is unchanged;
 * it's the wire shape, not the UX word.
 *
 * Distinct from `PromptEvalMode` below, which controls how voters see
 * and rate the generated output.
 */
type PromptAuthoringMode = 'simple' | 'advanced';

/**
 * Evaluation mode for a prompt — how voters rate the model outputs.
 * Mirrors the server-side enum in schema.ts. Phase 1 UI exposes the
 * first three; Phase 2 adds the rest.
 */
type PromptEvalMode =
  | 'tournament'
  | 'slider'
  | 'approve_reject'
  | 'best_of_n'
  | 'multi_axis'
  | 'qualitative';

interface SliderConfig {
  min: number;
  max: number;
  minLabel?: string;
  maxLabel?: string;
}
interface ApproveRejectConfig {
  approveLabel?: string;
  rejectLabel?: string;
}
interface MultiAxisDimensionDraft {
  key: string;
  label: string;
  min: number;
  max: number;
}
interface MultiAxisConfig {
  dimensions: MultiAxisDimensionDraft[];
}
interface QualitativeConfig {
  prompt: string;
  required: boolean;
}

interface PromptDraft {
  mode: PromptAuthoringMode;
  text: string; // simple-mode blob
  context: string; // shared
  instructions: string; // structured-mode
  input: string;
  outputFormat: string;
  /** Evaluation mode (how voters rate the output). */
  evalMode: PromptEvalMode;
  /** Mode-specific config; shape depends on `evalMode`. */
  sliderConfig: SliderConfig;
  approveRejectConfig: ApproveRejectConfig;
  multiAxisConfig: MultiAxisConfig;
  qualitativeConfig: QualitativeConfig;
}

const DEFAULT_SLIDER_CONFIG: SliderConfig = { min: 1, max: 10 };
const DEFAULT_MULTI_AXIS_CONFIG: MultiAxisConfig = {
  dimensions: [
    { key: 'correctness', label: 'Correctness', min: 1, max: 5 },
    { key: 'tone', label: 'Tone', min: 1, max: 5 },
    { key: 'clarity', label: 'Clarity', min: 1, max: 5 },
  ],
};
const DEFAULT_QUALITATIVE_CONFIG: QualitativeConfig = {
  prompt: '',
  required: false,
};

/**
 * Create a blank prompt draft. `previousEvalMode` seeds the new prompt's
 * evaluation mode so the common case of a campaign with one mode doesn't
 * require clicking the picker on every prompt added.
 */
function emptyPrompt(previousEvalMode: PromptEvalMode = 'tournament'): PromptDraft {
  return {
    // Simple is the default authoring mode — plain textarea, lowest
    // friction for the common case. Operators who need instructions /
    // input / output format as separate fields toggle into 'advanced'.
    mode: 'simple',
    text: '',
    context: '',
    instructions: '',
    input: '',
    outputFormat: '',
    evalMode: previousEvalMode,
    sliderConfig: { ...DEFAULT_SLIDER_CONFIG },
    approveRejectConfig: {},
    multiAxisConfig: {
      dimensions: DEFAULT_MULTI_AXIS_CONFIG.dimensions.map((d) => ({ ...d })),
    },
    qualitativeConfig: { ...DEFAULT_QUALITATIVE_CONFIG },
  };
}

/**
 * Pull the right mode-config payload for a prompt based on its evalMode.
 * Tournament + the not-yet-shipped modes return `undefined` so the server
 * stores NULL (it falls back to sensible defaults on read).
 */
function evalModeConfigForApi(p: PromptDraft): Record<string, unknown> | undefined {
  if (p.evalMode === 'slider') {
    const { min, max, minLabel, maxLabel } = p.sliderConfig;
    const cfg: Record<string, unknown> = { min, max };
    if (minLabel?.trim()) cfg.minLabel = minLabel.trim();
    if (maxLabel?.trim()) cfg.maxLabel = maxLabel.trim();
    return cfg;
  }
  if (p.evalMode === 'approve_reject') {
    const { approveLabel, rejectLabel } = p.approveRejectConfig;
    const cfg: Record<string, unknown> = {};
    if (approveLabel?.trim()) cfg.approveLabel = approveLabel.trim();
    if (rejectLabel?.trim()) cfg.rejectLabel = rejectLabel.trim();
    return Object.keys(cfg).length > 0 ? cfg : undefined;
  }
  if (p.evalMode === 'multi_axis') {
    // Server requires at least one dimension. Empty label/key rows are
    // dropped here so the operator isn't forced to complete every row.
    const clean = p.multiAxisConfig.dimensions
      .filter((d) => d.key.trim() && d.label.trim())
      .map((d) => ({
        key: d.key.trim(),
        label: d.label.trim(),
        min: d.min,
        max: d.max,
      }));
    return { dimensions: clean };
  }
  if (p.evalMode === 'qualitative') {
    const cfg: Record<string, unknown> = {
      required: !!p.qualitativeConfig.required,
    };
    if (p.qualitativeConfig.prompt.trim()) {
      cfg.prompt = p.qualitativeConfig.prompt.trim();
    }
    return cfg;
  }
  // best_of_n and tournament have no per-prompt config.
  return undefined;
}

/**
 * Collapse a draft into the wire shape the API expects. `text` is always
 * present (it's what the LLM sees). When the creator used structured
 * mode, we also attach `structured` so the voter UI can render each
 * field with its own typography instead of one merged blob.
 */
function flattenPrompt(
  p: PromptDraft,
): { text: string; structured?: PromptStructured } | null {
  if (p.mode === 'advanced') {
    const instructions = p.instructions.trim();
    if (!instructions) return null;
    const input = p.input.trim();
    const outputFormat = p.outputFormat.trim();
    const parts = [instructions];
    if (input) parts.push(`Input:\n${input}`);
    if (outputFormat) parts.push(`Output format:\n${outputFormat}`);
    const structured: PromptStructured = { instructions };
    if (input) structured.input = input;
    if (outputFormat) structured.outputFormat = outputFormat;
    return { text: parts.join('\n\n'), structured };
  }
  const text = p.text.trim();
  if (!text) return null;
  return { text };
}

export default function CreateCampaign() {
  const navigate = useNavigate();
  useDocumentTitle('New Campaign');
  const [step, setStep] = useState(1);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [prompts, setPrompts] = useState<PromptDraft[]>([emptyPrompt()]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);

  const [createError, setCreateError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationDone, setGenerationDone] = useState(false);
  const [campaign, setCampaign] = useState<CreatedCampaign | null>(null);
  const [slotTotal, setSlotTotal] = useState(0);
  const [slots, setSlots] = useState<Record<string, SlotEvent>>({});
  const [generateError, setGenerateError] = useState<string | null>(null);
  // Optional per-run USD cap. Empty string = no cap. Parsed at submit time.
  const [budgetCapInput, setBudgetCapInput] = useState('');
  const [budgetWarning, setBudgetWarning] =
    useState<BudgetExceededEvent | null>(null);

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

  const parsedBudgetUsd = useMemo(() => {
    const trimmed = budgetCapInput.trim();
    if (!trimmed) return null;
    const n = Number.parseFloat(trimmed);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [budgetCapInput]);

  const handleGenerate = useCallback(async () => {
    if (isGenerating) return;
    setCreateError(null);
    setGenerateError(null);
    setBudgetWarning(null);
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
            .map((p) => ({ p, flat: flattenPrompt(p) }))
            .filter((x): x is { p: PromptDraft; flat: NonNullable<ReturnType<typeof flattenPrompt>> } => x.flat !== null)
            .map(({ p, flat }) => ({
              text: flat.text,
              context: p.context.trim() ? p.context : undefined,
              structured: flat.structured,
              mode: p.evalMode,
              modeConfig: evalModeConfigForApi(p),
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

      await runGeneration(
        created.id,
        {
          onStart: (total) => setSlotTotal(total),
          onSlot: (ev) =>
            setSlots((prev) => ({
              ...prev,
              [slotKey(ev.promptId, ev.campaignModelId)]: ev,
            })),
          onBudgetExceeded: (ev) => setBudgetWarning(ev),
          onDone: () => setGenerationDone(true),
          onError: (msg) => setGenerateError(msg),
        },
        { budgetUsd: parsedBudgetUsd },
      );
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
    parsedBudgetUsd,
  ]);

  const handleRetryFailed = useCallback(async () => {
    if (isGenerating || !campaign) return;
    setGenerateError(null);
    setBudgetWarning(null);
    setGenerationDone(false);
    setIsGenerating(true);
    try {
      await runGeneration(
        campaign.id,
        {
          onStart: () => {
            // Preserve slotTotal — retry reports the failed subset; the
            // overall progress bar remains anchored to the full run.
          },
          onSlot: (ev) =>
            setSlots((prev) => ({
              ...prev,
              [slotKey(ev.promptId, ev.campaignModelId)]: ev,
            })),
          onBudgetExceeded: (ev) => setBudgetWarning(ev),
          onDone: () => setGenerationDone(true),
          onError: (msg) => setGenerateError(msg),
        },
        { onlyFailed: true, budgetUsd: parsedBudgetUsd },
      );
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setIsGenerating(false);
    }
  }, [isGenerating, campaign, parsedBudgetUsd]);

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

  const validPromptCount = prompts.filter((p) => flattenPrompt(p) !== null)
    .length;
  const canProgress =
    (step === 1 && !!name) ||
    (step === 2 && validPromptCount > 0) ||
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
                promptCount={validPromptCount}
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
                onRetryFailed={handleRetryFailed}
                canRetryFailed={Boolean(campaign)}
                budgetCapInput={budgetCapInput}
                onBudgetCapInput={setBudgetCapInput}
                budgetWarning={budgetWarning}
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
  const activeLabel = STEPS[activeStep - 1]?.label ?? '';
  const progressPct = (activeStep / STEPS.length) * 100;
  return (
    <>
      {/* Mobile-only compact header: "Step N of 5 · Label" + 2px progress bar.
          The full dotted-stepper below eats horizontal at 360px and its
          labels are second-tier info on a small screen anyway. */}
      <div className="sm:hidden" aria-label="Wizard progress">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Step{' '}
            <span className="text-foreground">{activeStep}</span> of{' '}
            {STEPS.length}
          </span>
          <span className="text-sm font-medium text-foreground">
            {activeLabel}
          </span>
        </div>
        <div
          className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-border"
          role="progressbar"
          aria-valuenow={activeStep}
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
        >
          <div
            className="h-full bg-foreground transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Desktop/tablet: full dotted stepper. Hidden below sm. */}
      <ol
        aria-label="Wizard progress"
        className="relative hidden items-center justify-between sm:flex"
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
    </>
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
  prompts: PromptDraft[];
  onChange: (p: PromptDraft[]) => void;
}) {
  const updateAt = (idx: number, patch: Partial<PromptDraft>) => {
    const next = prompts.map((p, i) => (i === idx ? { ...p, ...patch } : p));
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-6">
      <StepHeader
        title="Prompts & context"
        description="Add the prompts you want to evaluate. Each prompt runs against every selected model. Markdown is supported — the preview shows voters exactly what they'll see."
      />
      <div className="flex flex-col gap-6">
        {prompts.map((prompt, idx) => (
          <PromptCard
            key={idx}
            idx={idx}
            prompt={prompt}
            removable={prompts.length > 1}
            onPatch={(patch) => updateAt(idx, patch)}
            onRemove={() => onChange(prompts.filter((_, i) => i !== idx))}
          />
        ))}
        <button
          type="button"
          // Last-used mode is the default for the next prompt — a campaign
          // that's all slider stays all slider without clicking the
          // eval-mode picker every row.
          onClick={() =>
            onChange([
              ...prompts,
              emptyPrompt(prompts[prompts.length - 1]?.evalMode),
            ])
          }
          className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card py-3 text-sm text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
        >
          <Plus className="size-4" />
          Add another prompt
        </button>
      </div>
    </div>
  );
}

function PromptCard({
  idx,
  prompt,
  removable,
  onPatch,
  onRemove,
}: {
  idx: number;
  prompt: PromptDraft;
  removable: boolean;
  onPatch: (patch: Partial<PromptDraft>) => void;
  onRemove: () => void;
}) {
  const flat = flattenPrompt(prompt);
  const hasContent = flat !== null;

  // Build a live preview shape matching the battle-screen prompt contract.
  // Use the ACTUAL text the LLM will receive so creators notice if the
  // structured → flattened concatenation produces something awkward.
  const previewPrompt = hasContent
    ? {
        text: flat.text,
        context: prompt.context.trim() ? prompt.context : null,
        structured: flat.structured ?? null,
      }
    : null;

  return (
    <div className="group relative flex flex-col gap-3 rounded-lg border border-border bg-surface-highlight/30 p-4">
      {removable && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove prompt"
          className="absolute right-2 top-2 rounded-md p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-card hover:text-foreground group-hover:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Prompt {idx + 1}
        </span>
        <ModeToggle
          value={prompt.mode}
          onChange={(mode) => onPatch({ mode })}
        />
      </div>

      {prompt.mode === 'simple' ? (
        <SimpleFields prompt={prompt} idx={idx} onPatch={onPatch} />
      ) : (
        <StructuredFields prompt={prompt} idx={idx} onPatch={onPatch} />
      )}

      <EvalModePicker prompt={prompt} idx={idx} onPatch={onPatch} />

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
          onChange={(e) => onPatch({ context: e.target.value })}
          placeholder="Background info or system instructions…"
          className="min-h-16 bg-card text-sm"
        />
      </div>

      {previewPrompt && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Voter sees
          </span>
          <div className="rounded-md border border-border bg-card px-3 py-3">
            <PromptDisplay prompt={previewPrompt} />
          </div>
        </div>
      )}
    </div>
  );
}

function ModeToggle({
  value,
  onChange,
}: {
  value: PromptAuthoringMode;
  onChange: (mode: PromptAuthoringMode) => void;
}) {
  // Simple listed first so it reads as the progressive default;
  // Advanced is the opt-in for structured prompts (instructions / input
  // / output format as separate fields).
  return (
    <div
      className="inline-flex h-7 items-center rounded-md border border-border bg-card p-0.5 text-[11px] font-medium"
      role="tablist"
    >
      {(['simple', 'advanced'] as const).map((mode) => {
        const on = value === mode;
        return (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(mode)}
            className={cn(
              'h-full rounded-[5px] px-2.5 capitalize transition-colors',
              on
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {mode}
          </button>
        );
      })}
    </div>
  );
}

function SimpleFields({
  prompt,
  idx,
  onPatch,
}: {
  prompt: PromptDraft;
  idx: number;
  onPatch: (patch: Partial<PromptDraft>) => void;
}) {
  // Session-only rich editor toggle. Off by default so the ~60KB Tiptap
  // chunk only loads when a prompt author actually wants formatting.
  // State is per-prompt; persisting it would require a PromptDraft
  // field and isn't worth the schema churn for a UI preference.
  const [richEditor, setRichEditor] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label
          htmlFor={`prompt-text-${idx}`}
          className="text-[10px] uppercase tracking-wide"
        >
          Prompt text
        </Label>
        <button
          type="button"
          onClick={() => setRichEditor((r) => !r)}
          className="text-[10px] uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
          aria-pressed={richEditor}
        >
          {richEditor ? 'Plain text' : 'Rich editor'}
        </button>
      </div>
      {richEditor ? (
        <LazyTiptapPromptEditor
          value={prompt.text}
          onChange={(text) => onPatch({ text })}
          placeholder="Enter the prompt text…"
        />
      ) : (
        <Textarea
          id={`prompt-text-${idx}`}
          value={prompt.text}
          onChange={(e) => onPatch({ text: e.target.value })}
          placeholder="Enter the prompt text…"
          className="min-h-24 bg-card"
        />
      )}
    </div>
  );
}

function StructuredFields({
  prompt,
  idx,
  onPatch,
}: {
  prompt: PromptDraft;
  idx: number;
  onPatch: (patch: Partial<PromptDraft>) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <FieldSlot
        id={`prompt-instructions-${idx}`}
        label="Instructions"
        required
        hint="What should the model do?"
        value={prompt.instructions}
        onChange={(v) => onPatch({ instructions: v })}
        placeholder="e.g. Translate the following English text to Danish. Keep tone and meaning…"
        minHeightClass="min-h-24"
      />
      <FieldSlot
        id={`prompt-input-${idx}`}
        label="Input"
        optional
        hint="Text, code, or data the model should operate on. Leave empty for open-ended prompts."
        value={prompt.input}
        onChange={(v) => onPatch({ input: v })}
        placeholder="The source material the model should work on…"
        minHeightClass="min-h-20"
      />
      <FieldSlot
        id={`prompt-output-${idx}`}
        label="Output format"
        optional
        hint="Constraints on how the answer should be shaped."
        value={prompt.outputFormat}
        onChange={(v) => onPatch({ outputFormat: v })}
        placeholder="e.g. Return only the translation, no commentary."
        minHeightClass="min-h-16"
      />
    </div>
  );
}

function FieldSlot({
  id,
  label,
  value,
  onChange,
  placeholder,
  hint,
  required,
  optional,
  minHeightClass,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  hint?: string;
  required?: boolean;
  optional?: boolean;
  minHeightClass: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-[10px] uppercase tracking-wide">
        {label}
        {optional && (
          <span className="text-muted-foreground/70"> (optional)</span>
        )}
        {required && <span className="text-muted-foreground/70"> *</span>}
      </Label>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn('bg-card text-sm', minHeightClass)}
      />
      {hint && (
        <span className="text-[11px] text-muted-foreground/80">{hint}</span>
      )}
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
  onRetryFailed,
  canRetryFailed,
  budgetCapInput,
  onBudgetCapInput,
  budgetWarning,
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
  onRetryFailed: () => void;
  canRetryFailed: boolean;
  budgetCapInput: string;
  onBudgetCapInput: (v: string) => void;
  budgetWarning: BudgetExceededEvent | null;
}) {
  const total = promptCount * modelCount;
  const skippedForBudget = slotValues.filter(
    (s) => s.status === 'skipped_budget',
  ).length;

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
          <div className="flex flex-col items-center gap-3">
            <div className="flex w-full max-w-xs flex-col gap-1.5">
              <Label
                htmlFor="budget-cap"
                className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
              >
                Budget cap (USD · optional)
              </Label>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  id="budget-cap"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="0.50"
                  value={budgetCapInput}
                  onChange={(e) => onBudgetCapInput(e.target.value)}
                  className="h-9 font-mono tabular-nums"
                />
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Halts remaining slots if committed spend would exceed this cap.
                Leave empty to run without a limit.
              </p>
            </div>
            <Button onClick={onStart} size="lg">
              <Play className="size-4" />
              Start generation
            </Button>
          </div>
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
            {(succeeded > 0 || failed > 0 || skippedForBudget > 0) && (
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
                {skippedForBudget > 0 && (
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <AlertTriangle className="size-3" />
                    {skippedForBudget} skipped (budget)
                  </span>
                )}
              </div>
            )}
            {budgetWarning && (
              <div className="mt-1 rounded-md border border-border bg-surface-highlight/60 px-3 py-2 text-[11px] leading-snug">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="font-medium text-foreground">
                      Budget cap reached
                    </div>
                    <div className="mt-0.5 text-muted-foreground">
                      Spent{' '}
                      <span className="font-mono tabular-nums text-foreground">
                        ${budgetWarning.spentUsd.toFixed(4)}
                      </span>
                      {budgetWarning.capUsd !== null && (
                        <>
                          {' '}of{' '}
                          <span className="font-mono tabular-nums text-foreground">
                            ${budgetWarning.capUsd.toFixed(2)}
                          </span>
                        </>
                      )}
                      . Remaining slots halted.
                    </div>
                  </div>
                </div>
              </div>
            )}
            {failed > 0 && !isGenerating && canRetryFailed && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRetryFailed}
                className="self-start"
              >
                <RefreshCw className="size-3.5" />
                Retry failed ({failed})
              </Button>
            )}
          </div>
        )}

        {createError && <ErrorAlert>{createError}</ErrorAlert>}
        {generateError && <ErrorAlert>{generateError}</ErrorAlert>}

        {/* Visually-hidden status for screen readers. The progress bar
            and counters are silent visual changes; this announces them
            at a polite cadence so blind operators can track the long-
            running generation without relying on the bar. */}
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {generationDone
            ? `Generation complete. ${succeeded} succeeded${
                failed > 0 ? `, ${failed} failed` : ''
              }.`
            : isGenerating
            ? `Generating output ${slotsReceived} of ${slotTotal}.`
            : ''}
        </div>
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
                    : slot.status === 'skipped_budget'
                      ? 'border-border bg-surface-highlight/30'
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
                      : slot.status === 'skipped_budget'
                        ? `skipped · budget`
                        : `error · ${slot.latencyMs}ms`}
                  </span>
                </div>
                {slot.status === 'ok' ? (
                  <div className="line-clamp-3 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted-foreground">
                    {slot.output}
                  </div>
                ) : slot.status === 'skipped_budget' ? (
                  <div className="text-[11px] text-muted-foreground">
                    Would add ~${slot.estimatedUsd.toFixed(4)} over cap.
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
    onStart: (total: number, budgetUsd: number | null) => void;
    onSlot: (ev: SlotEvent) => void;
    onBudgetExceeded: (ev: BudgetExceededEvent) => void;
    onDone: (summary: {
      succeeded: number;
      failed: number;
      skippedForBudget?: number;
      spentUsd?: number;
    }) => void;
    onError: (msg: string) => void;
  },
  options: { onlyFailed?: boolean; budgetUsd?: number | null } = {},
): Promise<void> {
  const qs = options.onlyFailed ? '?only=failed' : '';
  const body: Record<string, unknown> = {};
  if (options.budgetUsd != null && options.budgetUsd > 0) {
    body.budgetUsd = options.budgetUsd;
  }
  const res = await fetch(`/api/campaigns/${campaignId}/generate${qs}`, {
    method: 'POST',
    headers: {
      accept: 'text/event-stream',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
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
        const { total, budgetUsd } = data as {
          total: number;
          budgetUsd?: number | null;
        };
        handlers.onStart(total, budgetUsd ?? null);
      } else if (event === 'slot') {
        handlers.onSlot(data as SlotEvent);
      } else if (event === 'budget_exceeded') {
        const ev = data as {
          promptId?: string;
          campaignModelId?: string;
          modelDisplayName?: string;
          reason: string;
          estimatedUsd: number;
          spentUsd: number;
          capUsd: number | null;
        };
        // Also emit as a slot skip so the slot counter reflects it.
        if (ev.promptId && ev.campaignModelId) {
          handlers.onSlot({
            promptId: ev.promptId,
            campaignModelId: ev.campaignModelId,
            modelDisplayName: ev.modelDisplayName ?? 'unknown',
            status: 'skipped_budget',
            reason: ev.reason,
            estimatedUsd: ev.estimatedUsd,
            spentUsd: ev.spentUsd,
            capUsd: ev.capUsd,
          });
        }
        handlers.onBudgetExceeded({
          reason: ev.reason,
          estimatedUsd: ev.estimatedUsd,
          spentUsd: ev.spentUsd,
          capUsd: ev.capUsd,
        });
      } else if (event === 'done') {
        handlers.onDone(
          data as {
            succeeded: number;
            failed: number;
            skippedForBudget?: number;
            spentUsd?: number;
          },
        );
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

// ─────────────────────────────────────────────────────────────────────────
// Evaluation-mode picker — per-prompt control for HOW voters rate this
// prompt's outputs. Separate from the authoring ModeToggle (which controls
// how the OPERATOR enters the prompt text). Ships three modes in Phase 1;
// best_of_n / multi_axis / qualitative are disabled with "soon" labels
// to preview the surface.
// ─────────────────────────────────────────────────────────────────────────

const EVAL_MODE_OPTIONS: Array<{
  mode: PromptEvalMode;
  label: string;
  desc: string;
  enabled: boolean;
}> = [
  {
    mode: 'tournament',
    label: 'Tournament',
    desc: 'Two outputs side-by-side, pick the winner.',
    enabled: true,
  },
  {
    mode: 'slider',
    label: 'Slider',
    desc: 'Rate each output on a numeric scale.',
    enabled: true,
  },
  {
    mode: 'approve_reject',
    label: 'Approve / reject',
    desc: 'Mark each output as acceptable or not.',
    enabled: true,
  },
  {
    mode: 'best_of_n',
    label: 'Best of N',
    desc: 'See all outputs at once, pick one.',
    enabled: true,
  },
  {
    mode: 'multi_axis',
    label: 'Multi-axis',
    desc: 'Score on several dimensions at once.',
    enabled: true,
  },
  {
    mode: 'qualitative',
    label: 'Qualitative',
    desc: 'Collect free-text feedback per output.',
    enabled: true,
  },
];

function EvalModePicker({
  prompt,
  idx,
  onPatch,
}: {
  prompt: PromptDraft;
  idx: number;
  onPatch: (patch: Partial<PromptDraft>) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <Label
          htmlFor={`eval-mode-${idx}`}
          className="text-[10px] uppercase tracking-wide"
        >
          Evaluation mode
        </Label>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {EVAL_MODE_OPTIONS.filter((o) => o.enabled).map((opt) => {
          const active = prompt.evalMode === opt.mode;
          return (
            <button
              key={opt.mode}
              type="button"
              onClick={() => onPatch({ evalMode: opt.mode })}
              aria-pressed={active}
              className={cn(
                'flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors',
                active
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-background hover:border-foreground/40',
              )}
            >
              <span className="text-[12px] font-semibold">{opt.label}</span>
              <span
                className={cn(
                  'text-[11px] leading-snug',
                  active ? 'text-background/75' : 'text-muted-foreground',
                )}
              >
                {opt.desc}
              </span>
            </button>
          );
        })}
      </div>
      {prompt.evalMode === 'slider' && (
        <SliderConfigEditor
          config={prompt.sliderConfig}
          idx={idx}
          onChange={(next) => onPatch({ sliderConfig: next })}
        />
      )}
      {prompt.evalMode === 'approve_reject' && (
        <ApproveRejectConfigEditor
          config={prompt.approveRejectConfig}
          idx={idx}
          onChange={(next) => onPatch({ approveRejectConfig: next })}
        />
      )}
      {prompt.evalMode === 'multi_axis' && (
        <MultiAxisConfigEditor
          config={prompt.multiAxisConfig}
          idx={idx}
          onChange={(next) => onPatch({ multiAxisConfig: next })}
        />
      )}
      {prompt.evalMode === 'qualitative' && (
        <QualitativeConfigEditor
          config={prompt.qualitativeConfig}
          idx={idx}
          onChange={(next) => onPatch({ qualitativeConfig: next })}
        />
      )}
      {prompt.evalMode === 'best_of_n' && (
        <p className="text-[11px] text-muted-foreground">
          Voters see every model's output on one screen and pick one.
        </p>
      )}
    </div>
  );
}

function SliderConfigEditor({
  config,
  idx,
  onChange,
}: {
  config: SliderConfig;
  idx: number;
  onChange: (next: SliderConfig) => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label
            htmlFor={`slider-min-${idx}`}
            className="text-[10px] uppercase tracking-wide"
          >
            Min
          </Label>
          <Input
            id={`slider-min-${idx}`}
            type="number"
            inputMode="numeric"
            value={config.min}
            onChange={(e) =>
              onChange({ ...config, min: Number(e.target.value) || 0 })
            }
            className="h-9 bg-background text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label
            htmlFor={`slider-max-${idx}`}
            className="text-[10px] uppercase tracking-wide"
          >
            Max
          </Label>
          <Input
            id={`slider-max-${idx}`}
            type="number"
            inputMode="numeric"
            value={config.max}
            onChange={(e) =>
              onChange({ ...config, max: Number(e.target.value) || 0 })
            }
            className="h-9 bg-background text-sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label
            htmlFor={`slider-min-label-${idx}`}
            className="text-[10px] uppercase tracking-wide"
          >
            Low label <span className="text-muted-foreground/70">(optional)</span>
          </Label>
          <Input
            id={`slider-min-label-${idx}`}
            value={config.minLabel ?? ''}
            onChange={(e) => onChange({ ...config, minLabel: e.target.value })}
            placeholder="e.g. Weakest"
            maxLength={40}
            className="h-9 bg-background text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label
            htmlFor={`slider-max-label-${idx}`}
            className="text-[10px] uppercase tracking-wide"
          >
            High label <span className="text-muted-foreground/70">(optional)</span>
          </Label>
          <Input
            id={`slider-max-label-${idx}`}
            value={config.maxLabel ?? ''}
            onChange={(e) => onChange({ ...config, maxLabel: e.target.value })}
            placeholder="e.g. Excellent"
            maxLength={40}
            className="h-9 bg-background text-sm"
          />
        </div>
      </div>
      {config.min >= config.max && (
        <p
          role="alert"
          className="text-[11px] text-destructive"
        >
          Min must be less than max.
        </p>
      )}
    </div>
  );
}

function ApproveRejectConfigEditor({
  config,
  idx,
  onChange,
}: {
  config: ApproveRejectConfig;
  idx: number;
  onChange: (next: ApproveRejectConfig) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
      <div className="flex flex-col gap-1">
        <Label
          htmlFor={`ar-approve-${idx}`}
          className="text-[10px] uppercase tracking-wide"
        >
          Approve label <span className="text-muted-foreground/70">(optional)</span>
        </Label>
        <Input
          id={`ar-approve-${idx}`}
          value={config.approveLabel ?? ''}
          onChange={(e) =>
            onChange({ ...config, approveLabel: e.target.value })
          }
          placeholder="Approve"
          maxLength={40}
          className="h-9 bg-background text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label
          htmlFor={`ar-reject-${idx}`}
          className="text-[10px] uppercase tracking-wide"
        >
          Reject label <span className="text-muted-foreground/70">(optional)</span>
        </Label>
        <Input
          id={`ar-reject-${idx}`}
          value={config.rejectLabel ?? ''}
          onChange={(e) =>
            onChange({ ...config, rejectLabel: e.target.value })
          }
          placeholder="Reject"
          maxLength={40}
          className="h-9 bg-background text-sm"
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Multi-axis dimension editor.
//
// Each dimension gets a key (stable identifier used by the ratings
// aggregator and the submission payload), a human-readable label, and
// min/max bounds. The operator can add, remove, and reorder via the
// standard up/down pattern. Starter set of 3 dimensions
// (correctness/tone/clarity) is seeded for new prompts; operator can
// rename, delete, or add more (cap enforced server-side at 8).
// ─────────────────────────────────────────────────────────────────────────

function MultiAxisConfigEditor({
  config,
  idx,
  onChange,
}: {
  config: MultiAxisConfig;
  idx: number;
  onChange: (next: MultiAxisConfig) => void;
}) {
  const maxDimensions = 8;
  const updateDim = (dimIdx: number, patch: Partial<MultiAxisDimensionDraft>) => {
    onChange({
      dimensions: config.dimensions.map((d, i) =>
        i === dimIdx ? { ...d, ...patch } : d,
      ),
    });
  };
  const removeDim = (dimIdx: number) => {
    onChange({
      dimensions: config.dimensions.filter((_, i) => i !== dimIdx),
    });
  };
  const addDim = () => {
    if (config.dimensions.length >= maxDimensions) return;
    onChange({
      dimensions: [
        ...config.dimensions,
        { key: `axis${config.dimensions.length + 1}`, label: '', min: 1, max: 5 },
      ],
    });
  };

  // Detect duplicate keys so the operator sees an inline warning — the
  // server will 400 on duplicates and we'd rather surface that early.
  const keyCounts = new Map<string, number>();
  for (const d of config.dimensions) {
    const k = d.key.trim();
    if (k) keyCounts.set(k, (keyCounts.get(k) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Dimensions ({config.dimensions.length}/{maxDimensions})
        </span>
        <button
          type="button"
          onClick={addDim}
          disabled={config.dimensions.length >= maxDimensions}
          className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="size-3" />
          Add dimension
        </button>
      </div>
      {config.dimensions.length === 0 && (
        <p
          role="alert"
          className="text-[11px] text-destructive"
        >
          At least one dimension is required.
        </p>
      )}
      {config.dimensions.map((d, dimIdx) => {
        const dup = d.key.trim() && (keyCounts.get(d.key.trim()) ?? 0) > 1;
        return (
          <div
            key={dimIdx}
            className="flex flex-col gap-2 rounded-md border border-border bg-background p-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase text-muted-foreground">
                Dimension {dimIdx + 1}
              </span>
              <button
                type="button"
                onClick={() => removeDim(dimIdx)}
                aria-label="Remove dimension"
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <Label
                  htmlFor={`ma-key-${idx}-${dimIdx}`}
                  className="text-[10px] uppercase tracking-wide"
                >
                  Key
                </Label>
                <Input
                  id={`ma-key-${idx}-${dimIdx}`}
                  value={d.key}
                  onChange={(e) => updateDim(dimIdx, { key: e.target.value })}
                  placeholder="correctness"
                  maxLength={40}
                  className="h-9 bg-card text-sm font-mono"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label
                  htmlFor={`ma-label-${idx}-${dimIdx}`}
                  className="text-[10px] uppercase tracking-wide"
                >
                  Label
                </Label>
                <Input
                  id={`ma-label-${idx}-${dimIdx}`}
                  value={d.label}
                  onChange={(e) => updateDim(dimIdx, { label: e.target.value })}
                  placeholder="Correctness"
                  maxLength={60}
                  className="h-9 bg-card text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <Label
                  htmlFor={`ma-min-${idx}-${dimIdx}`}
                  className="text-[10px] uppercase tracking-wide"
                >
                  Min
                </Label>
                <Input
                  id={`ma-min-${idx}-${dimIdx}`}
                  type="number"
                  inputMode="numeric"
                  value={d.min}
                  onChange={(e) =>
                    updateDim(dimIdx, { min: Number(e.target.value) || 0 })
                  }
                  className="h-9 bg-card text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label
                  htmlFor={`ma-max-${idx}-${dimIdx}`}
                  className="text-[10px] uppercase tracking-wide"
                >
                  Max
                </Label>
                <Input
                  id={`ma-max-${idx}-${dimIdx}`}
                  type="number"
                  inputMode="numeric"
                  value={d.max}
                  onChange={(e) =>
                    updateDim(dimIdx, { max: Number(e.target.value) || 0 })
                  }
                  className="h-9 bg-card text-sm"
                />
              </div>
            </div>
            {d.min >= d.max && (
              <p role="alert" className="text-[11px] text-destructive">
                Min must be less than max.
              </p>
            )}
            {dup && (
              <p role="alert" className="text-[11px] text-destructive">
                Duplicate key — keys must be unique within a prompt.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Qualitative editor — a custom question prompt shown above the voter's
// text field, plus a "required" toggle. Text-length cap is enforced on
// both client and server (4000 chars).
// ─────────────────────────────────────────────────────────────────────────

function QualitativeConfigEditor({
  config,
  idx,
  onChange,
}: {
  config: QualitativeConfig;
  idx: number;
  onChange: (next: QualitativeConfig) => void;
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex flex-col gap-1">
        <Label
          htmlFor={`qual-prompt-${idx}`}
          className="text-[10px] uppercase tracking-wide"
        >
          Question voters see{' '}
          <span className="text-muted-foreground/70">(optional)</span>
        </Label>
        <Input
          id={`qual-prompt-${idx}`}
          value={config.prompt}
          onChange={(e) => onChange({ ...config, prompt: e.target.value })}
          placeholder="What did you think of this response?"
          maxLength={200}
          className="h-9 bg-background text-sm"
        />
      </div>
      <label
        htmlFor={`qual-required-${idx}`}
        className="flex items-center gap-2 text-[12px] text-foreground"
      >
        <input
          id={`qual-required-${idx}`}
          type="checkbox"
          checked={config.required}
          onChange={(e) => onChange({ ...config, required: e.target.checked })}
          className="size-3.5 cursor-pointer accent-foreground"
        />
        Require feedback to continue
      </label>
    </div>
  );
}
