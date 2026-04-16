import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import OperatorLayout from '../components/layout/OperatorLayout';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import {
  Check,
  ChevronRight,
  Loader2,
  Play,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { activeModels } from '../lib/models';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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
  const [step, setStep] = useState(1);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [prompts, setPrompts] = useState([{ text: '', context: '' }]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);

  // Generation state
  const [createError, setCreateError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationDone, setGenerationDone] = useState(false);
  const [campaign, setCampaign] = useState<CreatedCampaign | null>(null);
  const [slotTotal, setSlotTotal] = useState(0);
  const [slots, setSlots] = useState<Record<string, SlotEvent>>({});
  const [generateError, setGenerateError] = useState<string | null>(null);

  const handleNext = () => setStep((s) => Math.min(5, s + 1));
  const handleBack = () => setStep((s) => Math.max(1, s - 1));

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
      // Step A: create the campaign in the DB (prompts + models in one shot).
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

      // Step B: open the SSE stream and consume generation events.
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

  const handleLaunch = () => {
    if (!campaign) return;
    // Phase 2: navigate to the dashboard. Dashboard still reads from
    // mocks until Phase 3 wires it to real data.
    navigate(`/campaign/${campaign.id}`);
  };

  const slotValues: SlotEvent[] = Object.values(slots);
  const slotsReceived = slotValues.length;
  const succeeded = slotValues.filter((s) => s.status === 'ok').length;
  const failed = slotValues.filter((s) => s.status === 'error').length;
  const pct = slotTotal ? Math.round((slotsReceived / slotTotal) * 100) : 0;

  const MODELS = activeModels();

  return (
    <OperatorLayout>
      <div className="max-w-3xl mx-auto w-full">
        {/* Stepper */}
        <div className="flex items-center justify-between mb-8 relative">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-px bg-border -z-10" />
          {[1, 2, 3, 4, 5].map((s) => (
            <div
              key={s}
              className="flex flex-col items-center gap-2 bg-background px-2"
            >
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                  step === s
                    ? 'bg-primary text-primary-foreground'
                    : step > s
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card border border-border text-muted-foreground',
                )}
              >
                {step > s ? <Check className="w-4 h-4" /> : s}
              </div>
              <span
                className={cn(
                  'text-xs font-medium uppercase tracking-wider',
                  step >= s ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {s === 1
                  ? 'Basics'
                  : s === 2
                    ? 'Prompts'
                    : s === 3
                      ? 'Models'
                      : s === 4
                        ? 'Generate'
                        : 'Launch'}
              </span>
            </div>
          ))}
        </div>

        <Card className="shadow-none border-border bg-card rounded-xl">
          <CardContent className="p-8">
            {step === 1 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div>
                  <h2 className="text-[28px] font-semibold tracking-tight mb-1">
                    Campaign Basics
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    Define what you are evaluating.
                  </p>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="name"
                      className="text-muted-foreground text-xs uppercase tracking-wider"
                    >
                      Campaign Name
                    </Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g., Customer Support Response Quality"
                      className="bg-background border-border"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label
                      htmlFor="desc"
                      className="text-muted-foreground text-xs uppercase tracking-wider"
                    >
                      Description (shown to voters)
                    </Label>
                    <Textarea
                      id="desc"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Briefly explain what voters should look for..."
                      className="h-24 bg-background border-border"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                      Categories
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {SUGGESTED_TAGS.map((tag) => (
                        <Badge
                          key={tag}
                          variant={
                            categories.includes(tag) ? 'default' : 'outline'
                          }
                          className={cn(
                            'cursor-pointer',
                            categories.includes(tag)
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-background border-border text-muted-foreground hover:bg-foreground/5',
                          )}
                          onClick={() => toggleCategory(tag)}
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div>
                  <h2 className="text-[28px] font-semibold tracking-tight mb-1">
                    Prompts & Context
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    Add the prompts you want to evaluate.
                  </p>
                </div>
                <div className="space-y-6">
                  {prompts.map((prompt, idx) => (
                    <div
                      key={idx}
                      className="p-5 border border-border bg-background rounded-xl space-y-4 relative group"
                    >
                      {prompts.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-400 hover:bg-red-500/10"
                          onClick={() =>
                            setPrompts((p) => p.filter((_, i) => i !== idx))
                          }
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                      <div className="space-y-2">
                        <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                          Prompt {idx + 1}
                        </Label>
                        <Textarea
                          value={prompt.text}
                          onChange={(e) => {
                            const newP = [...prompts];
                            newP[idx].text = e.target.value;
                            setPrompts(newP);
                          }}
                          placeholder="Enter the prompt text..."
                          className="bg-card border-border"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                          Context (Optional)
                        </Label>
                        <Textarea
                          value={prompt.context}
                          onChange={(e) => {
                            const newP = [...prompts];
                            newP[idx].context = e.target.value;
                            setPrompts(newP);
                          }}
                          placeholder="Background information or system instructions..."
                          className="h-20 text-sm bg-card border-border"
                        />
                      </div>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    onClick={() =>
                      setPrompts([...prompts, { text: '', context: '' }])
                    }
                    className="w-full border-dashed border-border bg-background hover:bg-foreground/5 text-foreground"
                  >
                    <Plus className="w-4 h-4 mr-2" /> Add another prompt
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div>
                  <h2 className="text-[28px] font-semibold tracking-tight mb-1">
                    Select Models
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    Choose which models to pit against each other. Tournaments
                    require at least {MIN_MODELS}.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {MODELS.map((model) => (
                    <div
                      key={model.providerModelId}
                      onClick={() => toggleModel(model.providerModelId)}
                      className={cn(
                        'p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between',
                        selectedModels.includes(model.providerModelId)
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-background hover:border-border/80 text-foreground',
                      )}
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          {model.displayName}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
                          {model.providerModelId}
                        </div>
                      </div>
                      {selectedModels.includes(model.providerModelId) && (
                        <Check className="w-4 h-4 shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground">
                  {selectedModels.length} selected · need at least {MIN_MODELS}
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div>
                  <h2 className="text-[28px] font-semibold tracking-tight mb-1">
                    Generate & Preview
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    Running every prompt through every model via OpenRouter.
                    This creates the campaign and pre-generates all outputs
                    participants will vote on.
                  </p>
                </div>

                <div className="bg-background p-6 rounded-xl border border-border space-y-4">
                  <div className="flex justify-center gap-8 text-sm">
                    <div>
                      <span className="font-mono font-semibold text-foreground">
                        {prompts.filter((p) => p.text.trim()).length}
                      </span>{' '}
                      <span className="text-muted-foreground">Prompts</span>
                    </div>
                    <div>
                      <span className="font-mono font-semibold text-foreground">
                        {selectedModels.length}
                      </span>{' '}
                      <span className="text-muted-foreground">Models</span>
                    </div>
                    <div>
                      <span className="font-mono font-semibold text-foreground">
                        {prompts.filter((p) => p.text.trim()).length *
                          selectedModels.length}
                      </span>{' '}
                      <span className="text-muted-foreground">
                        Total Generations
                      </span>
                    </div>
                  </div>

                  {!isGenerating && slotsReceived === 0 && (
                    <Button
                      onClick={handleGenerate}
                      size="lg"
                      className="w-full max-w-sm mx-auto block bg-foreground text-background hover:bg-foreground/90"
                    >
                      <Play className="w-4 h-4 mr-2" /> Start Generation
                    </Button>
                  )}

                  {(isGenerating || slotsReceived > 0) && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-2">
                          {isGenerating ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />{' '}
                              Generating...
                            </>
                          ) : generationDone ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />{' '}
                              Done
                            </>
                          ) : null}
                        </span>
                        <span className="font-mono font-medium">
                          {slotsReceived}/{slotTotal} · {pct}%
                        </span>
                      </div>
                      <div className="h-2 bg-border rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      {(succeeded > 0 || failed > 0) && (
                        <div className="text-xs text-muted-foreground flex gap-3">
                          <span className="text-emerald-500">
                            ✓ {succeeded} succeeded
                          </span>
                          {failed > 0 && (
                            <span className="text-red-400">
                              ✗ {failed} failed
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {createError && (
                    <div className="p-3 rounded-md bg-red-500/10 border border-red-500/30 text-red-500 text-sm flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{createError}</span>
                    </div>
                  )}
                  {generateError && (
                    <div className="p-3 rounded-md bg-red-500/10 border border-red-500/30 text-red-500 text-sm flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{generateError}</span>
                    </div>
                  )}
                </div>

                {/* Output preview */}
                {slotValues.length > 0 && (
                  <div className="space-y-3">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Outputs as they arrive
                    </div>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {slotValues.map((slot) => (
                        <div
                          key={slotKey(
                            slot.promptId,
                            slot.campaignModelId,
                          )}
                          className={cn(
                            'p-3 rounded-md border text-sm',
                            slot.status === 'ok'
                              ? 'bg-background border-border'
                              : 'bg-red-500/5 border-red-500/30',
                          )}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-foreground">
                              {slot.modelDisplayName}
                            </span>
                            <span className="font-mono text-xs text-muted-foreground">
                              {slot.status === 'ok'
                                ? `${slot.tokensOut ?? '?'} tok · ${slot.latencyMs}ms`
                                : `error · ${slot.latencyMs}ms`}
                            </span>
                          </div>
                          {slot.status === 'ok' ? (
                            <div className="whitespace-pre-wrap text-foreground/90 font-mono text-xs leading-relaxed line-clamp-3">
                              {slot.output}
                            </div>
                          ) : (
                            <div className="text-red-400 text-xs">
                              <span className="uppercase font-medium">
                                {slot.kind}
                              </span>
                              : {slot.message}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 5 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 text-center py-8">
                <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
                  <Check className="w-8 h-8" />
                </div>
                <h2 className="text-[28px] font-semibold tracking-tight">
                  Ready to launch
                </h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Campaign &quot;{name}&quot; is saved as a draft with{' '}
                  {succeeded} successful generations
                  {failed > 0 ? ` and ${failed} failures to review` : ''}. The
                  dashboard has the share link once you open it.
                </p>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
              <Button
                variant="ghost"
                onClick={handleBack}
                disabled={step === 1 || isGenerating}
                className="text-muted-foreground hover:text-foreground hover:bg-foreground/5"
              >
                Back
              </Button>
              {step < 5 ? (
                <Button
                  onClick={handleNext}
                  disabled={
                    (step === 1 && !name) ||
                    (step === 2 && !prompts[0].text) ||
                    (step === 3 && selectedModels.length < MIN_MODELS) ||
                    (step === 4 && !generationDone) ||
                    isGenerating
                  }
                  className="bg-foreground text-background hover:bg-foreground/90"
                >
                  Next <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button
                  onClick={handleLaunch}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Open dashboard
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </OperatorLayout>
  );
}

function slotKey(promptId: string, campaignModelId: string): string {
  return `${promptId}:${campaignModelId}`;
}

/**
 * Consume the SSE stream from /api/campaigns/:id/generate. Uses fetch +
 * ReadableStream because EventSource is GET-only. The protocol is small
 * enough that hand-parsing SSE frames is simpler than pulling in a lib.
 */
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

    // SSE events are separated by a blank line.
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
    if (line.startsWith(':')) continue; // comment / keep-alive
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
