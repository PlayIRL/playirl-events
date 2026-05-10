// CRUD + matching primitives for the "subscribe a guild's Events tab to
// matching events" flow. Companion to lib/discord-subscriptions.ts (which
// drives recurring channel-message posts) — same filter shape, different
// output: when a matching event lands, the dispatcher creates a Discord
// guild scheduled event in the target guild's Events tab.
//
// Idempotency is delegated to lib/discord-scheduled-event-posts.ts. The
// (event_id, guild_id) PK there guarantees a single Discord scheduled event
// per pair regardless of which sub created it — so two overlapping subs
// pointing at the same guild won't double-post the same event.

import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { getActiveEvents, type EventRow } from "./events";
import {
  createDiscordScheduledEvent,
  type DiscordScheduledEvent,
} from "./discord-scheduled-events";
import { DiscordPostError } from "./discord-post";
import {
  getScheduledEventPost,
  recordScheduledEventPost,
} from "./discord-scheduled-event-posts";

export interface DiscordEventsTabSub {
  id: string;
  guild_id: string;
  name: string | null;
  venue_name: string | null;
  format: string | null;
  source: string | null;
  radius_miles: number | null;
  center_lat: number | null;
  center_lng: number | null;
  near_label: string;
  days_ahead: number;
  enabled: number;
  linked_user_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  last_dispatched_at: string | null;
  consecutive_failures: number;
  last_failure_at: string | null;
  disabled_reason: string;
}

export interface CreateEventsTabSubInput {
  guild_id: string;
  name?: string | null;
  venue_name?: string | null;
  format?: string | null;
  source?: string | null;
  radius_miles?: number | null;
  center_lat?: number | null;
  center_lng?: number | null;
  near_label?: string;
  days_ahead?: number;
  linked_user_id?: string | null;
  created_by?: string | null;
}

