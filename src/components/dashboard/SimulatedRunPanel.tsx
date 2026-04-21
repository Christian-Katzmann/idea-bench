/**
 * SimulatedRunPanel — dashboard card that lets the operator launch and
 * monitor Plan 02 simulated runs. Three states:
 *
 *   1. Idle           — "Launch simulated run" CTA + list of past runs
 *   2. Streaming      — SSE progress bar + live seat counts, abort button
 *   3. Completed/Err  — summary of the last run, link to relaunch
 *
 * The SSE connection lives in this component for a single reason: it
 * needs to update counters in real time without polling the detail
 * endpoint. We keep a tiny in-memory state machine here; on unmount
 * (tab change, dialog close) the EventSource is closed, but the run
 * itself keeps progressing server-side and can be rejoined by hitting
 * the detail endpoint or re-launching the same run id.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  ActivitySquare,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  PlayCircle,
  StopCircle,
  Timer,
} from 'lucide-react';
import { SimulatedRunDialog } from './SimulatedRunDialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { Skeleton } from '../ui/skeleton';
import { toast } from '../ui/toast';
import {
  ApiError,
  apiFetch,
  type SimulatedRunDetail,
  type SimulatedRunStatus,
  type SimulatedRunSummary,
} from '../../lib/api';
import { cn } from '../../lib/utils';

interface LiveRunState {
  runId: string;
  seatsTotal: number;
  seatsCompleted: number;
  seatsFailed: number;
  callsMade: number;
  callsSkipped: number;
  callsFailed: number;
  costActualUsd: number;
  costCeilingUsd: number | null;
  status: SimulatedRunStatus | 'streaming';
  lastEvent: string | null;
}

export function SimulatedRunPanel({ campaignId }: { campaignId: string }) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [liveRun, setLiveRun] = useState<LiveRunState | null>(null);

  const runsQuery = useQuery({
    queryKey: ['simulated-runs', campaignId],
    queryFn: () =>
      apiFetch<{ runs: SimulatedRunSummary[] }>(
        `/api/simulated-runs?campaignId=${campaignId}`,
      ),
    refetchInterval: liveRun ? false : 15_000,
  });

  // Stream driver: opens an SSE EventSource to /run, maps events to
  // liveRun state, closes on unmount. We don't rely on EventSource to
  // keep the connection alive across tab changes — the run is durable
  // so the operator can reconnect by polling the detail endpoint.
  const abortRef = useRef<AbortController | null>(null);
  const startStream = useCallback(
    async (runId: string) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLiveRun({
        runId,
        seatsTotal: 0,
        seatsCompleted: 0,
        seatsFailed: 0,
        callsMade: 0,
        callsSkipped: 0,
        callsFailed: 0,
        costActualUsd: 0,
        costCeilingUsd: null,
        status: 'streaming',
        lastEvent: 'opening stream…',
      });

      try {
        // `?action=run` folds the two-segment route into one so the
        // single-segment Vercel catch-all can dispatch. See the
        // dispatcher at api/simulated-runs/[...path].ts for why.
        const res = await fetch(`/api/simulated-runs/${runId}?action=run`, {
          method: 'POST',
          signal: ac.signal,
          headers: { accept: 'text/event-stream' },
        });
        if (!res.ok || !res.body) {
          throw new Error(`run launch failed: HTTP ${res.status}`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buf.indexOf('\n\n')) !== -1) {
            const chunk = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            handleSseChunk(chunk, runId);
          }
        }
      } catch (err) {
        if (!ac.signal.aborted) {
          toast.error('Simulated run stream failed', {
            details:
              err instanceof Error ? err.message : String(err),
          });
        }
      } finally {
        qc.invalidateQueries({ queryKey: ['simulated-runs', campaignId] });
        qc.invalidateQueries({ queryKey: ['campaign', campaignId] });
      }
    },
    [qc, campaignId],
  );

  // Parse one SSE chunk (event: / data: lines) and update liveRun.
  const handleSseChunk = useCallback((chunk: string, runId: string) => {
    const lines = chunk.split('\n');
    let eventName = '';
    let data = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) eventName = line.slice(7).trim();
      else if (line.startsWith('data: ')) data += line.slice(6);
    }
    if (!eventName) return;
    let payload: unknown = null;
    try {
      payload = JSON.parse(data);
    } catch {
      // data may be a raw string; ignore
    }
    setLiveRun((prev) => {
      const base = prev ?? {
        runId,
        seatsTotal: 0,
        seatsCompleted: 0,
        seatsFailed: 0,
        callsMade: 0,
        callsSkipped: 0,
        callsFailed: 0,
        costActualUsd: 0,
        costCeilingUsd: null,
        status: 'streaming' as const,
        lastEvent: null,
      };
      const p = payload as Partial<LiveRunState> & Record<string, unknown>;
      const next: LiveRunState = {
        ...base,
        seatsTotal: typeof p?.seatsTotal === 'number' ? p.seatsTotal : base.seatsTotal,
        seatsCompleted:
          typeof p?.seatsCompleted === 'number'
            ? p.seatsCompleted
            : base.seatsCompleted,
        seatsFailed:
          typeof p?.seatsFailed === 'number' ? p.seatsFailed : base.seatsFailed,
        callsMade:
          typeof p?.callsMade === 'number' ? p.callsMade : base.callsMade,
        callsSkipped:
          typeof p?.callsSkipped === 'number' ? p.callsSkipped : base.callsSkipped,
        callsFailed:
          typeof p?.callsFailed === 'number' ? p.callsFailed : base.callsFailed,
        costActualUsd:
          typeof p?.costActualUsd === 'number'
            ? p.costActualUsd
            : base.costActualUsd,
        costCeilingUsd:
          typeof p?.costCeilingUsd === 'number'
            ? p.costCeilingUsd
            : base.costCeilingUsd,
        lastEvent: `${eventName}${typeof p?.message === 'string' ? ': ' + p.message : ''}`,
        status:
          eventName === 'done'
            ? (p?.status as SimulatedRunStatus) ?? 'complete'
            : base.status,
      };
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const abortMutation = useMutation({
    mutationFn: (runId: string) =>
      apiFetch<{ ok: true; status: SimulatedRunStatus }>(
        `/api/simulated-runs/${runId}?action=abort`,
        { method: 'POST' },
      ),
    onSuccess: (result) => {
      toast.success(`Run ${result.status}`);
      abortRef.current?.abort();
      qc.invalidateQueries({ queryKey: ['simulated-runs', campaignId] });
    },
    onError: (err) => {
      toast.error('Abort failed', {
        details:
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err),
      });
    },
  });

  const handleCreated = useCallback(
    async (runId: string) => {
      setDialogOpen(false);
      void startStream(runId);
    },
    [startStream],
  );

  const activeRun = useMemo(() => {
    const runs = runsQuery.data?.runs ?? [];
    return runs.find(
      (r) => r.status === 'pending' || r.status === 'running',
    );
  }, [runsQuery.data?.runs]);

  const pastRuns = useMemo(() => {
    const runs = runsQuery.data?.runs ?? [];
    return runs.filter(
      (r) => r.status !== 'pending' && r.status !== 'running',
    );
  }, [runsQuery.data?.runs]);

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">
            Simulated runs
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Cheap LLM judges vote on this campaign&rsquo;s outputs alongside
            human voters.
          </p>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          disabled={!!liveRun || !!activeRun}
        >
          <PlayCircle className="size-4" /> Launch run
        </Button>
      </header>

      <div className="p-5 space-y-5">
        {liveRun ? (
          <LiveRunCard
            state={liveRun}
            onAbort={() =>
              liveRun.runId ? abortMutation.mutate(liveRun.runId) : undefined
            }
            aborting={abortMutation.isPending}
          />
        ) : activeRun ? (
          <ResumeCard
            run={activeRun}
            onResume={() => startStream(activeRun.id)}
          />
        ) : null}

        <PastRunsList
          loading={runsQuery.isLoading}
          runs={pastRuns}
        />
      </div>

      <SimulatedRunDialog
        open={dialogOpen}
        campaignId={campaignId}
        onOpenChange={setDialogOpen}
        onCreated={(runId) => void handleCreated(runId)}
      />
    </section>
  );
}

function LiveRunCard({
  state,
  onAbort,
  aborting,
}: {
  state: LiveRunState;
  onAbort: () => void;
  aborting: boolean;
}) {
  const pct =
    state.seatsTotal > 0
      ? Math.min(
          100,
          Math.round(
            ((state.seatsCompleted + state.seatsFailed) / state.seatsTotal) *
              100,
          ),
        )
      : 0;
  const ceilingHit =
    state.costCeilingUsd != null && state.costActualUsd >= state.costCeilingUsd;
  const terminal =
    state.status !== 'streaming' && state.status !== 'running';
  return (
    <div className="rounded-lg border border-border bg-surface-highlight p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {terminal ? (
            state.status === 'complete' ? (
              <CheckCircle2 className="size-4 text-foreground" />
            ) : (
              <AlertTriangle className="size-4 text-foreground" />
            )
          ) : (
            <Loader2 className="size-4 animate-spin text-foreground" />
          )}
          <span className="text-sm font-medium">
            {terminal ? state.status : 'Running…'}
          </span>
        </div>
        {!terminal ? (
          <Button
            size="sm"
            variant="outline"
            onClick={onAbort}
            disabled={aborting}
          >
            {aborting ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <StopCircle className="size-3" />
            )}
            Abort
          </Button>
        ) : null}
      </div>
      <div className="mt-3 space-y-1">
        <Progress value={pct} />
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-muted-foreground">
            {state.seatsCompleted + state.seatsFailed} / {state.seatsTotal}{' '}
            seats
          </span>
          <span className="font-mono tabular-nums">{pct}%</span>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-y-2 gap-x-6 text-xs sm:grid-cols-4">
        <Stat label="Calls" value={state.callsMade.toLocaleString()} />
        <Stat label="Skipped" value={state.callsSkipped.toLocaleString()} />
        <Stat label="Failed" value={state.callsFailed.toLocaleString()} />
        <Stat
          label="Cost"
          value={
            state.costActualUsd > 0 ? `$${state.costActualUsd.toFixed(2)}` : '$0.00'
          }
          mono
        />
      </dl>
      {ceilingHit ? (
        <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
          Cost ceiling reached — run stopped to protect the budget.
        </p>
      ) : null}
      {state.lastEvent ? (
        <p className="mt-3 truncate text-[11px] text-muted-foreground">
          <Timer className="mr-1 inline size-3" />
          {state.lastEvent}
        </p>
      ) : null}
    </div>
  );
}

function ResumeCard({
  run,
  onResume,
}: {
  run: SimulatedRunSummary;
  onResume: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-surface-highlight p-4">
      <div>
        <p className="text-sm font-medium">Run in progress — disconnected</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {run.voterCount} seats · $
          {(run.costActualUsd ?? 0).toFixed(2)} spent
        </p>
      </div>
      <Button size="sm" onClick={onResume}>
        <PlayCircle className="size-3" /> Resume stream
      </Button>
    </div>
  );
}

function PastRunsList({
  loading,
  runs,
}: {
  loading: boolean;
  runs: SimulatedRunSummary[];
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }
  if (runs.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No simulated runs yet. Launch one to see LLM-judge ratings
        alongside human votes.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {runs.map((r) => (
        <li
          key={r.id}
          className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-xs"
        >
          <div className="flex items-center gap-3">
            <StatusDot status={r.status} />
            <span className="font-mono tabular-nums">
              {r.voterCount} seats
            </span>
            <span className="text-muted-foreground">
              {new Date(r.createdAt).toLocaleString()}
            </span>
            {r.panelType === 'persona' ? (
              <Badge
                variant="secondary"
                title={
                  r.personaIds && r.personaIds.length > 0
                    ? `${r.personaIds.length} persona${r.personaIds.length === 1 ? '' : 's'}`
                    : 'Persona panel'
                }
              >
                Persona
                {r.personaIds && r.personaIds.length > 0
                  ? ` · ${r.personaIds.length}`
                  : ''}
              </Badge>
            ) : (
              <Badge variant="outline">Generic</Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono tabular-nums">
              ${(r.costActualUsd ?? 0).toFixed(2)}
              {r.costEstimateUsd != null ? (
                <span className="text-muted-foreground">
                  {' '}
                  / est ${r.costEstimateUsd.toFixed(2)}
                </span>
              ) : null}
            </span>
            <span className="font-medium capitalize">{r.status}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Stat({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </dt>
      <dd className={cn('text-sm font-medium', mono && 'font-mono tabular-nums')}>
        {value}
      </dd>
    </div>
  );
}

function StatusDot({ status }: { status: SimulatedRunStatus }) {
  const color =
    status === 'complete'
      ? 'bg-foreground'
      : status === 'failed' || status === 'aborted'
        ? 'bg-destructive'
        : 'bg-muted-foreground';
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('size-1.5 rounded-full', color)} aria-hidden />
      <ActivitySquare className="size-3 text-muted-foreground" />
    </span>
  );
}

/**
 * Hook helper: load a run's detail on demand. Kept external to
 * SimulatedRunPanel so a future per-run drill-down page can reuse it
 * without re-wiring the SSE machinery.
 */
export function useSimulatedRunDetail(runId: string | null) {
  return useQuery({
    queryKey: ['simulated-run-detail', runId],
    queryFn: () =>
      apiFetch<SimulatedRunDetail>(`/api/simulated-runs/${runId}`),
    enabled: !!runId,
  });
}
