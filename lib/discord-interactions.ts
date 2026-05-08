// Discord HTTP Interactions handler. Verifies the Ed25519 signature on every
// inbound POST (Discord rejects an app whose endpoint can't validate signatures
// during the initial PING handshake), then routes slash commands to the
// subscription CRUD layer.
//
// Uses Node's built-in crypto for signature verification — no tweetnacl
// dependency. Discord's public key is a 32-byte Ed25519 key encoded as hex.

import { createPublicKey, verify as verifySignatureRaw } from "node:crypto";
import { getActiveEvents } from "./events";
import { geocodeAddress } from "./geocode";
import {
  type DiscordSubscription,
  createSubscription,
  getSubscription,
  listSubscriptionsForGuild,
  parseLeadArgument,
  setSubscriptionEnabled,
  updateSubscription,
} from "./discord-subscriptions";
import { renderDigestSummary, renderReminderMessage } from "./discord-post";

const DISCORD_API = "https://discord.com/api/v10";

// --- Discord interaction types (subset we care about) -----------------------

export const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  APPLICATION_COMMAND_AUTOCOMPLETE: 4,
  MODAL_SUBMIT: 5,
} as const;

export const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
  APPLICATION_COMMAND_AUTOCOMPLETE_RESULT: 8,
} as const;

const FLAGS_EPHEMERAL = 1 << 6;

// MANAGE_GUILD permission bit — gates all /playirl admin commands.
const PERMISSION_MANAGE_GUILD = BigInt(0x20);

interface InteractionMember {
  permissions?: string; // bigint as decimal string
  user?: { id: string; username?: string };
}

interface InteractionOption {
  name: string;
  type: number;
  value?: string | number | boolean;
  options?: InteractionOption[];
  /** Set on the focused option in autocomplete interactions. */
  focused?: boolean;
}

export interface DiscordInteraction {
  type: number;
  id: string;
  application_id: string;
  token: string;
  guild_id?: string;
  channel_id?: string;
  member?: InteractionMember;
  data?: {
    name: string;
    options?: InteractionOption[];
  };
}

/**
 * Result returned from a slash-command handler. Either an immediate response
 * (small reply, no I/O), or a deferred response — the route returns the
 * "thinking..." ack inside Discord's 3-second budget, then runs `work()` in
 * the background and PATCHes the original message via webhook follow-up.
 */
export type InteractionHandlerResult =
  | { kind: "immediate"; response: unknown }
  | {
      kind: "deferred";
      /** False for public lookup commands (today/week); true for admin ops. Default true. */
      ephemeral?: boolean;
      work: (interaction: DiscordInteraction) => Promise<DeferredFollowup>;
    };

export interface DeferredFollowup {
  content?: string;
  embeds?: unknown[];
}

// --- Signature verification -------------------------------------------------

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/**
 * Verify Discord's Ed25519 signature on a raw request body. Discord wraps
 * the public key as 32 raw bytes; Node's crypto.verify wants a PEM/SPKI key,
 * so we prepend the standard Ed25519 SPKI DER prefix.
 *
 * Returns false on any error — never throws — so a malformed signature is
 * treated as a verification failure rather than a 500.
 */
export function verifyInteractionSignature(
  rawBody: string,
  signatureHex: string,
  timestamp: string,
  publicKeyHex: string,
): boolean {
  try {
    const sig = Buffer.from(signatureHex, "hex");
    const pub = Buffer.from(publicKeyHex, "hex");
    if (sig.length !== 64 || pub.length !== 32) return false;
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, pub]),
      format: "der",
      type: "spki",
    });
    return verifySignatureRaw(null, Buffer.from(timestamp + rawBody), key, sig);
  } catch {
    return false;
  }
}

// --- Helpers ---------------------------------------------------------------

function memberHasManageGuild(member?: InteractionMember): boolean {
  if (!member?.permissions) return false;
  try {
    const bits = BigInt(member.permissions);
    return (bits & PERMISSION_MANAGE_GUILD) === PERMISSION_MANAGE_GUILD;
  } catch {
    return false;
  }
}

function findOption(opts: InteractionOption[] | undefined, name: string): InteractionOption | undefined {
  return opts?.find(o => o.name === name);
}

function optString(opts: InteractionOption[] | undefined, name: string): string | undefined {
  const v = findOption(opts, name)?.value;
  return typeof v === "string" ? v : undefined;
}

