import { vi } from 'vitest';

export interface MockRoute {
  method?: string;
  url:
    | string
    | RegExp
    | ((url: string, init?: RequestInit) => boolean);
  status?: number;
  body?: unknown | (() => unknown);
  headers?: Record<string, string>;
  /**
   * SSE / streaming support for routes like
   * `POST /api/campaigns/:id/generate`. When set, the response body is
   * a `ReadableStream<Uint8Array>` produced by the factory and `body`
   * is ignored. Default `content-type` flips to `text/event-stream`
   * unless overridden via `headers`. The factory is invoked once per
   * matching request so each call gets a fresh, lockable stream.
   */
  streamBody?: () => ReadableStream<Uint8Array>;
}

export function installMockFetch(routes: MockRoute[]) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const method = (
      init?.method ??
      (input instanceof Request ? input.method : undefined) ??
      'GET'
    ).toUpperCase();

    const route = routes.find((candidate) => {
      const expectedMethod = (candidate.method ?? 'GET').toUpperCase();
      if (expectedMethod !== method) return false;
      if (typeof candidate.url === 'string') return candidate.url === url;
      if (candidate.url instanceof RegExp) return candidate.url.test(url);
      return candidate.url(url, init);
    });

    if (!route) {
      throw new Error(`Unhandled fetch: ${method} ${url}`);
    }

    if (route.streamBody) {
      const headers = new Headers({
        'content-type': 'text/event-stream',
        ...route.headers,
      });
      return new Response(route.streamBody(), {
        status: route.status ?? 200,
        headers,
      });
    }

    const headers = new Headers({
      'content-type': 'application/json',
      ...route.headers,
    });
    const body = typeof route.body === 'function' ? route.body() : route.body;

    return new Response(
      body == null ? null : JSON.stringify(body),
      {
        status: route.status ?? 200,
        headers,
      },
    );
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
