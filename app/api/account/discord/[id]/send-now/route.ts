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
import {
  getSubscription,
  recordSubscriptionActivity,
  userCanManageSubscription,
} from "@/lib/discord-subscriptions";
import { postToChannel, renderDigestByDay, renderReminderMessage } from "@/lib/discord-post";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Inter-message gap when fanning out a multi-day digest to the SAME channel.
// Discord's per-channel limit is 5 messages / 5 seconds (1 msg/sec average);
// 1200ms keeps us under it with margin. The 25ms gap used for cross-channel
// reminder fan-out is too tight here — same channel + bursty posts trips 429.
const POST_GAP_MS = 1200;

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
    try {
      recordSubscriptionActivity({
        subscriptionId: sub.id,
        kind: "send_now",
        trigger: "manual",
        status: "ok",
        eventCount: events.length,
        messagesPosted: messageIds.length,
        channelId: sub.channel_id,
      });
    } catch (logErr) {
      console.error("[send-now] activity log failed:", logErr);
    }
    return NextResponse.json({
      ok: true,
      messageIds,
      messagesPosted: messageIds.length,
      eventCount: events.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      recordSubscriptionActivity({
        subscriptionId: sub.id,
        kind: "send_now",
        trigger: "manual",
        // Partial = at least one message landed before the failure. Lets the
        // UI distinguish "nothing got through" from "Discord ate days 3-5".
        status: messageIds.length > 0 ? "partial" : "error",
        eventCount: events.length,
        messagesPosted: messageIds.length,
        error: message,
        channelId: sub.channel_id,
      });
    } catch (logErr) {
      console.error("[send-now] activity log failed:", logErr);
    }
    return NextResponse.json({
      error: message,
      messagesPosted: messageIds.length,
    }, { status: 502 });
  }
}
