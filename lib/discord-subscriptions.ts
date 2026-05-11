// CRUD + idempotency primitives for the Discord subscriber bot. Schema lives
// in lib/db.ts (discord_subscriptions, discord_subscription_posts).
//
// claimPost / releasePost form the exactly-once-per-bucket contract used by
// the dispatcher: claim inserts a ledger row inside its own micro-transaction,
// then the network call runs unwrapped, and on failure releasePost rolls the
// claim back so the next tick retries.

import { randomUUID } from "node:crypto";
import { getDb } from "./db";

export type DiscordSubMode = "weekly" | "daily" | "reminder";
export type DiscordPostKind = "digest" | "reminder";
export type DiscordLeadPreset = "1h" | "2h" | "morning_of" | "day_before" | "custom";

export interface DiscordSubscription {
  id: string;
  guild_id: string;
  channel_id: string;
  mode: DiscordSubMode;
  /** User-set display name. NULL falls back to an auto-generated title at render time. */
  name: string | null;
  /** Optional single-venue scope. When set, the dispatcher filters events to
   *  only those at this venue and ignores radius/center. */
  venue_name: string | null;
  format: string | null;
  source: string | null;
  radius_miles: number | null;
  center_lat: number | null;
  center_lng: number | null;
  near_label: string;
  hour_utc: number;
  dow: number | null;
  lead_preset: DiscordLeadPreset | null;
  lead_minutes: number;
  days_ahead: number;
  enabled: number;
  linked_user_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  last_dispatched_at: string | null;
  /** Bumped every consecutive Discord post failure on this subscription;
   *  reset to 0 on the next success. The dispatcher auto-disables once it
   *  reaches PERMANENT_FAILURE_LIMIT or a permanent error fires. */
  consecutive_failures: number;
  last_failure_at: string | null;
  /** When the dispatcher auto-disables a subscription, the reason (HTTP
   *  status + Discord error body) lands here so the user sees it on
   *  /account/discord. Empty string when never disabled / re-enabled. */
  disabled_reason: string;
}

export interface CreateSubscriptionInput {
  guild_id: string;
  channel_id: string;
  mode: DiscordSubMode;
  name?: string | null;
  venue_name?: string | null;
  format?: string | null;
  source?: string | null;
  radius_miles?: number | null;
  center_lat?: number | null;
  center_lng?: number | null;
  near_label?: string;
  hour_utc?: number;
  dow?: number | null;
  lead_preset?: DiscordLeadPreset | null;
  lead_minutes?: number;
  days_ahead?: number;
  created_by?: string | null;
}

