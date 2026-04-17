import { getDb } from '../../src/server/db/client.js';
import { withOperator } from '../../src/server/auth/middleware.js';
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

export default toVercelHandler(withOperator(async (request: Request) => {
  if (request.method !== 'GET') {
    return new Response('method not allowed', { status: 405 });
  }

  const url = new URL(request.url);
  const filters: ModelLibraryFilters = {
    search: url.searchParams.get('search') ?? undefined,
    status: parseStatus(url.searchParams.get('status')),
    sort: parseSort(url.searchParams.get('sort')),
  };

  const data = await buildModelLibrary(getDb(), filters);
  return json(data, 200);
}));

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
