import "server-only";

// The photo store sometimes turns a request away for a moment when Supabase's connection limit is
// full ("Too many connections"). Only bursts of test traffic fill it, but the tests share the project
// with the live site, so a shopper's upload during a test run could fail. Every request to the store
// is tried again shortly (Sabine's decision C in the Phase 3 code review).

const BUSY = /too many connections|max_client_conn/i;
/** Waits before the second and third tries: about a second in all. */
const WAITS_MS = [300, 600];

/** A photo store request, tried up to twice more while the store says it's busy. */
export async function stored<T extends { error: { message: string } | null }>(request: () => PromiseLike<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const result = await request();
    if (!result.error || attempt >= WAITS_MS.length || !BUSY.test(result.error.message)) return result;
    await new Promise((r) => setTimeout(r, WAITS_MS[attempt]));
  }
}