function optInt(opts: InteractionOption[] | undefined, name: string): number | undefined {
  const v = findOption(opts, name)?.value;
  return typeof v === "number" ? v : undefined;
}

function immediateText(content: string): InteractionHandlerResult {
  return {
    kind: "immediate",
    response: {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content, flags: FLAGS_EPHEMERAL },
    },
  };
}


function describeSubscription(sub: DiscordSubscription): string {
  const parts: string[] = [];
  parts.push(`**${sub.mode}**`);
  if (sub.format) parts.push(`format: ${sub.format}`);
  if (sub.source) parts.push(`source: ${sub.source}`);
  if (sub.near_label) parts.push(`near: ${sub.near_label}${sub.radius_miles ? ` (${sub.radius_miles}mi)` : ""}`);
  if (sub.mode === "weekly") parts.push(`day: ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][sub.dow ?? 0]}`);
  if (sub.mode === "weekly" || sub.mode === "daily") parts.push(`hour_utc: ${sub.hour_utc}`);
  if (sub.mode === "reminder") parts.push(`lead: ${sub.lead_preset ?? `${sub.lead_minutes}min`}`);
  parts.push(`<#${sub.channel_id}>`);
  return `\`${sub.id}\` — ${parts.join(" · ")}`;
}

// --- Command handlers -------------------------------------------------------

function handleSubscribe(_interaction: DiscordInteraction, sub: InteractionOption): InteractionHandlerResult {
  const opts = sub.options;
  const mode = optString(opts, "mode") as "weekly" | "daily" | "reminder" | undefined;
  if (!mode) return immediateText("Missing `mode` argument.");

  const leadRaw = optString(opts, "lead");
  const lead = mode === "reminder" ? parseLeadArgument(leadRaw) : null;
  if (mode === "reminder" && leadRaw && !lead) {
    return immediateText(`Invalid \`lead\`: \`${leadRaw}\`. Try \`1h\`, \`2h\`, \`morning_of\`, \`day_before\`, or a number of minutes.`);
  }

  // Defer: geocoding `near` may take several seconds — well past Discord's
  // 3-second response window. Acknowledge immediately, do the work in the
  // background, then PATCH the placeholder via webhook follow-up.
  return {
    kind: "deferred",
    work: async (interaction) => {
      const guildId = interaction.guild_id!;
      const channelId = interaction.channel_id!;
      const format = optString(opts, "format")?.trim() || null;
      const source = optString(opts, "source")?.trim() || null;
      const radiusMiles = optInt(opts, "radius_miles") ?? null;
      const near = optString(opts, "near")?.trim();
      const hourUtc = optInt(opts, "hour_utc");
      const dow = optInt(opts, "dow");
      const daysAhead = optInt(opts, "days_ahead");

      let centerLat: number | null = null;
      let centerLng: number | null = null;
      let nearLabel = "";
      if (near) {
        const hit = await geocodeAddress(near);
        if (!hit) {
          return { content: `Could not geocode "${near}". Try a more specific address or zip.` };
        }
        centerLat = hit.latitude;
        centerLng = hit.longitude;
        nearLabel = near;
      }

      const created = createSubscription({
        guild_id: guildId,
        channel_id: channelId,
        mode,
        format,
        source,
        radius_miles: radiusMiles,
        center_lat: centerLat,
        center_lng: centerLng,
        near_label: nearLabel,
        hour_utc: hourUtc ?? 14,
        dow: mode === "weekly" ? (dow ?? 1) : null,
        lead_preset: lead?.preset ?? null,
        lead_minutes: lead?.minutes ?? 60,
        days_ahead: daysAhead ?? 7,
        created_by: interaction.member?.user?.id ?? null,
      });

      return {
        content:
          `Subscription created.\n${describeSubscription(created)}\n\n` +
          `Use \`/playirl preview ${created.id}\` to see what would post right now, or \`/playirl unsubscribe ${created.id}\` to remove it.`,
      };
    },
  };
}

function handleList(interaction: DiscordInteraction): InteractionHandlerResult {
  const subs = listSubscriptionsForGuild(interaction.guild_id!);
  if (subs.length === 0) {
    return immediateText("No subscriptions in this server yet. Try `/playirl subscribe`.");
  }
  const lines = subs.slice(0, 25).map(describeSubscription);
  const more = subs.length > 25 ? `\n…and ${subs.length - 25} more.` : "";
  return immediateText(lines.join("\n") + more);
}

