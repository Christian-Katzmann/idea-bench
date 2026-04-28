import { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Info,
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
  type Persona,
  type PromptStructured,
} from '../lib/api';
import type { ArenaKind } from '../lib/arena-kind';
import { suggestPersonas } from '../server/simulated-runs/persona-suggest';
import {
  defaultCostCeiling,
  estimateRunCost,
} from '../server/simulated-runs/cost';
import { defaultGenericMix } from '../server/simulated-runs/panel-assembly';
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
const MIN_VARIANTS = 2; // Prompt / system-prompt arena minimum (PRD §V1 scope).
const MIN_SYSTEM_PROMPT_SUITE = 3; // Plan 06 PRD: across-suite robustness.
/**
 * Per-kind variant-text length cap. Mirrors the server's per-kind
 * cap in `api/campaigns/index.ts`. Prompt arenas keep the 8k limit
 * (matches today's prompt limit). System-prompt arenas double to 16k —
 * brand-voice docs and refusal policies run long.
 */
const VARIANT_TEXT_MAX_BY_KIND: Record<'prompt' | 'system_prompt', number> = {
  prompt: 8000,
  system_prompt: 16000,
};
const VARIANT_DISPLAY_NAME_MAX = 60;
const PINNED_SYSTEM_PROMPT_MAX = 8000;
/**
 * Last-resort default model for the pinned-model picker when the
 * operator has no recent campaigns to derive a most-used model from.
 * Matches the AVAILABLE_MODELS catalog id; the picker silently falls
 * through to the first selectable model if even this id is missing.
 */
const DEFAULT_PINNED_MODEL_ID = 'openai/gpt-5';

interface VariantDraft {
  text: string;
  displayName: string;
}

function emptyVariant(idx: number): VariantDraft {
  return { text: '', displayName: `Variant ${idx + 1}` };
}

/**
 * Plan 04 — wizard steps. Step 0 is the kind picker; steps 1–5 are
 * Basics → contestants → Generate → Launch with per-kind labels on
 * the test-case (step 2) and contestant (step 3) steps. Today only
 * `model` is reachable; Plans 05/06 unblock prompt and system_prompt.
 */
const TOTAL_STEPS = 6;

interface WizardStep {
  n: number;
  label: string;
}

