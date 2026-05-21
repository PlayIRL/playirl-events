import { randomUUID } from "crypto";
import { getDb } from "./db";

export interface UserSource {
  id: string;
  user_id: string;
  kind: string;
  external_id: string;
  label: string;
  venue_name: string;
  venue_address: string;
  latitude: number | null;
  longitude: number | null;
  enabled: number;
  created_at: string;
  last_synced_at: string | null;
}

export interface CreateUserSourceInput {
  user_id: string;
  kind: "discord";
  external_id: string;
  label: string;
  venue_name?: string;
  venue_address?: string;
  latitude?: number | null;
  longitude?: number | null;
}

export function listSourcesForUser(userId: string): UserSource[] {
  return getDb()
    .prepare("SELECT * FROM user_sources WHERE user_id = ? ORDER BY created_at DESC")
    .all(userId) as UserSource[];
}

export function getSource(id: string): UserSource | undefined {
  return getDb().prepare("SELECT * FROM user_sources WHERE id = ?").get(id) as UserSource | undefined;
}

export function createUserSource(input: CreateUserSourceInput): UserSource {
  const id = randomUUID();
  const db = getDb();
  db.prepare(`
      INSERT INTO user_sources (id, user_id, kind, external_id, label, venue_name, venue_address, latitude, longitude)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
    id,
    input.user_id,
    input.kind,
    input.external_id,
    input.label,
    input.venue_name ?? "",
    input.venue_address ?? "",
    input.latitude ?? null,
    input.longitude ?? null,
  );
  // Admin notification: a user has connected their Discord guild as an event
  // source — high-signal activity. Only fires for Discord sources today;
  // generalize if other kinds get added.
  if (input.kind === "discord") {
    const userRow = db
      .prepare("SELECT email FROM users WHERE id = ?")
      .get(input.user_id) as { email: string } | undefined;
    const label = input.label || input.external_id;
    void import("@/lib/admin-notifications").then((m) =>
      m.recordAdminNotification({
        type: "discord_guild_connected",
        title: `${userRow?.email ?? "User"} connected ${label}`,
        subtitle: `Guild ${input.external_id}${input.venue_name ? ` · ${input.venue_name}` : ""}`,
        href: `/admin/discord-servers`,
        userId: input.user_id,
      }),
    );
  }
  return getSource(id)!;
}

export function setSourceEnabled(id: string, userId: string, enabled: boolean): boolean {
  const r = getDb()
    .prepare("UPDATE user_sources SET enabled = ? WHERE id = ? AND user_id = ?")
    .run(enabled ? 1 : 0, id, userId);
  return r.changes > 0;
}

export function deleteSource(id: string, userId: string): boolean {
  const r = getDb().prepare("DELETE FROM user_sources WHERE id = ? AND user_id = ?").run(id, userId);
  return r.changes > 0;
}

export function listEnabledDiscordSources(): UserSource[] {
  return getDb()
    .prepare("SELECT * FROM user_sources WHERE kind = 'discord' AND enabled = 1")
    .all() as UserSource[];
}

export function markSynced(id: string): void {
  getDb().prepare("UPDATE user_sources SET last_synced_at = datetime('now') WHERE id = ?").run(id);
}

export function isGuildClaimed(guildId: string): boolean {
  const row = getDb()
    .prepare("SELECT 1 FROM user_sources WHERE kind = 'discord' AND external_id = ?")
    .get(guildId);
  return !!row;
}
