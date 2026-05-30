/**
 * Tiny concurrency limiter. Runs `fn(item, index)` over `items` with at
 * most `limit` invocations in flight at a time, returning results in
 * the original array order. Errors are captured as `PromiseSettledResult`s
 * — the caller decides how to handle partial failure.
 *
 * Why this exists instead of a dependency: we only need one function,
 * none of the existing scrapers/lib code uses an external limiter, and
 * adding `p-limit` from npm pulls in a chain of ESM-only dependencies
 * that complicates the Next.js build. ~30 lines beats that.
 */
export async function pMapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const concurrency = Math.max(1, Math.min(limit, items.length));
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  // Shared counter — closure over `nextIdx` so each worker pulls the
  // next item without coordination. JS is single-threaded so the
  // increment is atomic.
  let nextIdx = 0;

  async function worker(): Promise<void> {
    while (true) {
      const idx = nextIdx++;
      if (idx >= items.length) return;
      try {
        const value = await fn(items[idx], idx);
        results[idx] = { status: "fulfilled", value };
      } catch (reason) {
        results[idx] = { status: "rejected", reason };
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return results;
}