function stepsForKind(kind: ArenaKind): readonly WizardStep[] {
  // Per-kind labels for steps 2 (test cases) and 3 (contestants).
  // Spec from PRD → "Creation UX (operator)" wizard table.
  const perKind: Record<ArenaKind, { testCases: string; contestants: string }> = {
    model: { testCases: 'Prompts', contestants: 'Models' },
    prompt: { testCases: 'Inputs', contestants: 'Variants' },
    system_prompt: {
      testCases: 'Test prompts',
      contestants: 'Variants',
    },
  };
  const { testCases, contestants } = perKind[kind];
  return [
    { n: 0, label: 'Kind' },
    { n: 1, label: 'Basics' },
    { n: 2, label: testCases },
    { n: 3, label: contestants },
    { n: 4, label: 'Generate' },
    { n: 5, label: 'Launch' },
  ];
}

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
  // Plan 04 — step indexing is 0..5 with Step 0 = Kind picker.
  // Existing model-arena flow lives in steps 1..5 (Basics → Launch).
  const [step, setStep] = useState(0);
  // Plan 04 — what this campaign varies. Default `model` keeps the
  // legacy flow byte-for-byte; `prompt` and `system_prompt` are
  // disabled in the picker until Plans 05/06 ship.
  const [kind, setKind] = useState<ArenaKind>('model');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [prompts, setPrompts] = useState<PromptDraft[]>([emptyPrompt()]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);

  // Plan 05 — prompt-arena state. Variants are the variable axis; the
  // pinned model + optional system prompt are held constant. Standalone
  // toggles "no {{input}} substitution" — V1 encodes this as 0 inputs
  // (server already permits the empty suite for kind='prompt'); the
  // verbatim-render wiring lands in a follow-up batch.
  const [variants, setVariants] = useState<VariantDraft[]>([
    emptyVariant(0),
    emptyVariant(1),
  ]);
  const [pinnedProviderModelId, setPinnedProviderModelId] = useState('');
  const [pinnedSystemPrompt, setPinnedSystemPrompt] = useState('');
  const [standaloneVariants, setStandaloneVariants] = useState(false);

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

  // Plan 06 P1-B — persona panel state for system-prompt arenas. The
  // PRD wants the panel ON by default (it's the wedge), with explicit
  // operator selection (no auto-checking) and a conservative voter
  // count of 10. Server-side `simulated_runs.MIN_VOTER_COUNT = 10`,
  // so the slider matches that floor.
  const [personaPanelEnabled, setPersonaPanelEnabled] = useState(true);
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>([]);
  const [personaVoterCount, setPersonaVoterCount] = useState(10);
  const [personaRefineQuery, setPersonaRefineQuery] = useState('');
  // Plan 06 P1-C — cost-confirmation gate for runs > $5 (PRD soft
  // threshold). The Launch button stays disabled until the operator
  // ticks the explicit acknowledgement; below the threshold the
  // checkbox is hidden entirely so the button enables silently.
  const [costAcknowledged, setCostAcknowledged] = useState(false);

  const {
    data: modelLibrary,
    error: modelsError,
    isLoading: modelsLoading,
  } = useQuery({
    queryKey: ['models', 'enabled', 'name', 'campaign-create'],
    queryFn: () =>
      apiFetch<ModelLibraryData>('/api/operator/models?status=enabled&sort=name'),
  });

  // Persona library — fetched once when the operator reaches the
  // launch step on a system-prompt arena. The whole library is small
  // (10–100 personas in a real org) so we filter + rank client-side
  // via `suggestPersonas`. The query is gated on `kind` so model and
  // prompt arenas don't hit the endpoint.
  const personasEnabled = kind === 'system_prompt' && step === 5;
  const {
    data: personasData,
    isLoading: personasLoading,
    error: personasError,
  } = useQuery({
    queryKey: ['personas', 'all', 'campaign-create'],
    queryFn: () => apiFetch<{ personas: Persona[] }>('/api/personas'),
    enabled: personasEnabled,
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

  // Best-of-N default for fresh prompt arenas (PRD → "Default voting
  // mode"). One-way nudge: if the operator hasn't touched the seed
  // input row, replace its tournament default with best_of_n. New rows
  // added via the "Add another input" button default to best_of_n via
  // StepPrompts; this hook only catches the initial seed.
  useEffect(() => {
    if (kind !== 'prompt') return;
    setPrompts((prev) => {
      if (
        prev.length === 1 &&
        prev[0].text === '' &&
        prev[0].evalMode === 'tournament' &&
        prev[0].mode === 'simple'
      ) {
        return [emptyPrompt('best_of_n')];
      }
      return prev;
    });
  }, [kind]);

  // Plan 06 P1-9 — Slider default for fresh system-prompt arenas.
  // Mirrors the prompt-arena hook above. The slider config gets
  // brand-voice-flavored labels ("Off-brand" / "On-brand") so the
  // PRD's "How well does this match the intent?" framing is visible
  // without the operator opening the eval-mode picker. New rows added
  // via "Add another test prompt" inherit the same defaults via
  // StepPrompts; this hook only seeds the initial row.
  useEffect(() => {
    if (kind !== 'system_prompt') return;
    setPrompts((prev) => {
      if (
        prev.length === 1 &&
        prev[0].text === '' &&
        prev[0].evalMode === 'tournament' &&
        prev[0].mode === 'simple'
      ) {
        const seed = emptyPrompt('slider');
        seed.sliderConfig = {
          ...seed.sliderConfig,
          minLabel: 'Off-brand',
          maxLabel: 'On-brand',
        };
        return [seed];
      }
      return prev;
    });
  }, [kind]);

  // Pinned-model default for prompt arenas: pick the operator's
  // most-used selectable model (highest `usage.campaigns`); fall back
  // to the catalog default; finally fall back to whatever's first.
  // Skip the seed if the operator has already picked something — never
  // overwrite a manual choice on subsequent library refetches.
  useEffect(() => {
    if (pinnedProviderModelId) return;
    const selectable = (modelLibrary?.rows ?? []).filter(
      (m) => m.enabled && !m.legacy,
    );
    if (selectable.length === 0) return;
    const mostUsed = [...selectable].sort(
      (a, b) => (b.usage?.campaigns ?? 0) - (a.usage?.campaigns ?? 0),
    )[0];
    const fallback =
      selectable.find((m) => m.providerModelId === DEFAULT_PINNED_MODEL_ID) ??
      mostUsed ??
      selectable[0];
    setPinnedProviderModelId(fallback.providerModelId);
  }, [modelLibrary, pinnedProviderModelId]);

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
      // Plan 04/05 — kind-specific payload assembly. The legacy
      // `model` shape carries `providerModelIds`; the prompt shape
      // carries `variants` + a held-constant `pinnedProviderModelId`
      // (and an optional `pinnedSystemPrompt`). Standalone variants
      // submit an empty prompts[] — server permits the empty suite
      // for kind='prompt' only.
      const promptsPayload =
        kind === 'prompt' && standaloneVariants
          ? []
          : prompts
              .map((p) => ({ p, flat: flattenPrompt(p) }))
              .filter(
                (x): x is {
                  p: PromptDraft;
                  flat: NonNullable<ReturnType<typeof flattenPrompt>>;
                } => x.flat !== null,
              )
              .map(({ p, flat }) => ({
                text: flat.text,
                context: p.context.trim() ? p.context : undefined,
                structured: flat.structured,
                mode: p.evalMode,
                modeConfig: evalModeConfigForApi(p),
              }));

      const baseBody = {
        name,
        description,
        categories,
        prompts: promptsPayload,
      } as const;

      // Plan 06 — `system_prompt` payload is the variant-bearing
      // shape MINUS pinnedSystemPrompt and standaloneVariants. The
      // server's parser rejects either field under this kind (the
      // variant IS the system message; standalone is a kind='prompt'
      // concept).
      const variantsPayload = (kind === 'prompt' || kind === 'system_prompt')
        ? variants
            .map((v) => ({
              text: v.text.trim(),
              displayName: v.displayName.trim() || undefined,
            }))
            .filter((v) => v.text.length > 0)
        : [];

      const body =
        kind === 'prompt'
          ? {
              ...baseBody,
              kind,
              variants: variantsPayload,
              pinnedProviderModelId,
              pinnedSystemPrompt: pinnedSystemPrompt.trim() || null,
              standaloneVariants,
            }
          : kind === 'system_prompt'
            ? {
                ...baseBody,
                kind,
                variants: variantsPayload,
                pinnedProviderModelId,
              }
            : { ...baseBody, kind, providerModelIds: selectedModels };

      const createRes = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
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
    kind,
    prompts,
    selectedModels,
    variants,
    pinnedProviderModelId,
    pinnedSystemPrompt,
    standaloneVariants,
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
      if (res.ok && kind === 'system_prompt' && personaPanelEnabled) {
        // Plan 06 P1-15 — second leg: spin up a persona panel for the
        // newly-active campaign. Only attempted when activation
        // succeeded; the empty-personaIds case is permitted (operator
        // can launch the campaign for human voters now and trigger a
        // simulated run from the dashboard later). When personas are
        // selected, the simulated run lands in `pending` status; the
        // dashboard's existing simulated-runs UI starts the runner.
        if (selectedPersonaIds.length > 0) {
          try {
            // Plan 06 P1-21 — pass the runtime hard ceiling. Default
            // is 2× the estimate (PRD); when no estimate is available
            // (shouldn't happen at this point), fall through to the
            // server's `defaultCostCeiling` floor.
            const ceilingUsd = personaJudgingEstimate
              ? defaultCostCeiling(personaJudgingEstimate.estimatedUsd)
              : undefined;
            await fetch('/api/simulated-runs', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                campaignId: campaign.id,
                panelType: 'persona',
                voterCount: personaVoterCount,
                personaIds: selectedPersonaIds,
                ...(ceilingUsd != null ? { costCeilingUsd: ceilingUsd } : {}),
              }),
            });
          } catch (err) {
            // Don't block navigation if the sim-run create errors —
            // the campaign is live, the operator can retry from the
            // dashboard. Surface the error inline for visibility.
            setActivateError(
              `Campaign activated, but failed to launch persona panel: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          }
        }
      }
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
  const validVariantCount = variants.filter((v) => v.text.trim().length > 0)
    .length;
  const steps = stepsForKind(kind);

  // Plan 06 P1-19 — cost preview for system-prompt arenas. The
  // generation cost is already paid by the time the operator reaches
  // Step 5 (we sum the per-slot `costUsd` reported by the SSE stream).
  // The persona-judging cost is forward-looking — it depends on the
  // operator's voter-count + persona-selection choices on this very
  // step, so it's recomputed on every render via `useMemo`.
  const generationActualUsd = useMemo(() => {
    let sum = 0;
    for (const ev of Object.values(slots)) {
      if (ev.status === 'ok' && typeof ev.costUsd === 'number') {
        sum += ev.costUsd;
      }
    }
    return sum;
  }, [slots]);

  const personaJudgingEstimate = useMemo(() => {
    if (kind !== 'system_prompt') return null;
    if (!personaPanelEnabled) return null;
    if (selectedPersonaIds.length === 0) return null;
    if (validPromptCount === 0 || validVariantCount === 0) return null;
    // Tally promptsByMode from the actual draft (the sim-run uses the
    // same mode each prompt was authored with).
    const promptsByMode: Record<PromptEvalMode, number> = {
      tournament: 0,
      slider: 0,
      approve_reject: 0,
      best_of_n: 0,
      multi_axis: 0,
      qualitative: 0,
    };
    for (const p of prompts) {
      if (flattenPrompt(p) !== null) promptsByMode[p.evalMode] += 1;
    }
    return estimateRunCost({
      voterCount: personaVoterCount,
      promptsByMode,
      campaignModelCount: validVariantCount,
      modelMix: defaultGenericMix(),
      kind: 'system_prompt',
    });
  }, [
    kind,
    personaPanelEnabled,
    selectedPersonaIds.length,
    personaVoterCount,
    validPromptCount,
    validVariantCount,
    prompts,
  ]);

  const totalEstimatedUsd =
    generationActualUsd + (personaJudgingEstimate?.estimatedUsd ?? 0);
  // Plan 06 P1-20 — soft threshold. PRD: "$5 in V1; tunable". Above
  // this, the Launch button is gated on the operator's explicit
  // acknowledgement.
  const COST_SOFT_THRESHOLD_USD = 5;
  const aboveCostThreshold =
    kind === 'system_prompt' && totalEstimatedUsd > COST_SOFT_THRESHOLD_USD;

  // Per-kind step gating. All three kinds advance past Step 0 now.
  const canProgressStep0 =
    kind === 'model' || kind === 'prompt' || kind === 'system_prompt';
  // Step 2 — test cases. Prompt arenas allow zero inputs when
  // standalone is on (PRD: variants run as-is). System-prompt arenas
  // require ≥3 test prompts (PRD: across-suite robustness; the
  // server's parser hard-blocks <3 — we mirror it client-side so the
  // operator sees inline gating instead of a 400 after submit). Model
  // arenas keep the legacy "at least one" rule.
  const canProgressStep2 =
    kind === 'prompt'
      ? standaloneVariants || validPromptCount > 0
      : kind === 'system_prompt'
        ? validPromptCount >= MIN_SYSTEM_PROMPT_SUITE
        : validPromptCount > 0;
  // Step 3 — contestants. Models for kind='model'; variants + pinned
  // model for kind='prompt' / 'system_prompt' (same minimum: 2).
  const canProgressStep3 =
    kind === 'prompt' || kind === 'system_prompt'
      ? validVariantCount >= MIN_VARIANTS && !!pinnedProviderModelId
      : selectedModels.length >= MIN_MODELS;

  const canProgress =
    (step === 0 && canProgressStep0) ||
    (step === 1 && !!name) ||
    (step === 2 && canProgressStep2) ||
    (step === 3 && canProgressStep3) ||
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
        <Stepper steps={steps} activeStep={step} />

        <div className="mt-8 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="px-6 py-7 md:px-8 md:py-8">
            {step === 0 && (
              <StepKind kind={kind} onKind={setKind} />
            )}

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
                kind={kind}
                prompts={prompts}
                onChange={setPrompts}
                standaloneOn={kind === 'prompt' && standaloneVariants}
              />
            )}

            {step === 3 && kind === 'model' && (
              <StepModels
                models={MODELS}
                selected={selectedModels}
                loading={modelsLoading}
                error={modelsError}
                onToggle={toggleModel}
              />
            )}

            {step === 3 && (kind === 'prompt' || kind === 'system_prompt') && (
              <StepVariants
                kind={kind}
                variants={variants}
                onChange={setVariants}
                models={MODELS}
                modelsLoading={modelsLoading}
                modelsError={modelsError}
                pinnedProviderModelId={pinnedProviderModelId}
                onPinnedProviderModelIdChange={setPinnedProviderModelId}
                pinnedSystemPrompt={pinnedSystemPrompt}
                onPinnedSystemPromptChange={setPinnedSystemPrompt}
                standaloneVariants={standaloneVariants}
                onStandaloneVariantsChange={setStandaloneVariants}
              />
            )}

            {step === 4 && (
              <StepGenerate
                kind={kind}
                // Standalone-variant prompt arenas have 0 inputs; the
                // server treats this as a single synthetic case so the
                // generated slot count equals variants × 1.
                promptCount={
                  kind === 'prompt' && standaloneVariants
                    ? 1
                    : validPromptCount
                }
                modelCount={
                  kind === 'prompt' || kind === 'system_prompt'
                    ? variants.filter((v) => v.text.trim().length > 0).length
                    : selectedModels.length
                }
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
                kind={kind}
                campaignCategories={categories}
                succeeded={succeeded}
                failed={failed}
                activateError={activateError}
                personaPanelEnabled={personaPanelEnabled}
                onPersonaPanelEnabledChange={setPersonaPanelEnabled}
                personas={personasData?.personas ?? []}
                personasLoading={personasLoading}
                personasError={personasError}
                selectedPersonaIds={selectedPersonaIds}
                onSelectedPersonaIdsChange={setSelectedPersonaIds}
                personaVoterCount={personaVoterCount}
                onPersonaVoterCountChange={setPersonaVoterCount}
                personaRefineQuery={personaRefineQuery}
                onPersonaRefineQueryChange={setPersonaRefineQuery}
                generationActualUsd={generationActualUsd}
                personaJudgingEstimateUsd={
                  personaJudgingEstimate?.estimatedUsd ?? null
                }
                totalEstimatedUsd={totalEstimatedUsd}
                aboveCostThreshold={aboveCostThreshold}
                costAcknowledged={costAcknowledged}
                onCostAcknowledgedChange={setCostAcknowledged}
              />
            )}
          </div>

          <footer className="flex items-center justify-between border-t border-border bg-surface-highlight/30 px-6 py-4 md:px-8">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0 || isGenerating}
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
                disabled={
                  isActivating ||
                  failed > 0 ||
                  (aboveCostThreshold && !costAcknowledged)
                }
                title={
                  failed > 0
                    ? 'Fix failed generations before launching'
                    : aboveCostThreshold && !costAcknowledged
                      ? `Acknowledge the ~$${totalEstimatedUsd.toFixed(2)} estimated cost before launching`
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

function Stepper({
  steps,
  activeStep,
}: {
  steps: readonly WizardStep[];
  activeStep: number;
}) {
  const activeLabel = steps[activeStep]?.label ?? '';
  // 0-indexed `activeStep` means progress = (activeStep + 1) / total.
  const progressPct = ((activeStep + 1) / steps.length) * 100;
  const displayStep = activeStep + 1;
  return (
    <>
      {/* Mobile-only compact header: "Step N of M · Label" + 2px progress bar.
          The full dotted-stepper below eats horizontal at 360px and its
          labels are second-tier info on a small screen anyway. */}
      <div className="sm:hidden" aria-label="Wizard progress">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Step{' '}
            <span className="text-foreground">{displayStep}</span> of{' '}
            {steps.length}
          </span>
          <span className="text-sm font-medium text-foreground">
            {activeLabel}
          </span>
        </div>
        <div
          className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-border"
          role="progressbar"
          aria-valuenow={displayStep}
          aria-valuemin={1}
          aria-valuemax={steps.length}
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
        {steps.map(({ n, label }) => {
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
                {isDone ? <Check className="size-3.5" /> : n + 1}
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

/**
 * Plan 04 — Step 0. Pick the arena kind. All three are now selectable
 * (Plans 05 and 06 have shipped). The list-order doubles as the
 * conceptual progression: model arena (varies the model) → prompt
 * arena (varies the user prompt) → system-prompt arena (varies the
 * system message). Operators self-route from this picker.
 */
const KIND_OPTIONS: ReadonlyArray<{
  kind: ArenaKind;
  title: string;
  description: string;
  comingSoon: boolean;
}> = [
  {
    kind: 'model',
    title: 'Model arena',
    description:
      'Compare different models on a fixed set of prompts. The original ModelArena experience.',
    comingSoon: false,
  },
  {
    kind: 'prompt',
    title: 'Prompt arena',
    description:
      'Test different user-prompt phrasings on a single pinned model. Useful for prompt iteration.',
    comingSoon: false,
  },
  {
    kind: 'system_prompt',
    title: 'System-prompt arena',
    description:
      'Test different system messages on a single pinned model across a suite of test prompts. Best for brand voice, agent personalities, refusal styles.',
    comingSoon: false,
  },
];

function StepKind({
  kind,
  onKind,
}: {
  kind: ArenaKind;
  onKind: (k: ArenaKind) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-heading text-lg font-semibold text-foreground">
          What does this campaign vary?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick the axis you want to compare. The rest of the wizard
          adapts to the choice.
        </p>
      </div>
      <div
        role="radiogroup"
        aria-label="Arena kind"
        className="grid gap-3 sm:grid-cols-3"
      >
        {KIND_OPTIONS.map((opt) => {
          const isSelected = kind === opt.kind;
          const isDisabled = opt.comingSoon;
          return (
            <button
              key={opt.kind}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-disabled={isDisabled || undefined}
              disabled={isDisabled}
              onClick={() => {
                if (!isDisabled) onKind(opt.kind);
              }}
              title={
                isDisabled
                  ? 'Coming soon — use Model arena for now.'
                  : undefined
              }
              className={cn(
                'flex h-full flex-col gap-2 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40',
                isSelected
                  ? 'border-foreground bg-card shadow-sm ring-1 ring-foreground/10'
                  : 'border-border bg-card hover:border-foreground/40',
                isDisabled && 'cursor-not-allowed opacity-60 hover:border-border',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-heading text-sm font-semibold text-foreground">
                  {opt.title}
                </span>
                {opt.comingSoon && (
                  <span className="inline-flex items-center rounded-full border border-border bg-surface-highlight px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Coming soon
                  </span>
                )}
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {opt.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

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
  kind,
  prompts,
  onChange,
  standaloneOn,
}: {
  kind: ArenaKind;
  prompts: PromptDraft[];
  onChange: (p: PromptDraft[]) => void;
  /**
   * For prompt arenas only: when the operator has flipped on Standalone
   * Variants in Step 3's Advanced panel, inputs are ignored. We render
   * the step in a disabled, banner-only state so the operator
   * understands the relationship without losing whatever they'd typed.
   */
  standaloneOn: boolean;
}) {
  const updateAt = (idx: number, patch: Partial<PromptDraft>) => {
    const next = prompts.map((p, i) => (i === idx ? { ...p, ...patch } : p));
    onChange(next);
  };

  // Per-kind copy. The data shape is identical (prompts[] in the API
  // payload) but the operator-facing label changes the mental model.
  const isPrompt = kind === 'prompt';
  const isSystemPrompt = kind === 'system_prompt';
  const header = isPrompt
    ? {
        title: 'Inputs',
        description:
          'Inputs are situational fragments substituted into each variant via the {{input}} token. Each input runs through every variant; results land on the per-input dashboard. Empty list is allowed only when Standalone variants is on (Step 3 → Advanced).',
      }
    : isSystemPrompt
      ? {
          title: 'Test prompts (suite)',
          description:
            "Add at least 3 representative user prompts the variants will be measured against. The leaderboard's heatmap shows where each variant wins or breaks across the suite — confidence intervals widen with smaller suites, so 5–10 prompts is the sweet spot.",
        }
      : {
          title: 'Prompts & context',
          description:
            "Add the prompts you want to evaluate. Each prompt runs against every selected model. Markdown is supported — the preview shows voters exactly what they'll see.",
        };

  // Per-kind default voting mode (PRD → "Default voting mode"):
  //   - prompt        → Best-of-N (one click per input)
  //   - system_prompt → Slider (absolute scores across the suite)
  //   - model         → Tournament (legacy bracket)
  // Once the operator has picked a mode for any prompt, that mode
  // forwards to the next row — a campaign that's all slider stays all
  // slider without re-clicking the picker on every prompt.
  const newPromptMode = (
    prev: PromptEvalMode | undefined,
  ): PromptEvalMode => {
    if (prev) return prev;
    if (isPrompt) return 'best_of_n';
    if (isSystemPrompt) return 'slider';
    return 'tournament';
  };

  // Plan 06 P1-9 — slider seed for system-prompt-arena prompts uses
  // brand-voice-shaped labels. Applied here when a new row is appended
  // and its evalMode resolves to slider; the seed prompt's labels are
  // applied via a parent useEffect (so the operator sees the labels on
  // first load, not only after they click "Add another test prompt").
  const newPromptSliderLabels = isSystemPrompt
    ? { minLabel: 'Off-brand', maxLabel: 'On-brand' }
    : null;

  const addRow = () => {
    const nextMode = newPromptMode(prompts[prompts.length - 1]?.evalMode);
    const draft = emptyPrompt(nextMode);
    if (nextMode === 'slider' && newPromptSliderLabels) {
      draft.sliderConfig = {
        ...draft.sliderConfig,
        ...newPromptSliderLabels,
      };
    }
    onChange([...prompts, draft]);
  };

  const addRowLabel = isPrompt ? 'input' : isSystemPrompt ? 'test prompt' : 'prompt';

  return (
    <div className="flex flex-col gap-6">
      <StepHeader
        title={header.title}
        description={header.description}
      />
      {/* Plan 06 P1-3 — Plan 03 Collections seam. Disabled placeholder
          so operators see the future option without being able to
          misuse it. When Plan 03 ships, this button opens a picker
          and writes the resulting prompts onto `prompts` (replacing or
          extending — TBD by Plan 03's UX). */}
      {isSystemPrompt && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-card px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-foreground">
              Load from a saved Collection
            </span>
            <span className="text-[11px] text-muted-foreground">
              Reuse a curated suite of test prompts. Coming with Plan 03.
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled
            title="Plan 03 ships saved prompt collections."
            className="shrink-0"
          >
            Load Collection
            <span className="inline-flex items-center rounded-full border border-border bg-surface-highlight px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Coming soon
            </span>
          </Button>
        </div>
      )}
      {standaloneOn && (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-highlight/50 px-4 py-3 text-[12px] leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0 text-foreground" />
          <div>
            <span className="font-medium text-foreground">
              Standalone variants is on.
            </span>{' '}
            Inputs are ignored — variants run as-is. To add inputs back,
            uncheck Standalone in Step 3 → Advanced.
          </div>
        </div>
      )}
      <div
        className={cn(
          'flex flex-col gap-6',
          standaloneOn && 'pointer-events-none opacity-50',
        )}
        aria-hidden={standaloneOn || undefined}
      >
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
          onClick={addRow}
          className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card py-3 text-sm text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
        >
          <Plus className="size-4" />
          Add another {addRowLabel}
        </button>
      </div>
      {/* Suite-min counter for system-prompt arenas. Surfaces the
          ≥3 hard block in the data so the operator sees the gap
          rather than discovering it via a disabled Next. */}
      {isSystemPrompt && (
        <div className="text-[11px] text-muted-foreground">
          <span className="font-mono text-foreground">
            {prompts.filter((p) => flattenPrompt(p) !== null).length}
          </span>{' '}
          valid · need at least{' '}
          <span className="font-mono">{MIN_SYSTEM_PROMPT_SUITE}</span>
        </div>
      )}
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

// ────────────────────────────────────────────────────────────────────────────
// Plan 05 — Step 3 for kind='prompt'. Variants editor + pinned-model picker
// + Advanced disclosure (pinned system prompt, Standalone variants, Cross-
// model toggle). Operator-facing labels match the PRD (display names are
// editable per-variant; voters never see them).
// ────────────────────────────────────────────────────────────────────────────

const INPUT_TOKEN = '{{input}}';

/**
 * Heuristic near-miss check for the {{input}} token. The server-side
 * `renderTemplate` is intentionally strict (the literal `{{input}}` is
 * the only recognized form), so common variants — `{ input }`,
 * `{{ input }}`, double spaces, missing braces — silently get appended
 * instead of substituted. We surface this as a non-blocking tip so the
 * operator can fix it before generating.
 */
function tokenWarning(text: string): string | null {
  if (!text) return null;
  if (text.includes(INPUT_TOKEN)) return null;
  // Patterns that LOOK like the operator meant {{input}} but won't
  // match the strict server-side check.
  const nearMisses: RegExp[] = [
    /\{\{\s+input\s*\}\}/, // {{ input}}, {{ input }}, etc.
    /\{\{\s*input\s+\}\}/, // {{input }}, {{input  }}
    /\{\{\s*INPUT\s*\}\}/, // case mismatch
    /\{\s*input\s*\}/,     // single braces
  ];
  if (nearMisses.some((re) => re.test(text))) {
    return 'Looks like an `{{input}}` near-miss — the server only matches the exact literal. Did you mean `{{input}}`?';
  }
  return null;
}

function StepVariants({
  kind,
  variants,
  onChange,
  models,
  modelsLoading,
  modelsError,
  pinnedProviderModelId,
  onPinnedProviderModelIdChange,
  pinnedSystemPrompt,
  onPinnedSystemPromptChange,
  standaloneVariants,
  onStandaloneVariantsChange,
}: {
  /**
   * Constrained to the variant-bearing kinds — `model` arenas don't
   * mount this step. The two share a card layout but differ on:
   *   - token UI (only kind='prompt' uses {{input}} substitution)
   *   - text-length cap (8k vs 16k)
   *   - Advanced disclosure (only kind='prompt' carries
   *     pinnedSystemPrompt + standaloneVariants)
   *   - copy
   */
  kind: 'prompt' | 'system_prompt';
  variants: VariantDraft[];
  onChange: (v: VariantDraft[]) => void;
  models: ModelLibraryData['rows'];
  modelsLoading: boolean;
  modelsError: unknown;
  pinnedProviderModelId: string;
  onPinnedProviderModelIdChange: (id: string) => void;
  /**
   * Held-constant system message for `kind='prompt'` only. The
   * Advanced disclosure that owns this control is hidden under
   * `kind='system_prompt'` (the variant IS the system message there),
   * so these props are read but never surfaced to the user.
   */
  pinnedSystemPrompt: string;
  onPinnedSystemPromptChange: (v: string) => void;
  standaloneVariants: boolean;
  onStandaloneVariantsChange: (on: boolean) => void;
}) {
  const isAuthError = modelsError instanceof ApiError && modelsError.status === 401;
  const validCount = variants.filter((v) => v.text.trim().length > 0).length;
  const isSystemPrompt = kind === 'system_prompt';
  const variantTextMax = VARIANT_TEXT_MAX_BY_KIND[kind];

  const headerCopy = isSystemPrompt
    ? {
        title: 'System prompt variants',
        description: `Add at least ${MIN_VARIANTS} system-prompt variants. Each runs as the system message on the pinned model, against every test prompt in the suite. The variant body is sent verbatim — no templating.`,
      }
    : {
        title: 'Variants',
        description: `Add at least ${MIN_VARIANTS} prompt variants. Each runs against every input on the pinned model. Use the {{input}} token to weave the input into the variant body.`,
      };

  const updateAt = (idx: number, patch: Partial<VariantDraft>) => {
    onChange(variants.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  };

  const removeAt = (idx: number) => {
    onChange(variants.filter((_, i) => i !== idx));
  };

  return (
    <div className="flex flex-col gap-6">
      <StepHeader
        title={headerCopy.title}
        description={headerCopy.description}
      />

      {/* Side-by-side cards — horizontal scroll when overflow, so the
          operator can scan differences across 3–4 variants without
          collapsing each one. Each card is fixed-width so editor sizes
          stay comparable. System-prompt arenas widen the cards
          slightly to give the longer bodies room. */}
      <div className="-mx-2 flex snap-x snap-mandatory gap-3 overflow-x-auto px-2 pb-2">
        {variants.map((variant, idx) => (
          <VariantCard
            key={idx}
            idx={idx}
            variant={variant}
            previousVariant={idx > 0 ? variants[idx - 1] : null}
            removable={variants.length > MIN_VARIANTS}
            tokenSupport={!isSystemPrompt}
            variantTextMax={variantTextMax}
            cardWidthClass={isSystemPrompt ? 'w-[26rem]' : 'w-[22rem]'}
            onPatch={(patch) => updateAt(idx, patch)}
            onRemove={() => removeAt(idx)}
          />
        ))}
        <button
          type="button"
          onClick={() =>
            onChange([...variants, emptyVariant(variants.length)])
          }
          className="flex w-32 shrink-0 snap-start items-center justify-center gap-2 self-stretch rounded-lg border border-dashed border-border bg-card text-sm text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
        >
          <Plus className="size-4" />
          Add variant
        </button>
      </div>

      <div className="text-[11px] text-muted-foreground">
        <span className="font-mono text-foreground">{validCount}</span> of{' '}
        <span className="font-mono">{variants.length}</span> with text · need at
        least <span className="font-mono">{MIN_VARIANTS}</span>
      </div>

      {/* Pinned model picker (P1-6). Single-select. The default is
          seeded by the parent useEffect; the operator can swap. */}
      <div className="flex flex-col gap-2">
        <Label
          htmlFor="pinned-model"
          className="text-[10px] uppercase tracking-wide"
        >
          Pinned model
        </Label>
        <p className="text-[11px] text-muted-foreground">
          {isSystemPrompt
            ? 'Held constant across all variants × test prompts. Cross-model fan-out lands later — see the toggle below.'
            : 'Held constant across all variants × inputs. Changing the model is a campaign-level decision, not a contestant.'}
        </p>
        {modelsLoading ? (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Loading available models…
          </div>
        ) : modelsError && !isAuthError ? (
          <ErrorAlert>
            {modelsError instanceof Error
              ? modelsError.message
              : String(modelsError)}
          </ErrorAlert>
        ) : (
          <select
            id="pinned-model"
            value={pinnedProviderModelId}
            onChange={(e) => onPinnedProviderModelIdChange(e.target.value)}
            className="flex h-10 w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
          >
            {models.length === 0 && (
              <option value="" disabled>
                No selectable models
              </option>
            )}
            {models.map((m) => (
              <option key={m.providerModelId} value={m.providerModelId}>
                {m.displayName} · {m.providerModelId}
              </option>
            ))}
          </select>
        )}
      </div>

      {isSystemPrompt ? (
        // P1-7 — system-prompt arenas don't have an Advanced disclosure
        // (no pinnedSystemPrompt, no standaloneVariants — both are
        // kind='prompt' concepts). The cross-model toggle lives inline
        // beneath the pinned-model picker so its presence isn't buried.
        <CheckboxRow
          id="cross-model-system-prompt"
          checked={false}
          onChange={() => {
            /* disabled */
          }}
          disabled
          badge="Coming soon"
          tooltip="Single-model V1; multi-model fan-out lands later."
          label="Run across multiple models"
          hint="Compare each variant on more than one model. Coming soon."
        />
      ) : (
        <AdvancedDisclosure
          pinnedSystemPrompt={pinnedSystemPrompt}
          onPinnedSystemPromptChange={onPinnedSystemPromptChange}
          standaloneVariants={standaloneVariants}
          onStandaloneVariantsChange={onStandaloneVariantsChange}
        />
      )}
    </div>
  );
}

function VariantCard({
  idx,
  variant,
  previousVariant,
  removable,
  tokenSupport,
  variantTextMax,
  cardWidthClass,
  onPatch,
  onRemove,
}: {
  idx: number;
  variant: VariantDraft;
  previousVariant: VariantDraft | null;
  removable: boolean;
  /**
   * When true (kind='prompt'), the card surfaces the `{{input}}`
   * token affordances: an Insert button, a near-miss warning, and the
   * "token must be exactly literal" helper text. System-prompt arenas
   * disable all three — the variant body is sent verbatim, no
   * substitution, no template semantics.
   */
  tokenSupport: boolean;
  /** Per-kind char limit (8k for prompt, 16k for system_prompt). */
  variantTextMax: number;
  /** Per-kind card width — system-prompt bodies run longer, so they
   *  get a wider editor by default. */
  cardWidthClass: string;
  onPatch: (patch: Partial<VariantDraft>) => void;
  onRemove: () => void;
}) {
  const [showDiff, setShowDiff] = useState(false);
  const warning = tokenSupport ? tokenWarning(variant.text) : null;
  const overLimit = variant.text.length > variantTextMax;

  // Insert the {{input}} token at the end of the current text — the
  // operator can move it manually if they want it elsewhere. Cheap
  // helper, mirrors the helper-text contract.
  const insertToken = () => {
    const next = variant.text
      ? `${variant.text}${variant.text.endsWith('\n') ? '' : ' '}${INPUT_TOKEN}`
      : INPUT_TOKEN;
    onPatch({ text: next });
  };

  return (
    <div className={cn(
      'flex shrink-0 snap-start flex-col gap-3 rounded-lg border border-border bg-surface-highlight/30 p-4',
      cardWidthClass,
    )}>
      <div className="flex items-center justify-between gap-2">
        <Input
          aria-label={`Variant ${idx + 1} display name`}
          value={variant.displayName}
          onChange={(e) =>
            onPatch({
              displayName: e.target.value.slice(0, VARIANT_DISPLAY_NAME_MAX),
            })
          }
          placeholder={`Variant ${idx + 1}`}
          className="h-8 max-w-44 text-xs"
        />
        {removable && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove variant ${idx + 1}`}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <Label
            htmlFor={`variant-text-${idx}`}
            className="text-[10px] uppercase tracking-wide"
          >
            Variant text
          </Label>
          {previousVariant && variant.text && previousVariant.text && (
            <button
              type="button"
              onClick={() => setShowDiff((s) => !s)}
              aria-pressed={showDiff}
              className="text-[10px] uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
            >
              {showDiff ? 'Hide diff' : 'Diff vs prev'}
            </button>
          )}
        </div>
        <Textarea
          id={`variant-text-${idx}`}
          value={variant.text}
          onChange={(e) => onPatch({ text: e.target.value })}
          placeholder={
            tokenSupport
              ? `e.g. You are a senior reviewer. Look at the following:\n\n${INPUT_TOKEN}`
              : 'e.g. You are a warm, professional brand voice. Be concise. Avoid jargon.'
          }
          className={cn(
            'bg-card font-mono text-[12px] leading-relaxed',
            tokenSupport ? 'min-h-32' : 'min-h-48',
          )}
        />
        <div className="flex items-center justify-between gap-2">
          {tokenSupport ? (
            <button
              type="button"
              onClick={insertToken}
              className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-card px-2 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <Plus className="size-3" />
              Insert {INPUT_TOKEN}
            </button>
          ) : (
            <span /> /* spacer keeps the count right-aligned */
          )}
          <span
            className={cn(
              'font-mono text-[10px] tabular-nums',
              overLimit ? 'text-destructive' : 'text-muted-foreground/70',
            )}
          >
            {variant.text.length}/{variantTextMax}
          </span>
        </div>
        {tokenSupport && (
          <p className="text-[11px] leading-snug text-muted-foreground/80">
            Token must be exactly <span className="font-mono">{INPUT_TOKEN}</span>{' '}
            — the server matches it literally.
          </p>
        )}
        {warning && (
          <div className="flex items-start gap-1.5 rounded-md border border-border bg-card px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-3 shrink-0" />
            <span>{warning}</span>
          </div>
        )}
      </div>

      {showDiff && previousVariant && (
        <div className="flex flex-col gap-1 border-t border-border pt-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Diff vs Variant {idx}
          </span>
          <DiffPanel before={previousVariant.text} after={variant.text} />
        </div>
      )}
    </div>
  );
}

