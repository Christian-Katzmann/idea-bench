/**
 * Adapts a Web-API-style handler `(request: Request) => Response` to a
 * Vercel Node.js function signature `(req, res) => void`.
 *
 * Why this exists: the handlers under api/*.ts are written for the Web
 * standard (Request/Response) because that's what the dev-only Vite API
 * plugin (src/server/vite-api-plugin.ts) serves them as. Vercel's
 * @vercel/node runtime in our current config invokes them with
 * Node-style `IncomingMessage`/`ServerResponse` arguments, which means
 * `req.headers.get` etc. blow up at runtime.
 *
 * Rather than rewrite every route twice, each api/*.ts wraps its Web
 * handler with `toVercelHandler(...)` before exporting. Local dev keeps
 * the Web-API flow via ssrLoadModule (see vite-api-plugin.ts) which
 * unwraps via the `__webHandler` marker we attach below.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

export type WebHandler = (request: Request) => Response | Promise<Response>;

type NodeHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => void | Promise<void>;

/** Exposes the original web handler so the dev plugin can skip the adapter. */
export interface AdaptedHandler extends NodeHandler {
  __webHandler: WebHandler;
}

export function toVercelHandler(webHandler: WebHandler): AdaptedHandler {
  const adapted: NodeHandler = async (req, res) => {
    try {
      const webReq = await nodeToWebRequest(req);
      const webRes = await webHandler(webReq);
      await writeWebResponse(webRes, res);
    } catch (err) {
      // Last-resort error guard; most handlers catch their own errors
      // and return JSON. If one throws, at least surface the stack in
      // the function log and send a 500.
      console.error('[vercel-adapter] handler threw:', err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            error: err instanceof Error ? err.message : 'internal error',
          }),
        );
      } else {
        try {
          res.end();
        } catch {
          /* already ended */
        }
      }
    }
  };
  (adapted as AdaptedHandler).__webHandler = webHandler;
  return adapted as AdaptedHandler;
}

async function nodeToWebRequest(req: IncomingMessage): Promise<Request> {
  const host =
    (req.headers['x-forwarded-host'] as string | undefined) ??
    (req.headers.host as string | undefined) ??
    'localhost';
  const proto =
    (req.headers['x-forwarded-proto'] as string | undefined) ?? 'https';
  const url = `${proto}://${host}${req.url ?? ''}`;

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v == null) continue;
    if (Array.isArray(v)) for (const vv of v) headers.append(k, vv);
    else headers.set(k, String(v));
  }

  const method = req.method ?? 'GET';
  const hasBody = method !== 'GET' && method !== 'HEAD';

  let body: Uint8Array | null = null;
  if (hasBody) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    if (chunks.length > 0) body = Buffer.concat(chunks);
  }

  return new Request(url, { method, headers, body });
}

async function writeWebResponse(
  webRes: Response,
  nodeRes: ServerResponse,
): Promise<void> {
  nodeRes.statusCode = webRes.status;
  webRes.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') {
      nodeRes.appendHeader('Set-Cookie', value);
    } else {
      nodeRes.setHeader(key, value);
    }
  });

  if (!webRes.body) {
    nodeRes.end();
    return;
  }

  const reader = webRes.body.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    // Back-pressure: if nodeRes.write returns false, wait for drain.
    const ok = nodeRes.write(Buffer.from(value));
    if (!ok) {
      await new Promise<void>((resolve) => nodeRes.once('drain', resolve));
    }
  }
  nodeRes.end();
}
