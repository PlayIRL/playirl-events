// Discord subscription dispatcher. Called by Railway Cron every 5 minutes:
//
//   curl -X POST https://playirl.gg/api/discord/dispatch \
//        -H "x-dispatch-secret: $DISPATCH_SECRET"
//
// All fire/retry/dispatch logic lives in lib/discord-dispatcher.ts so the
// per-guild admin "Dispatch now" endpoints share the same code path. This
// route is a thin auth shell that delegates to `dispatchAllSubs`.
//
// Idempotency: claimPost guarantees we never re-post the same (sub, event,
// kind, bucket). The retry queue (drainPendingPosts) gives reminder windows
// a bounded backoff path since they can't rely on next-tick retry semantics.

import { NextResponse } from "next/server";
import { safeEqualSecret } from "@/lib/security";
import { dispatchAllSubs } from "@/lib/discord-dispatcher";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const secret = process.env.DISPATCH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "DISPATCH_SECRET not configured" }, { status: 500 });
  }
  const provided = request.headers.get("x-dispatch-secret");
  if (!safeEqualSecret(provided, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Optional URL flag for tests: ?force=1 ignores the time gates so a manual
  // curl can verify a digest fires immediately. Reminders always require the
  // event time window because there's no manual override semantically equiv.
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";

  const summary = await dispatchAllSubs(new Date(), force);
  return NextResponse.json({ ok: true, ...summary });
}
