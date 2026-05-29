// Discord embed rendering + REST POST. The bot speaks raw v10 — no
// discord.js, no socket. Same auth pattern as scrapers/discord.ts so we don't
// fork the bot-token plumbing.

import { fromZonedTime } from "date-fns-tz";
import type { EventRow } from "./events";
import { listPostedMessagesForEvent } from "./discord-subscriptions";
import { SITE_URL } from "./config";
import { DEFAULT_LOCALE } from "./locale";
import {
  FORMAT_EMOJI,
  FORMAT_EMOJI_DEFAULT,
  FORMAT_EMBED_COLOR,
  FORMAT_EMBED_COLOR_DEFAULT,
  SOURCE_LABELS,
  formatDiscordPill,
} from "./format-style";

const DISCORD_API = "https://discord.com/api/v10";

export interface DiscordEmbed {
  title?: string;
  url?: string;
  description?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  image?: { url: string };
  footer?: { text: string };
}

export interface DiscordMessagePayload {
  content?: string;
  embeds?: DiscordEmbed[];
  /** Allow no @-pings; digest content is informational. */
  allowed_mentions?: { parse: [] };
}

/**
 * Combine an event's local date/time/timezone into a Unix epoch (seconds).
 * Used to feed Discord's `<t:UNIX:F>` syntax — Discord renders these in each
 * viewer's local timezone, which is exactly what we want for a global bot.
 *
 * Returns null when the event has no time set; caller should fall back to a
 * date-only string.
 */
function eventUnixTimestamp(event: EventRow): number | null {
  if (!event.time) return null;
  const tz = event.timezone || "America/New_York";
  try {
    const utc = fromZonedTime(`${event.date}T${event.time}:00`, tz);
    return Math.floor(utc.getTime() / 1000);
  } catch {
    return null;
  }
}

export function renderEventEmbed(event: EventRow): DiscordEmbed {
  const emoji = FORMAT_EMOJI[event.format] ?? FORMAT_EMOJI_DEFAULT;
  const color = FORMAT_EMBED_COLOR[event.format] ?? FORMAT_EMBED_COLOR_DEFAULT;
  const sourceLabel = SOURCE_LABELS[event.source] ?? event.source;

  const ts = eventUnixTimestamp(event);
  const description = ts != null
    ? `**<t:${ts}:F>** · <t:${ts}:R>`
    : `**${event.date}**`;

  const fields: NonNullable<DiscordEmbed["fields"]> = [];
  if (event.format) {
    // Pill = colored unicode square + inline-code format name. The square is
    // the closest unicode-palette match to the site's format chip color;
    // inline code gives Discord's rounded gray background so the chunk reads
    // as a pill instead of plain text.
    const pill = formatDiscordPill(event.format) ?? event.format;
    fields.push({ name: "Format", value: pill, inline: true });
  }
  fields.push({
    name: "Cost",
    value: event.cost && event.cost.trim() ? event.cost : "—",
    inline: true,
  });
  if (event.location) {
    const venueQuery = event.address ? `${event.location} ${event.address}` : event.location;
    const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(venueQuery)}`;
    fields.push({
      name: "Venue",
      value: `[${event.location}](${mapsUrl})`,
      inline: true,
    });
  }

  const embed: DiscordEmbed = {
    title: `${emoji} ${event.title}`,
    url: `${SITE_URL}/event/${encodeURIComponent(event.id)}`,
    description,
    color,
    fields,
    footer: { text: `Source: ${sourceLabel}` },
  };

  if (event.image_url) {
    embed.image = { url: event.image_url };
  }

  return embed;
}

// Embed description hard cap is 4096 chars; leave headroom for the overflow
// footer line so we never truncate it mid-word.
const DIGEST_DESC_BUDGET = 3950;

function escapeMarkdown(text: string): string {
  return text.replace(/([\\[\]()*_~`>])/g, "\\$1");
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  // Discord channel posts: messages are addressed to a Discord audience
  // whose own client renders timestamps in their personal locale. The text
  // headers stay on DEFAULT_LOCALE so a single subscription doesn't render
  // different copy across servers.
  const weekday = d.toLocaleDateString(DEFAULT_LOCALE, { weekday: "long", timeZone: "UTC" });
  const monthDay = d.toLocaleDateString(DEFAULT_LOCALE, { month: "long", day: "numeric", timeZone: "UTC" });
  return `${weekday}, ${monthDay}`;
}

