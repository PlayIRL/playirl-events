// Discord subscription dispatcher. Called by Railway Cron every 5 minutes:
//
//   curl -X POST https://playirl.gg/api/discord/dispatch \
//        -H "x-dispatch-secret: $DISPATCH_SECRET"
//
// Loops over every enabled subscription, decides whether it's "due" in this
// 5-minute window, and posts. Idempotency is enforced by claimPost() — the
// composite ledger PK guarantees we never re-post the same (sub, event, kind,
// bucket).
//
// Failure mode: any thrown error releases the claim so the next tick retries.
// Accepted SLA is "at most once per attempt, retried until success or the
// bucket rolls over" (e.g. next week / next day / next 5min reminder window).

import { NextResponse } from "next/server";
import { getActiveEvents, getEvent } from "@/lib/events";
import { safeEqualSecret } from "@/lib/security";
import {
  type DiscordSubscription,
  bumpPendingPost,
  claimPost,
  deletePendingPost,
  enqueuePendingPost,
  getSubscription,
  listDuePendingPosts,
  listEnabledSubscriptions,
  markSubscriptionDispatched,
  recordPostMessageId,
  recordSubscriptionFailure,
  releasePost,
} from "@/lib/discord-subscriptions";
import {
  DiscordPostError,
  postToChannel,
  renderDigestSummary,
  renderReminderMessage,
} from "@/lib/discord-post";

/**
 * Centralized handler for a Discord post failure inside the dispatch loop.
 * Bumps the per-subscription failure counter, auto-disables the subscription
 * if the failure is permanent (403/404/410) or after enough consecutive
 * failures, and logs context. Pulled out so the digest, reminder, and retry
 * paths share the same dead-channel cleanup behavior.
 */
