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
  getSubscription,
  listSubscriptionsForGuild,
  setSubscriptionEnabled,
} from "./discord-subscriptions";
import { renderDigestByDay } from "./discord-post";
import { SITE_URL } from "./config";
import { createSubscription, validateSubScope } from "./discord-subscriptions";
import {
  type DiscordSubscriptionDraft,
  createDraft,
  deleteDraft,
  getDraft,
  updateDraft,
} from "./discord-subscription-drafts";

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
  DEFERRED_UPDATE_MESSAGE: 6,
  UPDATE_MESSAGE: 7,
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
    /** Set on APPLICATION_COMMAND / autocomplete interactions. */
    name?: string;
    options?: InteractionOption[];
    /** Set on MESSAGE_COMPONENT interactions (button click, select submit). */
    custom_id?: string;
    /** Discord component type: 2=button, 3=string-select, 8=channel-select. */
    component_type?: number;
    /** Select values (string IDs for string-selects, channel IDs for channel-selects). */
    values?: string[];
    /** Object resolutions for snowflake-valued selects (channel, user, role). */
    resolved?: {
      channels?: Record<string, { id: string; name: string; type: number }>;
    };
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
      /**
       * Resolves to one or more messages. The first PATCHes the deferred ack;
       * any additional messages are POSTed as follow-ups so multi-day digests
       * (one embed per day) don't get truncated against Discord's 4096-char cap.
       */
      work: (interaction: DiscordInteraction) => Promise<DeferredFollowup[]>;
    };

