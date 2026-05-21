// Per-Discord-guild admin settings. Today: just an auto_approve flag that
// flips a guild's incoming Discord events between the default manual-review
// flow (status='pending', surface in /admin/events/pending) and the trusted
// flow (status='active', publishes immediately).
//
// Decoupled from user_sources / discord_subscriptions / config so a guild
// carries the same setting whether it's admin-configured, user-connected,
// or a push target.

import { getDb } from "./db";

export interface DiscordGuildSettings {
  guildId: string;
  autoApprove: boolean;
  updatedAt: string;
}

interface Row {
  guild_id: string;
  auto_approve: number;
  updated_at: string;
}

function fromRow(row: Row): DiscordGuildSettings {
  return {
    guildId: row.guild_id,
    autoApprove: row.auto_approve === 1,
    updatedAt: row.updated_at,
  };
}

export function getGuildSettings(guildId: string): DiscordGuildSettings | null {
  const row = getDb()
    .prepare("SELECT guild_id, auto_approve, updated_at FROM discord_guild_settings WHERE guild_id = ?")
    .get(guildId) as Row | undefined;
  return row ? fromRow(row) : null;
}

export function listGuildSettings(): DiscordGuildSettings[] {
  const rows = getDb()
    .prepare("SELECT guild_id, auto_approve, updated_at FROM discord_guild_settings")
    .all() as Row[];
  return rows.map(fromRow);
}

/** Fast lookup set used inside the ingest path (pull route, runScraper) to
 *  decide whether to bump pending → active. Re-queried per ingest run; the
 *  table is tiny so caching isn't worth the staleness risk. */
export function getAutoApproveGuildIds(): Set<string> {
  const rows = getDb()
    .prepare("SELECT guild_id FROM discord_guild_settings WHERE auto_approve = 1")
    .all() as { guild_id: string }[];
  return new Set(rows.map((r) => r.guild_id));
}

export function setGuildAutoApprove(guildId: string, autoApprove: boolean): DiscordGuildSettings {
  getDb()
    .prepare(`
      INSERT INTO discord_guild_settings (guild_id, auto_approve, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(guild_id) DO UPDATE SET
        auto_approve = excluded.auto_approve,
        updated_at = excluded.updated_at
    `)
    .run(guildId, autoApprove ? 1 : 0);
  return getGuildSettings(guildId)!;
}

/**
 * Promote every event currently in 'pending' for this guild to 'active'.
 * Called when the admin flips auto-approve ON, so existing queued events
 * don't sit in the review queue indefinitely. Idempotent: events already
 * in 'active' / 'skip' / 'pinned' are untouched.
 *
 * Matches by detail_url since admin-source Discord events all share
 * source='discord' (the same shape used by listDiscordServerRows).
 */
export function promotePendingEventsForGuild(guildId: string): number {
  const urlPrefix = `https://discord.com/events/${guildId}/%`;
  const result = getDb()
    .prepare(`
      UPDATE events
         SET status = 'active', updated_date = date('now')
       WHERE status = 'pending'
         AND detail_url LIKE ?
    `)
    .run(urlPrefix);
  return result.changes;
}
