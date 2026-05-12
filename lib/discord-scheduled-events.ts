// Wrapper around Discord's Guild Scheduled Events REST API. Distinct from
// `lib/discord-post.ts` (which posts channel messages) — this surface
// creates the native scheduled events that appear in a server's Events tab.
//
// Discord docs:
//   https://discord.com/developers/docs/resources/guild-scheduled-event
//
// Auth: bot token (the bot is the actor that creates the event in Discord).
// Permission: bot must have MANAGE_EVENTS in the target guild. New invites
// after PR #131 grant this; pre-existing servers will need to re-invite to
// get the bumped permissions. createDiscordScheduledEvent surfaces a clear
// "missing permissions" error if the bot lacks them.

import { DiscordPostError } from "./discord-post";
import type { EventRow } from "./events";
import { fromZonedTime } from "date-fns-tz";
import { SITE_URL } from "./config";

const DISCORD_API = "https://discord.com/api/v10";

function botToken(): string | null {
  return process.env.DISCORD_BOT_TOKEN || null;
}

// Discord's scheduled-event entity types. We always use EXTERNAL because our
// events are real-world (a venue location), not a Discord stage/voice
// channel. Per Discord docs, EXTERNAL events MUST set entity_metadata.location
// and a scheduled_end_time (Discord rejects the create otherwise).
const ENTITY_TYPE_EXTERNAL = 3;

// Privacy level. Only GUILD_ONLY (2) is supported for guild scheduled events
// at the API level — public scheduled events were never enabled to third
// parties.
const PRIVACY_GUILD_ONLY = 2;

interface CreateGuildScheduledEventInput {
  name: string;
  scheduled_start_time: string; // ISO-8601 with timezone
  scheduled_end_time: string;   // ISO-8601 with timezone
  description?: string;
  location: string;             // entity_metadata.location for EXTERNAL events
  /** Optional base64-encoded image (no data URL prefix); Discord crops to
   *  16:9 in the Events tab. Limit is 256 KB. */
  image?: string;
}

export interface DiscordScheduledEvent {
  id: string;
  guild_id: string;
  name: string;
  scheduled_start_time: string;
  scheduled_end_time: string | null;
  description: string | null;
}

/**
 * Format an event-row's date+time+timezone into the ISO-8601 string Discord
 * expects. Re-uses the same date-fns-tz path the dispatcher uses for reminder
 * scheduling, so a noon-local event always anchors to the same wall-clock
 * moment regardless of where the bot's host machine thinks it is.
 *
 * The `time` string is "HH:MM" (24h). When absent we default to noon — the
 * event still has to fit into Discord's required (start, end) pair, and a
 * mid-day default is safer than midnight (which can be off-by-one-day in
 * some timezones during DST transitions).
 */
function eventStartIso(event: EventRow): string {
  const time = event.time && /^\d{2}:\d{2}/.test(event.time) ? event.time : "12:00";
  // `${date}T${time}:00` is naive local; fromZonedTime resolves it against
  // the IANA zone to a real UTC instant.
  const local = `${event.date}T${time.length === 5 ? time + ":00" : time}`;
  const tz = event.timezone || "America/New_York";
  return fromZonedTime(local, tz).toISOString();
}

/** Default end time = start + 3 hours. Most LGS events run 2–4 hours;
 *  3h is the median and Discord just needs SOMETHING to satisfy the
 *  EXTERNAL-event end-time requirement. */
function eventEndIso(event: EventRow): string {
  const start = new Date(eventStartIso(event));
  return new Date(start.getTime() + 3 * 60 * 60 * 1000).toISOString();
}

/**
 * Build the body for a Discord guild scheduled event from an internal
 * EventRow. Embed the canonical playirl.gg URL into the description so the
 * Discord-side event always links back home.
 */
export function buildScheduledEventPayload(event: EventRow): CreateGuildScheduledEventInput {
  // Description: prefer host-written `notes`, fall back to the scraper's
  // `description` (same priority as the detail page). Truncated + a link
  // back to PlayIRL. Discord caps at 1000 chars; budget 800 for the body so
  // we have room for the link.
  const linkLine = `\n\nDetails: ${SITE_URL}/event/${encodeURIComponent(event.id)}`;
  const body = (event.notes || event.description || "").trim();
  const trimmedBody = body.length > 800 ? body.slice(0, 797) + "…" : body;
  const description = (trimmedBody ? `${trimmedBody}${linkLine}` : linkLine.trim()).slice(0, 1000);

  // Location field: prefer "Venue, Address" when both are present; fall back
  // to whichever we have. EXTERNAL events require non-empty location (max
  // 100 chars).
  const venue = event.location?.trim() ?? "";
  const address = event.address?.trim() ?? "";
  const locationParts = [venue, address].filter(Boolean);
  const location = (locationParts.join(", ") || "Venue TBD").slice(0, 100);

  // Name: format-prefixed when set so the Events tab is scannable.
  const namePrefix = event.format ? `${event.format} — ` : "";
  const name = `${namePrefix}${event.title}`.slice(0, 100);

  return {
    name,
    scheduled_start_time: eventStartIso(event),
    scheduled_end_time: eventEndIso(event),
    description,
    location,
  };
}

async function discordRequest(
  path: string,
  init: RequestInit,
): Promise<Response> {
  const token = botToken();
  if (!token) throw new Error("DISCORD_BOT_TOKEN is not configured");
  return fetch(`${DISCORD_API}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
  });
}

/**
 * Create a guild scheduled event. Throws DiscordPostError on non-2xx —
 * status 403 with body code 50013 means the bot lacks MANAGE_EVENTS
 * (the operator needs to re-invite with the new permission set).
 */
export async function createDiscordScheduledEvent(
  guildId: string,
  event: EventRow,
): Promise<DiscordScheduledEvent> {
  const payload = {
    ...buildScheduledEventPayload(event),
    entity_type: ENTITY_TYPE_EXTERNAL,
    entity_metadata: { location: buildScheduledEventPayload(event).location },
    privacy_level: PRIVACY_GUILD_ONLY,
  };
  // Strip the standalone "location" we set for the input shape — Discord
  // wants it inside entity_metadata only.
  const { location: _location, ...rest } = payload;
  void _location;
  const res = await discordRequest(`/guilds/${guildId}/scheduled-events`, {
    method: "POST",
    body: JSON.stringify(rest),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new DiscordPostError(res.status, body);
  }
  return await res.json() as DiscordScheduledEvent;
}

/** Patch an existing scheduled event's fields to match the latest event row. */
export async function updateDiscordScheduledEvent(
  guildId: string,
  discordEventId: string,
  event: EventRow,
): Promise<void> {
  const payload = buildScheduledEventPayload(event);
  // PATCH accepts a partial — we send only the user-visible fields.
  const res = await discordRequest(
    `/guilds/${guildId}/scheduled-events/${discordEventId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        name: payload.name,
        description: payload.description,
        scheduled_start_time: payload.scheduled_start_time,
        scheduled_end_time: payload.scheduled_end_time,
        entity_metadata: { location: payload.location },
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new DiscordPostError(res.status, body);
  }
}

/** Delete an existing scheduled event. */
export async function deleteDiscordScheduledEvent(
  guildId: string,
  discordEventId: string,
): Promise<void> {
  const res = await discordRequest(
    `/guilds/${guildId}/scheduled-events/${discordEventId}`,
    { method: "DELETE" },
  );
  // 404 means it was already deleted — treat as success so the caller can
  // clean up our local row without an error message.
  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => "");
    throw new DiscordPostError(res.status, body);
  }
}