export interface DeferredFollowup {
  content?: string;
  embeds?: unknown[];
  /** Discord message components (action rows + buttons/selects). Optional;
   *  used by the /today and /week subscribe CTA to attach a button under the
   *  last digest message. Caller is responsible for the action-row wrapping. */
  components?: unknown[];
  /** When true, this follow-up is only visible to the user who ran the
   *  command. We use this for the subscribe panel (channel/mode/dow/hour
   *  selects) so a user's draft picks don't spam the channel. */
  ephemeral?: boolean;
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

// --- Discord message component types (subset we use for the subscribe flow) -

const COMPONENT_ACTION_ROW = 1;
const COMPONENT_BUTTON = 2;
const COMPONENT_STRING_SELECT = 3;
const COMPONENT_CHANNEL_SELECT = 8;

const BUTTON_STYLE_PRIMARY = 1;
const BUTTON_STYLE_SECONDARY = 2;
const BUTTON_STYLE_SUCCESS = 3;
const BUTTON_STYLE_DANGER = 4;
const BUTTON_STYLE_LINK = 5;

// Channel type 0 = GUILD_TEXT. The subscribe panel's channel select filters
// to text channels only — announcements and threads would technically accept
// posts but the dispatcher fan-out hasn't been audited against them.
const CHANNEL_TYPE_TEXT = 0;

// --- Subscribe-button custom_id codec --------------------------------------
//
// The /today and /week digest result carries a "🔁 Subscribe to this digest"
// button whose custom_id encodes the lookup's filter state so the click
// handler can hydrate a draft without re-running geocode. Format:
//
//   si:v1:{mode}:{radius}:{lat}:{lng}:{format|_}:{nearB64}
//
// where:
//   mode    = 'd' (daily, from /today) or 'w' (weekly, from /week)
//   radius  = integer miles (matches RADIUS_CHOICES: 5/10/25/50/100)
//   lat/lng = 4-decimal floats (~11m precision; sufficient for a 5mi-min
//             radius query — extra precision would just pad the custom_id)
//   format  = exact MTG format name from FORMAT_CHOICES, or '_' for "any"
//   nearB64 = base64url of near_label, truncated to fit Discord's 100-char
//             custom_id cap. near_label is cosmetic on the subscription row
//             (filtering uses lat/lng), so a truncated label is harmless.
//
// Versioning (`v1`) is in the prefix so we can roll a v2 format without
// breaking buttons already in flight on Discord (clicks decode by version).

const SUBSCRIBE_INIT_PREFIX = "si:v1:";
const CUSTOM_ID_MAX = 100; // Discord's hard limit.

export interface SubscribeButtonState {
  mode: "weekly" | "daily";
  radius_miles: number;
  center_lat: number;
  center_lng: number;
  format: string | null;
  near_label: string;
}

export function encodeSubscribeButtonId(state: SubscribeButtonState): string {
  const m = state.mode === "weekly" ? "w" : "d";
  const r = String(state.radius_miles);
  const lat = state.center_lat.toFixed(4);
  const lng = state.center_lng.toFixed(4);
  const f = state.format ?? "_";
  // Reserve space for the fixed-width parts so we know how much of nearB64 fits.
  const prefix = `${SUBSCRIBE_INIT_PREFIX}${m}:${r}:${lat}:${lng}:${f}:`;
  const nearBudget = CUSTOM_ID_MAX - prefix.length;
  // base64url is colon-free, so the trailing field can safely include arbitrary
  // user text (ZIPs, addresses with commas, etc.) without breaking the split.
  let nearB64 = Buffer.from(state.near_label, "utf8").toString("base64url");
  if (nearB64.length > nearBudget) nearB64 = nearB64.slice(0, nearBudget);
  return prefix + nearB64;
}

export function decodeSubscribeButtonId(customId: string): SubscribeButtonState | null {
  if (!customId.startsWith(SUBSCRIBE_INIT_PREFIX)) return null;
  const body = customId.slice(SUBSCRIBE_INIT_PREFIX.length);
  const parts = body.split(":");
  if (parts.length !== 6) return null;
  const [m, r, lat, lng, f, nearB64] = parts;
  if (m !== "w" && m !== "d") return null;
  const radius_miles = Number(r);
  const center_lat = Number(lat);
  const center_lng = Number(lng);
  if (!Number.isFinite(radius_miles) || radius_miles <= 0) return null;
  if (!Number.isFinite(center_lat) || center_lat < -90 || center_lat > 90) return null;
  if (!Number.isFinite(center_lng) || center_lng < -180 || center_lng > 180) return null;
  let near_label = "";
  try {
    near_label = Buffer.from(nearB64, "base64url").toString("utf8");
  } catch {
    return null;
  }
  // A truncated base64 sequence can decode to a partial multibyte sequence
  // that breaks the validate-by-label rule in createSubscription. Fall back
  // to a lat/lng-derived label when decoding yields empty/whitespace.
  if (!near_label.trim()) near_label = `${center_lat.toFixed(3)}, ${center_lng.toFixed(3)}`;
  return {
    mode: m === "w" ? "weekly" : "daily",
    radius_miles,
    center_lat,
    center_lng,
    format: f === "_" ? null : f,
    near_label,
  };
}

/** Build the action-row component that goes under the last digest message. */
function buildSubscribeButton(state: SubscribeButtonState): unknown {
  return {
    type: COMPONENT_ACTION_ROW,
    components: [
      {
        type: COMPONENT_BUTTON,
        style: BUTTON_STYLE_PRIMARY,
        label: state.mode === "weekly"
          ? "🔁 Subscribe to this weekly digest"
          : "🔁 Subscribe to this daily digest",
        custom_id: encodeSubscribeButtonId(state),
      },
    ],
  };
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

function handleManage(interaction: DiscordInteraction, sub: InteractionOption): InteractionHandlerResult {
  const id = optString(sub.options, "id");
  if (!id) return immediateText("Missing `id` argument.");
  const existing = getSubscription(id);
  if (!existing || existing.guild_id !== interaction.guild_id) {
    return immediateText(`No subscription \`${id}\` in this server.`);
  }
  const panel = renderManagePanel(existing);
  return {
    kind: "immediate",
    response: {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: panel.content, components: panel.components, flags: FLAGS_EPHEMERAL },
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
  // "all" is the slash-command sentinel for "no format filter" — Discord
  // requires non-empty choice values, so we can't use "" for the wildcard.
  // Treat anything else (including a missing value, which shouldn't happen
  // now that format is required) as the typed-in format.
  const rawFormat = optString(opts, "format")?.trim();
  const format = !rawFormat || rawFormat === "all" ? undefined : rawFormat;
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
        return [{ content: `Couldn't find "${location}". Try a postcode or a more specific city/address.` }];
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

      // Multi-message digest: one embed per day, matching the scheduled
      // post format. Avoids the 4096-char "…and N more" truncation that the
      // single-embed summary hit on busy weeks.
      const messages = renderDigestByDay(events);

      // /today (windowDays=1) seeds a daily-mode subscription draft; /week
      // (windowDays=7) seeds weekly. The button's custom_id carries all of
      // the lookup's filter state so the click handler can hydrate a draft
      // without re-running geocode or re-parsing options.
      const subscribeButton = buildSubscribeButton({
        mode: windowDays === 1 ? "daily" : "weekly",
        radius_miles: radiusMiles,
        center_lat: hit.latitude,
        center_lng: hit.longitude,
        format: format ?? null,
        near_label: location,
      });

      if (messages.length === 0) {
        // Empty windows still surface the Subscribe CTA — a user looking at
        // "no events near 19103" is exactly who'd benefit from a recurring
        // alert when something gets scheduled later.
        return [{
          content: `No upcoming events ${windowLabel}${filterSuffix}. Browse the full calendar → ${SITE_URL}/?utm_source=discord`,
          components: [subscribeButton],
        }];
      }
      // Header content prefixes the first message so the filter context (format
      // / radius / location) and total count are visible above the day cards —
      // the per-day embeds themselves only show the date and that day's count.
      const header = `**${events.length} event${events.length === 1 ? "" : "s"} ${windowLabel}**${filterSuffix}`;
      // Subscribe button hangs off the LAST message so it appears as a footer
      // CTA after the user has scrolled past every day. Putting it on the
      // first message would push it above content the user hasn't read yet.
      const lastIdx = messages.length - 1;
      return messages.map((msg, i) => {
        const followup: DeferredFollowup = i === 0
          ? { content: header, embeds: msg.embeds }
          : { embeds: msg.embeds };
        if (i === lastIdx) followup.components = [subscribeButton];
        return followup;
      });
    },
  };
}

// --- Subscribe panel (MESSAGE_COMPONENT interactions) ----------------------
//
// Lifecycle:
//   1. User clicks the Subscribe button on the /today or /week result.
//      custom_id matches `si:v1:...` — see decodeSubscribeButtonId.
//   2. handleSubscribeInit creates a draft row scoped to the clicking user,
//      replies with an ephemeral panel (channel-select + mode/dow/hour
//      selects + submit/cancel buttons). All panel component custom_ids
//      are `sd:v1:{draftId}:{field}`.
//   3. Each select interaction (channel/mode/dow/hour) updates the draft and
//      re-renders the panel via UPDATE_MESSAGE so the chosen value shows as
//      selected on the next render.
//   4. Submit reads the draft, calls createSubscription, deletes the draft,
//      and UPDATE_MESSAGEs the panel into a "✅ Subscribed!" confirmation
//      with all selects stripped. Cancel just clears the panel.

const SUBSCRIBE_DRAFT_PREFIX = "sd:v1:";

/** Hours surfaced in the panel's hour select. Curated rather than 24 entries
 *  so the dropdown stays scannable. Labels acknowledge the seasonal ET shift
 *  (we store a single UTC hour per subscription; perceived ET time drifts by
 *  one hour twice a year — same trade-off the web form makes). */
const HOUR_CHOICES: Array<{ label: string; value: string }> = [
  { label: "Early morning (~8 AM ET)", value: "13" },
  { label: "Midday (~12 PM ET)", value: "17" },
  { label: "Afternoon (~3 PM ET)", value: "20" },
  { label: "Evening (~6 PM ET)", value: "23" },
  { label: "Late evening (~9 PM ET)", value: "2" },
];

// Date.getUTCDay() convention — Sunday = 0.
const DOW_CHOICES: Array<{ label: string; value: string }> = [
  { label: "Sunday", value: "0" },
  { label: "Monday", value: "1" },
  { label: "Tuesday", value: "2" },
  { label: "Wednesday", value: "3" },
  { label: "Thursday", value: "4" },
  { label: "Friday", value: "5" },
  { label: "Saturday", value: "6" },
];

const MODE_CHOICES: Array<{ label: string; value: string }> = [
  { label: "Weekly digest", value: "weekly" },
  { label: "Daily digest", value: "daily" },
];

function ephemeralImmediate(content: string): InteractionHandlerResult {
  return {
    kind: "immediate",
    response: {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content, flags: FLAGS_EPHEMERAL },
    },
  };
}

