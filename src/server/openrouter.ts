/**
 * Minimal OpenRouter client.
 *
 * - Non-streaming single-shot call per (prompt, model). We stream at the
 *   BATCH level (fan-out completions → SSE to operator), not at the token
 *   level. Token streaming adds complexity for no UX win here — the
 *   operator already sees per-slot progress in the progress bar.
 * - 60-second per-model timeout. Hard cap via AbortController.
 * - Returns a discriminated union so callers route on `ok` rather than
 *   catching exceptions. Per-model failures don't propagate — that's the
 *   caller's job to handle.
 *
 * OpenRouter accepts OpenAI-compatible `/v1/chat/completions`. The only
 * provider-specific bits we use are the `Authorization: Bearer ...` header
 * and the `usage` + `id` fields in the response.
 */

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

export type OpenRouterCallResult =
  | {
      ok: true;
      output: string;
      tokensIn: number | null;
      tokensOut: number | null;
      latencyMs: number;
      /** USD cost reported by OpenRouter, if present. */
      costUsd: number | null;
      /** OpenRouter request id for debugging. */
      providerResponseId: string | null;
    }
  | {
      ok: false;
      /** Short taxonomy for callers; full detail in `message`. */
      kind: 'timeout' | 'http' | 'network' | 'parse' | 'empty' | 'abort';
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
  // OpenRouter asks callers to send their app URL for leaderboard/routing.
  // Not required, but good citizenship.
  return process.env.OPENROUTER_APP_URL || 'https://modelarena.local';
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
    cost?: number; // OpenRouter-specific: USD cost
  };
  error?: { message?: string; code?: number | string };
}

export async function callOpenRouter(
  input: OpenRouterCallInput,
): Promise<OpenRouterCallResult> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const t0 = Date.now();

  const ac = new AbortController();
  const linkedSignal = input.signal;
  if (linkedSignal) {
    if (linkedSignal.aborted) ac.abort(linkedSignal.reason);
    else linkedSignal.addEventListener('abort', () => ac.abort(linkedSignal.reason), { once: true });
  }
  const timer = setTimeout(() => ac.abort(new Error('timeout')), timeoutMs);

  const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
  if (input.context && input.context.trim()) {
    messages.push({ role: 'system', content: input.context });
  }
  messages.push({ role: 'user', content: input.prompt });

  const body = {
    model: input.providerModelId,
    messages,
    ...(input.params ?? {}),
    // Ask OpenRouter to include per-request usage cost in the response.
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
        'X-Title': 'ModelArena',
      },
      body: JSON.stringify(body),
    });
  } catch (err: unknown) {
    clearTimeout(timer);
    const latencyMs = Date.now() - t0;
    if (ac.signal.aborted) {
      const reason = ac.signal.reason;
      const isTimeout = reason instanceof Error && reason.message === 'timeout';
      return {
        ok: false,
        kind: isTimeout ? 'timeout' : 'abort',
        message: isTimeout ? `timed out after ${timeoutMs}ms` : 'aborted',
        latencyMs,
      };
    }
    return {
      ok: false,
      kind: 'network',
      message: err instanceof Error ? err.message : String(err),
      latencyMs,
    };
  }
  clearTimeout(timer);

  const latencyMs = Date.now() - t0;

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return {
      ok: false,
      kind: 'http',
      status: res.status,
      message: text.slice(0, 500) || `HTTP ${res.status}`,
      latencyMs,
    };
  }

  let json: ChatCompletionResponse;
  try {
    json = (await res.json()) as ChatCompletionResponse;
  } catch (err: unknown) {
    return {
      ok: false,
      kind: 'parse',
      message: err instanceof Error ? err.message : 'invalid JSON response',
      latencyMs,
    };
  }

  if (json.error?.message) {
    return { ok: false, kind: 'http', message: json.error.message, latencyMs };
  }

  const content = json.choices?.[0]?.message?.content ?? '';
  if (!content.trim()) {
    return {
      ok: false,
      kind: 'empty',
      message: 'model returned empty content',
      latencyMs,
    };
  }

  return {
    ok: true,
    output: content,
    tokensIn: json.usage?.prompt_tokens ?? null,
    tokensOut: json.usage?.completion_tokens ?? null,
    latencyMs,
    costUsd: typeof json.usage?.cost === 'number' ? json.usage.cost : null,
    providerResponseId: json.id ?? null,
  };
}
