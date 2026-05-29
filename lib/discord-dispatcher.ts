// Discord dispatch helpers. Hoisted out of app/api/discord/dispatch/route.ts
// so the per-guild admin "Dispatch now" buttons can reuse the same fire path
// as the 5-minute cron — one source of truth for digest/reminder semantics,
// failure handling, and idempotency.
//
// Public surface:
//   dispatchAllSubs(now, force)            — the cron body
//   dispatchDigestsForGuild(guildId, now)  — admin manual fire for one guild's
//                                            channel-message subs (digest +
//                                            reminder). Force-fires (ignores
//                                            time gates) but still honors the
//                                            claimPost idempotency ledger, so
//                                            buckets that already posted this
//                                            week stay posted-once.
//   dispatchEventsTabSubsForGuild(guildId) — admin manual fire for one guild's
//                                            Events-tab subs.
//
// Idempotency: claimPost / recordScheduledEventPost continue to gate writes.
// Activity rows get trigger='scheduled' for cron and 'manual' for admin fires.

import { getActiveEvents, getEvent } from "@/lib/events";
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
  listSubscriptionsForGuild,
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
import { getDb } from "@/lib/db";
import type { DiscordEventsTabSub } from "@/lib/discord-events-tab-subs";
import { drainAdminNotifications } from "@/lib/discord-admin-push";

const REMINDER_WINDOW_MINUTES = 5;
// How late a missed per-event reminder can fire and still be useful. The
// purpose of a reminder is lead-time notice — if a tick lands 90 min late
// on a 60-min-lead reminder, sending it 30 min before the event is fine;
// sending it after the event has started is not (claimPost dedupes, and
// the evStart > now guard below blocks post-start fires regardless).
const REMINDER_CATCHUP_MAX_LATE_MINUTES = 60;
// How late a missed weekly/daily digest slot can be before we give up on it.
// Set high enough to tolerate the slowest realistic scheduler delay (we've
// seen GHA cron skip 4+ hours), low enough that an "8 AM digest" never
// surprises subscribers by landing in the evening.
const DIGEST_MAX_LATE_HOURS = 6;
const DIGEST_MAX_LATE_MS = DIGEST_MAX_LATE_HOURS * 60 * 60 * 1000;
// Inter-message gap for CROSS-channel fan-out (reminders + retry queue).
// Discord's global rate limit is 50 req/s; 25ms keeps us well under that
// when fanning out a single tick to many channels.
const POST_GAP_MS = 25;
// Inter-message gap for SAME-channel fan-out (multi-day digest chunks).
// Discord's per-channel limit is 5 messages / 5 seconds = 1 msg/sec average;
// 1200ms gives us margin. The 429 retry in postToChannel is the backstop if
// a concurrent reminder for the same channel overlaps with us.
const SAME_CHANNEL_GAP_MS = 1200;

export interface DispatchSummary {
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

export function newDispatchSummary(now: Date): DispatchSummary {
  return {
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
}

export function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // ISO week algorithm: Thursday in the same ISO week as the given day.
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function eventReminderBucket(event: { date: string; time: string }): string {
  return `${event.date}T${event.time || "00:00"}`;
}

function addMinutes(d: Date, mins: number): Date {
  return new Date(d.getTime() + mins * 60_000);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

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
  trigger: DiscordActivityTrigger,
): Promise<void> {
  const now = new Date();
  // windowDays counts inclusive dates: a 7-day weekly digest fired Monday
  // should cover Mon–Sun (7 dates), not Mon–next-Mon (8). `getActiveEvents`
  // filters `date >= from AND date <= to` inclusive, and `dateKey(to)` is the
  // calendar day `to` falls in — so we offset by `windowDays - 1` days, not
  // `windowDays`. Mirrors the slash-command lookup in handleLookup().
  const windowEnd = addMinutes(now, Math.max(0, windowDays - 1) * 24 * 60);
  const events = eventsForSubscription(sub, now, windowEnd)
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
      trigger,
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
    trigger,
    status: "ok",
    eventCount: events.length,
    messagesPosted,
  });
}

