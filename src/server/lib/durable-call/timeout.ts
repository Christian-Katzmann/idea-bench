// Vendored from /Users/christiankatzmann/Dev/reuse-kit/ready/durable-async-call/src/timeout.ts

export async function runWithTimeout<T>(
  fn: (signal?: AbortSignal) => Promise<T>,
  ms: number,
): Promise<T> {
  const ac = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      try {
        ac.abort();
      } catch {
        /* ignore */
      }
      reject(new Error('timeout'));
    }, ms);
  });
  try {
    return (await Promise.race([fn(ac.signal), timeoutPromise])) as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
