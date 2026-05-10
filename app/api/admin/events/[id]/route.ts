import { hasAdminAccess } from "@/lib/session";
import { updateEvent, updateEventStatus, getEvent, deleteEvent } from "@/lib/events";
import {
  deleteRemoteFromSnapshot,
  snapshotPostsBeforeDelete,
  syncDiscordPostsForEvent,
} from "@/lib/discord-event-fanout";
import { NextResponse } from "next/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasAdminAccess())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const event = getEvent(id);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  return NextResponse.json(event);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await hasAdminAccess())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  // Status-only patch (legacy admin page uses this shape).
  const isStatusOnly = Object.keys(body).every((k) => k === "status" || k === "notes");
  if (isStatusOnly) {
    if (body.status && !["active", "skip", "pinned", "pending"].includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    const ok = updateEventStatus(id, body.status, body.notes);
    if (!ok) return NextResponse.json({ error: "Event not found" }, { status: 404 });
    return NextResponse.json({ ok: true, event: getEvent(id) });
  }

  // Full-field patch (admin event editor).
  const event = updateEvent(id, body);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Mirror the account-side PATCH: keep linked Discord guild scheduled
  // events in sync. Fire-and-forget — admins shouldn't wait on Discord.
  void syncDiscordPostsForEvent(id).catch((err) =>
    console.error(`[admin event-patch] discord sync fan-out failed for ${id}:`, err),
  );

  return NextResponse.json({ ok: true, event });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasAdminAccess())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  // Snapshot before delete — same reason as the account-side route: the
  // FK CASCADE drops our scheduled-event-posts rows along with the event,
  // so we'd otherwise lose the (guild, discord_event_id) pairs needed
  // to delete from Discord.
  const snapshot = snapshotPostsBeforeDelete(id);
  const ok = deleteEvent(id);
  if (!ok) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  if (snapshot.length > 0) {
    void deleteRemoteFromSnapshot(snapshot).catch((err) =>
      console.error(`[admin event-delete] discord cascade fan-out failed for ${id}:`, err),
    );
  }
  return NextResponse.json({ ok: true });
}