function handleUnsubscribe(interaction: DiscordInteraction, sub: InteractionOption): InteractionHandlerResult {
  const id = optString(sub.options, "id");
  if (!id) return immediateText("Missing `id` argument.");
  const existing = getSubscription(id);
  if (!existing || existing.guild_id !== interaction.guild_id) {
    return immediateText(`No subscription \`${id}\` in this server.`);
  }
  setSubscriptionEnabled(id, false);
  return immediateText(`Unsubscribed \`${id}\`. (Subscription disabled — re-enable it from the database if needed.)`);
}

function handlePreview(_interaction: DiscordInteraction, sub: InteractionOption): InteractionHandlerResult {
  const id = optString(sub.options, "id");
  if (!id) return immediateText("Missing `id` argument.");

  // Defer: getActiveEvents is fast in the common case but does in-memory
  // distance filtering when radius is set, and a future Discord upload of
  // event images could push past the 3s window. Cheaper to always defer.
  return {
    kind: "deferred",
    work: async (interaction) => {
      const subscription = getSubscription(id);
      if (!subscription || subscription.guild_id !== interaction.guild_id) {
        return { content: `No subscription \`${id}\` in this server.` };
      }
      const today = new Date();
      const from = today.toISOString().slice(0, 10);
      const to = new Date(today.getTime() + subscription.days_ahead * 86400_000).toISOString().slice(0, 10);

      const events = getActiveEvents({
        format: subscription.format ?? undefined,
        from,
        to,
        radiusMiles: subscription.radius_miles ?? undefined,
        centerLat: subscription.center_lat ?? undefined,
        centerLng: subscription.center_lng ?? undefined,
      }).filter(ev => !subscription.source || ev.source === subscription.source);

      if (subscription.mode === "reminder") {
        if (events.length === 0) return { content: "No upcoming events match this subscription's filters." };
        const msg = renderReminderMessage(events[0]);
        return { content: msg.content, embeds: msg.embeds ?? [] };
      }
      const windowLabel = subscription.mode === "weekly" ? "this week" : "today";
      const msg = renderDigestSummary(events, { windowLabel });
      return { content: msg.content, embeds: msg.embeds ?? [] };
    },
  };
}

function handleEdit(_interaction: DiscordInteraction, sub: InteractionOption): InteractionHandlerResult {
  const opts = sub.options;
  const id = optString(opts, "id");
  if (!id) return immediateText("Missing `id` argument.");

  const leadRaw = optString(opts, "lead");
  const lead = leadRaw ? parseLeadArgument(leadRaw) : null;
  if (leadRaw && !lead) {
    return immediateText(`Invalid \`lead\`: \`${leadRaw}\`.`);
  }

  // Defer: same shape as subscribe — `near` may geocode, plus we want to read
  // the existing row before writing for a tidy "what changed" reply.
  return {
    kind: "deferred",
    work: async (interaction) => {
      const existing = getSubscription(id);
      if (!existing || existing.guild_id !== interaction.guild_id) {
        return { content: `No subscription \`${id}\` in this server.` };
      }

      const patch: Parameters<typeof updateSubscription>[1] = {};

      const format = optString(opts, "format");
      if (format !== undefined) patch.format = format.trim() || null;

      const source = optString(opts, "source");
      if (source !== undefined) patch.source = source.trim() || null;

      const radiusMiles = optInt(opts, "radius_miles");
      if (radiusMiles !== undefined) patch.radius_miles = radiusMiles;

      const near = optString(opts, "near");
      if (near !== undefined) {
        if (near.trim() === "") {
          patch.center_lat = null;
          patch.center_lng = null;
          patch.near_label = "";
        } else {
          const hit = await geocodeAddress(near.trim());
          if (!hit) return { content: `Could not geocode "${near}". Try a more specific address or zip.` };
          patch.center_lat = hit.latitude;
          patch.center_lng = hit.longitude;
          patch.near_label = near.trim();
        }
      }

      const hourUtc = optInt(opts, "hour_utc");
      if (hourUtc !== undefined) patch.hour_utc = hourUtc;

      const dow = optInt(opts, "dow");
      if (dow !== undefined) patch.dow = dow;

      const daysAhead = optInt(opts, "days_ahead");
      if (daysAhead !== undefined) patch.days_ahead = daysAhead;

      if (lead) {
        patch.lead_preset = lead.preset;
        patch.lead_minutes = lead.minutes;
      }

      const updated = updateSubscription(id, patch);
      if (!updated) return { content: `Subscription \`${id}\` could not be updated.` };

      return {
        content: `Subscription updated.\n${describeSubscription(updated)}`,
      };
    },
  };
}