/**
 * Re-render the subscribe panel for a given draft. Used both for the initial
 * panel reply (post-Subscribe-click) and for every select-driven UPDATE_MESSAGE
 * so the chosen values show as selected on the next render.
 *
 * The panel layout is:
 *   Row 1: Channel select (required — the only field with no default)
 *   Row 2: Mode select (weekly | daily)
 *   Row 3: Day-of-week select  ← weekly only
 *   Row 4: Hour select
 *   Row 5: Submit + Cancel buttons
 *
 * Daily mode collapses to 4 rows by hiding the dow select; the dispatcher
 * ignores dow when mode=daily so it doesn't matter what's stored there.
 */
function renderSubscribePanel(draft: DiscordSubscriptionDraft): {
  content: string;
  components: unknown[];
} {
  const draftId = draft.id;
  const filterBits: string[] = [`within ${draft.radius_miles}mi of ${draft.near_label}`];
  if (draft.format) filterBits.unshift(draft.format);
  const filterLine = filterBits.join(" · ");

  const channelLine = draft.channel_id
    ? `<#${draft.channel_id}>`
    : "_pick a channel below_";

  const content = [
    "**Set up your auto-post**",
    `Filters: ${filterLine}`,
    `Posts to: ${channelLine}`,
    "",
    "Only members with **Manage Server** can subscribe. Pick a channel and confirm — you can edit or unsubscribe later at <https://playirl.gg/account/discord>, with `/playirl manage`, or via the **Manage** button on each post.",
  ].join("\n");

  const components: unknown[] = [];

  // Row 1: channel select (CHANNEL_SELECT type 8, text channels only).
  components.push({
    type: COMPONENT_ACTION_ROW,
    components: [
      {
        type: COMPONENT_CHANNEL_SELECT,
        custom_id: `${SUBSCRIBE_DRAFT_PREFIX}${draftId}:channel`,
        placeholder: "Choose the channel to post to…",
        channel_types: [CHANNEL_TYPE_TEXT],
        // default_values lets Discord render the already-picked channel as
        // selected. Empty array on first render = "user hasn't picked yet".
        default_values: draft.channel_id
          ? [{ id: draft.channel_id, type: "channel" }]
          : [],
      },
    ],
  });

  // Row 2: mode select (weekly | daily).
  components.push({
    type: COMPONENT_ACTION_ROW,
    components: [
      {
        type: COMPONENT_STRING_SELECT,
        custom_id: `${SUBSCRIBE_DRAFT_PREFIX}${draftId}:mode`,
        placeholder: "Schedule cadence",
        options: MODE_CHOICES.map(c => ({
          ...c,
          default: c.value === draft.mode,
        })),
      },
    ],
  });

  // Row 3: day-of-week (weekly only).
  if (draft.mode === "weekly") {
    components.push({
      type: COMPONENT_ACTION_ROW,
      components: [
        {
          type: COMPONENT_STRING_SELECT,
          custom_id: `${SUBSCRIBE_DRAFT_PREFIX}${draftId}:dow`,
          placeholder: "Day of week",
          options: DOW_CHOICES.map(c => ({
            ...c,
            default: draft.dow !== null && c.value === String(draft.dow),
          })),
        },
      ],
    });
  }

  // Row 4: hour-of-day.
  components.push({
    type: COMPONENT_ACTION_ROW,
    components: [
      {
        type: COMPONENT_STRING_SELECT,
        custom_id: `${SUBSCRIBE_DRAFT_PREFIX}${draftId}:hour`,
        placeholder: "Time of day",
        options: HOUR_CHOICES.map(c => ({
          ...c,
          default: draft.hour_utc !== null && c.value === String(draft.hour_utc),
        })),
      },
    ],
  });

  // Final row: submit + cancel.
  components.push({
    type: COMPONENT_ACTION_ROW,
    components: [
      {
        type: COMPONENT_BUTTON,
        style: BUTTON_STYLE_SUCCESS,
        label: "Subscribe",
        custom_id: `${SUBSCRIBE_DRAFT_PREFIX}${draftId}:submit`,
        disabled: !draft.channel_id, // require channel before submit
      },
      {
        type: COMPONENT_BUTTON,
        style: BUTTON_STYLE_SECONDARY,
        label: "Cancel",
        custom_id: `${SUBSCRIBE_DRAFT_PREFIX}${draftId}:cancel`,
      },
    ],
  });

  return { content, components };
}

