/**
 * SimulatedRunDialog — operator configurator for launching a Plan 02
 * simulated run. Generic panel only in Phase 1; persona-panel surfaces
 * come in Phase 2.
 *
 * Mechanics:
 *   - Voter count slider/input (10..500)
 *   - Cost-estimate band, refreshed on every change via
 *     POST /api/simulated-runs/preview-cost
 *   - Max concurrency + cost-ceiling override behind an "Advanced" toggle
 *   - Submit posts to POST /api/simulated-runs, then the parent handles
 *     launching the SSE stream
 *
 * Cross-family exclusion is displayed as an info chip — NOT a toggle.
 * Plan 02's bias mitigations ship together; making it optional would
 * be worse than not shipping simulated runs.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, ShieldCheck, Info, Sparkles, Users2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from '../ui/toast';
import {
  ApiError,
  apiFetch,
  type PanelType,
  type Persona,
  type SimulatedRunCostEstimate,
  type SimulatedRunSummary,
} from '../../lib/api';
import { cn } from '../../lib/utils';

export interface SimulatedRunDialogProps {
  open: boolean;
  campaignId: string;
  onOpenChange: (open: boolean) => void;
  /** Fires after a successful create. The parent kicks the SSE run. */
  onCreated: (runId: string, summary: SimulatedRunSummary) => void;
}

const DEFAULT_VOTER_COUNT = 30;
const MIN_VOTER_COUNT = 10;
const MAX_VOTER_COUNT = 500;

