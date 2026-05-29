// Authenticated preferences PUT — saves the user's default browse settings
// (location, radius, days-ahead, formats) so subsequent /?... visits without
// query params restore the same scope. Pairs with the Overview tab on
// /account, which is the canonical editor.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { setPreferences } from "@/lib/user-preferences";
import { geocodeAddress } from "@/lib/geocode";
import { COUNTRY_COOKIE, LOCALE_COOKIE } from "@/lib/locale";

export const dynamic = "force-dynamic";

interface Body {
  // null = clear; undefined = leave unchanged.
  location_label?: string | null;
  radius_miles?: number;
  days_ahead?: number;
  formats?: string[];
  /** BCP-47 locale tag ("en-US", "fr-FR", "ja-JP"). Empty string clears the
   *  per-user override and lets the site fall back to Accept-Language /
   *  navigator.language. Persisted as the `playirl-locale` cookie, not in
   *  user_preferences — same surface used by anon visitors. */
  locale?: string | null;
  /** ISO 3166 alpha-2 ("US", "GB", "JP"). Empty string clears the override
   *  and lets the site infer from locale or IP. Persisted as the
   *  `playirl-country` cookie. */
  country?: string | null;
}

const ONE_YEAR_SEC = 60 * 60 * 24 * 365;

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
          error: `Could not find a location matching "${label}". Try a city, postcode, or street address.`,
        }, { status: 400 });
      }
      patch.location_lat = hit.latitude;
      patch.location_lng = hit.longitude;
      patch.location_label = label;
    }
  }

  // Validate locale + country before checking patch emptiness so a "locale
  // only" save still goes through (no DB patch needed — they live in cookies).
  let localeUpdate: string | null | undefined = undefined;
  let countryUpdate: string | null | undefined = undefined;
  if (body.locale !== undefined) {
    if (body.locale === null || body.locale === "") {
      localeUpdate = null;
    } else if (typeof body.locale === "string" && /^[a-z]{2,3}(-[A-Z]{2})?$/i.test(body.locale.trim())) {
      localeUpdate = body.locale.trim();
    } else {
      return NextResponse.json({ error: "locale must be a BCP-47 tag like 'en-US'" }, { status: 400 });
    }
  }
  if (body.country !== undefined) {
    if (body.country === null || body.country === "") {
      countryUpdate = null;
    } else if (typeof body.country === "string" && /^[A-Z]{2}$/i.test(body.country.trim())) {
      countryUpdate = body.country.trim().toUpperCase();
    } else {
      return NextResponse.json({ error: "country must be ISO 3166 alpha-2" }, { status: 400 });
    }
  }

  const hasCookieUpdate = localeUpdate !== undefined || countryUpdate !== undefined;
  if (Object.keys(patch).length === 0 && !hasCookieUpdate) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = Object.keys(patch).length > 0 ? setPreferences(user.id, patch) : null;
  const response = NextResponse.json({ ok: true, preferences: updated });

  // Apply locale / country cookie writes alongside the patch so the response
  // headers carry both. Setting `value: ""` with maxAge=0 clears.
  if (localeUpdate !== undefined) {
    response.cookies.set({
      name: LOCALE_COOKIE,
      value: localeUpdate ?? "",
      maxAge: localeUpdate ? ONE_YEAR_SEC : 0,
      path: "/",
      sameSite: "lax",
    });
  }
  if (countryUpdate !== undefined) {
    response.cookies.set({
      name: COUNTRY_COOKIE,
      value: countryUpdate ?? "",
      maxAge: countryUpdate ? ONE_YEAR_SEC : 0,
      path: "/",
      sameSite: "lax",
    });
  }
  return response;
}