function handleSubscribeInit(
  interaction: DiscordInteraction,
  customId: string,
): InteractionHandlerResult {
  if (!interaction.guild_id) {
    return ephemeralImmediate("This button only works inside a server.");
  }
  // Web requires Manage Server; mirror that here. Check on click rather than
  // hiding the button — Discord can't conditionally hide buttons per-viewer.
  if (!memberHasManageGuild(interaction.member)) {
    return ephemeralImmediate(
      "You need the **Manage Server** permission to set up an auto-post. Ask an admin to click Subscribe instead — or browse the calendar at <https://playirl.gg>.",
    );
  }
  const userId = interaction.member?.user?.id;
  if (!userId) {
    return ephemeralImmediate("Couldn't identify your Discord account. Try again from a server channel.");
  }
  const state = decodeSubscribeButtonId(customId);
  if (!state) {
    return ephemeralImmediate("That subscribe button is malformed or from an older bot version. Run `/playirl today` or `/playirl week` again to get a fresh button.");
  }

  const draft = createDraft({
    guild_id: interaction.guild_id,
    user_id: userId,
    format: state.format,
    radius_miles: state.radius_miles,
    center_lat: state.center_lat,
    center_lng: state.center_lng,
    near_label: state.near_label,
    mode: state.mode,
  });

  const panel = renderSubscribePanel(draft);
  return {
    kind: "immediate",
    response: {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: panel.content,
        components: panel.components,
        flags: FLAGS_EPHEMERAL, // only the clicker sees the panel
      },
    },
  };
}

interface DraftAction {
  draftId: string;
  field: "channel" | "mode" | "dow" | "hour" | "submit" | "cancel";
}

function parseDraftCustomId(customId: string): DraftAction | null {
  if (!customId.startsWith(SUBSCRIBE_DRAFT_PREFIX)) return null;
  const rest = customId.slice(SUBSCRIBE_DRAFT_PREFIX.length);
  const idx = rest.lastIndexOf(":");
  if (idx === -1) return null;
  const draftId = rest.slice(0, idx);
  const field = rest.slice(idx + 1);
  if (!draftId) return null;
  if (field !== "channel" && field !== "mode" && field !== "dow" && field !== "hour" && field !== "submit" && field !== "cancel") {
    return null;
  }
  return { draftId, field };
}

