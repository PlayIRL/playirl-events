// Local DB tracking for events pushed to Discord guild Events-tab. Mirror of
// `discord_subscription_posts` but for the per-event one-shot create/update/
// delete model rather than the per-subscription recurring-message model.
//
// Schema lives in lib/db.ts (discord_scheduled_event_posts).

import { getDb } from "./db";

export interface DiscordScheduledEventPost {
  event_id: string;
  guild_id: string;
  discord_event_id: string;
  posted_by_user_id: string | null;
  posted_at: string;
  last_synced_at: string | null;
}

const COLUMNS =
  "event_id, guild_id, discord_event_id, posted_by_user_id, posted_at, last_synced_at";

/** Every guild this event has been pushed to, ordered by posted_at desc. */
export function listScheduledEventPostsForEvent(eventId: string): DiscordScheduledEventPost[] {
  return getDb()
    .prepare(
      `SELECT ${COLUMNS} FROM discord_scheduled_event_posts WHERE event_id = ? ORDER BY posted_at DESC`,
    )
    .all(eventId) as DiscordScheduledEventPost[];
}

export function getScheduledEventPost(eventId: string, guildId: string): DiscordScheduledEventPost | null {
  const row = getDb()
    .prepare(`SELECT ${COLUMNS} FROM discord_scheduled_event_posts WHERE event_id = ? AND guild_id = ?`)
    .get(eventId, guildId) as DiscordScheduledEventPost | undefined;
  return row ?? null;
}

/**
 * Insert (or replace) the (event_id, guild_id) row. We use OR REPLACE rather
 * than OR IGNORE so a re-post (e.g. after a manual delete + re-add) updates
 * the discord_event_id correctly. The composite PK guarantees only one row
 * per (event, guild) pair.
 */
export function recordScheduledEventPost(
  eventId: string,
  guildId: string,
  discordEventId: string,
  userId: string | null,
): void {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO discord_scheduled_event_posts
         (event_id, guild_id, discord_event_id, posted_by_user_id, posted_at, last_synced_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
    )
    .run(eventId, guildId, discordEventId, userId);
}

export function removeScheduledEventPost(eventId: string, guildId: string): boolean {
  const r = getDb()
    .prepare(`DELETE FROM discord_scheduled_event_posts WHERE event_id = ? AND guild_id = ?`)
    .run(eventId, guildId);
  return r.changes > 0;
}

/** Stamp last_synced_at after a successful PATCH. */
export function markScheduledEventPostSynced(eventId: string, guildId: string): void {
  getDb()
    .prepare(
      `UPDATE discord_scheduled_event_posts SET last_synced_at = datetime('now') WHERE event_id = ? AND guild_id = ?`,
    )
    .run(eventId, guildId);
}
