/**
 * Tests for the observability wrapper composed into toVercelHandler.
 * Verifies: request IDs are attached to success + error responses,
 * thrown errors become normalized JSON with matching body.id, request
 * IDs supplied by the caller are preserved, and SSE-style streaming
 * responses retain the ID header.
 */
import { describe, it, expect, vi } from 'vitest';
import { withApiErrors, apiError } from '../lib/api-errors/index.js';
import { toVercelHandler } from '../vercel-adapter.js';

function makeReq(
  url = 'https://ïdea.com/api/example',
  init?: RequestInit,
): Request {
  return new Request(url, init);
}

describe('withApiErrors', () => {
  it('attaches x-request-id to successful responses', async () => {
    const handler = withApiErrors(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const res = await handler(makeReq());

    const id = res.headers.get('x-request-id');
    expect(id).toBeTruthy();
    expect(id?.length).toBeGreaterThan(8);
  });

  it('preserves a caller-supplied x-request-id', async () => {
    const handler = withApiErrors(async () =>
      new Response(null, { status: 204 }),
    );

    const res = await handler(
      makeReq('https://ïdea.com/api/x', {
        headers: { 'x-request-id': 'test-req-abc' },
      }),
    );

    expect(res.headers.get('x-request-id')).toBe('test-req-abc');
  });

  it('normalizes thrown errors to JSON with status + body.id matching header', async () => {
    const handler = withApiErrors(async () => {
      throw apiError({
        code: 'not_found',
        safe_message: 'campaign gone',
      });
    });

    const res = await handler(makeReq());
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string; code: string; id: string };
    expect(body.error).toBe('campaign gone');
    expect(body.code).toBe('not_found');
    expect(body.id).toBe(res.headers.get('x-request-id'));
  });

  it('coerces unknown thrown values to a generic 500', async () => {
    const handler = withApiErrors(async () => {
      throw new Error('boom');
    });

    const res = await handler(makeReq());
    expect(res.status).toBe(500);
    const body = (await res.json()) as { code: string; id: string };
    expect(body.code).toBe('internal_error');
    expect(body.id).toBe(res.headers.get('x-request-id'));
  });

  it('logs success and failure events when a logger is provided', async () => {
    const info = vi.fn();
    const errorLog = vi.fn();
    const happy = withApiErrors(
      async () => new Response(null, { status: 200 }),
      { logger: { info, error: errorLog } },
    );
    const sad = withApiErrors(
      async () => {
        throw apiError({ code: 'bad_request' });
      },
      { logger: { info, error: errorLog } },
    );

    await happy(makeReq());
    await sad(makeReq());

    expect(info).toHaveBeenCalledWith(
      'api.success',
      expect.objectContaining({ status: 200 }),
    );
    expect(errorLog).toHaveBeenCalledWith(
      'api.caught_error',
      expect.any(Object),
    );
    expect(errorLog).toHaveBeenCalledWith(
      'api.failure',
      expect.objectContaining({ status: 400 }),
    );
  });

  it('toVercelHandler composes withObservability by default', async () => {
    const h = toVercelHandler(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const res = await h.__webHandler(new Request('https://x/y'));
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });

  it('toVercelHandler skipObservability:true opts out of the wrapper', async () => {
    const h = toVercelHandler(
      async () => new Response(null, { status: 204 }),
      { skipObservability: true },
    );

    const res = await h.__webHandler(new Request('https://x/y'));
    expect(res.headers.get('x-request-id')).toBeNull();
  });

  it('passes streaming responses through with the request-id header attached', async () => {
    const handler = withApiErrors(async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('event: ping\n\n'));
          controller.close();
        },
      });
      return new Response(stream, {
        headers: { 'content-type': 'text/event-stream' },
      });
    });

    const res = await handler(makeReq());
    expect(res.headers.get('x-request-id')).toBeTruthy();
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    const text = await res.text();
    expect(text).toContain('event: ping');
  });
});
