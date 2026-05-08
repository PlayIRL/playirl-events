// Web manager mutation routes for Discord subscriptions. Auth: only the
// PlayIRL user whose linked Discord OAuth identity created the sub (or whose
// `linked_user_id` is set on it) can edit/delete via this surface.
//
// Slash-command edits go through /api/discord/interactions instead and use
// MANAGE_GUILD as their auth model — both surfaces hit the same DB.

import { NextResponse } from "next/server";
import { getCurrentUser, hasAccountAccess } from "@/lib/session";
import {
  type DiscordSubMode,
  deleteSubscription,
  getSubscription,
  parseLeadArgument,
  setSubscriptionEnabled,
  updateSubscription,
  userCanManageSubscription,
} from "@/lib/discord-subscriptions";
import { geocodeAddress } from "@/lib/geocode";

export const dynamic = "force-dynamic";

const VALID_MODES: DiscordSubMode[] = ["weekly", "daily", "reminder"];

interface PatchBody {
  /** User-set display name. Empty string clears it back to the auto-generated title. */
  name?: string | null;
  /** Single-venue scope. Empty string clears it. */
  venue_name?: string | null;
  format?: string | null;
  source?: string | null;
  radius_miles?: number | null;
  /** Re-geocode this string into center_lat/center_lng/near_label. Empty string clears the geo filter. */
  near?: string;
  /** Direct label-only edit (no re-geocode). */
  near_label?: string;
  hour_utc?: number;
  dow?: number | null;
  days_ahead?: number;
  lead_minutes?: number;
  /** Freeform lead spec parsed by parseLeadArgument: "1h" / "morning_of" / "60" / etc. */
  lead?: string | null;
  mode?: DiscordSubMode;
  enabled?: boolean;
}

async function authorize(id: string): Promise<{ ok: true; userId: string } | { ok: false; response: Response }> {
  if (!(await hasAccountAccess())) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const sub = getSubscription(id);
  if (!sub) {
    return { ok: false, response: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  if (!userCanManageSubscription(user.id, id)) {
    // Hide existence — don't differentiate "exists, you can't touch it"
    // from "doesn't exist".
    return { ok: false, response: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  return { ok: true, userId: user.id };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if (!auth.ok) return auth.response;

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 });
  }

  // enabled toggle is mutually exclusive with field edits — keep them
  // simple/composable so the client can hit either independently.
  if (typeof body.enabled === "boolean" && Object.keys(body).length === 1) {
    setSubscriptionEnabled(id, body.enabled);
    return NextResponse.json({ ok: true });
  }

  if (body.mode !== undefined && !VALID_MODES.includes(body.mode)) {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  }
  if (body.hour_utc !== undefined && (body.hour_utc < 0 || body.hour_utc > 23)) {
    return NextResponse.json({ error: "hour_utc out of range" }, { status: 400 });
  }
  if (body.dow !== undefined && body.dow !== null && (body.dow < 0 || body.dow > 6)) {
    return NextResponse.json({ error: "dow out of range" }, { status: 400 });
  }
  if (body.days_ahead !== undefined && (body.days_ahead < 1 || body.days_ahead > 60)) {
    return NextResponse.json({ error: "days_ahead out of range" }, { status: 400 });
  }
  if (body.lead_minutes !== undefined && (body.lead_minutes < 0 || body.lead_minutes > 60 * 24 * 7)) {
    return NextResponse.json({ error: "lead_minutes out of range" }, { status: 400 });
  }
  if (body.radius_miles !== undefined && body.radius_miles !== null && (body.radius_miles < 1 || body.radius_miles > 500)) {
    return NextResponse.json({ error: "radius_miles out of range" }, { status: 400 });
  }

  // Build the actual DB patch out of validated fields. We translate the two
  // user-facing freeform inputs (`near`, `lead`) into stored columns.
  const dbPatch: Parameters<typeof updateSubscription>[1] = {};
  if (body.name !== undefined) dbPatch.name = body.name;
  if (body.venue_name !== undefined) dbPatch.venue_name = body.venue_name;
  if (body.format !== undefined) dbPatch.format = body.format;
  if (body.source !== undefined) dbPatch.source = body.source;
  if (body.radius_miles !== undefined) dbPatch.radius_miles = body.radius_miles;
  if (body.hour_utc !== undefined) dbPatch.hour_utc = body.hour_utc;
  if (body.dow !== undefined) dbPatch.dow = body.dow;
  if (body.days_ahead !== undefined) dbPatch.days_ahead = body.days_ahead;
  if (body.mode !== undefined) dbPatch.mode = body.mode;
  if (body.lead_minutes !== undefined) dbPatch.lead_minutes = body.lead_minutes;
  if (body.near_label !== undefined) dbPatch.near_label = body.near_label;

  // `near` — re-geocode and update both coords + label.
  if (body.near !== undefined) {
    const trimmed = body.near.trim();
    if (trimmed === "") {
      dbPatch.center_lat = null;
      dbPatch.center_lng = null;
      dbPatch.near_label = "";
    } else {
      const hit = await geocodeAddress(trimmed);
      if (!hit) {
        return NextResponse.json({ error: `Could not geocode "${trimmed}"` }, { status: 400 });
      }
      dbPatch.center_lat = hit.latitude;
      dbPatch.center_lng = hit.longitude;
      dbPatch.near_label = trimmed;
    }
  }

  // `lead` — parse the freeform string into preset + minutes.
  if (body.lead !== undefined && body.lead !== null) {
    const parsed = parseLeadArgument(body.lead);
    if (!parsed) {
      return NextResponse.json({ error: `Invalid lead: ${body.lead}` }, { status: 400 });
    }
    dbPatch.lead_preset = parsed.preset;
    dbPatch.lead_minutes = parsed.minutes;
  }

  const updated = updateSubscription(id, dbPatch);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, subscription: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if (!auth.ok) return auth.response;
  deleteSubscription(id);
  return NextResponse.json({ ok: true });
}
