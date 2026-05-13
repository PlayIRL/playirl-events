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
  getSubscription,
  listSubscriptionsForGuild,
  setSubscriptionEnabled,
} from "./discord-subscriptions";
import { renderDigestSummary } from "./discord-post";

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
 * Also rejects timestamps older than ±5 minutes. Without that check, a
 * captured-and-replayed interaction (e.g. from logs or a sniffed transit) is
 * still cryptographically valid — Discord's signature covers the timestamp
 * but doesn't bound its freshness. Discord recommends ±300 seconds.
 *
 * Returns false on any error — never throws — so a malformed signature is
 * treated as a verification failure rather than a 500.
 */
const SIGNATURE_FRESHNESS_SECONDS = 300; // 5 minutes; Discord-recommended.

export function verifyInteractionSignature(
  rawBody: string,
  signatureHex: string,
  timestamp: string,
  publicKeyHex: string,
): boolean {
  try {
    // Replay defense: timestamps come from Discord as Unix seconds. Reject
    // anything outside ±5 minutes of our wall clock.
    const tsSec = Number(timestamp);
    if (!Number.isFinite(tsSec)) return false;
    const driftSec = Math.abs(Date.now() / 1000 - tsSec);
    if (driftSec > SIGNATURE_FRESHNESS_SECONDS) return false;

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

// --- Command handlers -------------------------------------------------------

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
  const location = optString(opts, "location")?.trim();
  const radiusMiles = optInt(opts, "radius_miles");

  // Discord enforces `required: true` client-side, but a malformed payload
  // could still arrive without these — fail loud rather than returning the
  // unscoped global event list.
  if (!location || !radiusMiles) {
    return immediateText("Both `location` and `radius_miles` are required.");
  }

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

      const hit = await geocodeAddress(location);
      if (!hit) {
        return { content: `Couldn't find "${location}". Try a ZIP code or a more specific city/address.` };
      }

      const events = getActiveEvents({
        format,
        from,
        to,
        radiusMiles,
        centerLat: hit.latitude,
        centerLng: hit.longitude,
      });

      const filterParts: string[] = [`within ${radiusMiles}mi of ${location}`];
      if (format) filterParts.unshift(format);
      const filterSuffix = ` matching ${filterParts.join(" · ")}`;

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
    "Find MTG events near you, or manage recurring event posts for this server.",
    "",
    "_Find events (anyone can run):_",
    "**`/playirl today`** — events happening today.",
    "**`/playirl week`** — events in the next 7 days.",
    "",
    "Both commands take three inputs:",
    "• **format** _(optional)_ — Commander, Modern, Standard, Pioneer, Legacy, Pauper, Draft, or Sealed. Leave blank for any.",
    "• **location** _(required)_ — your ZIP code, city, or address. Examples: `19103`, `Philadelphia, PA`, `123 Main St, Wilmington, DE`.",
    "• **radius_miles** _(required)_ — 5, 10, 25, 50, or 100 miles from your location.",
    "",
    "Example: `/playirl week format:Commander location:19103 radius_miles:25`",
    "",
    "_Server admin (needs Manage Server):_",
    "**`/playirl unsubscribe <id>`** — disable a recurring event post. Start typing in the `id` field — Discord will autocomplete from this server's subscriptions.",
    "Set up new subscriptions on the website → <https://playirl.gg/account/discord>",
    "",
    "_Other:_",
    "**`/playirl help`** — show this menu.",
    "",
    "Browse the full event calendar at <https://playirl.gg>.",
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
    case "unsubscribe": return handleUnsubscribe(interaction, sub);
    default: return immediateText(`Unknown subcommand: ${sub.name}`);
  }
}
