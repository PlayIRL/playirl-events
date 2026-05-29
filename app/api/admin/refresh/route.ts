import { hasAdminAccess } from "@/lib/session";
import { runScraper } from "@/lib/scraper";
import { tryAcquireScrapeLock, releaseScrapeLock, getRunningScrape } from "@/lib/scraper-lock";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
// Fast ack — same fire-and-forget pattern as /api/scrape. The admin UI
// polls /api/admin/scrape-history for completion rather than holding
// this connection open across a 10+ minute cold scrape.
export const maxDuration = 30;

/**
 * POST /api/admin/refresh
 *
 * Admin-triggered scrape from /admin/scrapers ("Refresh now"). Returns
 * 202 immediately; scrape runs detached. UI is expected to poll
 * /api/admin/scrape-history to surface completion + per-source results.
 *
 * Responses:
 *   202 — accepted; scrape started. Body: { ok, source, startedAt }.
 *   401 — not an admin.
 *   409 — another scrape is already running. Body includes runningSince.
 */
export async function POST() {
  if (!(await hasAdminAccess())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const lock = tryAcquireScrapeLock("admin-refresh");
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
  runScraper("admin-refresh")
    .then((result) => {
      console.log(`[scrape:admin] completed: scraped=${result.scraped} added=${result.added} updated=${result.updated} ${(result.durationMs / 1000).toFixed(1)}s`);
    })
    .catch((err: unknown) => {
      console.error("[scrape:admin] runScraper failed:", err);
    })
    .finally(() => {
      releaseScrapeLock();
    });

  return NextResponse.json({ ok: true, source: "admin-refresh", startedAt }, { status: 202 });
}

/**
 * GET /api/admin/refresh
 *
 * Live status probe — returns whether a scrape is currently running and
 * when it started. The admin UI polls this every few seconds while a
 * scrape is in progress.
 */
export async function GET() {
  if (!(await hasAdminAccess())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const running = getRunningScrape();
  return NextResponse.json({ running });
}
