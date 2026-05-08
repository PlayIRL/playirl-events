// Returns the Discord message payload that would be posted right now for the
// given subscription. Used by the in-app preview UI so users can verify their
// filter shape and digest formatting before going live. Same code path as the
// dispatcher (`fireDigest` / `fireReminders`) so what they see matches what
// they'd actually receive — without making a real Discord API call.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getActiveEvents } from "@/lib/events";
import { getSubscription, userCanManageSubscription } from "@/lib/discord-subscriptions";
import { renderDigestSummary, renderReminderMessage } from "@/lib/discord-post";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.suspended) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!userCanManageSubscription(user.id, id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const sub = getSubscription(id);
  if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date();
  const windowDays = sub.mode === "weekly" ? sub.days_ahead : sub.mode === "daily" ? Math.min(sub.days_ahead, 2) : sub.days_ahead;
  const windowLabel = sub.mode === "weekly" ? "this week" : sub.mode === "daily" ? "today" : "upcoming";
  const to = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);

  // Venue scope is stricter than radius — when set, drop the radius filter
  // and require an exact venue-name match, matching the dispatcher.
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

  // Reminder mode previews the next matching event as if its trigger fired
  // now — gives the user a feel for the message shape without waiting for
  // the actual lead-time window.
  if (sub.mode === "reminder") {
    if (events.length === 0) {
      return NextResponse.json({
        empty: true,
        message: { content: `No upcoming events match this subscription's filters within ${windowDays} days.` },
        eventCount: 0,
      });
    }
    return NextResponse.json({
      empty: false,
      message: renderReminderMessage(events[0]),
      eventCount: events.length,
      sample: true,
    });
  }

  return NextResponse.json({
    empty: events.length === 0,
    message: renderDigestSummary(events, { windowLabel }),
    eventCount: events.length,
  });
}