function updateMessageResponse(content: string, components: unknown[]): InteractionHandlerResult {
  return {
    kind: "immediate",
    response: {
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: { content, components },
    },
  };
}

/**
 * Replace the panel with a terminal message. Used for submit-success, cancel,
 * and any error path that wants to clear the selects (so the user can't re-
 * click into an already-submitted draft).
 */
function clearPanelResponse(content: string): InteractionHandlerResult {
  return updateMessageResponse(content, []);
}

function handleSubscribeDraft(
  interaction: DiscordInteraction,
  customId: string,
): InteractionHandlerResult {
  const action = parseDraftCustomId(customId);
  if (!action) return ephemeralImmediate("Unknown panel action.");

  const draft = getDraft(action.draftId);
  if (!draft) {
    // Expired or already-submitted draft. Clear the panel rather than
    // leaving zombie components the user can re-click into.
    return clearPanelResponse("This subscribe panel expired or was already used. Run `/playirl today` or `/playirl week` to start a new one.");
  }

  // Defense in depth: scope every panel interaction to the user who opened
  // it. Without this an admin in the same channel could hijack someone's
  // draft via copy-pasting the custom_id (Discord doesn't enforce author).
  if (draft.user_id !== interaction.member?.user?.id) {
    return ephemeralImmediate("Only the person who started this subscribe panel can use it. Click Subscribe on a fresh `/playirl today` or `/playirl week` to open your own.");
  }

  // Re-check Manage Server on every interaction. Permissions can change
  // mid-flow (admin role removed); we don't want a half-elevated draft to
  // sneak a subscription through on Submit.
  if (!memberHasManageGuild(interaction.member)) {
    deleteDraft(action.draftId);
    return clearPanelResponse("You no longer have **Manage Server** permission, so this subscribe panel was closed.");
  }

  switch (action.field) {
    case "channel": {
      const channelId = interaction.data?.values?.[0];
      if (!channelId) return ephemeralImmediate("Channel selection was empty.");
      const updated = updateDraft(action.draftId, { channel_id: channelId });
      if (!updated) return clearPanelResponse("Subscribe panel expired.");
      const panel = renderSubscribePanel(updated);
      return updateMessageResponse(panel.content, panel.components);
    }
    case "mode": {
      const raw = interaction.data?.values?.[0];
      if (raw !== "weekly" && raw !== "daily") {
        return ephemeralImmediate("Unsupported schedule mode.");
      }
      const updated = updateDraft(action.draftId, { mode: raw });
      if (!updated) return clearPanelResponse("Subscribe panel expired.");
      const panel = renderSubscribePanel(updated);
      return updateMessageResponse(panel.content, panel.components);
    }
    case "dow": {
      const raw = interaction.data?.values?.[0];
      const dow = raw === undefined ? NaN : Number(raw);
      if (!Number.isInteger(dow) || dow < 0 || dow > 6) {
        return ephemeralImmediate("Invalid day-of-week.");
      }
      const updated = updateDraft(action.draftId, { dow });
      if (!updated) return clearPanelResponse("Subscribe panel expired.");
      const panel = renderSubscribePanel(updated);
      return updateMessageResponse(panel.content, panel.components);
    }
    case "hour": {
      const raw = interaction.data?.values?.[0];
      const hour = raw === undefined ? NaN : Number(raw);
      if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
        return ephemeralImmediate("Invalid hour.");
      }
      const updated = updateDraft(action.draftId, { hour_utc: hour });
      if (!updated) return clearPanelResponse("Subscribe panel expired.");
      const panel = renderSubscribePanel(updated);
      return updateMessageResponse(panel.content, panel.components);
    }
    case "cancel": {
      deleteDraft(action.draftId);
      return clearPanelResponse("Subscribe cancelled. Run `/playirl today` or `/playirl week` if you change your mind.");
    }
    case "submit": {
      if (!draft.channel_id) {
        return ephemeralImmediate("Pick a channel before submitting.");
      }
      if (draft.hour_utc === null) {
        return ephemeralImmediate("Pick a time of day before submitting.");
      }
      if (draft.mode === "weekly" && draft.dow === null) {
        return ephemeralImmediate("Pick a day of week before submitting.");
      }
      // Mirror the web flow's scope validation — guards against a draft
      // somehow missing lat/lng or near_label after a future refactor.
      const scopeError = validateSubScope({
        venue_name: null,
        near_label: draft.near_label,
        center_lat: draft.center_lat,
        center_lng: draft.center_lng,
        radius_miles: draft.radius_miles,
      });
      if (scopeError) {
        return ephemeralImmediate(`Couldn't create the subscription: ${scopeError}`);
      }
      try {
        const created = createSubscription({
          guild_id: draft.guild_id,
          channel_id: draft.channel_id,
          mode: draft.mode,
          format: draft.format,
          radius_miles: draft.radius_miles,
          center_lat: draft.center_lat,
          center_lng: draft.center_lng,
          near_label: draft.near_label,
          hour_utc: draft.hour_utc,
          // dow is required for weekly mode; the dispatcher ignores it for daily.
          dow: draft.mode === "weekly" ? draft.dow : null,
          // days_ahead matches the lookup window the user came from. The
          // dispatcher already clamps daily to ≤2 days internally, so passing
          // the literal 1/7 is safe and self-documenting.
          days_ahead: draft.mode === "weekly" ? 7 : 1,
          created_by: draft.user_id,
        });
        deleteDraft(action.draftId);
        const cadenceLabel = draft.mode === "weekly"
          ? `every ${DOW_CHOICES.find(d => d.value === String(draft.dow))?.label ?? "week"} at <t:${hourUtcToUnix(draft.hour_utc)}:t>`
          : `every day at <t:${hourUtcToUnix(draft.hour_utc)}:t>`;
        const lines = [
          `✅ **Subscribed.** I'll post to <#${draft.channel_id}> ${cadenceLabel}.`,
          `Filters: ${draft.format ? `${draft.format} · ` : ""}within ${draft.radius_miles}mi of ${draft.near_label}`,
          `Manage at <https://playirl.gg/account/discord>, run \`/playirl manage\` (id \`${created.id.slice(0, 8)}\`), or use the **Manage** button on each post.`,
        ];
        return clearPanelResponse(lines.join("\n"));
      } catch (err) {
        console.error("[discord-interactions] subscribe submit failed:", err);
        return ephemeralImmediate("Couldn't create the subscription. Try again, or set it up at <https://playirl.gg/account/discord>.");
      }
    }
  }
}

