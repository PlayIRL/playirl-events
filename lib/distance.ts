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

/**
 * Human-readable distance string ("3.2 mi away"). One decimal under 10 mi
 * (where precision actually matters for "is this walkable"), whole numbers
 * above. Sub-100ft distances collapse to "<0.1 mi away" so noisy float jitter
 * doesn't render as "0.0 mi away".
 */
export function formatDistanceMiles(miles: number): string {
  if (!Number.isFinite(miles)) return "";
  if (miles < 0.1) return "<0.1 mi away";
  if (miles < 10) return `${miles.toFixed(1)} mi away`;
  return `${Math.round(miles)} mi away`;
}
