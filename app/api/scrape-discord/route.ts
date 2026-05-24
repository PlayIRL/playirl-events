// Frequent Discord-only pull, designed for Railway Cron. Same primitives as
// /api/admin/discord-servers/pull-all (which is the on-demand admin path),
// just gated by SCRAPE_SECRET instead of the admin session.
//
// Why a separate endpoint from /api/scrape:
//   - /api/scrape runs the full multi-source nationwide scrape (WotC GraphQL +
//     TopDeck REST + Discord), takes ~2-3 min on a warm cache, and is meant
//     to fire once a day.
//   - /api/scrape-discord touches Discord only (1-2 API calls per guild),
//     completes in seconds, and is meant to fire every ~15 min so events
//     created in connected Discord servers show up in PlayIRL within minutes
//     instead of "tomorrow morning."
//
// Locking is intentionally separate from the main scrape lock — see
// lib/scraper-lock.ts comments. The two paths don't conflict at the DB
// level.
//
// Trigger from Railway Cron:
//   curl -X POST https://playirl.gg/api/scrape-discord -H "x-scrape-secret: $SCRAPE_SECRET"
//
// Responses:
//   202 — accepted, pull started in background. Body: { ok, source, startedAt }.
//   401 — missing/invalid secret.
//   409 — another Discord pull is already running. Body includes runningSince.
//   500 — SCRAPE_SECRET env var not configured.

import { NextResponse } from "next/server";
import { pullAllDiscordGuilds } from "@/lib/discord-servers-admin";
import {
  tryAcquireDiscordPullLock,
  releaseDiscordPullLock,
} from "@/lib/scraper-lock";
import { safeEqualSecret } from "@/lib/security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Fast ack — the actual pull runs detached in the background. We only
// hold the HTTP connection long enough to acquire the lock and kick off
// the work. A typical Discord-only pull completes in <30s, but bigger
// guild lists could brush against Railway's edge timeout if awaited.
export const maxDuration = 30;

export async function POST(request: Request) {
  const secret = process.env.SCRAPE_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "SCRAPE_SECRET not configured" },
      { status: 500 },
    );
  }

  const provided = request.headers.get("x-scrape-secret");
  if (!safeEqualSecret(provided, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const lock = tryAcquireDiscordPullLock("cron");
  if (lock.busy) {
    return NextResponse.json(
      {
        error: "Another Discord pull is already running",
        runningSince: lock.runningSince,
        runningSource: lock.runningSource,
      },
      { status: 409 },
    );
  }

  const startedAt = new Date().toISOString();
  // Fire and forget. The response returns to the cron caller now; the
  // pull continues in the Node process. `finally` releases the lock so a
  // thrown error doesn't pin it.
  pullAllDiscordGuilds()
    .then((summary) => {
      const { totals, durationMs } = summary;
      console.log(
        `[scrape-discord:cron] completed in ${(durationMs / 1000).toFixed(1)}s — ` +
          `guilds=${totals.guilds} failed=${totals.failed} fetched=${totals.fetched} ` +
          `added=${totals.added} updated=${totals.updated} skipped=${totals.skipped} ` +
          `autoApproved=${totals.autoApproved}`,
      );
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[scrape-discord:cron] FAILED:", message);
    })
    .finally(() => {
      releaseDiscordPullLock();
    });

  return NextResponse.json(
    { ok: true, source: "cron", startedAt },
    { status: 202 },
  );
}
