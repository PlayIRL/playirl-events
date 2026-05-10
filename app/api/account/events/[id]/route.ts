import { getCurrentUser, hasAccountAccess } from "@/lib/session";
import { getEvent, updateEvent, deleteEvent } from "@/lib/events";
import {
  deleteRemoteFromSnapshot,
  snapshotPostsBeforeDelete,
  syncDiscordPostsForEvent,
} from "@/lib/discord-event-fanout";
import { NextResponse } from "next/server";

async function loadOwned(id: string) {
  if (!(await hasAccountAccess())) return { error: "Unauthorized", status: 401 } as const;
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized", status: 401 } as const;
  const event = getEvent(id);
  if (!event) return { error: "Not found", status: 404 } as const;
  // Admins bypass the ownership check.
  if (user.role !== "admin" && event.owner_id !== user.id) {
    return { error: "Not found", status: 404 } as const;
  }
  return { user, event } as const;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await loadOwned(id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.event);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await loadOwned(id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  const body = await req.json();
  delete body.owner_id;
  delete body.source;
  delete body.source_type;
  // Non-admin users cannot self-approve by flipping status — drop it.
  if (result.user.role !== "admin") delete body.status;
  const event = updateEvent(id, body);

  // Fire-and-forget: keep linked Discord guild scheduled events (PR #131)
  // in sync with the new title/date/location. We don't await — Discord's
  // PATCH per linked guild can take seconds, and the user already sees
  // their save succeed locally. Failures log and the panel will surface
  // them on next view.
  void syncDiscordPostsForEvent(id).catch((err) =>
    console.error(`[event-patch] discord sync fan-out failed for ${id}:`, err),
  );

  return NextResponse.json({ ok: true, event });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await loadOwned(id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  // Snapshot the linked Discord scheduled-event posts BEFORE the local
  // delete — the FK CASCADE drops our `discord_scheduled_event_posts`
  // rows along with the event row, so we'd lose the (guild_id,
  // discord_event_id) pairs we need to fire DELETEs to Discord.
  const snapshot = snapshotPostsBeforeDelete(id);
  deleteEvent(id);
  if (snapshot.length > 0) {
    void deleteRemoteFromSnapshot(snapshot).catch((err) =>
      console.error(`[event-delete] discord cascade fan-out failed for ${id}:`, err),
    );
  }
  return NextResponse.json({ ok: true });
}
