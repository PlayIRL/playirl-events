// Undo a venue merge. Replays the snapshot stored on the venue_merges row to
// put every UPDATE back. Idempotent in the safe sense — a second call throws
// because reversed_at is non-null after the first.

import { NextResponse } from "next/server";
import { getCurrentUser, hasAdminAccess } from "@/lib/session";
import { undoVenueMerge } from "@/lib/venue-merges";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await hasAdminAccess())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getCurrentUser();
  const { id } = await params;
  const mergeId = Number(id);
  if (!Number.isInteger(mergeId) || mergeId <= 0) {
    return NextResponse.json({ error: "Invalid merge id" }, { status: 400 });
  }

  try {
    const result = undoVenueMerge(mergeId, user?.id ?? null);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
