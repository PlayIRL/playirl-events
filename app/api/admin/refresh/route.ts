import { hasAdminAccess } from "@/lib/session";
import { runScraper } from "@/lib/scraper";
import { KNOWN_SOURCE_IDS } from "@/scrapers";
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
 * Body (optional):
 *   { only?: string | string[] }  — restrict to a single source or
 *   an explicit list. Allowed values: "wizardsLocator", "topdeck",
 *   "discord". Omit or pass [] / "all" to run every enabled source
 *   (legacy behavior).
 *
 * Responses:
 *   202 — accepted; scrape started. Body: { ok, source, startedAt, only? }.
 *   400 — body parsed but `only` contained an unknown source ID.
 *   401 — not an admin.
 *   409 — another scrape is already running. Body includes runningSince.
 */
export async function POST(request: Request) {
  if (!(await hasAdminAccess())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse the optional source filter. Body is optional — a legacy POST
  // with no body keeps the old "run everything" semantics so existing
  // UI / CLI callers don't break.
  let only: string[] | undefined;
  try {
    const text = await request.text();
    if (text.trim()) {
      const body = JSON.parse(text);
      const rawOnly = body?.only;
      if (rawOnly && rawOnly !== "all") {
        const arr = Array.isArray(rawOnly) ? rawOnly : [rawOnly];
        const cleaned = arr.filter((s): s is string => typeof s === "string" && s.length > 0);
        const bad = cleaned.filter(
          (s) => !KNOWN_SOURCE_IDS.includes(s as (typeof KNOWN_SOURCE_IDS)[number]),
        );
        if (bad.length > 0) {
          return NextResponse.json(
            { error: `Unknown source(s): ${bad.join(", ")}. Allowed: ${KNOWN_SOURCE_IDS.join(", ")}.` },
            { status: 400 },
          );
        }
        if (cleaned.length > 0) only = cleaned;
      }
    }
  } catch {
    // Malformed JSON body — treat as no filter rather than 400ing, since
    // the body is optional and we don't want to lock out the
    // "POST with no Content-Type" call shape.
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

  // triggeredBy keeps "admin-refresh" as the prefix so the Recent-runs
  // table's existing chip logic still recognizes admin runs; per-source
  // filter is appended after a colon so the chip can show
  // "admin-refresh:topdeck" when the admin scoped the run.
  const triggeredBy = only && only.length > 0 ? `admin-refresh:${only.join(",")}` : "admin-refresh";

  const startedAt = new Date().toISOString();
  runScraper(triggeredBy, { only })
    .then((result) => {
      console.log(`[scrape:admin] completed${only ? ` (only=${only.join(",")})` : ""}: scraped=${result.scraped} added=${result.added} updated=${result.updated} ${(result.durationMs / 1000).toFixed(1)}s`);
    })
    .catch((err: unknown) => {
      console.error("[scrape:admin] runScraper failed:", err);
    })
    .finally(() => {
      releaseScrapeLock();
    });

  return NextResponse.json({ ok: true, source: "admin-refresh", startedAt, only }, { status: 202 });
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
