/**
 * DEV-ONLY Vite plugin that serves api/**\/*.ts as Vercel-style
 * Functions during `vite dev`. In production these files are deployed
 * as real Vercel Functions — this plugin just fills the gap so we
 * don't need `vercel dev` for local work.
 *
 * Routing rules (matching Vercel's conventions):
 *   GET /api/foo                 → api/foo.ts
 *   POST /api/campaigns          → api/campaigns/index.ts  OR  api/campaigns.ts
 *   POST /api/campaigns/abc/generate → api/campaigns/[id]/generate.ts
 *
 * Handlers export a default async function (Request) => Response. The
 * plugin converts the incoming Node request to a Web Request, calls the
 * handler, and pipes the Response (including ReadableStream bodies for
 * SSE) back to the Node response.
 */
import type { Plugin, ViteDevServer, Connect } from 'vite';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { IncomingMessage, ServerResponse } from 'node:http';

const API_ROOT = 'api';

interface Route {
  /** The file path relative to the project root, e.g. "api/campaigns/[id]/generate.ts". */
  filePath: string;
  /** Regex that matches the URL pathname (minus query string). */
  pattern: RegExp;
}

function discoverRoutes(root: string): Route[] {
  const routes: Route[] = [];
  function walk(dir: string) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else if (st.isFile() && /\.(t|j)sx?$/.test(entry)) {
        const rel = relative(root, full).replace(/\\/g, '/');
        // api/campaigns/index.ts → /api/campaigns
        // api/campaigns/[id]/generate.ts → /api/campaigns/:id/generate
        const withoutExt = rel.replace(/\.(t|j)sx?$/, '');
        const withoutIndex = withoutExt.endsWith('/index')
          ? withoutExt.slice(0, -'/index'.length)
          : withoutExt;
        const pattern =
          '^/' +
          withoutIndex.replace(/\[([^/\]]+)]/g, '([^/]+)').replace(/\//g, '/') +
          '/?$';
        routes.push({ filePath: rel, pattern: new RegExp(pattern) });
      }
    }
  }
  walk(join(root, API_ROOT));
  // Longer (more specific) patterns first.
  routes.sort((a, b) => b.pattern.source.length - a.pattern.source.length);
  return routes;
}

function buildWebRequest(req: IncomingMessage): Promise<Request> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const host = req.headers.host ?? 'localhost';
      const url = `http://${host}${req.url ?? ''}`;
      const method = req.method ?? 'GET';
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (Array.isArray(v)) for (const vv of v) headers.append(k, vv);
        else if (v != null) headers.set(k, v);
      }
      const hasBody = method !== 'GET' && method !== 'HEAD';
      const body = hasBody && chunks.length > 0 ? Buffer.concat(chunks) : null;
      resolve(new Request(url, { method, headers, body }));
    });
  });
}

async function writeWebResponse(
  webRes: Response,
  nodeRes: ServerResponse,
): Promise<void> {
  nodeRes.statusCode = webRes.status;
  // Forward headers. Web Headers.forEach preserves multi-valued Set-Cookie
  // as a single comma-joined string in some impls; iterate manually to
  // preserve Set-Cookie appends.
  webRes.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') {
      // Node coerces multiple Set-Cookie via appendHeader in newer versions.
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
  const pump = async () => {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      nodeRes.write(Buffer.from(value));
      // Flush immediately for SSE streams.
      // ServerResponse.flushHeaders() is a no-op after first write, but
      // Node auto-flushes chunks.
    }
    nodeRes.end();
  };
  try {
    await pump();
  } catch (err) {
    try {
      nodeRes.end();
    } catch {
      /* already ended */
    }
    throw err;
  }
}

export function viteApiPlugin(): Plugin {
  let server: ViteDevServer;
  let routes: Route[] = [];
  let projectRoot = process.cwd();

  return {
    name: 'modelarena-api',
    apply: 'serve', // dev only
    configureServer(_server) {
      server = _server;
      projectRoot = server.config.root;
      routes = discoverRoutes(projectRoot);

      const middleware: Connect.NextHandleFunction = async (
        req,
        res,
        next,
      ) => {
        const rawUrl = req.url ?? '/';
        if (!rawUrl.startsWith('/api/')) return next();
        // Re-discover routes on every request during dev so added/removed
        // api files are picked up without restarting.
        routes = discoverRoutes(projectRoot);

        const pathname = rawUrl.split('?')[0];
        const hit = routes.find((r) => r.pattern.test(pathname));
        if (!hit) {
          res.statusCode = 404;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: `no handler for ${pathname}` }));
          return;
        }

        try {
          const mod = await server.ssrLoadModule(
            '/' + hit.filePath.replace(/\\/g, '/'),
          );
          const handler = mod.default as
            | ((request: Request) => Response | Promise<Response>)
            | undefined;
          if (typeof handler !== 'function') {
            res.statusCode = 500;
            res.end(`handler ${hit.filePath} has no default export function`);
            return;
          }
          const webReq = await buildWebRequest(req);
          const webRes = await handler(webReq);
          await writeWebResponse(webRes, res);
        } catch (err) {
          // Surface errors as stack traces in dev. Don't leak in prod
          // (prod uses real Vercel Functions; this plugin is serve-only).
          console.error(`[api] ${pathname} failed:`, err);
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : String(err),
              stack: err instanceof Error ? err.stack : undefined,
            }),
          );
        }
      };

      // Insert BEFORE Vite's default middleware so we intercept /api/*.
      server.middlewares.use(middleware);
    },
  };
}
