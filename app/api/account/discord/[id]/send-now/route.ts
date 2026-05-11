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
import { postToChannel, renderDigestSummary, renderReminderMessage } from "@/lib/discord-post";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

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
  const windowLabel = sub.mode === "weekly" ? "this week"
    : sub.mode === "daily" ? "today"
    : "upcoming";
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

  if (sub.mode === "reminder" && events.length === 0) {
    return NextResponse.json({
      error: "No matching events to send a reminder for. Add events that match this subscription's filters and try again.",
    }, { status: 400 });
  }

  const payload = sub.mode === "reminder"
    ? renderReminderMessage(events[0])
    : renderDigestSummary(events, { windowLabel });

  try {
    const msg = await postToChannel(sub.channel_id, payload);
    return NextResponse.json({ ok: true, messageId: msg.id, eventCount: events.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
