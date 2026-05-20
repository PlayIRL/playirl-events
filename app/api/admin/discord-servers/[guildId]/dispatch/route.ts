// Admin-triggered single-guild Discord dispatch. Fires every enabled
// subscription for the guild on BOTH flows in sequence:
//   1. Channel-message digests + reminders (force-fires, ignores cron's
//      hourly/weekly time gates — but still honors the claimPost ledger,
//      so buckets that already posted this week stay posted-once).
//   2. Events-tab subs (idempotent via the (event_id, guild_id) ledger).
//
// Activity rows are written with trigger='manual' so the admin UI can
// distinguish admin-fired runs from cron-fired ones.

import { NextResponse } from "next/server";
import { hasAdminAccess } from "@/lib/session";
import {
  dispatchDigestsForGuild,
  dispatchEventsTabSubsForGuild,
} from "@/lib/discord-dispatcher";

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
  const now = new Date();

  const channels = await dispatchDigestsForGuild(guildId, now);
  const eventsTab = await dispatchEventsTabSubsForGuild(guildId, now);

  return NextResponse.json({
    ok: true,
    guildId,
    channels,
    eventsTab,
  });
}
