// Admin-triggered "pull all" for Discord. Same primitives as the cron
// /api/scrape-discord path, just gated by the admin session instead of
// SCRAPE_SECRET. Delegates to the shared pullAllDiscordGuilds() helper so
// both paths produce identical rows.
//
// Intentionally does NOT acquire the main scrape lock (or the Discord-pull
// lock): admins clicking "pull all" expect the action to run immediately,
// not 409 because the every-15-min cron tick is mid-flight. The helper's
// per-guild work serializes at the SQLite transaction level anyway.

import { NextResponse } from "next/server";
import { hasAdminAccess } from "@/lib/session";
import { pullAllDiscordGuilds } from "@/lib/discord-servers-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  if (!(await hasAdminAccess())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { totals, results } = await pullAllDiscordGuilds();
  return NextResponse.json({ ok: true, totals, results });
}