async function fireReminders(
  sub: DiscordSubscription,
  now: Date,
  summary: DispatchSummary,
  trigger: DiscordActivityTrigger,
): Promise<void> {
  const lead = sub.lead_minutes;
  // Window: events starting in [now + lead − CATCHUP, now + lead + 5min).
  //
  // The forward 5-min half matches the cron cadence — an on-time tick still
  // catches a single ideal-fire-time window. The backward CATCHUP half
  // exists because the scheduler isn't on time: GHA cron skews 1–4h, and we
  // need a delayed tick to still fire reminders whose ideal time has just
  // passed. claimPost in the loop body keeps a same-event reminder from
  // double-posting across overlapping windows; the `evStart > now` guard
  // blocks fires for events that have already started.
  const from = addMinutes(now, lead - REMINDER_CATCHUP_MAX_LATE_MINUTES);
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
    // Skip reminders for events that have already started — a "reminder
    // 10 min before X" message arriving after X is worse than silence.
    if (evStart <= now) continue;
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
        trigger,
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
        trigger,
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
    // Intentional en-US literal: the downstream regex parses the "GMT-04:00"
    // shape produced by Intl with this locale. Switching locales here can
    // emit non-matching strings ("ut−04:00", "UTC−4", etc.) on some
    // implementations and break the offset extraction.
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

/**
 * Next scheduled fire moment for a subscription, or null if none can be
 * predicted. Used by the activity log to show "Next: …" alongside past fires.
 *
 * - weekly/daily: deterministic — next future UTC instant matching the
 *   subscription's hour_utc/dow, snapped to minute 0 (the canonical fire
 *   moment; the dispatcher window is just slack for cron jitter).
 * - reminder:    queries matching events in the next `days_ahead` window and
 *   returns the earliest `event.start - lead_minutes` that is still in the
 *   future. Null when no upcoming event matches.
 */
export function computeNextScheduledFire(
  sub: DiscordSubscription,
  now: Date,
): Date | null {
  if (sub.mode === "weekly") {
    if (sub.dow === null) return null;
    const d = new Date(now);
    d.setUTCHours(sub.hour_utc, 0, 0, 0);
    let daysUntil = (sub.dow - d.getUTCDay() + 7) % 7;
    if (daysUntil === 0 && d <= now) daysUntil = 7;
    d.setUTCDate(d.getUTCDate() + daysUntil);
    return d;
  }
  if (sub.mode === "daily") {
    const d = new Date(now);
    d.setUTCHours(sub.hour_utc, 0, 0, 0);
    if (d <= now) d.setUTCDate(d.getUTCDate() + 1);
    return d;
  }
  if (sub.mode === "reminder") {
    const lead = sub.lead_minutes;
    const windowEnd = addMinutes(now, sub.days_ahead * 24 * 60);
    const candidates = eventsForSubscription(sub, now, windowEnd);
    let soonest: Date | null = null;
    for (const ev of candidates) {
      if (!ev.time) continue;
      const tz = ev.timezone || "America/New_York";
      let evStart: Date;
      try {
        evStart = new Date(`${ev.date}T${ev.time}:00${utcOffsetSuffix(tz, ev.date)}`);
      } catch {
        continue;
      }
      const fireAt = addMinutes(evStart, -lead);
      if (fireAt <= now) continue;
      if (!soonest || fireAt < soonest) soonest = fireAt;
    }
    return soonest;
  }
  return null;
}

// --- Public surface --------------------------------------------------------

async function dispatchEventsTabSubsForAll(
  now: Date,
  summary: DispatchSummary,
): Promise<void> {
  const eventsTabSubs = listEnabledEventsTabSubs();
  summary.events_tab_subs_checked = eventsTabSubs.length;
  for (const sub of eventsTabSubs) {
    try {
      await dispatchOneEventsTabSub(sub, now, summary);
    } catch (err) {
      summary.errors++;
      console.error(`[discord-dispatch] events-tab sub=${sub.id} top-level failure:`, err);
    }
  }
}

async function dispatchOneEventsTabSub(
  sub: DiscordEventsTabSub,
  now: Date,
  summary: DispatchSummary,
): Promise<void> {
  const matches = eventsMatchingEventsTabSub(sub, now);
  if (matches.length === 0) return;
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
}

/**
 * Most recent UTC timestamp at-or-before `now` matching (dow, hourUtc:00).
 * dow uses Date.getUTCDay() convention (0=Sun..6=Sat). Used by catch-up
 * dispatch: if the most recent slot is in the past and `last_dispatched_at`
 * is older, we missed a tick and should fire now (subject to lateness cap).
 */
export function mostRecentWeeklyOccurrenceUtc(
  now: Date,
  dow: number,
  hourUtc: number,
): Date {
  const fire = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    hourUtc, 0, 0, 0,
  ));
  // Walk back to the target dow.
  const daysBack = (fire.getUTCDay() - dow + 7) % 7;
  fire.setUTCDate(fire.getUTCDate() - daysBack);
  // If we're on the target day but before hourUtc, that put us in the future
  // — step back a full week to the previous occurrence.
  if (fire.getTime() > now.getTime()) {
    fire.setUTCDate(fire.getUTCDate() - 7);
  }
  return fire;
}