/**
 * Public lookup commands (`/playirl today` / `/playirl week`). These are
 * read-only and visible to everyone in the channel — anyone can ask "what's
 * happening this week" without needing Manage Server. Filters mirror the
 * subscribe options so users can casually scope by format / location.
 */
function handleLookup(
  _interaction: DiscordInteraction,
  sub: InteractionOption,
  windowDays: number,
  windowLabel: string,
): InteractionHandlerResult {
  const opts = sub.options;
  const format = optString(opts, "format")?.trim() || undefined;
  const near = optString(opts, "near")?.trim();
  const radiusMiles = optInt(opts, "radius_miles");
  const source = optString(opts, "source")?.trim() || undefined;

  return {
    kind: "deferred",
    ephemeral: false,
    work: async () => {
      // "Today" anchors on Eastern time so the event date matches what users
      // see on the site (the site assumes Philadelphia by default; hosts in
      // other zones still get correct UTC start times via the per-event
      // timezone field, but the date-bucket query is local).
      const easternTodayStr = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
        year: "numeric", month: "2-digit", day: "2-digit",
      }).format(new Date());
      const from = easternTodayStr;
      const toDate = new Date(easternTodayStr + "T00:00:00Z");
      toDate.setUTCDate(toDate.getUTCDate() + Math.max(0, windowDays - 1));
      const to = toDate.toISOString().slice(0, 10);

      let centerLat: number | undefined;
      let centerLng: number | undefined;
      if (near && radiusMiles) {
        const hit = await geocodeAddress(near);
        if (!hit) {
          return { content: `Couldn't geocode "${near}". Try a more specific address.` };
        }
        centerLat = hit.latitude;
        centerLng = hit.longitude;
      }

      const events = getActiveEvents({
        format,
        from,
        to,
        radiusMiles: radiusMiles ?? undefined,
        centerLat,
        centerLng,
      }).filter(ev => !source || ev.source === source);

      const filterParts: string[] = [];
      if (format) filterParts.push(format);
      if (source) filterParts.push(source);
      if (near && radiusMiles) filterParts.push(`within ${radiusMiles}mi of ${near}`);
      const filterSuffix = filterParts.length > 0 ? ` matching ${filterParts.join(" · ")}` : "";

      const msg = renderDigestSummary(events, { windowLabel: `${windowLabel}${filterSuffix}` });
      // Lookups are public by design — the whole point is to surface events
      // into the channel so other members see them. (No ephemeral flag.)
      return { content: msg.content, embeds: msg.embeds ?? [] };
    },
  };
}

function handleHelp(): InteractionHandlerResult {
  const lines = [
    "**PlayIRL.GG Discord bot — quick reference**",
    "",
    "_Anyone can run these:_",
    "**`/playirl today`** — show events happening today. All filters are dropdowns: pick a format, a venue/area, and a radius.",
    "**`/playirl week`** — show events in the next 7 days. Same dropdowns.",
    "**`/playirl help`** — this menu.",
    "",
    "_Manage Server only:_",
    "**`/playirl subscribe`** — schedule recurring event posts in this channel. Easier on the website → <https://playirl.gg/account/discord>",
    "**`/playirl list`** — list this server's subscriptions.",
    "**`/playirl preview <id>`** — show what a subscription would post right now.",
    "**`/playirl edit <id>`** — change one or more options on an existing subscription.",
    "**`/playirl unsubscribe <id>`** — disable a subscription.",
    "",
    `Browse the full event calendar at <https://playirl.gg>.`,
  ];
  return immediateText(lines.join("\n"));
}

// --- Deferred follow-up via webhook ----------------------------------------

/**
 * PATCH the original interaction message after a deferred ack. Discord allows
 * up to 15 minutes between the ack and the follow-up — far longer than any
 * geocode or DB query takes. Logs and swallows errors so a stale-interaction
 * 404 (user dismissed the loading state) doesn't crash the dispatcher.
 */