/**
 * Convert an hour_utc (0–23) into a Unix timestamp for Discord's <t:NNN:t>
 * relative-time syntax. We anchor to the next occurrence of that UTC hour
 * starting from "now" so Discord renders the time in the viewer's local
 * timezone — sidesteps the "is this EDT or EST?" ambiguity in the labels.
 */
function hourUtcToUnix(hourUtc: number): number {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUtc, 0, 0, 0));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return Math.floor(next.getTime() / 1000);
}

// --- Manage panel (scheduled-post button + /playirl manage) ----------------
//
// Every scheduled digest carries a "⚙️ Manage this auto-post" button whose
// custom_id encodes the subscription id. The button is visible to everyone in
// the channel (Discord can't hide a component per-viewer), but the click
// handler gates on Manage Server and politely refuses non-admins — mirroring
// the subscribe-button model. Clicking opens an ephemeral panel with the
// subscription's details and Unsubscribe / Re-enable actions plus a link to
// the web dashboard for full editing. The same panel backs `/playirl manage`.
//
// custom_id grammar (subscription ids are UUIDs — colon-free, so a plain
// `split(":")` is unambiguous):
//   mng:v1:{subId}            → open the panel (button on the public post)
//   mng:v1:{subId}:disable    → unsubscribe (pause) — only from inside a panel
//   mng:v1:{subId}:enable     → re-enable — only from inside a panel

const MANAGE_PREFIX = "mng:v1:";

interface ManageAction {
  subId: string;
  action: "open" | "disable" | "enable";
}

function parseManageCustomId(customId: string): ManageAction | null {
  if (!customId.startsWith(MANAGE_PREFIX)) return null;
  const parts = customId.slice(MANAGE_PREFIX.length).split(":");
  const subId = parts[0];
  if (!subId) return null;
  const action = parts[1] ?? "open";
  if (action !== "open" && action !== "disable" && action !== "enable") return null;
  return { subId, action };
}

/** The action-row that hangs off a scheduled digest post. Exported so the
 *  dispatcher can attach it to the last day's message without duplicating the
 *  custom_id codec. */
export function buildManageButtonRow(subId: string): unknown {
  return {
    type: COMPONENT_ACTION_ROW,
    components: [
      {
        type: COMPONENT_BUTTON,
        style: BUTTON_STYLE_SECONDARY,
        label: "⚙️ Manage this auto-post",
        custom_id: `${MANAGE_PREFIX}${subId}`,
      },
    ],
  };
}

/** Human-readable cadence line for a subscription (weekly/daily/reminder). */
function describeCadence(sub: DiscordSubscription): string {
  if (sub.mode === "weekly") {
    const day = DOW_CHOICES.find(d => d.value === String(sub.dow))?.label ?? "week";
    return `Weekly · every ${day} at <t:${hourUtcToUnix(sub.hour_utc)}:t>`;
  }
  if (sub.mode === "daily") {
    return `Daily · every day at <t:${hourUtcToUnix(sub.hour_utc)}:t>`;
  }
  return `Reminder · ${sub.lead_minutes} min before each matching event`;
}