export function createEventsTabSub(input: CreateEventsTabSubInput): DiscordEventsTabSub {
  const db = getDb();
  const id = randomUUID();
  db.prepare(`
    INSERT INTO discord_scheduled_event_subs (
      id, guild_id, name, venue_name, format, source,
      radius_miles, center_lat, center_lng, near_label,
      days_ahead, linked_user_id, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.guild_id,
    input.name?.trim() || null,
    input.venue_name?.trim() || null,
    input.format ?? null,
    input.source ?? null,
    input.radius_miles ?? null,
    input.center_lat ?? null,
    input.center_lng ?? null,
    input.near_label ?? "",
    input.days_ahead ?? 30,
    input.linked_user_id ?? null,
    input.created_by ?? null,
  );
  return getEventsTabSub(id)!;
}

export function getEventsTabSub(id: string): DiscordEventsTabSub | undefined {
  return getDb()
    .prepare("SELECT * FROM discord_scheduled_event_subs WHERE id = ?")
    .get(id) as DiscordEventsTabSub | undefined;
}

export function listEnabledEventsTabSubs(): DiscordEventsTabSub[] {
  return getDb()
    .prepare("SELECT * FROM discord_scheduled_event_subs WHERE enabled = 1")
    .all() as DiscordEventsTabSub[];
}

/**
 * Subs the given PlayIRL user can manage in the web UI. Mirrors
 * listSubscriptionsManageableByUser — joins on the user's linked Discord
 * OAuth identity so subs auto-appear without a `/playirl link` step.
 */
export function listEventsTabSubsManageableByUser(userId: string): DiscordEventsTabSub[] {
  return getDb().prepare(`
    SELECT s.* FROM discord_scheduled_event_subs s
     WHERE s.linked_user_id = ?
        OR s.created_by IN (
             SELECT provider_account_id FROM accounts
              WHERE user_id = ? AND provider = 'discord'
           )
     ORDER BY s.created_at DESC
  `).all(userId, userId) as DiscordEventsTabSub[];
}

export function userCanManageEventsTabSub(userId: string, subId: string): boolean {
  const row = getDb().prepare(`
    SELECT 1 FROM discord_scheduled_event_subs s
     WHERE s.id = ?
       AND (s.linked_user_id = ?
            OR s.created_by IN (
                 SELECT provider_account_id FROM accounts
                  WHERE user_id = ? AND provider = 'discord'
               ))
     LIMIT 1
  `).get(subId, userId, userId);
  return !!row;
}

export function deleteEventsTabSub(id: string): boolean {
  const r = getDb().prepare("DELETE FROM discord_scheduled_event_subs WHERE id = ?").run(id);
  return r.changes > 0;
}

export function setEventsTabSubEnabled(id: string, enabled: boolean): boolean {
  const r = enabled
    ? getDb()
        .prepare(
          "UPDATE discord_scheduled_event_subs SET enabled = 1, consecutive_failures = 0, disabled_reason = '', updated_at = datetime('now') WHERE id = ?",
        )
        .run(id)
    : getDb()
        .prepare("UPDATE discord_scheduled_event_subs SET enabled = 0, updated_at = datetime('now') WHERE id = ?")
        .run(id);
  return r.changes > 0;
}

export function markEventsTabSubDispatched(id: string): void {
  getDb()
    .prepare(
      "UPDATE discord_scheduled_event_subs SET last_dispatched_at = datetime('now'), consecutive_failures = 0 WHERE id = ?",
    )
    .run(id);
}

const PERMANENT_FAILURE_LIMIT = 5;

export function recordEventsTabSubFailure(
  id: string,
  reason: string,
  permanent: boolean,
): { disabled: boolean; consecutiveFailures: number } {
  const db = getDb();
  const next = db
    .prepare(
      "UPDATE discord_scheduled_event_subs SET consecutive_failures = consecutive_failures + 1, last_failure_at = datetime('now') WHERE id = ? RETURNING consecutive_failures",
    )
    .get(id) as { consecutive_failures: number } | undefined;
  const cf = next?.consecutive_failures ?? 0;
  const shouldDisable = permanent || cf >= PERMANENT_FAILURE_LIMIT;
  if (shouldDisable) {
    db.prepare(
      "UPDATE discord_scheduled_event_subs SET enabled = 0, disabled_reason = ?, updated_at = datetime('now') WHERE id = ?",
    ).run(reason.slice(0, 500), id);
  }
  return { disabled: shouldDisable, consecutiveFailures: cf };
}

// --- Matching --------------------------------------------------------------

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * The set of currently-active events that match this sub's filter, looking
 * `days_ahead` forward from `now`. Mirror of dispatch's eventsForSubscription
 * — venue scope is stricter than radius (skips geo when set).
 */
export function eventsMatchingEventsTabSub(
  sub: Pick<DiscordEventsTabSub, "venue_name" | "format" | "source" | "radius_miles" | "center_lat" | "center_lng" | "days_ahead">,
  now: Date = new Date(),
): EventRow[] {
  const to = new Date(now.getTime() + sub.days_ahead * 24 * 60 * 60 * 1000);
  const venueScope = sub.venue_name?.trim().toLowerCase();
  const useGeo = !venueScope;
  return getActiveEvents({
    format: sub.format ?? undefined,
    from: dateKey(now),
    to: dateKey(to),
    radiusMiles: useGeo ? (sub.radius_miles ?? undefined) : undefined,
    centerLat: useGeo ? (sub.center_lat ?? undefined) : undefined,
    centerLng: useGeo ? (sub.center_lng ?? undefined) : undefined,
  }).filter(ev => {
    if (sub.source && ev.source !== sub.source) return false;
    if (venueScope && (ev.location ?? "").trim().toLowerCase() !== venueScope) return false;
    if (ev.cancelled_at) return false;
    return true;
  });
}

// --- Push (one-shot or per-tick) ------------------------------------------

export interface PushResult {
  attempted: number;
  posted: number;
  skipped: number;
  failed: number;
  /** First permanent error encountered, if any — useful for surfacing
   *  bot-misconfiguration to the user during one-shot pushes. */
  permanentError?: { status: number; body: string };
}

const POST_GAP_MS = 25;

/**
 * Push every matching event from `events` into `guildId`'s Events tab.
 * Skips events already in the (event_id, guild_id) ledger. Best-effort:
 * a single Discord-side failure logs and continues — except permanent
 * errors (403/404), which abort the loop early since they apply to every
 * subsequent call.
 *
 * Returns counts so callers can summarize: one-shot pushes show "posted N"
 * to the user; the cron uses it to decide whether to mark the sub as
 * dispatched.
 */
export async function pushEventsToGuild(
  guildId: string,
  events: EventRow[],
  postedByUserId: string | null,
): Promise<PushResult> {
  const result: PushResult = { attempted: 0, posted: 0, skipped: 0, failed: 0 };
  for (const ev of events) {
    if (getScheduledEventPost(ev.id, guildId)) {
      result.skipped++;
      continue;
    }
    result.attempted++;
    let created: DiscordScheduledEvent;
    try {
      created = await createDiscordScheduledEvent(guildId, ev);
    } catch (err) {
      result.failed++;
      if (err instanceof DiscordPostError) {
        console.error(
          `[events-tab-subs] push event=${ev.id} guild=${guildId} status=${err.status}: ${err.body.slice(0, 200)}`,
        );
        // 403 (missing perms) and 404 (bot not in guild) are guild-wide —
        // every following call will fail too, so bail out and let the
        // caller surface the error.
        if (err.status === 403 || err.status === 404) {
          result.permanentError = { status: err.status, body: err.body };
          return result;
        }
        continue;
      }
      console.error(
        `[events-tab-subs] push event=${ev.id} guild=${guildId} threw:`,
        err instanceof Error ? err.message : String(err),
      );
      continue;
    }
    recordScheduledEventPost(ev.id, guildId, created.id, postedByUserId);
    result.posted++;
    await new Promise(r => setTimeout(r, POST_GAP_MS));
  }
  return result;
}