export async function sendDeferredFollowup(
  applicationId: string,
  interactionToken: string,
  followup: DeferredFollowup,
): Promise<void> {
  const url = `${DISCORD_API}/webhooks/${applicationId}/${interactionToken}/messages/@original`;
  try {
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: followup.content,
        embeds: followup.embeds,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[discord-interactions] follow-up PATCH failed: ${res.status} ${body}`);
    }
  } catch (err) {
    console.error("[discord-interactions] follow-up PATCH threw:", err);
  }
}

// --- Autocomplete -----------------------------------------------------------

interface AutocompleteChoice { name: string; value: string }

function autocompleteResponse(choices: AutocompleteChoice[]): InteractionHandlerResult {
  return {
    kind: "immediate",
    response: {
      type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
      data: { choices: choices.slice(0, 25) }, // Discord caps at 25
    },
  };
}

function findFocusedOption(opts: InteractionOption[] | undefined): InteractionOption | undefined {
  if (!opts) return undefined;
  for (const o of opts) {
    if (o.focused) return o;
    const inner = findFocusedOption(o.options);
    if (inner) return inner;
  }
  return undefined;
}

function handleAutocomplete(interaction: DiscordInteraction): InteractionHandlerResult {
  if (!interaction.guild_id) return autocompleteResponse([]);
  const focused = findFocusedOption(interaction.data?.options);
  if (!focused) return autocompleteResponse([]);

  // Only the `id` field is auto-completed (everything else uses Discord's
  // own choice/typed-input). Match against subscription ids and short
  // descriptions in the current guild.
  if (focused.name === "id") {
    const query = String(focused.value ?? "").toLowerCase();
    const subs = listSubscriptionsForGuild(interaction.guild_id);
    const matches = subs.filter(s => {
      if (!query) return true;
      return s.id.toLowerCase().includes(query)
        || (s.format ?? "").toLowerCase().includes(query)
        || s.mode.includes(query)
        || s.near_label.toLowerCase().includes(query);
    });
    const choices = matches.map(s => {
      const tags: string[] = [s.mode];
      if (s.format) tags.push(s.format);
      if (s.near_label) tags.push(`near ${s.near_label}`);
      if (!s.enabled) tags.push("disabled");
      const label = `${tags.join(" · ")} — ${s.id.slice(0, 8)}`;
      return { name: label.slice(0, 100), value: s.id };
    });
    return autocompleteResponse(choices);
  }
  return autocompleteResponse([]);
}

// --- Public router ----------------------------------------------------------

/**
 * Handle a verified, parsed interaction. Returns either an immediate response
 * or a deferred work function — the route layer is responsible for ack-ing
 * the deferred case within Discord's 3-second budget and PATCHing the
 * follow-up afterwards.
 */
export function handleInteraction(interaction: DiscordInteraction): InteractionHandlerResult {
  if (interaction.type === InteractionType.PING) {
    return { kind: "immediate", response: { type: InteractionResponseType.PONG } };
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE) {
    return handleAutocomplete(interaction);
  }

  if (interaction.type !== InteractionType.APPLICATION_COMMAND) {
    return immediateText("Unsupported interaction type.");
  }

  if (!interaction.guild_id) {
    return immediateText("This command only works inside a server.");
  }

  if (interaction.data?.name !== "playirl") {
    return immediateText("Unknown command.");
  }

  const sub = interaction.data.options?.[0];
  if (!sub) return immediateText("Missing subcommand.");

  // Public read-only commands — anyone in the channel can use them.
  // Configuration commands below the gate require Manage Server.
  switch (sub.name) {
    case "help":  return handleHelp();
    case "today": return handleLookup(interaction, sub, 1, "today");
    case "week":  return handleLookup(interaction, sub, 7, "this week");
  }

  if (!memberHasManageGuild(interaction.member)) {
    return immediateText("You need the **Manage Server** permission to set up or change subscriptions.");
  }

  switch (sub.name) {
    case "subscribe":   return handleSubscribe(interaction, sub);
    case "list":        return handleList(interaction);
    case "unsubscribe": return handleUnsubscribe(interaction, sub);
    case "preview":     return handlePreview(interaction, sub);
    case "edit":        return handleEdit(interaction, sub);
    default: return immediateText(`Unknown subcommand: ${sub.name}`);
  }
}
