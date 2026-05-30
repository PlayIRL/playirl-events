/**
 * Haversine great-circle distance in miles between two lat/lng pairs.
 * Returns NaN-free finite numbers for any valid input. Shared by the radius
 * filter (lib/events.ts) and the per-event "X mi away" display.
 */
export function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Convert miles → kilometers. The whole system stores distances internally
 *  in miles (radius prefs, bbox prefilter, RADIUS_OPTIONS), so callers pass
 *  miles in and ask for km at display time. */
export const MI_PER_KM = 0.621371192;
export function milesToKm(miles: number): number {
  return miles / MI_PER_KM;
}

export type DistanceUnit = "mi" | "km";

/** Pick a sensible distance unit from a country code. US, UK, and Liberia
 *  use miles for everyday distances; everyone else uses km. (The UK is
 *  legally metric but signs/colloquial usage still favor miles, which is
 *  what users entering "5 miles" in the radius chip expect.) */
export function preferredDistanceUnit(countryCode?: string | null): DistanceUnit {
  if (!countryCode) return "mi";
  const cc = countryCode.toUpperCase();
  if (cc === "US" || cc === "GB" || cc === "LR" || cc === "MM") return "mi";
  return "km";
}

/**
 * Human-readable distance string ("3.2 mi away" or "5 km away"). One decimal
 * under 10 (where precision matters for "is this walkable"), whole numbers
 * above. Sub-0.1 collapses to "<0.1 X away" so noisy float jitter doesn't
 * render as "0.0".
 */
export function formatDistance(miles: number, unit: DistanceUnit = "mi"): string {
  if (!Number.isFinite(miles)) return "";
  const value = unit === "km" ? milesToKm(miles) : miles;
  const u = unit;
  if (value < 0.1) return `<0.1 ${u} away`;
  if (value < 10) return `${value.toFixed(1)} ${u} away`;
  return `${Math.round(value)} ${u} away`;
}

