// Marks the current user's waitlist→going promotion banner as seen.
// Called by the WaitlistPromotedBanner component on the event detail
// page. POST-only so it's idempotent at the HTTP-method level
// (clear-on-acknowledge is naturally idempotent — calling twice is a no-op).

import { NextResponse } from "next/server";
import { acknowledgePromotion } from "@/lib/event-rsvps";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user || user.suspended) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  acknowledgePromotion(decodeURIComponent(id), user.id);
  return NextResponse.json({ ok: true });
}
