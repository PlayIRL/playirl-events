// PATCH/DELETE for an individual events-tab sub. PATCH currently only
// toggles `enabled` — to change filters, delete and recreate (matches the
// channel-message subscription UX where mode/server are also immutable).

import { NextResponse } from "next/server";
import { getCurrentUser, hasAccountAccess } from "@/lib/session";
import {
  deleteEventsTabSub,
  getEventsTabSub,
  setEventsTabSubEnabled,
  userCanManageEventsTabSub,
} from "@/lib/discord-events-tab-subs";

export const dynamic = "force-dynamic";

async function authorize(id: string) {
  if (!(await hasAccountAccess())) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const sub = getEventsTabSub(id);
  if (!sub) {
    return { ok: false as const, response: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  if (user.role !== "admin" && !userCanManageEventsTabSub(user.id, id)) {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true as const, sub };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await authorize(id);
  if (!auth.ok) return auth.response;

  let body: { enabled?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "Only `enabled` (boolean) is supported." }, { status: 400 });
  }
  setEventsTabSubEnabled(id, body.enabled);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await authorize(id);
  if (!auth.ok) return auth.response;
  deleteEventsTabSub(id);
  return NextResponse.json({ ok: true });
}
