// Authenticated preferences PUT — saves the user's default browse settings
// (location, radius, days-ahead, formats) so subsequent /?... visits without
// query params restore the same scope. Pairs with the Overview tab on
// /account, which is the canonical editor.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { setPreferences } from "@/lib/user-preferences";
import { geocodeAddress } from "@/lib/geocode";

export const dynamic = "force-dynamic";

interface Body {
  // null = clear; undefined = leave unchanged.
  location_label?: string | null;
  radius_miles?: number;
  days_ahead?: number;
  formats?: string[];
}

export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.suspended) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 });
  }

  // Build the patch. `setPreferences` understands `location_lat`/`lng` directly
  // — we accept a human label here and geocode server-side so the client UI
  // doesn't need its own Maps key.
  const patch: Parameters<typeof setPreferences>[1] = {};

  if (body.radius_miles !== undefined) {
    if (typeof body.radius_miles !== "number" || body.radius_miles < 0 || body.radius_miles > 500) {
      return NextResponse.json({ error: "radius_miles must be 0-500" }, { status: 400 });
    }
    patch.radius_miles = Math.round(body.radius_miles);
  }

  if (body.days_ahead !== undefined) {
    if (typeof body.days_ahead !== "number" || body.days_ahead < 1 || body.days_ahead > 90) {
      return NextResponse.json({ error: "days_ahead must be 1-90" }, { status: 400 });
    }
    patch.days_ahead = Math.round(body.days_ahead);
  }

  if (body.formats !== undefined) {
    if (!Array.isArray(body.formats) || body.formats.some(f => typeof f !== "string")) {
      return NextResponse.json({ error: "formats must be string[]" }, { status: 400 });
    }
    patch.formats = body.formats.map(f => f.trim()).filter(Boolean);
  }

  if (body.location_label !== undefined) {
    const label = (body.location_label ?? "").trim();
    if (label === "") {
      // Clear the per-user override; site falls back to the global default.
      patch.location_lat = null;
      patch.location_lng = null;
      patch.location_label = "";
    } else {
      const hit = await geocodeAddress(label);
      if (!hit) {
        return NextResponse.json({
          error: `Could not find a location matching "${label}". Try a city, ZIP, or street address.`,
        }, { status: 400 });
      }
      patch.location_lat = hit.latitude;
      patch.location_lng = hit.longitude;
      patch.location_label = label;
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = setPreferences(user.id, patch);
  return NextResponse.json({ ok: true, preferences: updated });
}