export function createSubscription(input: CreateSubscriptionInput): DiscordSubscription {
  const db = getDb();
  const id = randomUUID();
  db.prepare(`
    INSERT INTO discord_subscriptions (
      id, guild_id, channel_id, mode, name, venue_name,
      format, source, radius_miles, center_lat, center_lng, near_label,
      hour_utc, dow, lead_preset, lead_minutes, days_ahead,
      created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.guild_id,
    input.channel_id,
    input.mode,
    input.name?.trim() || null,
    input.venue_name?.trim() || null,
    input.format ?? null,
    input.source ?? null,
    input.radius_miles ?? null,
    input.center_lat ?? null,
    input.center_lng ?? null,
    input.near_label ?? "",
    input.hour_utc ?? 14,
    input.dow ?? null,
    input.lead_preset ?? null,
    input.lead_minutes ?? 60,
    input.days_ahead ?? 7,
    input.created_by ?? null,
  );
  return getSubscription(id)!;
}

export function getSubscription(id: string): DiscordSubscription | undefined {
  return getDb()
    .prepare("SELECT * FROM discord_subscriptions WHERE id = ?")
    .get(id) as DiscordSubscription | undefined;
}

export function listSubscriptionsForGuild(guildId: string): DiscordSubscription[] {
  return getDb()
    .prepare("SELECT * FROM discord_subscriptions WHERE guild_id = ? ORDER BY created_at DESC")
    .all(guildId) as DiscordSubscription[];
}

export function listEnabledSubscriptions(): DiscordSubscription[] {
  return getDb()
    .prepare("SELECT * FROM discord_subscriptions WHERE enabled = 1")
    .all() as DiscordSubscription[];
}

/**
 * Subscriptions the given PlayIRL user can manage in the web UI. We join via
 * the user's linked Discord OAuth identity (`accounts` table) so the moment
 * a user signs in with Discord, every sub they created in any guild appears
 * in their dashboard — no `/playirl link` ceremony required.
 *
 * Plus any subs explicitly linked via `linked_user_id` (future flow).
 */
export function listSubscriptionsManageableByUser(userId: string): DiscordSubscription[] {
  return getDb().prepare(`
    SELECT s.* FROM discord_subscriptions s
     WHERE s.linked_user_id = ?
        OR s.created_by IN (
             SELECT provider_account_id FROM accounts
              WHERE user_id = ? AND provider = 'discord'
           )
     ORDER BY s.created_at DESC
  `).all(userId, userId) as DiscordSubscription[];
}

/** Authorization check for the web UI mutation routes. */
export function userCanManageSubscription(userId: string, subscriptionId: string): boolean {
  const row = getDb().prepare(`
    SELECT 1 FROM discord_subscriptions s
     WHERE s.id = ?
       AND (s.linked_user_id = ?
            OR s.created_by IN (
                 SELECT provider_account_id FROM accounts
                  WHERE user_id = ? AND provider = 'discord'
               ))
     LIMIT 1
  `).get(subscriptionId, userId, userId);
  return !!row;
}

export function deleteSubscription(id: string): boolean {
  const r = getDb().prepare("DELETE FROM discord_subscriptions WHERE id = ?").run(id);
  return r.changes > 0;
}

export function setSubscriptionEnabled(id: string, enabled: boolean): boolean {
  // When the user manually re-enables a subscription, clear the auto-disable
  // failure trail too. Otherwise the next failure walks straight back into
  // "5 in a row" because the counter was sitting at 5+ from the prior
  // dead-channel run, and the user's "I fixed the bot permission" attempt
  // gets disabled on the very next tick.
  const r = enabled
    ? getDb()
        .prepare(
          "UPDATE discord_subscriptions SET enabled = 1, consecutive_failures = 0, disabled_reason = '', updated_at = datetime('now') WHERE id = ?",
        )
        .run(id)
    : getDb()
        .prepare("UPDATE discord_subscriptions SET enabled = 0, updated_at = datetime('now') WHERE id = ?")
        .run(id);
  return r.changes > 0;
}

export function updateSubscription(id: string, patch: Partial<CreateSubscriptionInput>): DiscordSubscription | undefined {
  const existing = getSubscription(id);
  if (!existing) return undefined;
  const merged = { ...existing, ...patch };
  getDb().prepare(`
    UPDATE discord_subscriptions SET
      mode = ?, name = ?, venue_name = ?, format = ?, source = ?, radius_miles = ?, center_lat = ?, center_lng = ?,
      near_label = ?, hour_utc = ?, dow = ?, lead_preset = ?, lead_minutes = ?, days_ahead = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    merged.mode,
    merged.name?.trim() || null,
    merged.venue_name?.trim() || null,
    merged.format,
    merged.source,
    merged.radius_miles,
    merged.center_lat,
    merged.center_lng,
    merged.near_label,
    merged.hour_utc,
    merged.dow,
    merged.lead_preset,
    merged.lead_minutes,
    merged.days_ahead,
    id,
  );
  return getSubscription(id);
}

export function markSubscriptionDispatched(id: string): void {
  // A successful dispatch implies the channel + permissions are healthy —
  // reset the consecutive-failure counter so a previously-flaky channel
  // doesn't get auto-disabled by an old streak.
  getDb()
    .prepare(
      "UPDATE discord_subscriptions SET last_dispatched_at = datetime('now'), consecutive_failures = 0 WHERE id = ?",
    )
    .run(id);
}

/**
 * Every Discord subscription must be scoped — either pinned to a specific
 * venue, OR bounded by a geo center + radius. An unscoped sub would post the
 * entire scrape catalog (potentially nationwide), which is the foot-gun this
 * rule closes. Returns null if the scope is valid, otherwise a user-facing
 * error string the API routes return verbatim.
 */