/**
 * Tiny per-line diff. Not a real LCS — for the V1 use case (operators
 * eyeballing 2–4 variants of a paragraph) a simple line-by-line "added
 * if it's in `after` but not `before`" is enough. Pulling a diff lib
 * would dwarf the value at this scale.
 */
function DiffPanel({ before, after }: { before: string; after: string }) {
  const beforeLines = new Set(before.split('\n').map((l) => l.trim()).filter(Boolean));
  const afterLines = new Set(after.split('\n').map((l) => l.trim()).filter(Boolean));
  const lines = after.split('\n');
  return (
    <div className="rounded-md border border-border bg-card px-2 py-2 font-mono text-[11px] leading-relaxed">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        const wasInBefore = trimmed && beforeLines.has(trimmed);
        const isNew = trimmed && !wasInBefore;
        return (
          <div
            key={i}
            className={cn(
              'whitespace-pre-wrap',
              isNew ? 'bg-success/10 text-foreground' : 'text-muted-foreground',
            )}
          >
            {isNew ? '+ ' : '  '}
            {line || ' '}
          </div>
        );
      })}
      {[...beforeLines].filter((l) => !afterLines.has(l)).map((line, i) => (
        <div
          key={`removed-${i}`}
          className="whitespace-pre-wrap bg-destructive/10 text-foreground"
        >
          - {line}
        </div>
      ))}
    </div>
  );
}

