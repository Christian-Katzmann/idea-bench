/**
 * Minimal OpenRouter client.
 *
 * - Non-streaming single-shot call per (prompt, model). We stream at the
 *   BATCH level (fan-out completions → SSE to operator), not at the token
 *   level. Token streaming adds complexity for no UX win here — the
 *   operator already sees per-slot progress in the progress bar.
 * - 60-second per-model timeout. Hard cap via `runWithTimeout` inside
 *   `durableCall` (see src/server/lib/durable-call).
 * - Resilience: `durableCall` retries transient failures (categorized
 *   via `categorizeError`) with exponential backoff, and a circuit
 *   breaker keyed per provider-model prevents hammering a provider
 *   that's already returning 5xx. Non-transient errors (4xx other than
 *   429, invalid JSON, empty completions, user-initiated aborts) surface
 *   immediately.
 * - Returns a discriminated union so callers route on `ok` rather than
 *   catching exceptions. Per-model failures don't propagate — that's
 *   the caller's job to handle.
 */

import {
  CircuitOpenError,
  durableCall,
} from './lib/durable-call/index.js';
import {
  categorizeError,
  shouldRetry,
  type ErrorCategory,
} from './lib/error-category/index.js';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const DEFAULT_TIMEOUT_MS = 60_000;

export interface OpenRouterCallInput {
  providerModelId: string;
  /** System instructions / context, passed as the system message. */
  context?: string | null;
  /** The user-facing prompt. */
  prompt: string;
  /** Optional knobs per campaign_models.params; pass as-is. */
  params?: Record<string, unknown>;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export type OpenRouterErrorKind =
  | 'timeout'
  | 'http'
  | 'network'
  | 'parse'
  | 'empty'
  | 'abort';

export type OpenRouterCallResult =
  | {
      ok: true;
      output: string;
      tokensIn: number | null;
      tokensOut: number | null;
      latencyMs: number;
      costUsd: number | null;
      providerResponseId: string | null;
    }
  | {
      ok: false;
      /** Short taxonomy describing WHERE the failure happened. Stable for callers. */
      kind: OpenRouterErrorKind;
      /** Retry-class: transient vs fatal. New in Phase 2 (durable-call). */
      category: ErrorCategory;
      status?: number;
      message: string;
      latencyMs: number;
    };

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key || key.length < 10) {
    throw new Error(
      'OPENROUTER_API_KEY is not set. Add it to .env.local or Vercel env.',
    );
  }
  return key;
}

function getReferer(): string {
  return process.env.OPENROUTER_APP_URL || 'https://idea-bench.local';
}

interface ChatCompletionResponse {
  id?: string;
  choices?: Array<{
    message?: { content?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number;
  };
  error?: { message?: string; code?: number | string };
}

interface AttemptSuccess {
  output: string;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  providerResponseId: string | null;
}

/**
 * Internal error thrown inside the attempt function. Carries the
 * OpenRouter-specific `kind` and optional HTTP status so the outer
 * catch can build the discriminated-union error variant and
 * `isTransientError` can make a retry decision via shouldRetry.
 */
class AttemptError extends Error {
  constructor(
    public kind: 'http' | 'network' | 'parse' | 'empty',
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'AttemptError';
  }
}

export async function callOpenRouter(
  input: OpenRouterCallInput,
): Promise<OpenRouterCallResult> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const t0 = Date.now();

  // The kit's durableCall owns retry + timeout + breaker. User-initiated
  // aborts (input.signal) must surface immediately without retry; we
  // track that in `userAborted` and gate retries on it.
  let userAborted = false;
  const checkUserAbort = () => {
    if (input.signal?.aborted) userAborted = true;
  };
  checkUserAbort();
  const onExternalAbort = () => {
    userAborted = true;
  };
  input.signal?.addEventListener('abort', onExternalAbort, { once: true });