export function SimulatedRunDialog({
  open,
  campaignId,
  onOpenChange,
  onCreated,
}: SimulatedRunDialogProps) {
  const [panelType, setPanelType] = useState<PanelType>('generic');
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>([]);
  const [voterCount, setVoterCount] = useState<number>(DEFAULT_VOTER_COUNT);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [maxConcurrency, setMaxConcurrency] = useState<number>(5);
  const [ceilingOverride, setCeilingOverride] = useState<string>('');

  // Reset state each time the dialog opens — avoids stale values from a
  // prior launch bleeding into the next one.
  useEffect(() => {
    if (open) {
      setPanelType('generic');
      setSelectedPersonaIds([]);
      setVoterCount(DEFAULT_VOTER_COUNT);
      setShowAdvanced(false);
      setMaxConcurrency(5);
      setCeilingOverride('');
    }
  }, [open]);

  const personasQuery = useQuery({
    queryKey: ['personas-for-run'],
    enabled: open,
    queryFn: () =>
      apiFetch<{ personas: Persona[] }>(`/api/personas`),
    staleTime: 30_000,
  });

  const previewQuery = useQuery({
    queryKey: ['simulated-run-preview', campaignId, voterCount],
    enabled: open && Number.isInteger(voterCount) && voterCount > 0,
    queryFn: () =>
      apiFetch<{
        estimate: SimulatedRunCostEstimate;
        defaultCeilingUsd: number;
        promptsByMode: Record<string, number>;
        campaignModelCount: number;
      }>(`/api/simulated-runs/preview-cost`, {
        method: 'POST',
        body: JSON.stringify({ campaignId, voterCount }),
      }),
    staleTime: 1000,
  });

  const ceilingDisplay = useMemo(() => {
    if (ceilingOverride.trim()) {
      const parsed = parseFloat(ceilingOverride);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return previewQuery.data?.defaultCeilingUsd ?? null;
  }, [ceilingOverride, previewQuery.data?.defaultCeilingUsd]);

  const launchMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        campaignId,
        panelType,
        voterCount,
        maxConcurrency,
      };
      if (panelType === 'persona') {
        body.personaIds = selectedPersonaIds;
      }
      if (ceilingOverride.trim()) {
        const parsed = parseFloat(ceilingOverride);
        if (Number.isFinite(parsed) && parsed > 0) body.costCeilingUsd = parsed;
      }
      return apiFetch<{ run: SimulatedRunSummary; seatsCreated: number }>(
        '/api/simulated-runs',
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
      );
    },
    onSuccess: (result) => {
      toast.success('Simulated run created', {
        details: `${result.seatsCreated} seats · launching…`,
      });
      onCreated(result.run.id, result.run);
    },
    onError: (err) => {
      toast.error('Could not create simulated run', {
        details:
          err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err),
      });
    },
  });

  const voterCountValid =
    Number.isInteger(voterCount) &&
    voterCount >= MIN_VOTER_COUNT &&
    voterCount <= MAX_VOTER_COUNT;
  const personaChoiceValid =
    panelType === 'generic' || selectedPersonaIds.length > 0;
  const submitDisabled =
    launchMutation.isPending ||
    !voterCountValid ||
    !personaChoiceValid ||
    previewQuery.isError ||
    !previewQuery.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Launch a simulated run</DialogTitle>
          <DialogDescription>
            Cheap, diverse LLM judges vote on this campaign's outputs the
            same way humans do. Ratings appear on the dashboard under the
            &ldquo;Simulated&rdquo; filter; a combined &ldquo;Both&rdquo; view is the
            default.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <PanelTypePicker
            value={panelType}
            onChange={(v) => {
              setPanelType(v);
              if (v === 'generic') setSelectedPersonaIds([]);
            }}
          />

          {panelType === 'persona' ? (
            <PersonaPicker
              loading={personasQuery.isLoading}
              personas={personasQuery.data?.personas ?? []}
              selected={selectedPersonaIds}
              onChange={setSelectedPersonaIds}
            />
          ) : null}

          <div className="space-y-2">
            <Label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Voter count
            </Label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={MIN_VOTER_COUNT}
                max={MAX_VOTER_COUNT}
                step={5}
                value={voterCount}
                onChange={(e) => setVoterCount(parseInt(e.target.value, 10))}
                className="flex-1 accent-foreground"
                aria-label="Voter count"
              />
              <Input
                type="number"
                min={MIN_VOTER_COUNT}
                max={MAX_VOTER_COUNT}
                value={voterCount}
                onChange={(e) => {
                  const parsed = parseInt(e.target.value, 10);
                  if (Number.isFinite(parsed)) setVoterCount(parsed);
                }}
                className="w-24 font-mono tabular-nums text-right"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Range {MIN_VOTER_COUNT}&ndash;{MAX_VOTER_COUNT}. More voters = tighter
              confidence intervals, but higher cost.
            </p>
          </div>

          {/* Bias safeguard — informational, not toggleable. */}
          <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-highlight p-3 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-foreground" />
            <div className="space-y-1">
              <p className="font-medium text-foreground">
                Cross-family exclusion: on
              </p>
              <p>
                A Claude judge never votes on Claude outputs. Same for every
                other family. This prevents a measurable self-preference
                bias (~5&ndash;10% over blinded human judgment) that single-judge
                LLM-as-judge setups leak into ratings.
              </p>
            </div>
          </div>

          <CostEstimateBlock
            loading={previewQuery.isLoading}
            data={previewQuery.data ?? null}
            ceilingUsd={ceilingDisplay}
            error={previewQuery.error instanceof Error ? previewQuery.error.message : null}
          />

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex w-full items-center gap-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
            >
              <span>{showAdvanced ? 'Hide' : 'Show'} advanced</span>
              <span
                className={cn(
                  'text-muted-foreground transition-transform',
                  showAdvanced && 'rotate-90',
                )}
                aria-hidden
              >
                &rsaquo;
              </span>
            </button>
            {showAdvanced ? (
              <div className="space-y-4 rounded-lg border border-border bg-card p-3">
                <div className="space-y-2">
                  <Label
                    htmlFor="max-concurrency"
                    className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
                  >
                    Max concurrency
                  </Label>
                  <Input
                    id="max-concurrency"
                    type="number"
                    min={1}
                    max={25}
                    value={maxConcurrency}
                    onChange={(e) => {
                      const parsed = parseInt(e.target.value, 10);
                      if (Number.isFinite(parsed))
                        setMaxConcurrency(Math.max(1, Math.min(25, parsed)));
                    }}
                    className="w-24 font-mono tabular-nums text-right"
                  />
                  <p className="text-xs text-muted-foreground">
                    Parallel judge seats. Higher = faster, but can stress
                    OpenRouter rate limits on the chosen model mix.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="ceiling-override"
                    className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
                  >
                    Cost ceiling override (USD)
                  </Label>
                  <Input
                    id="ceiling-override"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder={
                      previewQuery.data?.defaultCeilingUsd
                        ? previewQuery.data.defaultCeilingUsd.toFixed(2)
                        : 'auto (2× estimate)'
                    }
                    value={ceilingOverride}
                    onChange={(e) => setCeilingOverride(e.target.value)}
                    className="w-32 font-mono tabular-nums"
                  />
                  <p className="text-xs text-muted-foreground">
                    Run aborts if actual cost exceeds this. Leave blank for
                    the default (2&times; the estimate).
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={launchMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => launchMutation.mutate()}
            disabled={submitDisabled}
          >
            {launchMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Creating&hellip;
              </>
            ) : (
              'Launch simulated run'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PanelTypePicker({
  value,
  onChange,
}: {
  value: PanelType;
  onChange: (v: PanelType) => void;
}) {
  const options: Array<{
    value: PanelType;
    label: string;
    hint: string;
    icon: typeof Users2;
  }> = [
    {
      value: 'generic',
      label: 'Generic',
      hint: 'Cross-family quality panel — one leaderboard under "Simulated".',
      icon: Users2,
    },
    {
      value: 'persona',
      label: 'Persona',
      hint: 'Judges evaluate from specific roles — per-persona leaderboards.',
      icon: Sparkles,
    },
  ];
  return (
    <div className="space-y-2">
      <Label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        Panel type
      </Label>
      <div className="grid grid-cols-2 gap-2">
        {options.map((opt) => {
          const active = opt.value === value;
          const Icon = opt.icon;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition',
                active
                  ? 'border-foreground bg-surface-highlight'
                  : 'border-border bg-card hover:border-foreground/40',
              )}
            >
              <div className="flex items-center gap-2">
                <Icon
                  className={cn(
                    'size-4',
                    active ? 'text-foreground' : 'text-muted-foreground',
                  )}
                />
                <span className="text-sm font-medium">{opt.label}</span>
              </div>
              <p className="text-xs text-muted-foreground">{opt.hint}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PersonaPicker({
  loading,
  personas,
  selected,
  onChange,
}: {
  loading: boolean;
  personas: Persona[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const selectedSet = new Set(selected);
  return (
    <div className="space-y-2">
      <Label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        Personas
      </Label>
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading personas…</p>
      ) : personas.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
          Your persona library is empty. Create at least one persona
          before launching a persona-panel run — the{' '}
          <a
            href="/personas"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Personas page
          </a>{' '}
          walks you through authoring.
        </div>
      ) : (
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border bg-card p-2">
          {personas.map((p) => {
            const active = selectedSet.has(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() =>
                  onChange(
                    active
                      ? selected.filter((id) => id !== p.id)
                      : [...selected, p.id],
                  )
                }
                className={cn(
                  'flex w-full items-start gap-3 rounded-md px-3 py-2 text-left text-sm transition',
                  active
                    ? 'bg-surface-highlight'
                    : 'hover:bg-surface-highlight/50',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex size-4 items-center justify-center rounded border',
                    active
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border',
                  )}
                  aria-hidden
                >
                  {active ? '✓' : ''}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {p.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        {selected.length === 0
          ? 'Pick at least one persona — seats are distributed evenly across your picks.'
          : `${selected.length} persona${selected.length === 1 ? '' : 's'} selected.`}
      </p>
    </div>
  );
}

function CostEstimateBlock({
  loading,
  data,
  ceilingUsd,
  error,
}: {
  loading: boolean;
  data: {
    estimate: SimulatedRunCostEstimate;
    defaultCeilingUsd: number;
    promptsByMode: Record<string, number>;
    campaignModelCount: number;
  } | null;
  ceilingUsd: number | null;
  error: string | null;
}) {
  if (error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
        Couldn&rsquo;t compute estimate: {error}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-baseline justify-between gap-3">
        <Label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Cost estimate
        </Label>
        {loading ? (
          <Loader2 className="size-3 animate-spin text-muted-foreground" />
        ) : null}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold font-mono tabular-nums">
          {loading || !data ? '—' : `$${data.estimate.estimatedUsd.toFixed(2)}`}
        </span>
        {data ? (
          <span className="text-xs text-muted-foreground font-mono tabular-nums">
            range ${data.estimate.lowUsd.toFixed(2)}–$
            {data.estimate.highUsd.toFixed(2)}
          </span>
        ) : null}
      </div>
      {data ? (
        <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <span className="text-muted-foreground">Total calls</span>
          <span className="font-mono tabular-nums">
            {data.estimate.totalCalls.toLocaleString()}
          </span>
          <span className="text-muted-foreground">Ceiling</span>
          <span className="font-mono tabular-nums">
            {ceilingUsd != null ? `$${ceilingUsd.toFixed(2)}` : '—'}
          </span>
        </div>
      ) : null}
      <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <Info className="mt-0.5 size-3 shrink-0" />
        <span>
          Estimates use blended per-token pricing from your judge mix. Actual
          cost is tracked live — the run aborts if it breaches the ceiling.
        </span>
      </p>
    </div>
  );
}
