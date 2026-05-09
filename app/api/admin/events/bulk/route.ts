import { hasAdminAccess } from "@/lib/session";
import { bulkUpdateStatus, bulkDelete } from "@/lib/events";
import { NextResponse } from "next/server";

const STATUS_FOR_ACTION: Record<string, string> = {
  pin: "pinned",
  skip: "skip",
  activate: "active",
};

// Hard cap on how many events one admin call can mutate. Lets a curator
// process a normal day's pending queue (~hundreds) without surprises, but
// blocks accidental "select all 50,000 events" footguns and any malicious
// admin trying to nuke the DB in one click.
const BULK_LIMIT = 1000;

export async function POST(request: Request) {
  if (!(await hasAdminAccess())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let ids: unknown;
  let action: unknown;
  try {
    ({ ids, action } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids[] required" }, { status: 400 });
  }
  if (ids.length > BULK_LIMIT) {
    return NextResponse.json(
      { error: `Too many ids — limit is ${BULK_LIMIT} per request` },
      { status: 413 },
    );
  }
  if (!ids.every((x) => typeof x === "string" && x.length > 0 && x.length < 200)) {
    return NextResponse.json({ error: "ids must be non-empty strings" }, { status: 400 });
  }
  if (action === "delete") {
    const updated = bulkDelete(ids as string[]);
    return NextResponse.json({ ok: true, updated });
  }
  const status = STATUS_FOR_ACTION[action as string];
  if (!status) return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  const updated = bulkUpdateStatus(ids as string[], status);
  return NextResponse.json({ ok: true, updated });
}