export function validateSubScope(args: {
  venue_name: string | null | undefined;
  near_label: string | null | undefined;
  center_lat: number | null | undefined;
  center_lng: number | null | undefined;
  radius_miles: number | null | undefined;
}): string | null {
  const hasVenue = !!args.venue_name && args.venue_name.trim() !== "";
  if (hasVenue) return null;

  const hasLabel = !!args.near_label && args.near_label.trim() !== "";
  const hasCenter = typeof args.center_lat === "number" && typeof args.center_lng === "number";
  const hasRadius = typeof args.radius_miles === "number" && args.radius_miles > 0;

  if (!hasLabel || !hasCenter) {
    return "Location is required. Enter a city, ZIP, or address.";
  }
  if (!hasRadius) {
    return "Radius is required. Pick how many miles from your location to include.";
  }
  return null;
}

const PERMANENT_FAILURE_LIMIT = 5;

/**
 * Record a Discord post failure against a subscription. Bumps the consecutive
 * failure counter and stamps the time. If `permanent` is true (403/404/410)
 * OR the counter has reached `PERMANENT_FAILURE_LIMIT`, the subscription is
 * also auto-disabled with `disabled_reason` set so the user can see why on
 * /account/discord. Returns whether the subscription was disabled by this
 * call (so the dispatcher can log it).
 */
export function recordSubscriptionFailure(
  id: string,
  reason: string,
  permanent: boolean,
): { disabled: boolean; consecutiveFailures: number } {
  const db = getDb();
  // Read-modify-write — small, on a single row, fine without an explicit
  // transaction. The dispatcher serializes calls per-subscription via the
  // for-of loop, so concurrent writers aren't a concern.
  const next = db
    .prepare(
      "UPDATE discord_subscriptions SET consecutive_failures = consecutive_failures + 1, last_failure_at = datetime('now') WHERE id = ? RETURNING consecutive_failures",
    )
    .get(id) as { consecutive_failures: number } | undefined;
  const cf = next?.consecutive_failures ?? 0;
  const shouldDisable = permanent || cf >= PERMANENT_FAILURE_LIMIT;
  if (shouldDisable) {
    db.prepare(
      "UPDATE discord_subscriptions SET enabled = 0, disabled_reason = ?, updated_at = datetime('now') WHERE id = ?",
    ).run(reason.slice(0, 500), id);
  }
  return { disabled: shouldDisable, consecutiveFailures: cf };
}

/**
 * Atomic claim. Returns true if this caller owns the post for the given
 * (subscription, event, kind, bucket) tuple — meaning no prior tick has
 * inserted the ledger row. Returns false when the row already exists, which
 * is the dedup signal: skip the post.
 */
export function claimPost(
  subscriptionId: string,
  eventId: string,
  kind: DiscordPostKind,
  bucket: string,
): boolean {
  const r = getDb().prepare(`
    INSERT OR IGNORE INTO discord_subscription_posts
      (subscription_id, event_id, kind, bucket)
    VALUES (?, ?, ?, ?)
  `).run(subscriptionId, eventId, kind, bucket);
  return r.changes > 0;
}

/** Roll back a claim when the Discord POST failed — frees the slot for retry. */
export function releasePost(
  subscriptionId: string,
  eventId: string,
  kind: DiscordPostKind,
  bucket: string,
): void {
  getDb().prepare(`
    DELETE FROM discord_subscription_posts
     WHERE subscription_id = ? AND event_id = ? AND kind = ? AND bucket = ?
  `).run(subscriptionId, eventId, kind, bucket);
}

export function recordPostMessageId(
  subscriptionId: string,
  eventId: string,
  kind: DiscordPostKind,
  bucket: string,
  messageId: string,
): void {
  getDb().prepare(`
    UPDATE discord_subscription_posts SET message_id = ?
     WHERE subscription_id = ? AND event_id = ? AND kind = ? AND bucket = ?
  `).run(messageId, subscriptionId, eventId, kind, bucket);
}

/**
 * Every posted bot message that referenced a given event, joined with its
 * subscription's channel id. Used by the edit-on-cancel flow to find which
 * Discord messages need a "cancelled" PATCH.
 *
 * Filters out rows with NULL message_id (the post failed before we recorded
 * Discord's snowflake) — there's nothing to patch in that case.
 */
export interface PostedMessageForEvent {
  channel_id: string;
  message_id: string;
  kind: DiscordPostKind;
  subscription_id: string;
}

