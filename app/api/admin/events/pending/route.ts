import { hasAdminAccess } from "@/lib/session";
import { bulkUpdateStatus, bulkRejectEvents } from "@/lib/events";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  if (!(await hasAdminAccess())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { ids?: unknown; action?: unknown; reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { ids, action, reason } = body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids[] required" }, { status: 400 });
  }
  if (ids.length > 1000) {
    return NextResponse.json({ error: "Too many ids — limit is 1000 per request" }, { status: 413 });
  }
  if (!ids.every((x) => typeof x === "string" && x.length > 0 && x.length < 200)) {
    return NextResponse.json({ error: "ids must be non-empty strings" }, { status: 400 });
  }
  if (action === "approve") {
    const updated = bulkUpdateStatus(ids as string[], "active");
    return NextResponse.json({ ok: true, updated });
  }
  if (action === "reject") {
    const reasonStr = typeof reason === "string" ? reason : "";
    if (!reasonStr.trim()) {
      // Reason is mandatory: the whole point of soft-reject is the host
      // knows *why*. Without a reason we'd be back to silent deletion.
      return NextResponse.json({ error: "reason is required when rejecting" }, { status: 400 });
    }
    const updated = bulkRejectEvents(ids as string[], reasonStr);
    return NextResponse.json({ ok: true, updated });
  }
  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
