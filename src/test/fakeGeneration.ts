/**
 * Fake-SSE helper for the wizard end-to-end test harness.
 *
 * `runGeneration` (src/pages/CreateCampaign.tsx) consumes the
 * `POST /api/campaigns/:id/generate` response as a stream of SSE
 * frames separated by `\n\n`, with each frame carrying an
 * `event: <name>\ndata: <json>` pair. The wizard only cares about
 * four event names: `start`, `slot`, `budget_exceeded`, `done` (plus
 * `error`).
 *
 * This helper builds a `ReadableStream<Uint8Array>` that emits a
 * realistic prologue (`start`), one frame per slot event, and an
 * epilogue (`done`) so a test can drive the wizard's Step 4 progress
 * UI through to `generationDone === true` without spinning up the
 * server. Mirrors the `parseFrame` contract exactly.
 */

export interface FakeSlotOk {
  promptId: string;
  campaignModelId: string;
  modelDisplayName: string;
  status: 'ok';
  tokensIn?: number | null;
  tokensOut?: number | null;
  latencyMs?: number;
  costUsd?: number | null;
  output?: string;
}

export interface FakeSlotError {
  promptId: string;
  campaignModelId: string;
  modelDisplayName: string;
  status: 'error';
  kind?: string;
  message?: string;
  latencyMs?: number;
}

export interface FakeSlotSkipped {
  promptId: string;
  campaignModelId: string;
  modelDisplayName: string;
  status: 'skipped_budget';
  reason?: string;
  estimatedUsd?: number;
  spentUsd?: number;
  capUsd?: number | null;
}

export type FakeSlotEvent = FakeSlotOk | FakeSlotError | FakeSlotSkipped;

export interface FakeGenerationOptions {
  /** Total slot count announced by the `start` frame. Defaults to events.length. */
  total?: number;
  /** USD budget echoed in the `start` frame. Defaults to null. */
  budgetUsd?: number | null;
  /**
   * When set, instead of a `done` epilogue the stream emits a
   * `budget_exceeded` frame after the last slot. Use this to exercise
   * the cap-reached banner without actually providing an event-level
   * skipped_budget slot.
   */
  budgetExceeded?: {
    reason: string;
    estimatedUsd: number;
    spentUsd: number;
    capUsd: number | null;
  };
  /** Override the `done` summary. Default sums `events`. */
  doneSummary?: {
    succeeded: number;
    failed: number;
    skippedForBudget?: number;
    spentUsd?: number;
  };
}

function fillOk(ev: FakeSlotOk): Required<FakeSlotOk> {
  return {
    promptId: ev.promptId,
    campaignModelId: ev.campaignModelId,
    modelDisplayName: ev.modelDisplayName,
    status: 'ok',
    tokensIn: ev.tokensIn ?? 12,
    tokensOut: ev.tokensOut ?? 24,
    latencyMs: ev.latencyMs ?? 200,
    costUsd: ev.costUsd ?? 0.001,
    output: ev.output ?? 'fake output',
  };
}

function fillError(ev: FakeSlotError): Required<FakeSlotError> {
  return {
    promptId: ev.promptId,
    campaignModelId: ev.campaignModelId,
    modelDisplayName: ev.modelDisplayName,
    status: 'error',
    kind: ev.kind ?? 'upstream',
    message: ev.message ?? 'simulated failure',
    latencyMs: ev.latencyMs ?? 100,
  };
}

function fillSkipped(ev: FakeSlotSkipped): Required<FakeSlotSkipped> {
  return {
    promptId: ev.promptId,
    campaignModelId: ev.campaignModelId,
    modelDisplayName: ev.modelDisplayName,
    status: 'skipped_budget',
    reason: ev.reason ?? 'cap',
    estimatedUsd: ev.estimatedUsd ?? 0.01,
    spentUsd: ev.spentUsd ?? 0.49,
    capUsd: ev.capUsd ?? 0.5,
  };
}

function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Build the SSE wire-text for a generation run. Useful in isolation
 * for unit tests; `fakeGenerationStream` wraps the same text in a
 * ReadableStream.
 */
export function fakeGenerationText(
  events: FakeSlotEvent[],
  options: FakeGenerationOptions = {},
): string {
  const total = options.total ?? events.length;
  const budgetUsd = options.budgetUsd ?? null;
  let body = frame('start', { total, budgetUsd });

  const filled = events.map((ev) => {
    if (ev.status === 'ok') return fillOk(ev);
    if (ev.status === 'error') return fillError(ev);
    return fillSkipped(ev);
  });

  for (const ev of filled) {
    body += frame('slot', ev);
  }

  if (options.budgetExceeded) {
    body += frame('budget_exceeded', options.budgetExceeded);
  }

  const succeeded =
    options.doneSummary?.succeeded ??
    filled.filter((e) => e.status === 'ok').length;
  const failed =
    options.doneSummary?.failed ??
    filled.filter((e) => e.status === 'error').length;
  const skippedForBudget =
    options.doneSummary?.skippedForBudget ??
    filled.filter((e) => e.status === 'skipped_budget').length;
  const spentUsd =
    options.doneSummary?.spentUsd ??
    filled.reduce(
      (s, e) => s + (e.status === 'ok' ? (e.costUsd ?? 0) : 0),
      0,
    );

  body += frame('done', { succeeded, failed, skippedForBudget, spentUsd });
  return body;
}

/**
 * Build a `ReadableStream<Uint8Array>` that emits the generation
 * frames synchronously inside `start`, then closes. The whole payload
 * lands in a single chunk — `runGeneration`'s frame-splitter already
 * handles multi-frame chunks correctly, and a single-chunk stream is
 * enough to exercise every code path in the consumer.
 */
export function fakeGenerationStream(
  events: FakeSlotEvent[],
  options: FakeGenerationOptions = {},
): ReadableStream<Uint8Array> {
  const text = fakeGenerationText(events, options);
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}