  const attempt = async (timeoutSignal?: AbortSignal): Promise<AttemptSuccess> => {
    checkUserAbort();
    if (userAborted) {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    }

    // Merge the timeout signal from runWithTimeout with the caller's
    // signal so either can cancel the underlying fetch.
    const ac = new AbortController();
    if (timeoutSignal) {
      if (timeoutSignal.aborted) ac.abort(timeoutSignal.reason);
      else
        timeoutSignal.addEventListener('abort', () => ac.abort(timeoutSignal.reason), {
          once: true,
        });
    }
    if (input.signal) {
      if (input.signal.aborted) ac.abort(input.signal.reason);
      else
        input.signal.addEventListener('abort', () => ac.abort(input.signal!.reason), {
          once: true,
        });
    }

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (input.context && input.context.trim()) {
      messages.push({ role: 'system', content: input.context });
    }
    messages.push({ role: 'user', content: input.prompt });

    const body = {
      model: input.providerModelId,
      messages,
      ...(input.params ?? {}),
      usage: { include: true },
    };

    let res: Response;
    try {
      res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: 'POST',
        signal: ac.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getApiKey()}`,
          'HTTP-Referer': getReferer(),
          'X-Title': 'ïdea Bench',
        },
        body: JSON.stringify(body),
      });
    } catch (err: unknown) {
      // AbortError from either timeoutSignal or input.signal — re-throw
      // as-is so retry logic can distinguish (timeout → retry; user
      // abort → don't).
      if (err instanceof Error && err.name === 'AbortError') throw err;
      throw new AttemptError(
        'network',
        err instanceof Error ? err.message : String(err),
      );
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new AttemptError(
        'http',
        text.slice(0, 500) || `HTTP ${res.status}`,
        res.status,
      );
    }

    let json: ChatCompletionResponse;
    try {
      json = (await res.json()) as ChatCompletionResponse;
    } catch (err: unknown) {
      throw new AttemptError(
        'parse',
        err instanceof Error ? err.message : 'invalid JSON response',
      );
    }

    if (json.error?.message) {
      // Body-level error with 200 status (OpenRouter occasionally does this).
      // Treat as http-kind so the caller sees it the same as a 4xx/5xx.
      throw new AttemptError('http', json.error.message);
    }

    const content = json.choices?.[0]?.message?.content ?? '';
    if (!content.trim()) {
      throw new AttemptError('empty', 'model returned empty content');
    }

    return {
      output: content,
      tokensIn: json.usage?.prompt_tokens ?? null,
      tokensOut: json.usage?.completion_tokens ?? null,
      costUsd: typeof json.usage?.cost === 'number' ? json.usage.cost : null,
      providerResponseId: json.id ?? null,
    };
  };

  try {
    const success = await durableCall({
      // Key per provider-model so a breaker tripped on one model doesn't
      // block the rest of the fan-out. Narrow enough to isolate, broad
      // enough that repeated failures accumulate.
      key: `openrouter:${input.providerModelId}`,
      timeoutMs,
      attempt,
      retries: 2,
      baseDelayMs: 250,
      isTransientError: (err) => {
        checkUserAbort();
        if (userAborted) return false;
        if (err instanceof Error && err.name === 'AbortError') return false;
        if (err instanceof AttemptError) {
          // `empty` and `parse` are bugs on either end — don't retry.
          if (err.kind === 'empty' || err.kind === 'parse') return false;
          return shouldRetry(err, err.status);
        }
        // timeout from runWithTimeout — retry (another attempt with a
        // fresh timer might succeed under transient latency).
        if (err instanceof Error && err.message === 'timeout') return true;
        return false;
      },
    });
    return {
      ok: true,
      ...success,
      latencyMs: Date.now() - t0,
    };
  } catch (err: unknown) {
    input.signal?.removeEventListener('abort', onExternalAbort);
    const latencyMs = Date.now() - t0;
    return buildErrorResult(err, latencyMs, timeoutMs, userAborted);
  }
}

function buildErrorResult(
  err: unknown,
  latencyMs: number,
  timeoutMs: number,
  userAborted: boolean,
): OpenRouterCallResult {
  if (userAborted) {
    return {
      ok: false,
      kind: 'abort',
      category: 'unknown',
      message: 'aborted by caller',
      latencyMs,
    };
  }

  if (err instanceof CircuitOpenError) {
    return {
      ok: false,
      kind: 'network',
      category: 'server_unavailable',
      message: err.message,
      latencyMs,
    };
  }

  if (err instanceof AttemptError) {
    const category = categorizeError(err, err.status);
    return {
      ok: false,
      kind: err.kind,
      category,
      status: err.status,
      message: err.message,
      latencyMs,
    };
  }

  if (err instanceof Error && err.name === 'AbortError') {
    return {
      ok: false,
      kind: 'abort',
      category: 'unknown',
      message: err.message || 'aborted',
      latencyMs,
    };
  }

  if (err instanceof Error && err.message === 'timeout') {
    return {
      ok: false,
      kind: 'timeout',
      category: 'timeout',
      message: `timed out after ${timeoutMs}ms`,
      latencyMs,
    };
  }

  const msg = err instanceof Error ? err.message : String(err);
  return {
    ok: false,
    kind: 'network',
    category: categorizeError(err),
    message: msg,
    latencyMs,
  };
}
