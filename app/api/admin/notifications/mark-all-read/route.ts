// Mark every unseen admin notification as seen. Called from the dashboard
// "Mark all read" button; same gate as the rest of /admin (hasAdminAccess).
// Idempotent — no-op when there's nothing to mark.

import { NextResponse } from "next/server";
import { hasAdminAccess } from "@/lib/session";
import { markAllNotificationsSeen } from "@/lib/admin-notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  if (!(await hasAdminAccess())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const changes = markAllNotificationsSeen();
  return NextResponse.json({ ok: true, marked: changes });
}
