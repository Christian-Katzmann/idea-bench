# `src/server/`

Server-only code. Never imported from `src/pages/**`, `src/components/**`, or anywhere else the client bundles.

## Layout

```
auth/
  cookies.ts           HMAC-signed cookie primitives (operator + participant)
  middleware.ts        withOperator / withParticipant wrappers for Vercel Functions
db/
  client.ts            Memoized Drizzle client (Neon HTTP driver)
  schema.ts            Drizzle schema + exported types
openrouter.ts          Minimal OpenRouter client (OpenAI-compatible /chat/completions)
sse.ts                 Server-Sent Events stream helper
vite-api-plugin.ts     DEV-ONLY Vite plugin that serves api/**.ts as Functions
```

## Why `vite-api-plugin.ts` exists

TL;DR: local dev needs `/api/*` routes working alongside Vite. `vercel dev` is the canonical way, but it refused to run non-interactively in our environment. This plugin replaces it for local work only. Production is untouched — real Vercel Functions deploy from `api/`.

**Longer version.** The obvious path was `vercel dev`. It orchestrates Vite + serves the `api/` directory as Vercel Functions. But on CLI 50.17.1 the CLI required a scope and refused to accept `--scope aistotles-projects` in a non-interactive shell — it kept returning `"status": "action_required", "reason": "missing_scope"` even when the scope was passed explicitly. Probably a CLI bug (the session context flagged 50.17.1 as outdated vs the then-current 51.4.0), but chasing it would have blocked the demo.

The plugin is short (~140 lines), scoped to `apply: 'serve'`, and mirrors just enough of Vercel's behavior for dev:

- File-based routing: `api/campaigns/[id]/generate.ts` → `/api/campaigns/:id/generate`
- `index.ts` resolves to the parent directory's path
- Dynamic `[param]` segments captured as regex groups
- Longer patterns matched first (specificity ordering)
- Handlers export a `default async function handler(request: Request): Promise<Response>` — same Web API signature Vercel Functions use on Fluid Compute runtime
- Node `IncomingMessage` converted to Web `Request` (including body for non-GET); Web `Response.body` (including SSE `ReadableStream`) piped back to Node `ServerResponse`

Because handlers are loaded via Vite's `ssrLoadModule`, you get HMR on edits and TS+ESM work natively — no build step.

**When you might remove this:**

- Vercel CLI gets patched so `vercel dev --yes --scope <team>` works in non-interactive shells
- Someone actually runs `vercel link` interactively and stops needing `--scope`
- We migrate to Next.js (Next.js handles API routes natively; no plugin needed)

Either of those makes the plugin redundant. Production code doesn't reference it — safe to delete when no longer useful.

## Why `src/server/` is a strict boundary

Client code (anything under `src/` except `src/server/`) gets bundled for the browser. Server code (`src/server/**`, plus `api/**`) runs on Vercel Functions only.

Keep the boundary clean:

- Never `import` from `src/server/**` inside `src/pages/**`, `src/components/**`, or `src/lib/**`.
- Shared types that both sides need (e.g. response shapes) live in `src/lib/` — but don't export runtime code from there that depends on `process.env` or Node-only APIs.

If you need to share a single type across client and server, define it once and import it from both. The client import will tree-shake the server import away; just don't export values (functions, constants from `process.env`, etc.) that would execute client-side.
