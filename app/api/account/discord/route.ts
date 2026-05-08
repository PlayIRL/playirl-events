// POST /api/account/discord — create a Discord subscription from the web
// "Add subscription" form. Auth: the user must be signed in with Discord
// (so we have a guilds-scoped access token), and must hold MANAGE_GUILD on
// the guild they're targeting. We persist `created_by = the user's Discord
// account id` so the subscription auto-shows up in /account/discord.

import { NextResponse } from "next/server";
import { getCurrentUser, hasAccountAccess } from "@/lib/session";
import { getDiscordAccountForUser, listUserManageableGuilds } from "@/lib/discord-account";
import { listGuildTextChannels } from "@/lib/discord-bot";
import { geocodeAddress } from "@/lib/geocode";
import {
  type DiscordLeadPreset,
  type DiscordSubMode,
  createSubscription,
  parseLeadArgument,
} from "@/lib/discord-subscriptions";

export const dynamic = "force-dynamic";

const VALID_MODES: DiscordSubMode[] = ["weekly", "daily", "reminder"];
const VALID_LEAD_PRESETS: DiscordLeadPreset[] = ["1h", "2h", "morning_of", "day_before", "custom"];

interface CreateBody {
  guild_id: string;
  channel_id: string;
  mode: DiscordSubMode;
  name?: string | null;
  /** Optional single-venue scope. Skips radius/location filters when set. */
  venue_name?: string | null;
  format?: string | null;
  source?: string | null;
  near?: string | null;
  radius_miles?: number | null;
  hour_utc?: number;
  dow?: number | null;
  days_ahead?: number;
  lead?: string | null; // freeform — same parsing as the slash command
}

export async function POST(req: Request) {
  if (!(await hasAccountAccess())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: CreateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 });
  }

  if (!body.guild_id || !body.channel_id) {
    return NextResponse.json({ error: "guild_id and channel_id are required" }, { status: 400 });
  }
  if (!VALID_MODES.includes(body.mode)) {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  }

  // Authorize: user must hold MANAGE_GUILD in that guild, and the channel
  // must actually exist in it.
  let userGuilds;
  try {
    userGuilds = await listUserManageableGuilds(user.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "MISSING_GUILDS_SCOPE" || msg === "DISCORD_TOKEN_EXPIRED") {
      return NextResponse.json({ error: msg, reauth: true }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
  if (!userGuilds.some(g => g.id === body.guild_id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const channels = await listGuildTextChannels(body.guild_id);
  if (!channels.some(c => c.id === body.channel_id)) {
    return NextResponse.json({ error: "Channel not found in this server" }, { status: 404 });
  }

  // Normalize + validate filter fields.
  const format = body.format?.trim() || null;
  const source = body.source?.trim() || null;
  const radiusMiles = body.radius_miles ?? null;
  if (radiusMiles !== null && (radiusMiles < 1 || radiusMiles > 500)) {
    return NextResponse.json({ error: "radius_miles out of range" }, { status: 400 });
  }
  const hourUtc = body.hour_utc ?? 14;
  if (hourUtc < 0 || hourUtc > 23) {
    return NextResponse.json({ error: "hour_utc out of range" }, { status: 400 });
  }
  const dow = body.mode === "weekly" ? (body.dow ?? 1) : null;
  if (dow !== null && (dow < 0 || dow > 6)) {
    return NextResponse.json({ error: "dow out of range" }, { status: 400 });
  }
  const daysAhead = body.days_ahead ?? 7;
  if (daysAhead < 1 || daysAhead > 60) {
    return NextResponse.json({ error: "days_ahead out of range" }, { status: 400 });
  }

  let leadPreset: DiscordLeadPreset | null = null;
  let leadMinutes = 60;
  if (body.mode === "reminder" && body.lead) {
    const lead = parseLeadArgument(body.lead);
    if (!lead) {
      return NextResponse.json({ error: `Invalid lead: ${body.lead}` }, { status: 400 });
    }
    leadPreset = lead.preset;
    leadMinutes = lead.minutes;
  }
  if (leadPreset !== null && !VALID_LEAD_PRESETS.includes(leadPreset)) {
    return NextResponse.json({ error: "Invalid lead preset" }, { status: 400 });
  }

  // Geocode `near` into center_lat/center_lng so the digest filter works.
  let centerLat: number | null = null;
  let centerLng: number | null = null;
  let nearLabel = "";
  if (body.near?.trim()) {
    const hit = await geocodeAddress(body.near.trim());
    if (!hit) {
      return NextResponse.json({ error: `Could not geocode "${body.near}"` }, { status: 400 });
    }
    centerLat = hit.latitude;
    centerLng = hit.longitude;
    nearLabel = body.near.trim();
  }

  const account = getDiscordAccountForUser(user.id);
  const sub = createSubscription({
    guild_id: body.guild_id,
    channel_id: body.channel_id,
    mode: body.mode,
    name: body.name ?? null,
    venue_name: body.venue_name ?? null,
    format,
    source,
    radius_miles: radiusMiles,
    center_lat: centerLat,
    center_lng: centerLng,
    near_label: nearLabel,
    hour_utc: hourUtc,
    dow,
    lead_preset: leadPreset,
    lead_minutes: leadMinutes,
    days_ahead: daysAhead,
    // Tag with the user's Discord id so /account/discord lists it via
    // listSubscriptionsManageableByUser without a /playirl link step.
    created_by: account?.provider_account_id ?? null,
  });

  return NextResponse.json({ ok: true, subscription: sub });
}
