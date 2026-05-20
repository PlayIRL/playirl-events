// Admin-triggered "dispatch all" — equivalent to one cron tick of
// /api/discord/dispatch, but admin-gated and force-fires the time gates so
// digests fire immediately rather than waiting for the next bucket boundary.
// Per-event reminder windows are still time-based: the cron-style match
// (event start ∈ [now+lead, now+lead+5min)) is preserved.

import { NextResponse } from "next/server";
import { hasAdminAccess } from "@/lib/session";
import { dispatchAllSubs } from "@/lib/discord-dispatcher";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  if (!(await hasAdminAccess())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const summary = await dispatchAllSubs(new Date(), true);
  return NextResponse.json({ ok: true, ...summary });
}
