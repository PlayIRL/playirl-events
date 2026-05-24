// Admin-triggered single-guild Discord pull. Delegates to the shared
// pullOneDiscordGuild() helper so this path produces the same rows as the
// admin "pull all" button and the cron /api/scrape-discord endpoint.
//
// Intentionally does NOT acquire any scrape lock: a per-guild pull touches
// 1-2 Discord API requests and writes <50 rows. upsertEvents wraps the
// writes in a SQLite transaction, so even if the full nightly scrape is
// running concurrently, the two paths serialize cleanly at the DB level
// and produce equivalent rows.

import { NextResponse } from "next/server";
import { hasAdminAccess } from "@/lib/session";
import { pullOneDiscordGuild } from "@/lib/discord-servers-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ guildId: string }> },
) {
  if (!(await hasAdminAccess())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { guildId } = await params;

  const result = await pullOneDiscordGuild(guildId);
  if (!result.ok) {
    const status = result.error === "Guild not configured" ? 404 : 502;
    return NextResponse.json({ error: result.error, guildId }, { status });
  }

  return NextResponse.json({
    ok: true,
    guildId,
    fetched: result.fetched,
    added: result.added,
    updated: result.updated,
    skipped: result.skipped,
    autoApproved: result.autoApproved,
  });
}
