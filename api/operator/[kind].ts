/**
 * Consolidated operator-read endpoint. Replaces three independent
 * Vercel Functions (/api/dashboard, /api/activity, /api/models) with a
 * single file so that a fresh operator visit pays one cold-start rather
 * than three.
 *
 * Each GET response is cached in the Vercel Runtime Cache (per-region
 * KV, shared across Fluid Compute instances) with a 5 min TTL. Entries
 * are tagged with `snapshot` so a mutation elsewhere in the app can
 * bust them globally via `invalidateAnalyticsSnapshot()` —
 * see `src/server/models/library.ts`. The long TTL is safe because
 * mutations always invalidate via tag; staleness is bounded by the
 * library.ts module-level L1 cache (30 s) on non-mutating instances.
 *
 * Response bodies are cached as already-serialized JSON strings to
 * avoid Date-object round-trip issues (Runtime Cache uses JSON
 * serialization; `AnalyticsSnapshot` contains Date fields that wouldn't
 * survive a stringify/parse cycle).
 */
import { getDb } from '../../src/server/db/client.js';
import { withOperator } from '../../src/server/auth/middleware.js';
import { buildDashboardSummary } from '../../src/server/dashboard/summary.js';
import { buildActivityFeed } from '../../src/server/activity/feed.js';
import {
  buildModelLibrary,
  type ModelLibraryFilters,
  type ModelLibrarySort,
  type ModelLibraryStatusFilter,
} from '../../src/server/models/library.js';
import { toVercelHandler } from '../../src/server/vercel-adapter.js';

const VALID_STATUS = new Set<ModelLibraryStatusFilter>([
  'all',
  'enabled',
  'disabled',
  'legacy',
  'in-use',
]);
const VALID_SORT = new Set<ModelLibrarySort>(['name', 'usage', 'winRate']);

type Kind = 'dashboard' | 'activity' | 'models';
const KINDS: ReadonlySet<Kind> = new Set(['dashboard', 'activity', 'models']);

/** Runtime Cache is optional — unavailable in local dev and tests. */
type RuntimeCache = {
  get<T>(key: string): Promise<T | null | undefined>;
  set<T>(
    key: string,
    value: T,
    options?: { ttl?: number; tags?: string[] },
  ): Promise<void>;
  expireTag?(tag: string): Promise<void>;
};

let runtimeCachePromise: Promise<RuntimeCache | null> | undefined;
function getRuntimeCache(): Promise<RuntimeCache | null> {
  if (runtimeCachePromise) return runtimeCachePromise;
  runtimeCachePromise = (async () => {
    try {
      const mod = await import('@vercel/functions');
      if (typeof (mod as { getCache?: unknown }).getCache !== 'function') {
        return null;
      }
      return (mod as { getCache: (opts: { namespace: string }) => RuntimeCache })
        .getCache({ namespace: 'idea-bench' });
    } catch {
      return null;
    }
  })();
  return runtimeCachePromise;
}

const operatorWebHandler = async (request: Request): Promise<Response> => {
  if (request.method !== 'GET') {
    return json({ error: 'method not allowed' }, 405);
  }

  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  const raw = parts[2] ?? '';
  if (!KINDS.has(raw as Kind)) {
    return json({ error: 'not found' }, 404);
  }
  const kind = raw as Kind;

  // Filters only matter for models; fold into the cache key so different
  // filter combos don't share a slot.
  const filters: ModelLibraryFilters | undefined =
    kind === 'models'
      ? {
          search: url.searchParams.get('search') ?? undefined,
          status: parseStatus(url.searchParams.get('status')),
          sort: parseSort(url.searchParams.get('sort')),
        }
      : undefined;

  const cacheKey =
    kind === 'models'
      ? `models:${filters?.status ?? 'any'}:${filters?.sort ?? 'any'}:${filters?.search ?? ''}`
      : kind;

  const rc = await getRuntimeCache();
  if (rc) {
    try {
      const hit = await rc.get<string>(cacheKey);
      if (typeof hit === 'string' && hit.length > 0) {
        return new Response(hit, {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'x-cache': 'runtime-hit',
          },
        });
      }
    } catch {
      /* swallow — cache must never block the response */
    }
  }

  const db = getDb();
  let body: unknown;
  switch (kind) {
    case 'dashboard':
      body = await buildDashboardSummary(db);
      break;
    case 'activity':
      body = await buildActivityFeed(db);
      break;
    case 'models':
      body = await buildModelLibrary(db, filters);
      break;
  }
  const serialized = JSON.stringify(body);

  if (rc) {
    // Fire-and-forget — the response is already being returned to the
    // client. A failed set() just means the next request pays the same
    // DB cost; no correctness impact.
    rc.set(cacheKey, serialized, { ttl: 300, tags: ['snapshot'] }).catch(
      () => {},
    );
  }

  return new Response(serialized, {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'x-cache': rc ? 'runtime-miss' : 'runtime-off',
    },
  });
};

function parseStatus(value: string | null): ModelLibraryStatusFilter | undefined {
  return value && VALID_STATUS.has(value as ModelLibraryStatusFilter)
    ? (value as ModelLibraryStatusFilter)
    : undefined;
}

function parseSort(value: string | null): ModelLibrarySort | undefined {
  return value && VALID_SORT.has(value as ModelLibrarySort)
    ? (value as ModelLibrarySort)
    : undefined;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export default toVercelHandler(withOperator(operatorWebHandler));