function handleDispatchFailure(
  subId: string,
  err: unknown,
  context: string,
): void {
  const isPermanent = err instanceof DiscordPostError && err.isPermanent;
  const reason =
    err instanceof DiscordPostError
      ? `HTTP ${err.status}: ${err.body.slice(0, 200)}`
      : err instanceof Error
        ? err.message.slice(0, 200)
        : String(err).slice(0, 200);
  const result = recordSubscriptionFailure(subId, reason, isPermanent);
  if (result.disabled) {
    console.error(
      `[discord-dispatch] sub=${subId} ${context} disabled after ${result.consecutiveFailures} consecutive failures (${isPermanent ? "permanent" : "threshold"}): ${reason}`,
    );
  } else {
    console.error(
      `[discord-dispatch] sub=${subId} ${context} failed (${result.consecutiveFailures} in a row): ${reason}`,
    );
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const REMINDER_WINDOW_MINUTES = 5;
// Inter-message gap. Discord's global rate limit is 50 req/s; 25ms keeps us
// well under that even when fanning out a single tick to many channels.
const POST_GAP_MS = 25;

interface DispatchSummary {
  ticked_at: string;
  subscriptions_checked: number;
  digests_posted: number;
  reminders_posted: number;
  retries_posted: number;
  retries_gave_up: number;
  errors: number;
}

function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // ISO week algorithm: Thursday in the same ISO week as the given day.
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function eventReminderBucket(event: { date: string; time: string }): string {
  return `${event.date}T${event.time || "00:00"}`;
}

function addMinutes(d: Date, mins: number): Date {
  return new Date(d.getTime() + mins * 60_000);
}

function eventsForSubscription(
  sub: DiscordSubscription,
  from: Date,
  to: Date,
) {
  // Venue scope is stricter than location scope — when set, we skip the
  // radius filter and require an exact (case/whitespace-insensitive)
  // match on the event's `location` column, mirroring getEventsForVenue.
  const venueScope = sub.venue_name?.trim().toLowerCase();
  const useGeo = !venueScope;
  return getActiveEvents({
    format: sub.format ?? undefined,
    from: dateKey(from),
    to: dateKey(to),
    radiusMiles: useGeo ? (sub.radius_miles ?? undefined) : undefined,
    centerLat: useGeo ? (sub.center_lat ?? undefined) : undefined,
    centerLng: useGeo ? (sub.center_lng ?? undefined) : undefined,
  }).filter(ev => {
    if (sub.source && ev.source !== sub.source) return false;
    if (venueScope && (ev.location ?? "").trim().toLowerCase() !== venueScope) return false;
    return true;
  });
}

async function fireDigest(
  sub: DiscordSubscription,
  bucket: string,
  windowDays: number,
  windowLabel: string,
  summary: DispatchSummary,
): Promise<void> {
  const now = new Date();
  const events = eventsForSubscription(sub, now, addMinutes(now, windowDays * 24 * 60))
    // Re-resolve cancelled state at fire time — a sub created last week
    // shouldn't fire a now-cancelled event.
    .filter(ev => {
      const fresh = getEvent(ev.id);
      return fresh && !fresh.cancelled_at;
    });

  // Skip empty digests entirely — quiet weeks shouldn't spam the channel
  // with "no events" boilerplate. The next bucket fires whenever there's
  // actual content, and /playirl preview lets admins sanity-check filters.
  if (events.length === 0) return;

  // Single summary message. Claim under the first event's id so the dedupe
  // ledger key (subscription_id, event_id, kind, bucket) stays unique per
  // bucket, matching the per-event PK shape the schema expects.
  const payload = renderDigestSummary(events, { windowLabel });
  const headEvent = events[0];
  if (!claimPost(sub.id, headEvent.id, "digest", bucket)) return;
  try {
    const result = await postToChannel(sub.channel_id, payload);
    recordPostMessageId(sub.id, headEvent.id, "digest", bucket, result.id);
    summary.digests_posted++;
  } catch (err) {
    releasePost(sub.id, headEvent.id, "digest", bucket);
    summary.errors++;
    handleDispatchFailure(sub.id, err, "digest");
  }
}

async function fireReminders(
  sub: DiscordSubscription,
  now: Date,
  summary: DispatchSummary,
): Promise<void> {
  const lead = sub.lead_minutes;
  // Window: events starting in [now+lead, now+lead+5min). The 5-min width
  // matches the cron cadence — every event passes through exactly one window.
  const from = addMinutes(now, lead);
  const to = addMinutes(now, lead + REMINDER_WINDOW_MINUTES);
  // Date filter is day-granular in getActiveEvents; pull the union of dates
  // that the window straddles, then narrow by exact UTC start time below.
  const candidates = eventsForSubscription(sub, from, to);
  for (const ev of candidates) {
    if (!ev.time) continue;
    const tz = ev.timezone || "America/New_York";
    let evStart: Date;
    try {
      // Avoid pulling date-fns-tz here — keep this dispatch endpoint lean.
      // toLocaleString round-trip is good enough for whole-minute matching.
      evStart = new Date(`${ev.date}T${ev.time}:00${utcOffsetSuffix(tz, ev.date)}`);
    } catch {
      continue;
    }
    if (evStart < from || evStart >= to) continue;
    // Re-fetch to honor cancelled_at flips.
    const fresh = getEvent(ev.id);
    if (!fresh || fresh.cancelled_at) continue;
    const bucket = eventReminderBucket(ev);
    const payload = renderReminderMessage(fresh);
    if (!claimPost(sub.id, ev.id, "reminder", bucket)) continue;
    try {
      const msg = await postToChannel(sub.channel_id, payload);
      recordPostMessageId(sub.id, ev.id, "reminder", bucket, msg.id);
      summary.reminders_posted++;
      await new Promise(r => setTimeout(r, POST_GAP_MS));
    } catch (err) {
      // Keep the ledger claim so the main loop won't retry; queue for
      // bounded backoff instead. Reminder windows are too narrow to rely on
      // the next-tick retry pattern that digests use.
      summary.errors++;
      const errMsg = err instanceof Error ? err.message : String(err);
      handleDispatchFailure(sub.id, err, `reminder ${ev.id}`);
      enqueuePendingPost(sub.id, ev.id, "reminder", bucket, errMsg);
    }
  }
}

async function drainPendingPosts(now: Date, summary: DispatchSummary): Promise<void> {
  const due = listDuePendingPosts(now);
  for (const row of due) {
    const sub = getSubscription(row.subscription_id);
    if (!sub || !sub.enabled) {
      deletePendingPost(row.subscription_id, row.event_id, row.kind, row.bucket);
      continue;
    }
    const ev = getEvent(row.event_id);
    if (!ev || ev.cancelled_at) {
      // Event was cancelled or deleted between the original failure and now —
      // there's nothing meaningful to retry. The cancellation fan-out (if it
      // ran) handled user-visible state.
      deletePendingPost(row.subscription_id, row.event_id, row.kind, row.bucket);
      continue;
    }
    const payload = row.kind === "reminder"
      ? renderReminderMessage(ev)
      : renderDigestSummary([ev], { windowLabel: "this week" });
    try {
      const msg = await postToChannel(sub.channel_id, payload);
      recordPostMessageId(row.subscription_id, row.event_id, row.kind, row.bucket, msg.id);
      deletePendingPost(row.subscription_id, row.event_id, row.kind, row.bucket);
      summary.retries_posted++;
      await new Promise(r => setTimeout(r, POST_GAP_MS));
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const result = bumpPendingPost(row.subscription_id, row.event_id, row.kind, row.bucket, errMsg);
      if (result.givingUp) {
        summary.retries_gave_up++;
        console.error(`[discord-dispatch] giving up on retry sub=${sub.id} event=${ev.id} after ${result.attempt} attempts: ${errMsg}`);
      } else {
        console.error(`[discord-dispatch] retry attempt ${result.attempt} failed sub=${sub.id} event=${ev.id}: ${errMsg}`);
      }
      // Also feed the per-subscription dead-channel cleanup so a retry
      // queue full of "channel deleted" failures eventually disables the
      // subscription instead of keeping the rows around forever.
      handleDispatchFailure(sub.id, err, `retry ${ev.id}`);
      summary.errors++;
    }
  }
}

// Approximate UTC offset for an IANA zone on a given date, formatted as
// "+HH:MM" / "-HH:MM" so we can build a date string parseable by Date.
// Good enough for whole-minute reminder bucketing — DST transitions land on
// 5-min boundaries we already accept.
function utcOffsetSuffix(timeZone: string, dateStr: string): string {
  try {
    const noon = new Date(`${dateStr}T12:00:00Z`);
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longOffset",
      hour: "2-digit",
    });
    const parts = fmt.formatToParts(noon);
    const tzPart = parts.find(p => p.type === "timeZoneName")?.value || "GMT";
    // longOffset returns e.g. "GMT-04:00"
    const match = tzPart.match(/GMT([+-]\d{2}:\d{2})/);
    return match ? match[1] : "+00:00";
  } catch {
    return "-05:00";
  }
}