function formatDigestDateHeading(dateStr: string): string {
  // `## ` is Discord's h2 markdown — renders large + bold so the day jumps
  // out as a section divider when scanning a multi-day digest.
  return `## ${formatDateLabel(dateStr)}`;
}

// Two-line block per event:
//   5:00 AM · **[Title](url)**
//   Commander · Top Deck Games · Free
// Time leads so the eye catches "when" first while scanning the day. Title
// gets its own line (wrapping long titles doesn't orphan the metadata of the
// next row), bold + linked for prominence.
function formatDigestEventBlock(event: EventRow): string {
  const ts = eventUnixTimestamp(event);
  const time = ts != null ? `<t:${ts}:t>` : "Time TBD";
  const titleLink = `[${escapeMarkdown(event.title)}](${SITE_URL}/event/${encodeURIComponent(event.id)})`;
  const titleLine = `${time} · **${titleLink}**`;

  const meta: string[] = [];
  if (event.format) {
    // Render the format as a colored-square + inline-code pill so the
    // chunk reads as a badge in chat instead of an undifferentiated word
    // in the meta string. Matches the site's format-chip visual language
    // as closely as Discord's text primitives allow.
    meta.push(formatDiscordPill(event.format) ?? event.format);
  }
  if (event.location) meta.push(event.location);
  if (event.cost && event.cost.trim()) meta.push(event.cost);
  const metaLine = meta.length > 0 ? meta.join(" · ") : "";

  return metaLine ? `${titleLine}\n${metaLine}` : titleLine;
}

/**
 * Build a single digest summary message — one embed listing every matching
 * event as a hyperlinked line, grouped by date. Replaces the old "one full
 * embed per event" format which fanned out to multiple messages above 10
 * events. Stays within Discord's 4096-char description cap by truncating
 * with an overflow footer ("…and N more · view all →") when needed.
 */
export function renderDigestSummary(events: EventRow[], opts: {
  windowLabel: string; // "this week" / "today" / etc.
}): DiscordMessagePayload {
  if (events.length === 0) {
    return {
      content: `No upcoming events ${opts.windowLabel}. Browse the full calendar → ${SITE_URL}/?utm_source=discord`,
      allowed_mentions: { parse: [] },
    };
  }

  // Preserve chronological order (caller passes events sorted by date+time).
  const byDate = new Map<string, EventRow[]>();
  for (const ev of events) {
    const list = byDate.get(ev.date);
    if (list) list.push(ev);
    else byDate.set(ev.date, [ev]);
  }

  const blocks: string[] = [];
  let used = 0;
  let omitted = 0;
  let firstGroup = true;

  for (const [date, evs] of byDate) {
    const heading = formatDigestDateHeading(date);
    // Blank-line spacer between groups (not before the first).
    const headingBlock = firstGroup ? heading : `\n${heading}`;
    if (used + headingBlock.length + 1 > DIGEST_DESC_BUDGET) {
      omitted += evs.length;
      continue;
    }
    blocks.push(headingBlock);
    used += headingBlock.length + 1;
    firstGroup = false;

    let firstInGroup = true;
    for (const ev of evs) {
      // Single blank line between events (Discord renders \n\n as a small
      // paragraph gap), but no gap before the first event of a day so it
      // sits tight under the heading.
      const block = formatDigestEventBlock(ev);
      const piece = firstInGroup ? block : `\n${block}`;
      const cost = piece.length + 1;
      if (used + cost > DIGEST_DESC_BUDGET) {
        omitted++;
        continue;
      }
      blocks.push(piece);
      used += cost;
      firstInGroup = false;
    }
  }

  if (omitted > 0) {
    blocks.push(`\n_…and ${omitted} more · [view all](${SITE_URL}/?utm_source=discord)_`);
  }

  return {
    embeds: [{
      title: `📅 ${events.length} event${events.length === 1 ? "" : "s"} ${opts.windowLabel}`,
      url: `${SITE_URL}/?utm_source=discord`,
      description: blocks.join("\n"),
      color: FORMAT_EMBED_COLOR_DEFAULT,
      footer: { text: "PlayIRL.GG" },
    }],
    allowed_mentions: { parse: [] },
  };
}