/**
 * Render the ephemeral management panel for a subscription. Used by both the
 * scheduled-post Manage button and the `/playirl manage` command. The action
 * buttons re-encode the subscription id so a follow-up disable/enable click
 * re-renders this same panel via UPDATE_MESSAGE.
 *
 * `notice` is an optional confirmation banner pinned to the top after an
 * action (e.g. "✅ Unsubscribed.") so the user gets explicit feedback that
 * their click took effect — the panel otherwise looks similar before/after.
 *
 * The copy is deliberately verbose: this menu is the only in-Discord surface
 * for managing an auto-post, so it spells out what each button does and that
 * pausing is reversible, rather than assuming the reader knows.
 */
function renderManagePanel(
  sub: DiscordSubscription,
  notice?: string,
): { content: string; components: unknown[] } {
  const id8 = sub.id.slice(0, 8);
  const status = sub.enabled
    ? "🟢 **Active** — posting on the schedule below."
    : `🔴 **Paused** — no posts are going out right now.${sub.disabled_reason ? ` (${sub.disabled_reason.slice(0, 150)})` : ""}`;

  const filterBits: string[] = [];
  if (sub.venue_name?.trim()) {
    filterBits.push(`at ${sub.venue_name.trim()}`);
  } else {
    filterBits.push(`within ${sub.radius_miles ?? "?"}mi of ${sub.near_label}`);
  }
  if (sub.format) filterBits.unshift(sub.format);

  const lines: string[] = [
    `## ⚙️ Manage auto-post \`${id8}\``,
    "_Only you can see this menu — nothing here posts to the channel._",
  ];
  if (notice) {
    lines.push("", notice);
  }
  lines.push(
    "",
    "**Here's what this auto-post does:**",
    `${status}`,
    `📢 **Posts to:** <#${sub.channel_id}>`,
    `🗓️ **When:** ${describeCadence(sub)}`,
    `🔎 **What it includes:** ${filterBits.join(" · ")}`,
  );
  if (sub.created_by) lines.push(`👤 **Set up by:** <@${sub.created_by}>`);

  // Spell out each button so the action row isn't a guessing game. The primary
  // action flips with the enabled state, so the guide flips with it too.
  lines.push("", "**What you can do from here:**");
  if (sub.enabled) {
    lines.push(
      "• 🛑 **Unsubscribe** — stop these posts. They'll pause immediately, and you can turn them back on here anytime.",
    );
  } else {
    lines.push(
      "• ▶️ **Re-enable** — resume posting on the schedule above. Nothing changes about the filters or timing.",
    );
  }
  lines.push(
    "• ✏️ **Edit on the web** — rename it, or change the channel, filters, day, or time (Discord opens the dashboard in your browser).",
  );

  const actionRow = {
    type: COMPONENT_ACTION_ROW,
    components: [
      sub.enabled
        ? {
            type: COMPONENT_BUTTON,
            style: BUTTON_STYLE_DANGER,
            label: "Unsubscribe",
            custom_id: `${MANAGE_PREFIX}${sub.id}:disable`,
          }
        : {
            type: COMPONENT_BUTTON,
            style: BUTTON_STYLE_SUCCESS,
            label: "Re-enable",
            custom_id: `${MANAGE_PREFIX}${sub.id}:enable`,
          },
      {
        type: COMPONENT_BUTTON,
        style: BUTTON_STYLE_LINK,
        label: "Edit on the web",
        url: `${SITE_URL}/account/discord`,
      },
    ],
  };

  return { content: lines.join("\n"), components: [actionRow] };
}

function handleManageComponent(
  interaction: DiscordInteraction,
  customId: string,
): InteractionHandlerResult {
  const parsed = parseManageCustomId(customId);
  if (!parsed) return ephemeralImmediate("Unknown manage action.");
  if (!interaction.guild_id) {
    return ephemeralImmediate("This button only works inside a server.");
  }
  // Gate on Manage Server, same as the subscribe flow and the slash commands.
  // The button is visible to everyone in the channel; the gate is here.
  if (!memberHasManageGuild(interaction.member)) {
    return ephemeralImmediate(
      "You need the **Manage Server** permission to manage an auto-post. Ask a server admin to use this button instead.",
    );
  }
  const sub = getSubscription(parsed.subId);
  if (!sub || sub.guild_id !== interaction.guild_id) {
    return ephemeralImmediate("That subscription no longer exists in this server.");
  }

  switch (parsed.action) {
    case "open": {
      // Opened from the public post — reply with a fresh ephemeral panel that
      // only the clicker sees.
      const panel = renderManagePanel(sub);
      return {
        kind: "immediate",
        response: {
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: panel.content, components: panel.components, flags: FLAGS_EPHEMERAL },
        },
      };
    }
    case "disable": {
      setSubscriptionEnabled(parsed.subId, false);
      const panel = renderManagePanel(
        getSubscription(parsed.subId) ?? sub,
        "✅ **Unsubscribed.** This auto-post is paused — no more messages will go out. Changed your mind? Tap **Re-enable** below.",
      );
      return updateMessageResponse(panel.content, panel.components);
    }
    case "enable": {
      setSubscriptionEnabled(parsed.subId, true);
      const panel = renderManagePanel(
        getSubscription(parsed.subId) ?? sub,
        "✅ **Re-enabled.** Posts will resume on the schedule shown below.",
      );
      return updateMessageResponse(panel.content, panel.components);
    }
  }
}

