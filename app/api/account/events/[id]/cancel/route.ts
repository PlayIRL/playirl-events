import { NextResponse } from "next/server";
import { getCurrentUser, hasAccountAccess } from "@/lib/session";
import { getEvent } from "@/lib/events";
import { getDb } from "@/lib/db";
import { patchPostsForCancelledEvent } from "@/lib/discord-post";
import { removeDiscordPostsForEvent } from "@/lib/discord-event-fanout";

export const dynamic = "force-dynamic";

/**
 * Host-cancel an event. Sets `cancelled_at` to NOW and flips every RSVP to
 * 'cancelled' in the same transaction. Soft-delete (the row stays in the DB
 * so attendees can still load the event detail and see the cancelled banner).
 *
 * Auth: only the owner — or any admin — can cancel. Same shape as the
 * per-event PATCH/DELETE endpoint.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasAccountAccess())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const event = getEvent(id);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.role !== "admin" && event.owner_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (event.cancelled_at) {
    return NextResponse.json({ error: "Already cancelled" }, { status: 400 });
  }

  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare("UPDATE events SET cancelled_at = datetime('now') WHERE id = ?").run(id);
    // Mark all RSVPs cancelled so attendees see consistent state.
    db.prepare(
      "UPDATE event_rsvps SET status = 'cancelled', updated_at = datetime('now') WHERE event_id = ? AND status != 'cancelled'",
    ).run(id);
  });
  tx();

  // Fire-and-forget: patch any Discord bot CHANNEL messages that
  // referenced this event so users in those channels see the cancellation
  // without a fresh post. Re-fetch to pick up the just-set cancelled_at.
  const fresh = getEvent(id);
  if (fresh) {
    void patchPostsForCancelledEvent(fresh).catch(err =>
      console.error(`[cancel] discord patch fan-out failed for ${id}:`, err),
    );
  }

  // Fire-and-forget: also delete any guild-scheduled-event linkages for
  // this event (the per-event flow from PR #131). Distinct from the
  // channel-message fan-out above — these are entries in each server's
  // native Events tab that need to disappear when the host cancels.
  void removeDiscordPostsForEvent(id).catch((err) =>
    console.error(`[cancel] scheduled-event fan-out failed for ${id}:`, err),
  );

  return NextResponse.json({ ok: true });
}