/**
 * Multi-message digest: one Discord message per date with events. Used by the
 * scheduled dispatcher and the manual "send now" trigger so very long digests
 * don't get truncated against Discord's 4096-char embed cap (each day's slice
 * is small enough to fit comfortably), and so a 7+ day window doesn't render
 * two side-by-side "Monday" sections that read as duplicates. Days with no
 * matching events are skipped entirely. Returns `[]` when there are no events
 * at all — caller decides whether to post a "no events" placeholder.
 */
export function renderDigestByDay(events: EventRow[]): DiscordMessagePayload[] {
  if (events.length === 0) return [];

  // Preserve chronological order — caller passes events sorted by date+time.
  const byDate = new Map<string, EventRow[]>();
  for (const ev of events) {
    const list = byDate.get(ev.date);
    if (list) list.push(ev);
    else byDate.set(ev.date, [ev]);
  }

  const messages: DiscordMessagePayload[] = [];
  for (const [date, evs] of byDate) {
    if (evs.length === 0) continue;

    const blocks = evs.map(formatDigestEventBlock);
    // Each day's embed should never overflow 4096 chars in practice (50+
    // events at one venue on the same day is implausible), but keep the
    // budget-aware truncation as a safety rail.
    let used = 0;
    const kept: string[] = [];
    let omitted = 0;
    for (const block of blocks) {
      const cost = block.length + 2; // \n\n separator
      if (used + cost > DIGEST_DESC_BUDGET) {
        omitted++;
        continue;
      }
      kept.push(block);
      used += cost;
    }
    let description = kept.join("\n\n");
    if (omitted > 0) {
      description += `\n\n_…and ${omitted} more · [view all](${SITE_URL}/?utm_source=discord)_`;
    }

    messages.push({
      embeds: [{
        title: `📅 ${formatDateLabel(date)} · ${evs.length} event${evs.length === 1 ? "" : "s"}`,
        url: `${SITE_URL}/?utm_source=discord`,
        description,
        color: FORMAT_EMBED_COLOR_DEFAULT,
        footer: { text: "PlayIRL.GG" },
      }],
      allowed_mentions: { parse: [] },
    });
  }
  return messages;
}

export function renderReminderMessage(event: EventRow): DiscordMessagePayload {
  const ts = eventUnixTimestamp(event);
  const content = ts != null
    ? `⏰ Starting <t:${ts}:R>`
    : `⏰ Starting soon`;
  return {
    content,
    embeds: [renderEventEmbed(event)],
    allowed_mentions: { parse: [] },
  };
}

function botToken(): string | null {
  return process.env.DISCORD_BOT_TOKEN || null;
}

export interface PostedMessage {
  id: string;
}

/**
 * Typed error thrown by `postToChannel` on non-2xx Discord responses. Carries
 * the HTTP status and the response body so the dispatcher can decide whether
 * to retry (5xx, 429) or auto-disable the subscription (403, 404, 410).
 */
