// Merge N source venue names into one canonical name. Pure text rewrite
// across events.location and *.venue_name plus an optional venue_defaults
// image copy. Single SQLite transaction; audit row written into venue_merges
// for undo.
//
// Body: { canonicalName: string, sourceNames: string[] }

import { NextResponse } from "next/server";
import { getCurrentUser, hasAdminAccess } from "@/lib/session";
import { mergeVenues } from "@/lib/venue-merges";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Body {
  canonicalName?: unknown;
  sourceNames?: unknown;
}

export async function POST(req: Request) {
  if (!(await hasAdminAccess())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getCurrentUser();

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.canonicalName !== "string" || !body.canonicalName.trim()) {
    return NextResponse.json(
      { error: "canonicalName (string) is required" },
      { status: 400 },
    );
  }
  if (!Array.isArray(body.sourceNames) || body.sourceNames.length === 0) {
    return NextResponse.json(
      { error: "sourceNames (non-empty array of strings) is required" },
      { status: 400 },
    );
  }
  if (!body.sourceNames.every((s) => typeof s === "string")) {
    return NextResponse.json(
      { error: "sourceNames entries must all be strings" },
      { status: 400 },
    );
  }

  try {
    const result = mergeVenues({
      canonicalName: body.canonicalName,
      sourceNames: body.sourceNames as string[],
      userId: user?.id ?? null,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