// --- Activity log ----------------------------------------------------------

export type DiscordActivityKind = "digest" | "reminder" | "send_now";
export type DiscordActivityTrigger = "scheduled" | "manual" | "retry";
export type DiscordActivityStatus = "ok" | "partial" | "error" | "skipped";

export interface DiscordSubscriptionActivity {
  id: number;
  subscription_id: string;
  fired_at: string;
  kind: DiscordActivityKind;
  trigger: DiscordActivityTrigger;
  status: DiscordActivityStatus;
  event_count: number;
  messages_posted: number;
  error: string | null;
  channel_id: string;
}

/**
 * Append one row to the per-subscription activity log. Best-effort — wrapped
 * in a try/catch by callers so a logging failure never breaks the actual
 * post path. Error strings are truncated to keep the table small.
 */
export function recordSubscriptionActivity(args: {
  subscriptionId: string;
  kind: DiscordActivityKind;
  trigger: DiscordActivityTrigger;
  status: DiscordActivityStatus;
  eventCount: number;
  messagesPosted: number;
  error?: string | null;
  channelId: string;
}): void {
  getDb().prepare(`
    INSERT INTO discord_subscription_activity
      (subscription_id, kind, trigger, status, event_count, messages_posted, error, channel_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    args.subscriptionId,
    args.kind,
    args.trigger,
    args.status,
    args.eventCount,
    args.messagesPosted,
    args.error ? args.error.slice(0, 500) : null,
    args.channelId,
  );
}

/** Most-recent-first activity for a subscription. Default cap is 25 rows. */
export function listSubscriptionActivity(
  subscriptionId: string,
  limit = 25,
): DiscordSubscriptionActivity[] {
  return getDb()
    .prepare(`
      SELECT id, subscription_id, fired_at, kind, trigger, status,
             event_count, messages_posted, error, channel_id
        FROM discord_subscription_activity
       WHERE subscription_id = ?
       ORDER BY fired_at DESC, id DESC
       LIMIT ?
    `)
    .all(subscriptionId, limit) as DiscordSubscriptionActivity[];
}

// --- Pending retry queue ---------------------------------------------------

export interface PendingPost {
  subscription_id: string;
  event_id: string;
  kind: DiscordPostKind;
  bucket: string;
  attempt_count: number;
  next_attempt_at: string;
  last_error: string | null;
}

const MAX_RETRY_ATTEMPTS = 5;

function backoffSeconds(attempt: number): number {
  // 1, 2, 4, 8, 16, 32 minutes. Caps at ~30min so a slow Discord outage
  // doesn't strand a reminder for hours.
  return Math.min(2 ** attempt, 32) * 60;
}

/**
 * Enqueue a failed post for retry. The ledger claim stays in place so the
 * main dispatcher loop won't re-fire the same (sub, event, kind, bucket).
 * `attempt_count` starts at 1 because the caller already tried once.
 */
export function enqueuePendingPost(
  subscriptionId: string,
  eventId: string,
  kind: DiscordPostKind,
  bucket: string,
  errorMessage: string,
): void {
  const now = new Date();
  const nextAttempt = new Date(now.getTime() + backoffSeconds(1) * 1000).toISOString();
  getDb().prepare(`
    INSERT INTO discord_pending_posts
      (subscription_id, event_id, kind, bucket, attempt_count, next_attempt_at, last_error)
    VALUES (?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(subscription_id, event_id, kind, bucket) DO UPDATE SET
      attempt_count = attempt_count + 1,
      next_attempt_at = ?,
      last_error = ?
  `).run(
    subscriptionId, eventId, kind, bucket, nextAttempt, errorMessage,
    nextAttempt, errorMessage,
  );
}

/** Pull the rows whose next_attempt_at has passed, ordered by oldest first. */
export function listDuePendingPosts(now: Date = new Date()): PendingPost[] {
  return getDb().prepare(`
    SELECT * FROM discord_pending_posts
     WHERE next_attempt_at <= ? AND attempt_count < ?
     ORDER BY next_attempt_at ASC
     LIMIT 50
  `).all(now.toISOString(), MAX_RETRY_ATTEMPTS) as PendingPost[];
}

export function deletePendingPost(
  subscriptionId: string,
  eventId: string,
  kind: DiscordPostKind,
  bucket: string,
): void {
  getDb().prepare(`
    DELETE FROM discord_pending_posts
     WHERE subscription_id = ? AND event_id = ? AND kind = ? AND bucket = ?
  `).run(subscriptionId, eventId, kind, bucket);
}

/** Bump the retry counter and push next_attempt_at out by exponential backoff. */
export function bumpPendingPost(
  subscriptionId: string,
  eventId: string,
  kind: DiscordPostKind,
  bucket: string,
  errorMessage: string,
): { attempt: number; givingUp: boolean } {
  const row = getDb().prepare(`
    SELECT attempt_count FROM discord_pending_posts
     WHERE subscription_id = ? AND event_id = ? AND kind = ? AND bucket = ?
  `).get(subscriptionId, eventId, kind, bucket) as { attempt_count: number } | undefined;
  if (!row) return { attempt: 0, givingUp: true };
  const next = row.attempt_count + 1;
  if (next >= MAX_RETRY_ATTEMPTS) {
    // Leave the row in place as a permanent dead letter — the WHERE clause
    // in listDuePendingPosts filters by attempt_count < MAX so it stops
    // being scheduled. Operators can inspect the table for debugging.
    getDb().prepare(`
      UPDATE discord_pending_posts SET attempt_count = ?, last_error = ?
       WHERE subscription_id = ? AND event_id = ? AND kind = ? AND bucket = ?
    `).run(next, errorMessage, subscriptionId, eventId, kind, bucket);
    return { attempt: next, givingUp: true };
  }
  const nextAt = new Date(Date.now() + backoffSeconds(next) * 1000).toISOString();
  getDb().prepare(`
    UPDATE discord_pending_posts
       SET attempt_count = ?, next_attempt_at = ?, last_error = ?
     WHERE subscription_id = ? AND event_id = ? AND kind = ? AND bucket = ?
  `).run(next, nextAt, errorMessage, subscriptionId, eventId, kind, bucket);
  return { attempt: next, givingUp: false };
}

export function listPostedMessagesForEvent(eventId: string): PostedMessageForEvent[] {
  return getDb().prepare(`
    SELECT s.channel_id, p.message_id, p.kind, p.subscription_id
      FROM discord_subscription_posts p
      JOIN discord_subscriptions s ON s.id = p.subscription_id
     WHERE p.event_id = ? AND p.message_id IS NOT NULL
  `).all(eventId) as PostedMessageForEvent[];
}

/** Resolve a lead-time preset string to a minute count. */
export function leadPresetToMinutes(preset: DiscordLeadPreset, eventTimeHHMM?: string): number {
  switch (preset) {
    case "1h": return 60;
    case "2h": return 120;
    case "morning_of": {
      // "morning of" = 8am local on the event day. Caller knows the event's
      // local time-of-day; we just need to express that distance in minutes.
      // Default to "however many minutes from 08:00 to event start".
      if (!eventTimeHHMM) return 60 * 8;
      const [h, m] = eventTimeHHMM.split(":").map(Number);
      const eventMinutes = h * 60 + m;
      const morningMinutes = 8 * 60;
      return Math.max(0, eventMinutes - morningMinutes);
    }
    case "day_before": return 24 * 60;
    case "custom": return 60;
  }
}

/**
 * Parse a `lead` slash-command argument. Accepts presets ("1h", "morning_of")
 * and freeform integer minutes. Returns both the resolved preset tag (for
 * persistence and human-friendly display) and the minute count used by the
 * dispatcher's "events starting in [now+lead, now+lead+5min]" window query.
 */
export function parseLeadArgument(raw: string | null | undefined): { preset: DiscordLeadPreset; minutes: number } | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === "1h") return { preset: "1h", minutes: 60 };
  if (v === "2h") return { preset: "2h", minutes: 120 };
  if (v === "morning_of" || v === "morning") return { preset: "morning_of", minutes: leadPresetToMinutes("morning_of") };
  if (v === "day_before" || v === "day-before") return { preset: "day_before", minutes: 24 * 60 };
  // Freeform integer minutes
  const n = Number.parseInt(v, 10);
  if (Number.isFinite(n) && n >= 0 && n <= 7 * 24 * 60) {
    return { preset: "custom", minutes: n };
  }
  return null;
}
