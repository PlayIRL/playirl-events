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
  type DiscordActivityKind,
  type DiscordActivityStatus,
  type DiscordActivityTrigger,
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
  recordSubscriptionActivity,
  recordSubscriptionFailure,
  releasePost,
} from "@/lib/discord-subscriptions";
import {
  DiscordPostError,
  postToChannel,
  renderDigestByDay,
  renderDigestSummary,
  renderReminderMessage,
} from "@/lib/discord-post";
import {
  eventsMatchingEventsTabSub,
  listEnabledEventsTabSubs,
  markEventsTabSubDispatched,
  pushEventsToGuild,
  recordEventsTabSubFailure,
} from "@/lib/discord-events-tab-subs";

/**
 * Centralized handler for a Discord post failure inside the dispatch loop.
 * Bumps the per-subscription failure counter, auto-disables the subscription
 * if the failure is permanent (403/404/410) or after enough consecutive
 * failures, and logs context. Pulled out so the digest, reminder, and retry
 * paths share the same dead-channel cleanup behavior.
 */
/**
 * Append a row to discord_subscription_activity. Wrapped in try/catch so a
 * logging failure never breaks the actual post path — activity is best-effort
 * observability, not part of the dispatch contract.
 */
function logActivity(args: {
  subscriptionId: string;
  channelId: string;
  kind: DiscordActivityKind;
  trigger: DiscordActivityTrigger;
  status: DiscordActivityStatus;
  eventCount: number;
  messagesPosted: number;
  error?: string | null;
}): void {
  try {
    recordSubscriptionActivity(args);
  } catch (err) {
    console.error(`[discord-dispatch] activity log failed for sub=${args.subscriptionId}:`, err);
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

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
// Inter-message gap for CROSS-channel fan-out (reminders + retry queue).
// Discord's global rate limit is 50 req/s; 25ms keeps us well under that
// when fanning out a single tick to many channels.
const POST_GAP_MS = 25;
// Inter-message gap for SAME-channel fan-out (multi-day digest chunks).
// Discord's per-channel limit is 5 messages / 5 seconds = 1 msg/sec average;
// 1200ms gives us margin. The 429 retry in postToChannel is the backstop if
// a concurrent reminder for the same channel overlaps with us.
const SAME_CHANNEL_GAP_MS = 1200;

interface DispatchSummary {
  ticked_at: string;
  subscriptions_checked: number;
  digests_posted: number;
  reminders_posted: number;
  retries_posted: number;
  retries_gave_up: number;
  events_tab_subs_checked: number;
  events_tab_events_posted: number;
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
  // actual content; admins can sanity-check filters via the preview panel
  // in /account?tab=discord.
  if (events.length === 0) return;

  // Fan out one message per date so a long window (e.g. a 7-day weekly
  // digest with 30+ events) doesn't truncate at Discord's 4096-char embed
  // cap. Claim under the first event's id so the dedupe ledger key
  // (subscription_id, event_id, kind, bucket) stays unique per bucket; the
  // first chunk's message_id is what gets recorded, which is what the
  // cancellation patcher will reach for. Trade-off: cancellations only
  // patch the first day's message on a multi-day digest. Acceptable
  // (cancellations are best-effort) and avoids a schema migration.
  const payloads = renderDigestByDay(events);
  if (payloads.length === 0) return;

  const headEvent = events[0];
  if (!claimPost(sub.id, headEvent.id, "digest", bucket)) return;

  let firstMsgId: string | null = null;
  let messagesPosted = 0;
  let lastErr: unknown = null;
  for (let i = 0; i < payloads.length; i++) {
    try {
      const result = await postToChannel(sub.channel_id, payloads[i]);
      messagesPosted++;
      if (firstMsgId === null) {
        firstMsgId = result.id;
        recordPostMessageId(sub.id, headEvent.id, "digest", bucket, result.id);
      }
      if (i < payloads.length - 1) {
        await new Promise(r => setTimeout(r, SAME_CHANNEL_GAP_MS));
      }
    } catch (err) {
      lastErr = err;
      break;
    }
  }

  if (lastErr) {
    // First chunk never landed → release the claim so the next tick retries
    // the whole digest. Otherwise: at least one day's content reached the
    // channel — keep the claim to prevent duplicate days on retry, log, and
    // accept the partial delivery.
    if (firstMsgId === null) {
      releasePost(sub.id, headEvent.id, "digest", bucket);
    }
    summary.errors++;
    handleDispatchFailure(
      sub.id,
      lastErr,
      firstMsgId === null ? "digest" : "digest partial",
    );
    logActivity({
      subscriptionId: sub.id,
      channelId: sub.channel_id,
      kind: "digest",
      trigger: "scheduled",
      status: messagesPosted > 0 ? "partial" : "error",
      eventCount: events.length,
      messagesPosted,
      error: errorMessage(lastErr),
    });
    return;
  }

  summary.digests_posted++;
  logActivity({
    subscriptionId: sub.id,
    channelId: sub.channel_id,
    kind: "digest",
    trigger: "scheduled",
    status: "ok",
    eventCount: events.length,
    messagesPosted,
  });
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
      logActivity({
        subscriptionId: sub.id,
        channelId: sub.channel_id,
        kind: "reminder",
        trigger: "scheduled",
        status: "ok",
        eventCount: 1,
        messagesPosted: 1,
      });
      await new Promise(r => setTimeout(r, POST_GAP_MS));
    } catch (err) {
      // Keep the ledger claim so the main loop won't retry; queue for
      // bounded backoff instead. Reminder windows are too narrow to rely on
      // the next-tick retry pattern that digests use.
      summary.errors++;
      const errMsg = err instanceof Error ? err.message : String(err);
      handleDispatchFailure(sub.id, err, `reminder ${ev.id}`);
      enqueuePendingPost(sub.id, ev.id, "reminder", bucket, errMsg);
      logActivity({
        subscriptionId: sub.id,
        channelId: sub.channel_id,
        kind: "reminder",
        trigger: "scheduled",
        status: "error",
        eventCount: 1,
        messagesPosted: 0,
        error: errMsg,
      });
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
      logActivity({
        subscriptionId: sub.id,
        channelId: sub.channel_id,
        kind: row.kind === "reminder" ? "reminder" : "digest",
        trigger: "retry",
        status: "ok",
        eventCount: 1,
        messagesPosted: 1,
      });
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
      logActivity({
        subscriptionId: sub.id,
        channelId: sub.channel_id,
        kind: row.kind === "reminder" ? "reminder" : "digest",
        trigger: "retry",
        status: "error",
        eventCount: 1,
        messagesPosted: 0,
        error: errMsg,
      });
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
    events_tab_subs_checked: 0,
    events_tab_events_posted: 0,
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
          await fireDigest(sub, isoWeekKey(now), sub.days_ahead, summary);
          markSubscriptionDispatched(sub.id);
        }
      } else if (sub.mode === "daily") {
        const due = force || (sub.hour_utc === utcHour && inFireWindow);
        if (due) {
          await fireDigest(sub, dateKey(now), Math.min(sub.days_ahead, 2), summary);
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

  // Events-tab subs: every tick, scan each enabled sub for matching events
  // not yet posted to its guild and create the missing scheduled events.
  // The (event_id, guild_id) ledger guarantees no double-posts even if two
  // subs overlap in filter+guild.
  const eventsTabSubs = listEnabledEventsTabSubs();
  summary.events_tab_subs_checked = eventsTabSubs.length;
  for (const sub of eventsTabSubs) {
    try {
      const matches = eventsMatchingEventsTabSub(sub, now);
      if (matches.length === 0) continue;
      const result = await pushEventsToGuild(sub.guild_id, matches, sub.linked_user_id);
      summary.events_tab_events_posted += result.posted;
      if (result.permanentError) {
        summary.errors++;
        const reason = `HTTP ${result.permanentError.status}: ${result.permanentError.body.slice(0, 200)}`;
        const r = recordEventsTabSubFailure(sub.id, reason, true);
        console.error(
          `[discord-dispatch] events-tab sub=${sub.id} ${r.disabled ? "disabled" : "failed"} (permanent): ${reason}`,
        );
      } else if (result.failed > 0) {
        summary.errors += result.failed;
        const r = recordEventsTabSubFailure(sub.id, `${result.failed} non-permanent failure(s)`, false);
        if (r.disabled) {
          console.error(
            `[discord-dispatch] events-tab sub=${sub.id} disabled after ${r.consecutiveFailures} consecutive failure runs`,
          );
        }
      } else if (result.posted > 0) {
        markEventsTabSubDispatched(sub.id);
      }
    } catch (err) {
      summary.errors++;
      console.error(`[discord-dispatch] events-tab sub=${sub.id} top-level failure:`, err);
    }
  }

  return NextResponse.json({ ok: true, ...summary });
}