function AdvancedDisclosure({
  pinnedSystemPrompt,
  onPinnedSystemPromptChange,
  standaloneVariants,
  onStandaloneVariantsChange,
}: {
  pinnedSystemPrompt: string;
  onPinnedSystemPromptChange: (v: string) => void;
  standaloneVariants: boolean;
  onStandaloneVariantsChange: (on: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const sysOver = pinnedSystemPrompt.length > PINNED_SYSTEM_PROMPT_MAX;
  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="advanced-panel"
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="text-sm font-medium text-foreground">
          Advanced settings
        </span>
        <ChevronDown
          className={cn(
            'size-4 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <div
          id="advanced-panel"
          className="flex flex-col gap-5 border-t border-border px-4 py-4"
        >
          {/* Pinned system prompt — held constant across all variants
              × inputs. NOT the same as a System-Prompt Arena (where
              the system message IS the variable axis). */}
          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="pinned-system-prompt"
              className="text-[10px] uppercase tracking-wide"
            >
              Pinned system prompt{' '}
              <span className="text-muted-foreground/70">(optional)</span>
            </Label>
            <Textarea
              id="pinned-system-prompt"
              value={pinnedSystemPrompt}
              onChange={(e) => onPinnedSystemPromptChange(e.target.value)}
              placeholder="e.g. You are a customer support agent. Be polite and concise."
              className="min-h-20 bg-background text-sm"
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] leading-snug text-muted-foreground/80">
                A sticky persona that frames every response. Distinct from
                System-Prompt Arena, which varies the system message itself.
              </p>
              <span
                className={cn(
                  'shrink-0 font-mono text-[10px] tabular-nums',
                  sysOver ? 'text-destructive' : 'text-muted-foreground/70',
                )}
              >
                {pinnedSystemPrompt.length}/{PINNED_SYSTEM_PROMPT_MAX}
              </span>
            </div>
          </div>

          {/* Standalone variants — wired through the create payload to
              the campaign's `standaloneVariants` column. At generate
              time, `assembleCall` calls `renderTemplate({ standalone:
              true })` so each variant's body passes through verbatim,
              including any literal `{{input}}` token. */}
          <CheckboxRow
            id="standalone-variants"
            checked={standaloneVariants}
            onChange={onStandaloneVariantsChange}
            label="Standalone variants"
            hint="Variants run as-is, ignoring Inputs. Use case: comparing fully-formed prompts that don't share a template — `{{input}}` inside the variant body is preserved verbatim."
          />

          <CheckboxRow
            id="cross-model"
            checked={false}
            onChange={() => {
              /* disabled */
            }}
            disabled
            badge="Coming soon"
            tooltip="Single-model V1; multi-model fan-out lands later."
            label="Run across multiple models"
            hint="Compare each variant on more than one model. Coming soon."
          />
        </div>
      )}
    </div>
  );
}

