import { hasAdminAccess } from "@/lib/session";
import { getAllEvents, createEvent } from "@/lib/events";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Hard cap on what one admin GET can return. The admin events table needs
// thousands of rows to be useful, but the nationwide scrape can produce
// 50k+ rows — shipping all of those at once OOMs both the server and the
// browser. 5000 is enough to scan a month's worth of events visually.
const MAX_LIMIT = 5000;

export async function GET(request: Request) {
  if (!(await hasAdminAccess())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") ?? "");
  const limit =
    Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(Math.floor(requestedLimit), MAX_LIMIT)
      : MAX_LIMIT;
  const requestedOffset = Number(url.searchParams.get("offset") ?? "");
  const offset =
    Number.isFinite(requestedOffset) && requestedOffset >= 0
      ? Math.floor(requestedOffset)
      : 0;
  return NextResponse.json(getAllEvents(limit, offset));
}

export async function POST(request: Request) {
  if (!(await hasAdminAccess())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const title = body.title;
  const date = body.date;
  if (typeof title !== "string" || !title || typeof date !== "string" || !date) {
    return NextResponse.json({ error: "title and date are required" }, { status: 400 });
  }
  const id = (typeof body.id === "string" && body.id) || `manual_${randomUUID()}`;
  const source = (typeof body.source === "string" && body.source) || "manual";
  const event = createEvent({
    ...body,
    title,
    date,
    id,
    source,
    source_type: "manual",
  });
  return NextResponse.json({ ok: true, event });
}