export async function POST(request: Request) {
  const secret = process.env.DISPATCH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "DISPATCH_SECRET not configured" }, { status: 500 });
  }
  const provided = request.headers.get("x-dispatch-secret");
  if (!safeEqualSecret(provided, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const summary: DispatchSummary = {
    ticked_at: now.toISOString(),
    subscriptions_checked: 0,
    digests_posted: 0,
    reminders_posted: 0,
    retries_posted: 0,
    retries_gave_up: 0,
    errors: 0,
  };

  // Drain any retries due for posting before the main loop fires fresh ones.
  // Keeping this first means a flaky tick still makes progress on the queue.
  await drainPendingPosts(now, summary);

  // Optional URL flag for tests: ?force=1 ignores the time gates so a manual
  // curl can verify a digest fires immediately. Reminders always require the
  // event time window because there's no manual override semantically equiv.
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";

  const subs = listEnabledSubscriptions();
  summary.subscriptions_checked = subs.length;

  const utcDow = now.getUTCDay();
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();
  const inFireWindow = utcMinute < REMINDER_WINDOW_MINUTES;

  for (const sub of subs) {
    try {
      if (sub.mode === "weekly") {
        const due = force || (sub.dow === utcDow && sub.hour_utc === utcHour && inFireWindow);
        if (due) {
          await fireDigest(sub, isoWeekKey(now), sub.days_ahead, "this week", summary);
          markSubscriptionDispatched(sub.id);
        }
      } else if (sub.mode === "daily") {
        const due = force || (sub.hour_utc === utcHour && inFireWindow);
        if (due) {
          await fireDigest(sub, dateKey(now), Math.min(sub.days_ahead, 2), "today", summary);
          markSubscriptionDispatched(sub.id);
        }
      } else if (sub.mode === "reminder") {
        await fireReminders(sub, now, summary);
      }
    } catch (err) {
      summary.errors++;
      console.error(`[discord-dispatch] sub=${sub.id} top-level failure:`, err);
    }
  }

  return NextResponse.json({ ok: true, ...summary });
}