function handleComponent(interaction: DiscordInteraction): InteractionHandlerResult {
  const customId = interaction.data?.custom_id ?? "";
  if (customId.startsWith(SUBSCRIBE_INIT_PREFIX)) {
    return handleSubscribeInit(interaction, customId);
  }
  if (customId.startsWith(SUBSCRIBE_DRAFT_PREFIX)) {
    return handleSubscribeDraft(interaction, customId);
  }
  if (customId.startsWith(MANAGE_PREFIX)) {
    return handleManageComponent(interaction, customId);
  }
  return ephemeralImmediate("Unknown component action.");
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
    "**Subscribe** — click the **🔁 Subscribe** button under any `/playirl today` or `/playirl week` result to turn that lookup into a recurring auto-post. Pick channel, day, and time in the follow-up panel.",
    "**`/playirl manage <id>`** — view a recurring post's details and unsubscribe or re-enable it. Start typing in the `id` field — Discord will autocomplete from this server's subscriptions. You can also click the **⚙️ Manage** button under any auto-post.",
    "Full management UI (rename, edit filters, reminder-mode subs) lives on the website → <https://playirl.gg/account/discord>",
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
 * Send one or more messages after a deferred ack. The first message PATCHes
 * the original "thinking..." response; additional messages are POSTed as
 * webhook follow-ups so multi-day digests (one embed per day) don't get
 * truncated against Discord's 4096-char description cap.
 *
 * Discord allows up to 15 minutes between the ack and the follow-ups — far
 * longer than any geocode or DB query takes. Logs and swallows errors so a
 * stale-interaction 404 (user dismissed the loading state) doesn't crash the
 * dispatcher.
 */
export async function sendDeferredFollowups(
  applicationId: string,
  interactionToken: string,
  followups: DeferredFollowup[],
): Promise<void> {
  if (followups.length === 0) return;

  const [first, ...rest] = followups;
  const patchUrl = `${DISCORD_API}/webhooks/${applicationId}/${interactionToken}/messages/@original`;
  try {
    // Note: the PATCH @original endpoint can't change the ephemeral flag of
    // the original interaction response — that's locked in by the type-5 ack.
    // first.ephemeral on the @original message is therefore ignored; ephemeral
    // delivery only applies to POSTed follow-ups below.
    const res = await fetch(patchUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: first.content,
        embeds: first.embeds,
        components: first.components,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[discord-interactions] follow-up PATCH failed: ${res.status} ${body}`);
    }
  } catch (err) {
    console.error("[discord-interactions] follow-up PATCH threw:", err);
  }

  // Additional messages posted sequentially so Discord renders them in order.
  // Webhook follow-ups don't share the per-channel rate-limit budget the bot
  // token uses, but back-to-back POSTs can still hit 429 — a small gap keeps
  // ordered delivery cheap. If a follow-up fails we still try the rest so a
  // single Discord hiccup doesn't drop the whole digest.
  const postUrl = `${DISCORD_API}/webhooks/${applicationId}/${interactionToken}`;
  for (const followup of rest) {
    try {
      const res = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: followup.content,
          embeds: followup.embeds,
          components: followup.components,
          // Per-follow-up ephemeral flag — used by the subscribe panel so
          // the channel/dow/hour selects only appear to the user who clicked
          // Subscribe, not the whole channel.
          flags: followup.ephemeral ? FLAGS_EPHEMERAL : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(`[discord-interactions] follow-up POST failed: ${res.status} ${body}`);
      }
    } catch (err) {
      console.error("[discord-interactions] follow-up POST threw:", err);
    }
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
      // Lead with a status dot so active vs. paused reads at a glance in the
      // picker, then the cadence/format/location, then the short id the panel
      // header echoes back so the user can confirm they opened the right one.
      const tags: string[] = [s.mode];
      if (s.format) tags.push(s.format);
      if (s.near_label) tags.push(`near ${s.near_label}`);
      const dot = s.enabled ? "🟢" : "🔴 (paused)";
      const label = `${dot} ${tags.join(" · ")} — ${s.id.slice(0, 8)}`;
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

  if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
    return handleComponent(interaction);
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
    case "manage": return handleManage(interaction, sub);
    default: return immediateText(`Unknown subcommand: ${sub.name}`);
  }
}
