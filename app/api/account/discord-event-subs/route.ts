// Endpoints for managing "subscribe a guild's Events tab to matching
// PlayIRL events" subscriptions. Distinct from /api/account/discord/* —
// that surface drives recurring channel-message digests; this surface
// creates Discord guild scheduled events from a filter, and (optionally)
// keeps doing so for new matching events as they land.
//
// POST body shape:
//   {
//     guild_id: string,
//     subscribe: boolean,   // create the sub row? false = one-shot push only
//     name?: string | null,
//     venue_name?: string | null,
//     format?: string | null,
//     near?: string | null,
//     radius_miles?: number | null,
//     days_ahead?: number,
//   }
//
// Always enumerates currently-matching events and creates Discord scheduled
// events for them in `guild_id` immediately. When `subscribe = true`, also
// creates a sub row so the dispatcher keeps pushing new matches going forward.

import { NextResponse } from "next/server";
import { getCurrentUser, hasAccountAccess } from "@/lib/session";
import {
  getDiscordAccountForUser,
  listUserManageableGuilds,
} from "@/lib/discord-account";
import { listBotGuilds } from "@/lib/discord-bot";
import { geocodeAddress } from "@/lib/geocode";
import {
  createEventsTabSub,
  eventsMatchingEventsTabSub,
  listEventsTabSubsManageableByUser,
  pushEventsToGuild,
} from "@/lib/discord-events-tab-subs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface CreateBody {
  guild_id: string;
  subscribe: boolean;
  name?: string | null;
  venue_name?: string | null;
  format?: string | null;
  source?: string | null;
  near?: string | null;
  radius_miles?: number | null;
  days_ahead?: number;
}

export async function GET() {
  if (!(await hasAccountAccess())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const subs = listEventsTabSubsManageableByUser(user.id);
  return NextResponse.json({ subs });
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
  if (!body.guild_id) {
    return NextResponse.json({ error: "guild_id is required" }, { status: 400 });
  }
  if (typeof body.subscribe !== "boolean") {
    return NextResponse.json({ error: "subscribe (boolean) is required" }, { status: 400 });
  }

  // Authorize: user must hold MANAGE_GUILD in the target guild AND the bot
  // must already be a member (otherwise the create-event call will 404).
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
    return NextResponse.json(
      { error: "You don't have Manage Server permission in that guild." },
      { status: 403 },
    );
  }
  const botGuilds = await listBotGuilds();
  if (!botGuilds.some(g => g.id === body.guild_id)) {
    return NextResponse.json(
      { error: "The bot isn't in that server. Add it first via /account?tab=discord." },
      { status: 422 },
    );
  }

  // Validate + normalize filter fields.
  const radiusMiles = body.radius_miles ?? null;
  if (radiusMiles !== null && (radiusMiles < 1 || radiusMiles > 500)) {
    return NextResponse.json({ error: "radius_miles out of range" }, { status: 400 });
  }
  const daysAhead = body.days_ahead ?? 30;
  if (daysAhead < 1 || daysAhead > 60) {
    return NextResponse.json({ error: "days_ahead out of range" }, { status: 400 });
  }
  const format = body.format?.trim() || null;
  const source = body.source?.trim() || null;
  const venueName = body.venue_name?.trim() || null;

  // Geocode `near` so the matcher can radius-filter without a second pass.
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

  // Build the filter shape we'll use for the immediate push and (optionally)
  // persist into the new sub row.
  const filter = {
    guild_id: body.guild_id,
    name: body.name ?? null,
    venue_name: venueName,
    format,
    source,
    radius_miles: radiusMiles,
    center_lat: centerLat,
    center_lng: centerLng,
    near_label: nearLabel,
    days_ahead: daysAhead,
  };

  // Always: push currently-matching events. The user expects an immediate
  // result either way — a sub that posts nothing on creation feels broken.
  const matches = eventsMatchingEventsTabSub(filter);
  const pushResult = await pushEventsToGuild(
    body.guild_id,
    matches,
    user.id,
  );

  if (pushResult.permanentError) {
    const status = pushResult.permanentError.status;
    if (status === 403) {
      return NextResponse.json(
        {
          error:
            "The bot doesn't have permission to create events in that server. " +
            "Ask a server admin to re-invite the bot to grant the Manage Events permission.",
          discord_status: status,
        },
        { status: 422 },
      );
    }
    if (status === 404) {
      return NextResponse.json(
        { error: "The bot isn't in that server anymore.", discord_status: status },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { error: `Discord rejected the request: ${pushResult.permanentError.body.slice(0, 200)}` },
      { status: 502 },
    );
  }

  let subId: string | null = null;
  if (body.subscribe) {
    const account = getDiscordAccountForUser(user.id);
    const sub = createEventsTabSub({
      ...filter,
      linked_user_id: user.id,
      created_by: account?.provider_account_id ?? null,
    });
    subId = sub.id;
  }

  return NextResponse.json({
    ok: true,
    subscribed: body.subscribe,
    subscription_id: subId,
    matched: matches.length,
    posted: pushResult.posted,
    skipped: pushResult.skipped,
    failed: pushResult.failed,
  });
}