export class DiscordPostError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Discord POST failed: ${status} ${body}`);
    this.name = "DiscordPostError";
    this.status = status;
    this.body = body;
  }
  /** True when the channel is permanently unreachable (deleted, bot kicked,
   *  or bot lacks the SEND_MESSAGES permission). 410 = Discord's "Gone." */
  get isPermanent(): boolean {
    return this.status === 403 || this.status === 404 || this.status === 410;
  }
}

/**
 * POST a message to a channel using the bot token. Throws DiscordPostError
 * on non-2xx so the dispatcher's catch can release the idempotency claim,
 * decide retry vs. give-up, and handle dead-channel cleanup.
 *
 * Transparently handles 429 by sleeping `retry_after` and retrying up to
 * three times. The per-channel limit is 5 messages / 5 seconds; per-day
 * digest fan-out can trip it even with proactive pacing if a reminder for
 * the same channel posts concurrently. Three retries with the server-
 * supplied wait is enough to absorb that overlap without losing the post.
 */
export async function postToChannel(
  channelId: string,
  payload: DiscordMessagePayload,
): Promise<PostedMessage> {
  const token = botToken();
  if (!token) throw new Error("DISCORD_BOT_TOKEN is not configured");

  const url = `${DISCORD_API}/channels/${channelId}/messages`;
  const init: RequestInit = {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  };

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, init);
    if (res.ok) {
      const data = await res.json() as { id: string };
      return { id: data.id };
    }
    const body = await res.text().catch(() => "");
    if (res.status === 429 && attempt < 3) {
      let retryAfterMs = 1000;
      try {
        const parsed = JSON.parse(body) as { retry_after?: number };
        if (typeof parsed.retry_after === "number") {
          // Discord sends seconds (float). Add 100ms margin for clock skew.
          retryAfterMs = Math.ceil(parsed.retry_after * 1000) + 100;
        }
      } catch { /* fall back to 1s default */ }
      await new Promise(r => setTimeout(r, retryAfterMs));
      continue;
    }
    throw new DiscordPostError(res.status, body);
  }
  // Unreachable — loop returns or throws.
  throw new DiscordPostError(429, "exhausted retry budget");
}

/**
 * PATCH a previously-posted bot message. Used by the edit-on-cancel flow to
 * mark stale digests/reminders as cancelled. Returns true on 2xx, false on
 * any error (the message was deleted, the bot lost permission, etc.) — no
 * throw, since cancellations are best-effort fan-out.
 */
export async function patchChannelMessage(
  channelId: string,
  messageId: string,
  payload: DiscordMessagePayload,
): Promise<boolean> {
  const token = botToken();
  if (!token) return false;
  try {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages/${messageId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[discord-post] PATCH /channels/${channelId}/messages/${messageId} failed: ${res.status} ${body}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[discord-post] PATCH threw:`, err);
    return false;
  }
}

/**
 * Best-effort fan-out: patch every Discord message where this bot referenced
 * the cancelled event, prefixing the content with a "cancelled" notice so
 * users in the channel see the update without a duplicate post.
 *
 * Run as fire-and-forget from the cancel route — caller doesn't wait. We
 * also rate-limit ourselves with a small inter-call gap so a heavily-shared
 * event doesn't trip Discord's per-bot global limit.
 */
export async function patchPostsForCancelledEvent(event: EventRow): Promise<{ patched: number; failed: number }> {
  const messages = listPostedMessagesForEvent(event.id);
  if (messages.length === 0) return { patched: 0, failed: 0 };

  const cancelledEmbed = renderEventEmbed(event);
  // Mark the embed as cancelled visually: gray it out and prepend the title.
  cancelledEmbed.color = 0x6b7280;
  cancelledEmbed.title = `❌ [Cancelled] ${cancelledEmbed.title?.replace(/^[^\s]+\s/, "") ?? event.title}`;

  let patched = 0;
  let failed = 0;
  for (const m of messages) {
    const content = m.kind === "reminder"
      ? `⚠️ This event was cancelled by the host.`
      : `⚠️ One of the events in this digest was cancelled — see below.`;
    const ok = await patchChannelMessage(m.channel_id, m.message_id, {
      content,
      embeds: m.kind === "reminder" ? [cancelledEmbed] : undefined,
    });
    if (ok) patched++; else failed++;
    await new Promise(r => setTimeout(r, 25));
  }
  return { patched, failed };
}
