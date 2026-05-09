import { getCurrentUser, hasAccountAccess } from "@/lib/session";
import { getEventsByOwner, createEvent } from "@/lib/events";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Field length caps for user-submitted events. Keep these generous enough that
// real listings (long venue names + city + state, multi-paragraph notes)
// aren't truncated, but tight enough that an attacker can't store megabytes
// per event and bloat the DB. SQLite has no per-column length, so application
// validation is the only line of defense.
const FIELD_LIMITS = {
  title: 200,
  format: 80,
  date: 10, // YYYY-MM-DD
  time: 16, // HH:MM[:SS] or with AM/PM
  timezone: 64,
  location: 200,
  address: 300,
  cost: 60,
  store_url: 500,
  detail_url: 500,
  notes: 4000,
} as const;

const URL_FIELDS = new Set(["store_url", "detail_url"]);

function validateFields(body: Record<string, unknown>): string | null {
  for (const [field, max] of Object.entries(FIELD_LIMITS)) {
    const v = body[field];
    if (v == null || v === "") continue;
    if (typeof v !== "string") return `${field} must be a string`;
    if (v.length > max) return `${field} exceeds maximum length of ${max}`;
    if (URL_FIELDS.has(field)) {
      // Reject any URL that doesn't parse cleanly or isn't http(s) — stops
      // javascript:, data:, mailto: from sneaking through into a hyperlink.
      try {
        const u = new URL(v);
        if (u.protocol !== "http:" && u.protocol !== "https:") {
          return `${field} must be an http(s) URL`;
        }
      } catch {
        return `${field} is not a valid URL`;
      }
    }
  }
  return null;
}

export async function GET() {
  if (!(await hasAccountAccess())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(getEventsByOwner(user.id));
}

export async function POST(request: Request) {
  if (!(await hasAccountAccess())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Malformed JSON body — return 400 instead of crashing the route.
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
  const validationError = validateFields(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const publishesImmediately = user.role === "organizer" || user.role === "admin";
  const idPrefix = publishesImmediately ? "org" : "user";
  const id = `${idPrefix}_${user.id}_${randomUUID()}`;
  const sourceTypeForRole = publishesImmediately ? "organizer" : "user";

  const event = createEvent({
    ...body,
    title,
    date,
    id,
    source: `${sourceTypeForRole}:${user.id}`,
    source_type: sourceTypeForRole,
    owner_id: user.id,
    status: publishesImmediately ? "active" : "pending",
  });
  return NextResponse.json({ ok: true, event });
}
