import { runScraper } from "@/lib/scraper";
import { tryAcquireScrapeLock, releaseScrapeLock } from "@/lib/scraper-lock";
import { safeEqualSecret } from "@/lib/security";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
// Fast ack — the actual scrape runs detached in the background. We only
// hold the HTTP connection long enough to acquire the lock and kick off
// the work. A cold nationwide scrape is ~10–15 min; the cron caller
// shouldn't (and on Railway can't) hold the connection that long.
export const maxDuration = 30;

/**
 * POST /api/scrape
 *
 * Fire-and-forget scraper trigger for Railway Cron. Validates the
 * `x-scrape-secret` header, acquires the in-process scrape lock, and
 * returns immediately. The scrape itself runs detached.
 *
 *   curl -X POST https://playirl.gg/api/scrape -H "x-scrape-secret: $SCRAPE_SECRET"
 *
 * Responses:
 *   202 — accepted, scrape started in background. Body: { ok, source, startedAt }.
 *   401 — missing/invalid secret.
 *   409 — another scrape is already running. Body includes runningSince.
 *   500 — SCRAPE_SECRET env var not configured.
 *
 * To watch progress: GET /api/admin/scrape-history (admin-gated) or
 * tail Railway logs for `[wotc] region X/N` lines.
 */
export async function POST(request: Request) {
  const secret = process.env.SCRAPE_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "SCRAPE_SECRET not configured" }, { status: 500 });
  }

  const provided = request.headers.get("x-scrape-secret");
  if (!safeEqualSecret(provided, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const lock = tryAcquireScrapeLock("cron");
  if (lock.busy) {
    return NextResponse.json(
      {
        error: "Another scrape is already running",
        runningSince: lock.runningSince,
        runningSource: lock.runningSource,
      },
      { status: 409 },
    );
  }

  const startedAt = new Date().toISOString();
  // Fire and forget. We deliberately don't await — the response goes
  // back to the cron caller now, and the scrape continues in the Node
  // process. `finally` releases the lock so a thrown error doesn't pin it.
  runScraper()
    .then((result) => {
      console.log(`[scrape:cron] completed: scraped=${result.scraped} added=${result.added} updated=${result.updated} ${(result.durationMs / 1000).toFixed(1)}s`);
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[scrape:cron] FAILED:", message);
    })
    .finally(() => {
      releaseScrapeLock();
    });

  return NextResponse.json({ ok: true, source: "cron", startedAt }, { status: 202 });
}
