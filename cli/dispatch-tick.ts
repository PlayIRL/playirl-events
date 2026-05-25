// Single-shot dispatcher trigger — POSTs to /api/discord/dispatch with the
// shared secret header, retrying transient failures. Designed to be run on a
// schedule (e.g. Railway cron service every 5 min) replacing the unreliable
// GitHub Actions cron.
//
// Env vars expected:
//   DISPATCH_DISPATCH_URL     — e.g. "https://playirl.gg/api/discord/dispatch"
//   DISPATCH_SECRET  — same secret as the receiving endpoint
//
// Exit code: 0 on success, 1 on hard failure (after retries). The dispatcher
// itself is idempotent (claimPost ledger), so a retried tick is safe.

const DISPATCH_URL = process.env.DISPATCH_URL ?? "https://playirl.gg/api/discord/dispatch";
const SECRET = process.env.DISPATCH_SECRET;
const FORCE = process.argv.includes("--force");
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5_000;

if (!SECRET) {
  console.error("[dispatch-tick] DISPATCH_SECRET not set; refusing to call dispatcher unauthenticated");
  process.exit(1);
}

async function attempt(n: number): Promise<boolean> {
  const url = FORCE ? `${DISPATCH_URL}?force=1` : DISPATCH_URL;
  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "x-dispatch-secret": SECRET as string },
      // 60s gives the dispatcher headroom on a tick that fans out to many
      // channels; the receiving handler has maxDuration=60 itself.
      signal: AbortSignal.timeout(60_000),
    });
    const elapsedMs = Date.now() - startedAt;
    if (res.ok) {
      const body = await res.text();
      console.log(`[dispatch-tick] attempt=${n} ok status=${res.status} ms=${elapsedMs} body=${body.slice(0, 200)}`);
      return true;
    }
    const errBody = await res.text().catch(() => "<unreadable>");
    console.error(`[dispatch-tick] attempt=${n} non-2xx status=${res.status} ms=${elapsedMs} body=${errBody.slice(0, 200)}`);
    return false;
  } catch (err) {
    const elapsedMs = Date.now() - startedAt;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[dispatch-tick] attempt=${n} failed ms=${elapsedMs} err=${msg}`);
    return false;
  }
}

(async () => {
  for (let n = 1; n <= MAX_ATTEMPTS; n++) {
    if (await attempt(n)) process.exit(0);
    if (n < MAX_ATTEMPTS) {
      console.log(`[dispatch-tick] retry in ${RETRY_DELAY_MS}ms`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }
  }
  console.error(`[dispatch-tick] giving up after ${MAX_ATTEMPTS} attempts`);
  process.exit(1);
})();
