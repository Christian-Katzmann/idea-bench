/**
 * Tiny Server-Sent Events helper.
 *
 * Usage:
 *   const stream = createSSEStream(async (send) => {
 *     send('slot', { ... });
 *     send('done', { ... });
 *   });
 *   return new Response(stream, { headers: sseHeaders() });
 *
 * Events are JSON-encoded. If an event payload is a string, it's sent
 * raw. We enqueue a keep-alive comment every 15s to keep proxies from
 * closing the connection during long fan-outs.
 */

export function sseHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Disable proxy buffering (nginx and friends).
    'X-Accel-Buffering': 'no',
  };
}

export type SSESend = (event: string, data: unknown) => void;

export function createSSEStream(
  producer: (send: SSESend, signal: AbortSignal) => Promise<void>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const ac = new AbortController();
      let closed = false;

      const safeEnqueue = (chunk: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          closed = true;
        }
      };

      const send: SSESend = (event, data) => {
        const payload =
          typeof data === 'string' ? data : JSON.stringify(data);
        // Per SSE spec: event and data lines followed by a blank line.
        safeEnqueue(
          encoder.encode(`event: ${event}\ndata: ${payload}\n\n`),
        );
      };

      const keepAlive = setInterval(() => {
        safeEnqueue(encoder.encode(`: keep-alive ${Date.now()}\n\n`));
      }, 15_000);

      try {
        await producer(send, ac.signal);
      } catch (err: unknown) {
        // Surface producer errors as a final SSE event before closing.
        // The route handler should generally catch and send a structured
        // error itself; this is a safety net.
        send('error', {
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        clearInterval(keepAlive);
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      // Client disconnected mid-stream. The producer is responsible for
      // listening to the AbortSignal we pass in; we can't force it to
      // stop here.
    },
  });
}
