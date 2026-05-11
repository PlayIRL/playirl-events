// On-demand "send now" trigger for a Discord auto-post — fires the same
// payload the dispatcher would produce so the channel sees exactly what a
// scheduled run would deliver. Bypasses the idempotency ledger so a manual
// fire doesn't block the next scheduled tick.
//
// Trade-off vs. the preview API: this writes to Discord. Use the preview UI
// to iterate on filters; use this to manually trigger the auto-post one time.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getActiveEvents } from "@/lib/events";
import { getSubscription, userCanManageSubscription } from "@/lib/discord-subscriptions";
import { postToChannel, renderDigestByDay, renderReminderMessage } from "@/lib/discord-post";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Inter-message gap when fanning out a multi-day digest. 25ms matches the
// dispatcher and keeps us well under Discord's 50 req/s global limit.
const POST_GAP_MS = 25;

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.suspended) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!userCanManageSubscription(user.id, id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const sub = getSubscription(id);
  if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date();
  const windowDays = sub.mode === "weekly" ? sub.days_ahead
    : sub.mode === "daily" ? Math.min(sub.days_ahead, 2)
    : sub.days_ahead;
  const to = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);

  // Same venue-vs-geo precedence as the live dispatcher.
  const venueScope = sub.venue_name?.trim().toLowerCase();
  const useGeo = !venueScope;
  const events = getActiveEvents({
    format: sub.format ?? undefined,
    from: now.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    radiusMiles: useGeo ? (sub.radius_miles ?? undefined) : undefined,
    centerLat: useGeo ? (sub.center_lat ?? undefined) : undefined,
    centerLng: useGeo ? (sub.center_lng ?? undefined) : undefined,
  }).filter(ev => {
    if (sub.source && ev.source !== sub.source) return false;
    if (venueScope && (ev.location ?? "").trim().toLowerCase() !== venueScope) return false;
    return true;
  });

  if (events.length === 0) {
    return NextResponse.json({
      error: "No matching events to send. Add events that match this subscription's filters and try again.",
    }, { status: 400 });
  }

  // Reminder mode is per-event (one message); digest mode fans out one
  // message per date so a long week doesn't truncate at Discord's 4096-char
  // embed cap and two same-weekday entries (e.g. two Mondays in a 7-day
  // window) don't read as duplicates.
  const payloads = sub.mode === "reminder"
    ? [renderReminderMessage(events[0])]
    : renderDigestByDay(events);

  const messageIds: string[] = [];
  try {
    for (let i = 0; i < payloads.length; i++) {
      const msg = await postToChannel(sub.channel_id, payloads[i]);
      messageIds.push(msg.id);
      if (i < payloads.length - 1) {
        await new Promise(r => setTimeout(r, POST_GAP_MS));
      }
    }
    return NextResponse.json({
      ok: true,
      messageIds,
      messagesPosted: messageIds.length,
      eventCount: events.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      error: message,
      messagesPosted: messageIds.length,
    }, { status: 502 });
  }
}
