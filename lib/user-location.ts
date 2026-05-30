/**
 * Server-side resolution of the viewer's "from" location. Used by the
 * homepage list/calendar, the map view, and the event detail page — anywhere
 * a per-event distance or a radius filter needs a center point.
 *
 * Resolution hierarchy (first hit wins):
 *   1. URL params  (?lat=…&lng=…&loc=…)         — most recent explicit signal
 *   2. User prefs   (signed-in users only)       — persisted last choice
 *   3. IP geolocation (best-effort, capped 1.5s) — implicit hint for new users
 *   4. Hardcoded default (Philly)                — last resort
 *
 * `isFromUser` is true for tiers 1–3 (anything traceable to the actual viewer).
 * Distance display gates on this — we don't render "X mi from Philly" to a
 * user who hasn't given us any location signal, since the number would be
 * meaningless.
 */

import { cache } from "react";
import { config } from "./config";
import { getLabelForCoords } from "./geocode-cache";
import { clientIpFromHeaders, geolocateIp } from "./ip-geo";
import { getServerCountry } from "./locale";
import { getCountryDefaultLocation } from "./country-defaults";
import type { UserPreferences } from "./user-preferences";

// Belt-and-braces around the in-memory LRU in ip-geo.ts: dedupes calls
// within a single SSR render so multiple consumers of resolveUserLocation
// (homepage + LocationBanner + any future caller) share one network round
// trip. Cache scope is per-request, automatic eviction at render end.
const cachedGeolocateIp = cache(async (ip: string) => geolocateIp(ip));
const cachedLabelForCoords = cache(
  async (lat: number, lng: number) => getLabelForCoords(lat, lng),
);

export const DEFAULT_LOCATION_LABEL = "Philly";

export interface ResolvedLocation {
  lat: number;
  lng: number;
  label: string;
  /** True when the coordinates came from a user signal (URL/prefs/IP),
   *  false when they fell through to the hardcoded default. Distance
   *  display, the "you set a custom location" banner, etc. read this. */
  isFromUser: boolean;
  /** True when the user explicitly set the location (URL or prefs).
   *  Distinct from `isFromUser`: IP-derived is a user signal but not
   *  "custom" — the LocationBanner keeps nudging IP-only users to confirm. */
  isCustom: boolean;
}

export async function resolveUserLocation(opts: {
  urlLat?: string;
  urlLng?: string;
  urlLabel?: string;
  prefs?: UserPreferences | null;
  requestHeaders?: Headers;
}): Promise<ResolvedLocation> {
  const { urlLat, urlLng, urlLabel, prefs, requestHeaders } = opts;

  // 1. URL params.
  const parsedUrlLat = urlLat ? parseFloat(urlLat) : NaN;
  const parsedUrlLng = urlLng ? parseFloat(urlLng) : NaN;
  const hasUrlLocation =
    Number.isFinite(parsedUrlLat) &&
    Number.isFinite(parsedUrlLng) &&
    parsedUrlLat >= -90 &&
    parsedUrlLat <= 90 &&
    parsedUrlLng >= -180 &&
    parsedUrlLng <= 180;
  if (hasUrlLocation) {
    const explicit = urlLabel?.trim();
    const label = explicit
      ? explicit
      : (await cachedLabelForCoords(parsedUrlLat, parsedUrlLng)) ?? DEFAULT_LOCATION_LABEL;
    return {
      lat: parsedUrlLat,
      lng: parsedUrlLng,
      label,
      isFromUser: true,
      isCustom: true,
    };
  }

  // 2. User prefs (signed-in only).
  if (prefs && prefs.location_lat != null && prefs.location_lng != null) {
    return {
      lat: prefs.location_lat,
      lng: prefs.location_lng,
      label: prefs.location_label || DEFAULT_LOCATION_LABEL,
      isFromUser: true,
      isCustom: true,
    };
  }

  // 3. IP geolocation. Best-effort; never throws. If IP-geo succeeds with
  // coords, we return immediately. If it fails or returns no coords, fall
  // through to the country-aware default below — `getServerCountry` will
  // re-parse Accept-Language / cookies independently of IP-geo's outcome.
  if (requestHeaders) {
    const ip = clientIpFromHeaders(requestHeaders);
    if (ip) {
      const hit = await cachedGeolocateIp(ip);
      if (hit) {
        const label =
          (await cachedLabelForCoords(hit.latitude, hit.longitude)) ?? DEFAULT_LOCATION_LABEL;
        return {
          lat: hit.latitude,
          lng: hit.longitude,
          label,
          isFromUser: true,
          isCustom: false,
        };
      }
    }
  }

  // 4. Country-aware fallback. If we know the viewer's country from a
  // cookie or Accept-Language, drop them onto that country's default city
  // rather than Philly. Beats showing every German first-time visitor
  // "events near Philadelphia" when IP-geo can't see them (corporate VPN,
  // private network, throttled API).
  if (requestHeaders) {
    const viewerCountry = getServerCountry(requestHeaders);
    const def = getCountryDefaultLocation(viewerCountry);
    // Skip the override for US — US viewers expect the existing Philly
    // default (the original audience). Only fire the override for countries
    // we explicitly cover and that AREN'T the historical default.
    if (def && viewerCountry !== "US") {
      return {
        lat: def.lat,
        lng: def.lng,
        label: def.label,
        // isFromUser=true because the country signal IS a real (if coarse)
        // viewer signal — drives the LocationBanner nudge the same way the
        // IP-geo result does.
        isFromUser: true,
        isCustom: false,
      };
    }
  }

  // 5. Final hardcoded default (Philly).
  return {
    lat: config.location.lat,
    lng: config.location.lng,
    label: DEFAULT_LOCATION_LABEL,
    isFromUser: false,
    isCustom: false,
  };
}
