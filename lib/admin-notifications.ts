// Admin activity ledger. Captures user-initiated actions worth surfacing to
// admins (signups, Discord connects, sub creates, sub auto-disables, event
// submissions) and powers two surfaces:
//   1. /admin dashboard "Recent activity" card + sidebar unseen-count badge
//   2. Discord push to an admin-configured channel
//
// Idempotency: pushed_to_discord_at is the ledger. Once a row is stamped,
// the cron drain skips it. push_error stores the last failure reason so a
// row that keeps failing doesn't sit silent.
//
// recordAdminNotification() does the DB insert synchronously and kicks off
// the Discord push fire-and-forget — never blocks the user request that
// triggered the notification. Failures are caught + stamped for the cron
// drain to retry.

import { getDb } from "@/lib/db";

export type AdminNotificationType =
  | "signup"
  | "account_linked"
  | "discord_guild_connected"
  | "discord_sub_created"
  | "events_tab_sub_created"
  | "sub_disabled"
  | "event_submitted";

export type AdminNotificationSeverity = "info" | "warn";

export interface AdminNotification {
  id: number;
  type: AdminNotificationType;
  severity: AdminNotificationSeverity;
  title: string;
  subtitle: string | null;
  href: string | null;
  userId: string | null;
  createdAt: string;
  seenInAdminAt: string | null;
  pushedToDiscordAt: string | null;
  pushError: string | null;
}

interface Row {
  id: number;
  type: string;
  severity: string;
  title: string;
  subtitle: string | null;
  href: string | null;
  user_id: string | null;
  created_at: string;
  seen_in_admin_at: string | null;
  pushed_to_discord_at: string | null;
  push_error: string | null;
}

function fromRow(row: Row): AdminNotification {
  return {
    id: row.id,
    type: row.type as AdminNotificationType,
    severity: (row.severity as AdminNotificationSeverity) ?? "info",
    title: row.title,
    subtitle: row.subtitle,
    href: row.href,
    userId: row.user_id,
    createdAt: row.created_at,
    seenInAdminAt: row.seen_in_admin_at,
    pushedToDiscordAt: row.pushed_to_discord_at,
    pushError: row.push_error,
  };
}

export interface RecordInput {
  type: AdminNotificationType;
  severity?: AdminNotificationSeverity;
  title: string;
  subtitle?: string | null;
  href?: string | null;
  userId?: string | null;
}

/**
 * Insert a notification and kick off the Discord push fire-and-forget.
 * Safe to call from any user-facing request path: the DB insert is
 * synchronous, the Discord post is detached, and any thrown error from
 * either is swallowed + logged so the caller's flow never breaks.
 *
 * Returns the inserted notification id, or null if the insert itself
 * failed (extremely unlikely; logged either way).
 */
export function recordAdminNotification(input: RecordInput): number | null {
  let id: number | null = null;
  try {
    const result = getDb()
      .prepare(`
        INSERT INTO admin_notifications (type, severity, title, subtitle, href, user_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(
        input.type,
        input.severity ?? "info",
        input.title,
        input.subtitle ?? null,
        input.href ?? null,
        input.userId ?? null,
      );
    id = Number(result.lastInsertRowid);
  } catch (err) {
    console.error("[admin-notif] insert failed:", err);
    return null;
  }

  // Fire-and-forget Discord push. Dynamic import to avoid a circular dep
  // between this module and lib/discord-admin-push.ts (which reads settings,
  // which transitively imports lib/events.ts, which is heavy). The push
  // module catches its own errors and stamps the row; nothing here needs
  // to await or handle the result.
  if (id !== null) {
    void import("@/lib/discord-admin-push")
      .then((m) => m.pushAdminNotification(id!))
      .catch((err) => {
        console.error(`[admin-notif] async push for notif=${id} threw:`, err);
      });
  }

  return id;
}

export function listRecentNotifications(limit = 25): AdminNotification[] {
  const rows = getDb()
    .prepare(`
      SELECT id, type, severity, title, subtitle, href, user_id,
             created_at, seen_in_admin_at, pushed_to_discord_at, push_error
        FROM admin_notifications
       ORDER BY id DESC
       LIMIT ?
    `)
    .all(limit) as Row[];
  return rows.map(fromRow);
}

export function countUnseenNotifications(): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM admin_notifications WHERE seen_in_admin_at IS NULL")
    .get() as { n: number };
  return row.n;
}

export function markAllNotificationsSeen(): number {
  const result = getDb()
    .prepare("UPDATE admin_notifications SET seen_in_admin_at = datetime('now') WHERE seen_in_admin_at IS NULL")
    .run();
  return result.changes;
}

/** Drain candidates for the dispatch cron — rows the push path never
 *  succeeded on. Bounded so a permanently-broken channel can't make the
 *  cron loop unbounded. */
export function listUnpushedNotifications(limit = 50): AdminNotification[] {
  const rows = getDb()
    .prepare(`
      SELECT id, type, severity, title, subtitle, href, user_id,
             created_at, seen_in_admin_at, pushed_to_discord_at, push_error
        FROM admin_notifications
       WHERE pushed_to_discord_at IS NULL
       ORDER BY id ASC
       LIMIT ?
    `)
    .all(limit) as Row[];
  return rows.map(fromRow);
}

export function markNotificationPushed(id: number): void {
  getDb()
    .prepare("UPDATE admin_notifications SET pushed_to_discord_at = datetime('now'), push_error = NULL WHERE id = ?")
    .run(id);
}

export function markNotificationPushFailed(id: number, error: string): void {
  getDb()
    .prepare("UPDATE admin_notifications SET push_error = ? WHERE id = ?")
    .run(error.slice(0, 500), id);
}

/** Convenience for the push module: stamp the row as "deliberately skipped"
 *  (e.g. when no admin channel is configured) so the cron drain doesn't
 *  reconsider it on every tick. */
export function markNotificationPushSkipped(id: number, reason: string): void {
  getDb()
    .prepare("UPDATE admin_notifications SET pushed_to_discord_at = datetime('now'), push_error = ? WHERE id = ?")
    .run(`skipped: ${reason}`.slice(0, 500), id);
}