function CheckboxRow({
  id,
  checked,
  onChange,
  label,
  hint,
  disabled,
  badge,
  tooltip,
}: {
  id: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  label: string;
  hint: string;
  disabled?: boolean;
  badge?: string;
  tooltip?: string;
}) {
  return (
    <label
      htmlFor={id}
      title={tooltip}
      className={cn(
        'flex items-start gap-3 rounded-md border border-transparent px-1 py-1',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="mt-0.5 size-4 shrink-0 rounded border-border accent-foreground"
      />
      <span className="flex flex-col gap-0.5">
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          {label}
          {badge && (
            <span className="inline-flex items-center rounded-full border border-border bg-surface-highlight px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {badge}
            </span>
          )}
        </span>
        <span className="text-[11px] leading-snug text-muted-foreground">
          {hint}
        </span>
      </span>
    </label>
  );
}

function StepGenerate({
  kind,
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
  kind: ArenaKind;
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
          <Counter
            label={
              kind === 'prompt'
                ? 'Inputs'
                : kind === 'system_prompt'
                  ? 'Test prompts'
                  : 'Prompts'
            }
            value={promptCount}
          />
          <Counter
            label={
              kind === 'prompt' || kind === 'system_prompt'
                ? 'Variants'
                : 'Models'
            }
            value={modelCount}
          />
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
  kind,
  campaignCategories,
  succeeded,
  failed,
  activateError,
  personaPanelEnabled,
  onPersonaPanelEnabledChange,
  personas,
  personasLoading,
  personasError,
  selectedPersonaIds,
  onSelectedPersonaIdsChange,
  personaVoterCount,
  onPersonaVoterCountChange,
  personaRefineQuery,
  onPersonaRefineQueryChange,
  generationActualUsd,
  personaJudgingEstimateUsd,
  totalEstimatedUsd,
  aboveCostThreshold,
  costAcknowledged,
  onCostAcknowledgedChange,
}: {
  name: string;
  kind: ArenaKind;
  campaignCategories: string[];
  succeeded: number;
  failed: number;
  activateError: string | null;
  /** Plan 06 P1-B — persona panel state (system-prompt arenas only). */
  personaPanelEnabled: boolean;
  onPersonaPanelEnabledChange: (on: boolean) => void;
  personas: Persona[];
  personasLoading: boolean;
  personasError: unknown;
  selectedPersonaIds: string[];
  onSelectedPersonaIdsChange: (ids: string[]) => void;
  personaVoterCount: number;
  onPersonaVoterCountChange: (n: number) => void;
  personaRefineQuery: string;
  onPersonaRefineQueryChange: (q: string) => void;
  /** Plan 06 P1-C — cost preview state (system-prompt arenas only). */
  generationActualUsd: number;
  personaJudgingEstimateUsd: number | null;
  totalEstimatedUsd: number;
  aboveCostThreshold: boolean;
  costAcknowledged: boolean;
  onCostAcknowledgedChange: (on: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
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

      {kind === 'system_prompt' && (
        <PersonaPanelCard
          campaignCategories={campaignCategories}
          enabled={personaPanelEnabled}
          onEnabledChange={onPersonaPanelEnabledChange}
          personas={personas}
          personasLoading={personasLoading}
          personasError={personasError}
          selectedPersonaIds={selectedPersonaIds}
          onSelectedPersonaIdsChange={onSelectedPersonaIdsChange}
          voterCount={personaVoterCount}
          onVoterCountChange={onPersonaVoterCountChange}
          refineQuery={personaRefineQuery}
          onRefineQueryChange={onPersonaRefineQueryChange}
        />
      )}

      {kind === 'system_prompt' && (
        <CostPreviewCard
          generationActualUsd={generationActualUsd}
          personaJudgingEstimateUsd={personaJudgingEstimateUsd}
          totalEstimatedUsd={totalEstimatedUsd}
          aboveCostThreshold={aboveCostThreshold}
          costAcknowledged={costAcknowledged}
          onCostAcknowledgedChange={onCostAcknowledgedChange}
        />
      )}
    </div>
  );
}

/**
 * Plan 06 P1-19/20 — cost preview prominent above the Launch button.
 *
 * Two layers of spend:
 *   - Generation (already paid): operator hit Generate; the SSE stream
 *     reported actual `costUsd` per slot. Shown for transparency.
 *   - Persona judging (estimated): forward-looking estimate from
 *     `estimateRunCost`. Updates live as voter-count or persona
 *     selection changes.
 *
 * Above the soft threshold ($5 in V1) an explicit acknowledgement
 * checkbox unlocks the Launch button. Below the threshold the
 * checkbox is hidden — small runs ship without friction.
 */
export function CostPreviewCard({
  generationActualUsd,
  personaJudgingEstimateUsd,
  totalEstimatedUsd,
  aboveCostThreshold,
  costAcknowledged,
  onCostAcknowledgedChange,
}: {
  generationActualUsd: number;
  personaJudgingEstimateUsd: number | null;
  totalEstimatedUsd: number;
  aboveCostThreshold: boolean;
  costAcknowledged: boolean;
  onCostAcknowledgedChange: (on: boolean) => void;
}) {
  const fmt = (usd: number): string => {
    // Sub-cent precision for tiny estimates so the operator sees
    // *something* > 0; standard 2-decimal otherwise.
    if (usd > 0 && usd < 0.01) return '<$0.01';
    return `$${usd.toFixed(2)}`;
  };
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-5 py-4">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Estimated total
        </span>
        <span
          className="font-mono text-2xl font-semibold tabular-nums text-foreground"
          aria-live="polite"
        >
          {fmt(totalEstimatedUsd)}
        </span>
      </div>
      <div className="flex flex-col gap-2 px-5 py-4 text-[12px] text-muted-foreground">
        <div className="flex items-baseline justify-between gap-3">
          <span>Generations (already spent)</span>
          <span className="font-mono tabular-nums text-foreground">
            {fmt(generationActualUsd)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span>Persona judging (estimated)</span>
          <span className="font-mono tabular-nums text-foreground">
            {personaJudgingEstimateUsd == null
              ? '—'
              : fmt(personaJudgingEstimateUsd)}
          </span>
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground/80">
          Estimates are within ±25% of typical actuals. The runner caps
          spend at 2× the estimate via{' '}
          <span className="font-mono">costCeilingUsd</span>; runaway
          loops abort.
        </p>
      </div>
      {aboveCostThreshold && (
        <label
          htmlFor="cost-acknowledged"
          className="flex items-start gap-3 border-t border-border bg-surface-highlight/30 px-5 py-4 text-sm"
        >
          <input
            id="cost-acknowledged"
            type="checkbox"
            checked={costAcknowledged}
            onChange={(e) => onCostAcknowledgedChange(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 rounded border-border accent-foreground"
          />
          <span className="flex flex-col gap-0.5">
            <span className="font-medium text-foreground">
              I understand this run costs about {fmt(totalEstimatedUsd)}
            </span>
            <span className="text-[11px] leading-snug text-muted-foreground">
              Required above $5 (V1 default) — keeps surprise charges
              visible. The Launch button stays disabled until checked.
            </span>
          </span>
        </label>
      )}
    </div>
  );
}

/**
 * Plan 06 P1-13/14 — persona suggestion card for system-prompt arenas.
 *
 * Default-on. The suggestion list is the operator's full library
 * ranked by tag-overlap with the campaign's categories (high matches
 * first). The "Refine" search field narrows the list further by name
 * substring; personas with zero tag-matches still appear via search,
 * per the PRD ("don't silently exclude them").
 *
 * Selection is explicit — no persona is auto-checked. Server caps the
 * panel at 10 personas per run, so the UI mirrors that ceiling: when
 * the operator has 10 selected, additional checkboxes are disabled.
 *
 * Voter-count slider is 10–500. The 10 lower bound matches
 * `MIN_VOTER_COUNT` in `src/server/simulated-runs/launch.ts`; the PRD's
 * conservative default of 10 lives at the bottom of that range so the
 * operator sees the minimum and tunes up.
 */
const PERSONA_PANEL_MAX = 10;
const VOTER_COUNT_MIN = 10;
const VOTER_COUNT_MAX = 500;

export function PersonaPanelCard({
  campaignCategories,
  enabled,
  onEnabledChange,
  personas,
  personasLoading,
  personasError,
  selectedPersonaIds,
  onSelectedPersonaIdsChange,
  voterCount,
  onVoterCountChange,
  refineQuery,
  onRefineQueryChange,
}: {
  campaignCategories: string[];
  enabled: boolean;
  onEnabledChange: (on: boolean) => void;
  personas: Persona[];
  personasLoading: boolean;
  personasError: unknown;
  selectedPersonaIds: string[];
  onSelectedPersonaIdsChange: (ids: string[]) => void;
  voterCount: number;
  onVoterCountChange: (n: number) => void;
  refineQuery: string;
  onRefineQueryChange: (q: string) => void;
}) {
  const isAuthError =
    personasError instanceof ApiError && personasError.status === 401;

  // Memoize the suggestion list — it only changes when the categories
  // or the persona library do. The search filter on top is cheap.
  const ranked = useMemo(
    () => suggestPersonas({ campaignCategories, personas }),
    [campaignCategories, personas],
  );
  const filtered = useMemo(() => {
    const q = refineQuery.trim().toLowerCase();
    if (!q) return ranked;
    return ranked.filter(({ persona }) => {
      const haystack = [
        persona.name,
        persona.description,
        persona.tags.join(' '),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [ranked, refineQuery]);

  const selectedSet = new Set(selectedPersonaIds);
  const atMax = selectedPersonaIds.length >= PERSONA_PANEL_MAX;

  const togglePersona = (id: string) => {
    if (selectedSet.has(id)) {
      onSelectedPersonaIdsChange(selectedPersonaIds.filter((x) => x !== id));
    } else if (!atMax) {
      onSelectedPersonaIdsChange([...selectedPersonaIds, id]);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-start gap-3 border-b border-border px-5 py-4">
        <input
          id="persona-panel-toggle"
          type="checkbox"
          checked={enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
          className="mt-1 size-4 shrink-0 rounded border-border accent-foreground"
        />
        <div className="flex flex-col gap-0.5">
          <label
            htmlFor="persona-panel-toggle"
            className="cursor-pointer text-sm font-medium text-foreground"
          >
            Run with a persona panel
          </label>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Score each variant from your target audience's perspective.
            Personas judge every variant × test prompt cell — the
            heatmap shows where each persona aligns or diverges. Voter
            count and persona selection are explicit; no auto-checking.
          </p>
        </div>
      </div>

      {enabled && (
        <div className="flex flex-col gap-5 px-5 py-5">
          {/* Voter-count slider (P1-14). */}
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <Label
                htmlFor="persona-voter-count"
                className="text-[10px] uppercase tracking-wide"
              >
                Voter count
              </Label>
              <span
                className="font-mono text-sm tabular-nums text-foreground"
                aria-live="polite"
              >
                {voterCount}
              </span>
            </div>
            <input
              id="persona-voter-count"
              type="range"
              min={VOTER_COUNT_MIN}
              max={VOTER_COUNT_MAX}
              value={voterCount}
              onChange={(e) => onVoterCountChange(Number(e.target.value))}
              className="w-full accent-foreground"
            />
            <p
              className="text-[11px] leading-snug text-muted-foreground"
              title={
                'A panel of 10 keeps cost in check while still surfacing variant-by-persona patterns. Crank it up for tighter confidence intervals.'
              }
            >
              Why 10? Conservative default — keeps cost predictable.
              Drag right for tighter confidence intervals.
            </p>
          </div>

          {/* Persona list. */}
          {personasLoading ? (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Loading persona library…
            </div>
          ) : personasError && !isAuthError ? (
            <ErrorAlert>
              {personasError instanceof Error
                ? personasError.message
                : String(personasError)}
            </ErrorAlert>
          ) : personas.length === 0 ? (
            // Plan 06 P0-A drift handling — no starter library was
            // seeded yet (Plan 02 Phase 2 deliverable still pending).
            // Show a graceful empty-state CTA instead of an empty list.
            <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-surface-highlight/30 px-4 py-4">
              <span className="text-sm font-medium text-foreground">
                No personas in your library yet
              </span>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Personas represent your target audience. Once you've
                created a few, they'll show up here pre-filtered by the
                categories on this campaign. You can launch the
                campaign now for human voters and add a persona panel
                from the dashboard later.
              </p>
              <a
                href="/personas"
                className="inline-flex w-fit items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-foreground underline-offset-2 hover:underline"
              >
                Create a persona →
              </a>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="persona-refine"
                  className="text-[10px] uppercase tracking-wide"
                >
                  Refine
                </Label>
                <Input
                  id="persona-refine"
                  value={refineQuery}
                  onChange={(e) => onRefineQueryChange(e.target.value)}
                  placeholder="Search by name, description, or tag…"
                  className="h-8 text-xs"
                />
              </div>

              <ul
                role="list"
                className="flex max-h-72 flex-col gap-1.5 overflow-y-auto rounded-lg border border-border bg-surface-highlight/20 p-2"
                aria-label="Pre-filtered persona library"
              >
                {filtered.length === 0 ? (
                  <li className="px-2 py-3 text-[11px] text-muted-foreground">
                    No matches. Clear the search to see your full library.
                  </li>
                ) : (
                  filtered.map(({ persona, matchCount }) => {
                    const checked = selectedSet.has(persona.id);
                    const disabled = !checked && atMax;
                    return (
                      <li key={persona.id}>
                        <label
                          htmlFor={`persona-${persona.id}`}
                          className={cn(
                            'flex items-start gap-3 rounded-md border border-transparent px-2 py-2 text-left',
                            checked && 'bg-card ring-1 ring-foreground/10',
                            disabled && 'cursor-not-allowed opacity-60',
                            !disabled &&
                              !checked &&
                              'hover:border-foreground/20 hover:bg-card',
                          )}
                        >
                          <input
                            id={`persona-${persona.id}`}
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => togglePersona(persona.id)}
                            className="mt-0.5 size-4 shrink-0 rounded border-border accent-foreground"
                          />
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground">
                                {persona.name}
                              </span>
                              {matchCount > 0 && (
                                <span
                                  className="inline-flex items-center rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                                  title={`${matchCount} category tag${matchCount === 1 ? '' : 's'} match this campaign`}
                                >
                                  {matchCount} match{matchCount === 1 ? '' : 'es'}
                                </span>
                              )}
                            </div>
                            <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                              {persona.description}
                            </p>
                          </div>
                        </label>
                      </li>
                    );
                  })
                )}
              </ul>

              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>
                  <span className="font-mono text-foreground">
                    {selectedPersonaIds.length}
                  </span>{' '}
                  selected · max{' '}
                  <span className="font-mono">{PERSONA_PANEL_MAX}</span>
                </span>
                {selectedPersonaIds.length === 0 && (
                  <span className="text-muted-foreground/80">
                    Pick at least one persona to score this campaign
                  </span>
                )}
              </div>
            </>
          )}
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
