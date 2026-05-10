// Endpoints for pushing one of the user's events to Discord guild
// Events tabs as native scheduled events. Distinct from
// /api/account/discord/* (subscriptions for posting recurring digests
// to channels) — this surface creates and removes individual scheduled
// events in a guild's Events tab.
//
// Auth model:
//   - The signed-in PlayIRL user must own the event (or be admin).
//   - The user must hold MANAGE_GUILD in the target guild (same gate
//     as the subscription flow uses, so the auth model stays
//     consistent and we don't ship two parallel permission ladders).
//
// On the Discord side: the bot creates the scheduled event and must
// hold MANAGE_EVENTS in the guild. New invites grant it; pre-existing
// servers will need to re-invite to pick up the bumped permissions
// (see lib/discord-bot.ts:BOT_PERMISSIONS comment for details). The
// POST handler maps Discord's 403 / 50013 response to a friendly
// "ask the server admin to re-invite the bot" error.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getEvent } from "@/lib/events";
import { listUserManageableGuilds } from "@/lib/discord-account";
import {
  createDiscordScheduledEvent,
  deleteDiscordScheduledEvent,
  type DiscordScheduledEvent,
} from "@/lib/discord-scheduled-events";
import { DiscordPostError } from "@/lib/discord-post";
import {
  getScheduledEventPost,
  listScheduledEventPostsForEvent,
  recordScheduledEventPost,
  removeScheduledEventPost,
} from "@/lib/discord-scheduled-event-posts";

export const dynamic = "force-dynamic";

/**
 * Verify the signed-in user can act on this event AND on the target guild.
 * Returns the resolved user + event when everything checks out, or a
 * NextResponse to short-circuit the handler with the right HTTP status.
 *
 * Pulled out of the handlers because GET / POST / DELETE all need the same
 * three checks (signed-in, owns/admins event, manages guild — last one only
 * for POST/DELETE, GET skips it).
 */
type AuthOk = { kind: "ok"; userId: string; event: NonNullable<ReturnType<typeof getEvent>> };
type AuthDeny = { kind: "deny"; response: NextResponse };

async function authorize(
  eventId: string,
  guildId: string | null,
): Promise<AuthOk | AuthDeny> {
  const user = await getCurrentUser();
  if (!user || user.suspended) {
    return { kind: "deny", response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const event = getEvent(decodeURIComponent(eventId));
  if (!event) {
    return { kind: "deny", response: NextResponse.json({ error: "Event not found" }, { status: 404 }) };
  }
  const isOwnerOrAdmin = user.role === "admin" || event.owner_id === user.id;
  if (!isOwnerOrAdmin) {
    return { kind: "deny", response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  if (guildId !== null) {
    let guilds;
    try {
      guilds = await listUserManageableGuilds(user.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "DISCORD_TOKEN_EXPIRED" || msg === "MISSING_GUILDS_SCOPE") {
        return {
          kind: "deny",
          response: NextResponse.json(
            { error: "Sign in with Discord again to grant the guilds scope.", code: msg },
            { status: 403 },
          ),
        };
      }
      throw err;
    }
    if (!guilds.some((g) => g.id === guildId)) {
      return {
        kind: "deny",
        response: NextResponse.json(
          { error: "You don't have Manage Server permission in that guild." },
          { status: 403 },
        ),
      };
    }
  }
  return { kind: "ok", userId: user.id, event };
}

/** GET — list every guild this event has been posted to. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await authorize(id, null);
  if (auth.kind === "deny") return auth.response;
  const posts = listScheduledEventPostsForEvent(auth.event.id);
  return NextResponse.json({ posts });
}

/** POST — push the event to the given guild's Events tab.
 *  Body: { guild_id: string }. Idempotent: if a row already exists for
 *  (event, guild), we surface a 409 — the user should remove first if they
 *  want to re-create. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { guild_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.guild_id !== "string" || !body.guild_id) {
    return NextResponse.json({ error: "guild_id (string) is required" }, { status: 400 });
  }
  const auth = await authorize(id, body.guild_id);
  if (auth.kind === "deny") return auth.response;

  const existing = getScheduledEventPost(auth.event.id, body.guild_id);
  if (existing) {
    return NextResponse.json(
      {
        error: "Already posted to this server.",
        post: existing,
      },
      { status: 409 },
    );
  }

  let created: DiscordScheduledEvent;
  try {
    created = await createDiscordScheduledEvent(body.guild_id, auth.event);
  } catch (err) {
    if (err instanceof DiscordPostError) {
      // 403 with code 50013 = bot lacks MANAGE_EVENTS in this guild.
      // Map to a UX-actionable message: ask the server owner to re-invite
      // the bot (the new invite URL grants the permission automatically).
      if (err.status === 403) {
        return NextResponse.json(
          {
            error:
              "The bot doesn't have permission to create events in that server. " +
              "Ask a server admin to re-invite the bot to grant the Manage Events permission.",
            discord_status: err.status,
            discord_body: err.body.slice(0, 500),
          },
          { status: 422 },
        );
      }
      if (err.status === 404) {
        return NextResponse.json(
          {
            error:
              "The bot isn't a member of that server. Add the bot first via /account?tab=discord.",
            discord_status: err.status,
          },
          { status: 422 },
        );
      }
      return NextResponse.json(
        {
          error: `Discord rejected the request: ${err.body.slice(0, 200)}`,
          discord_status: err.status,
        },
        { status: 502 },
      );
    }
    throw err;
  }

  recordScheduledEventPost(auth.event.id, body.guild_id, created.id, auth.userId);
  return NextResponse.json(
    {
      ok: true,
      post: getScheduledEventPost(auth.event.id, body.guild_id),
    },
    { status: 201 },
  );
}

/** DELETE — remove the event from the given guild's Events tab.
 *  Body: { guild_id: string }. Always best-effort on the Discord side
 *  (a 404 there means the event was already gone, which we treat as
 *  success so the user can clean up stale rows). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { guild_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.guild_id !== "string" || !body.guild_id) {
    return NextResponse.json({ error: "guild_id (string) is required" }, { status: 400 });
  }
  const auth = await authorize(id, body.guild_id);
  if (auth.kind === "deny") return auth.response;

  const existing = getScheduledEventPost(auth.event.id, body.guild_id);
  if (!existing) {
    return NextResponse.json({ error: "Not posted to this server." }, { status: 404 });
  }

  try {
    await deleteDiscordScheduledEvent(body.guild_id, existing.discord_event_id);
  } catch (err) {
    if (err instanceof DiscordPostError) {
      // Discord-side delete failed — log + surface but still keep the row,
      // so the user can retry or contact support. We DON'T remove the
      // local row on Discord-side failure: that would leave the scheduled
      // event in Discord with no way for us to find it again.
      console.error(
        `[discord-events] DELETE event=${auth.event.id} guild=${body.guild_id} discord-status=${err.status}: ${err.body}`,
      );
      return NextResponse.json(
        {
          error: `Discord rejected the delete: ${err.body.slice(0, 200)}`,
          discord_status: err.status,
        },
        { status: 502 },
      );
    }
    throw err;
  }

  removeScheduledEventPost(auth.event.id, body.guild_id);
  return NextResponse.json({ ok: true });
}
