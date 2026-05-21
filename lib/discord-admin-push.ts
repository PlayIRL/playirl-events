// Push admin notifications to a Discord channel. Reads the configured
// channel ID from settings; when unset, every notification is marked
// "skipped" so the cron drain doesn't reconsider it. Failures are stamped
// onto the notification row for the cron drain (lib/discord-dispatcher.ts
// → drainAdminNotifications) to retry.
//
// Format: one embed per notification with a severity-tinted color, the
// title as the embed title, optional subtitle as the description, and a
// link back to the relevant /admin page when href is provided.

import { getSetting } from "@/lib/events";
import { SITE_URL } from "@/lib/config";
import {
  DiscordPostError,
  postToChannel,
  type DiscordEmbed,
  type DiscordMessagePayload,
} from "@/lib/discord-post";
import {
  listUnpushedNotifications,
  markNotificationPushed,
  markNotificationPushFailed,
  markNotificationPushSkipped,
  type AdminNotification,
} from "@/lib/admin-notifications";
import { getDb } from "@/lib/db";

export const ADMIN_NOTIFICATIONS_CHANNEL_SETTING = "config_admin_notifications_channel_id";

// Mirror of FORMAT_EMBED_COLOR_DEFAULT for our two severities. info = neutral
// indigo (matches site brand), warn = amber. Picked to read clearly against
// both light and dark Discord themes.
const SEVERITY_COLOR: Record<AdminNotification["severity"], number> = {
  info: 0x6366f1, // indigo-500
  warn: 0xf59e0b, // amber-500
};

const TYPE_EMOJI: Record<AdminNotification["type"], string> = {
  signup: "👤",
  account_linked: "🔗",
  discord_guild_connected: "🟣",
  discord_sub_created: "📰",
  events_tab_sub_created: "📅",
  sub_disabled: "⚠️",
  event_submitted: "✏️",
};

export function getAdminNotificationsChannelId(): string {
  return (getSetting(ADMIN_NOTIFICATIONS_CHANNEL_SETTING) || "").trim();
}

function renderNotificationPayload(n: AdminNotification): DiscordMessagePayload {
  const emoji = TYPE_EMOJI[n.type] ?? "•";
  const embed: DiscordEmbed = {
    title: `${emoji} ${n.title}`.slice(0, 256),
    color: SEVERITY_COLOR[n.severity],
  };
  if (n.subtitle) {
    embed.description = n.subtitle.slice(0, 4000);
  }
  if (n.href) {
    const href = n.href.startsWith("http") ? n.href : `${SITE_URL}${n.href}`;
    embed.url = href;
    // Repeat the link in the description so mobile users (who can't always
    // tap the title) still have something to click.
    const linkLine = `[Open admin →](${href})`;
    embed.description = embed.description
      ? `${embed.description}\n\n${linkLine}`
      : linkLine;
  }
  embed.footer = { text: `playirl.gg · ${n.type}` };

  return {
    embeds: [embed],
    allowed_mentions: { parse: [] },
  };
}

async function pushSingleNotification(n: AdminNotification): Promise<void> {
  const channelId = getAdminNotificationsChannelId();
  if (!channelId) {
    markNotificationPushSkipped(n.id, "no admin channel configured");
    return;
  }
  try {
    await postToChannel(channelId, renderNotificationPayload(n));
    markNotificationPushed(n.id);
  } catch (err) {
    const reason =
      err instanceof DiscordPostError
        ? `HTTP ${err.status}: ${err.body.slice(0, 200)}`
        : err instanceof Error
          ? err.message
          : String(err);
    markNotificationPushFailed(n.id, reason);
    // Permanent failures (no channel, bot kicked) should not keep firing on
    // every cron tick. Stamp pushed_to_discord_at so we don't retry; the
    // push_error column preserves the reason for forensics.
    if (err instanceof DiscordPostError && err.isPermanent) {
      markNotificationPushSkipped(n.id, `permanent: ${reason}`);
    }
    console.error(`[admin-push] notif=${n.id} (${n.type}) failed:`, reason);
  }
}

/**
 * Fetch and push one notification by id. Called fire-and-forget from
 * recordAdminNotification so user request paths never block on Discord.
 * No-op if the row was already pushed (cheap re-read).
 */
export async function pushAdminNotification(id: number): Promise<void> {
  const row = getDb()
    .prepare(`
      SELECT id, type, severity, title, subtitle, href, user_id,
             created_at, seen_in_admin_at, pushed_to_discord_at, push_error
        FROM admin_notifications
       WHERE id = ?
    `)
    .get(id) as
    | {
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
    | undefined;
  if (!row || row.pushed_to_discord_at) return;
  await pushSingleNotification({
    id: row.id,
    type: row.type as AdminNotification["type"],
    severity: (row.severity as AdminNotification["severity"]) ?? "info",
    title: row.title,
    subtitle: row.subtitle,
    href: row.href,
    userId: row.user_id,
    createdAt: row.created_at,
    seenInAdminAt: row.seen_in_admin_at,
    pushedToDiscordAt: row.pushed_to_discord_at,
    pushError: row.push_error,
  });
}

/**
 * Cron drain: push every unpushed admin notification. Called from the
 * existing /api/discord/dispatch tick so we don't add a new cron entry.
 * Bounded (50/tick) so a permanently-broken channel can't unbound the loop.
 */
export async function drainAdminNotifications(): Promise<{
  pushed: number;
  failed: number;
  skipped: number;
}> {
  const channelId = getAdminNotificationsChannelId();
  if (!channelId) {
    // No channel configured — sweep any leftover unpushed rows into the
    // "skipped" state so we don't waste cycles re-evaluating them every
    // tick. A later channel config will only push notifications created
    // AFTER it's set, which matches user expectation.
    const unpushed = listUnpushedNotifications(200);
    for (const n of unpushed) {
      markNotificationPushSkipped(n.id, "no admin channel configured");
    }
    return { pushed: 0, failed: 0, skipped: unpushed.length };
  }

  const queue = listUnpushedNotifications(50);
  let pushed = 0;
  let failed = 0;
  for (const n of queue) {
    const before = Date.now();
    await pushSingleNotification(n);
    // Re-check: did the row land pushed? markNotificationPushFailed keeps
    // pushed_to_discord_at null, so a still-null value means failure.
    // Cheap sample query: trust the side effects without an extra read.
    if (Date.now() - before >= 0) {
      // Use the row's now-current state via a quick read.
      const after = getDb()
        .prepare("SELECT pushed_to_discord_at FROM admin_notifications WHERE id = ?")
        .get(n.id) as { pushed_to_discord_at: string | null } | undefined;
      if (after?.pushed_to_discord_at) pushed++;
      else failed++;
    }
  }
  return { pushed, failed, skipped: 0 };
}