/**
 * Most recent UTC timestamp at-or-before `now` matching hourUtc:00 on any day.
 */
export function mostRecentDailyOccurrenceUtc(now: Date, hourUtc: number): Date {
  const fire = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    hourUtc, 0, 0, 0,
  ));
  if (fire.getTime() > now.getTime()) {
    fire.setUTCDate(fire.getUTCDate() - 1);
  }
  return fire;
}

/**
 * Parse SQLite `datetime('now')` text (e.g. "2026-05-25 17:57:00") as UTC ms.
 * Returns 0 if null/unparsable so dedupe treats "never fired" as
 * earlier-than-any-slot.
 */
function parseLastDispatchedAtMs(value: string | null): number {
  if (!value) return 0;
  const isoish = value.includes("T") ? value : value.replace(" ", "T");
  const hasTz = /[Zz]|[+-]\d{2}:?\d{2}$/.test(isoish);
  const parsed = Date.parse(hasTz ? isoish : isoish + "Z");
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Catch-up dispatch check: fire if the most recent scheduled slot is in the
 * past, we haven't fired since that slot, and the slot isn't too stale.
 *
 * This replaces a narrow `utcMinute < 5` gate that depended on the scheduler
 * being on time — which GitHub Actions cron isn't. Now a tick delayed up to
 * DIGEST_MAX_LATE_HOURS still catches the missed slot; subsequent ticks
 * within the same slot dedupe via `last_dispatched_at`.
 */
function isDigestSlotDue(
  sub: DiscordSubscription,
  now: Date,
  slot: Date,
): boolean {
  const slotMs = slot.getTime();
  const nowMs = now.getTime();
  if (slotMs > nowMs) return false; // future slot
  if (nowMs - slotMs > DIGEST_MAX_LATE_MS) return false; // ancient slot, skip
  return parseLastDispatchedAtMs(sub.last_dispatched_at) < slotMs;
}

/**
 * The cron body — drain pending retries, evaluate every enabled channel
 * subscription against time gates, then push every Events-tab match. Used by
 * both /api/discord/dispatch (cron) and /api/admin/discord-servers/dispatch-all.
 *
 * `force=true` skips the time gate on weekly/daily digests so an admin or
 * manual curl can fire a digest immediately. Reminders never honor force
 * because their window is time-of-event-based, not now-based.
 */
export async function dispatchAllSubs(
  now: Date,
  force: boolean,
): Promise<DispatchSummary> {
  const summary = newDispatchSummary(now);

  // Drain any retries due for posting before the main loop fires fresh ones.
  // Keeping this first means a flaky tick still makes progress on the queue.
  await drainPendingPosts(now, summary);

  const subs = listEnabledSubscriptions();
  summary.subscriptions_checked = subs.length;

  for (const sub of subs) {
    try {
      if (sub.mode === "weekly") {
        if (sub.dow === null) {
          // Weekly mode requires a configured day-of-week. A null here means
          // the row is misconfigured (UI bug or partial migration); skip
          // silently rather than picking an arbitrary day.
          console.warn(`[discord-dispatch] sub=${sub.id} weekly mode missing dow, skipping`);
          continue;
        }
        const slot = mostRecentWeeklyOccurrenceUtc(now, sub.dow, sub.hour_utc);
        const due = force || isDigestSlotDue(sub, now, slot);
        if (due) {
          await fireDigest(sub, isoWeekKey(now), sub.days_ahead, summary, "scheduled");
          markSubscriptionDispatched(sub.id);
        }
      } else if (sub.mode === "daily") {
        const slot = mostRecentDailyOccurrenceUtc(now, sub.hour_utc);
        const due = force || isDigestSlotDue(sub, now, slot);
        if (due) {
          await fireDigest(sub, dateKey(now), Math.min(sub.days_ahead, 2), summary, "scheduled");
          markSubscriptionDispatched(sub.id);
        }
      } else if (sub.mode === "reminder") {
        await fireReminders(sub, now, summary, "scheduled");
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
  await dispatchEventsTabSubsForAll(now, summary);

  // Admin notification drain: catch up any rows that the fire-and-forget
  // push missed (Discord transient 5xx, race conditions during boot, etc.).
  // pushed_to_discord_at is the idempotency ledger; this is a no-op when
  // every notification was already pushed on first try.
  try {
    const drained = await drainAdminNotifications();
    if (drained.pushed > 0 || drained.failed > 0) {
      console.log(
        `[discord-dispatch] admin notifications drained: pushed=${drained.pushed} failed=${drained.failed} skipped=${drained.skipped}`,
      );
    }
  } catch (err) {
    console.error("[discord-dispatch] admin notification drain failed:", err);
  }

  return summary;
}

export interface GuildDispatchResult {
  subsChecked: number;
  digestsPosted: number;
  remindersPosted: number;
  errors: number;
}

/**
 * Admin manual fire: post every enabled channel-message subscription for one
 * guild. Honors claimPost (no double-posts for buckets already fired). Skips
 * time gates — but the per-event reminder window is still time-based, so a
 * reminder sub will only post for events whose start time falls in the
 * current 5-minute window.
 *
 * Activity rows logged with trigger='manual' so the admin UI distinguishes
 * cron-fired runs from admin-fired ones.
 */
export async function dispatchDigestsForGuild(
  guildId: string,
  now: Date = new Date(),
): Promise<GuildDispatchResult> {
  const subs = listSubscriptionsForGuild(guildId).filter(s => s.enabled);
  const summary = newDispatchSummary(now);
  for (const sub of subs) {
    try {
      if (sub.mode === "weekly") {
        await fireDigest(sub, isoWeekKey(now), sub.days_ahead, summary, "manual");
        markSubscriptionDispatched(sub.id);
      } else if (sub.mode === "daily") {
        await fireDigest(sub, dateKey(now), Math.min(sub.days_ahead, 2), summary, "manual");
        markSubscriptionDispatched(sub.id);
      } else if (sub.mode === "reminder") {
        await fireReminders(sub, now, summary, "manual");
      }
    } catch (err) {
      summary.errors++;
      console.error(`[discord-dispatch] manual sub=${sub.id} top-level failure:`, err);
    }
  }
  return {
    subsChecked: subs.length,
    digestsPosted: summary.digests_posted,
    remindersPosted: summary.reminders_posted,
    errors: summary.errors,
  };
}

export interface GuildEventsTabResult {
  subsChecked: number;
  eventsPosted: number;
  errors: number;
}

/**
 * Admin manual fire: push matching events into every enabled Events-tab sub
 * for one guild. Idempotent via the (event_id, guild_id) ledger.
 */
export async function dispatchEventsTabSubsForGuild(
  guildId: string,
  now: Date = new Date(),
): Promise<GuildEventsTabResult> {
  const subs = getDb()
    .prepare("SELECT * FROM discord_scheduled_event_subs WHERE guild_id = ? AND enabled = 1")
    .all(guildId) as DiscordEventsTabSub[];
  const summary = newDispatchSummary(now);
  for (const sub of subs) {
    try {
      await dispatchOneEventsTabSub(sub, now, summary);
    } catch (err) {
      summary.errors++;
      console.error(`[discord-dispatch] manual events-tab sub=${sub.id} top-level failure:`, err);
    }
  }
  return {
    subsChecked: subs.length,
    eventsPosted: summary.events_tab_events_posted,
    errors: summary.errors,
  };
}
