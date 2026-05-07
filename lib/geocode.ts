/**
 * Address → coordinates. Used at scrape-time (to derive trustworthy lat/lng
 * for sources that don't expose per-event coords, like Discord), in admin/
 * organizer forms (to auto-fill lat/lng on blur), and by the backfill CLI.
 *
 * Two providers, in order:
 *   1. Google Geocoding API — best accuracy + speed, requires a server-side
 *      key (GOOGLE_PLACES_API_KEY, shared with the venue-image fetcher).
 *      The "Geocoding API" must be enabled on the Google Cloud project.
 *   2. OpenStreetMap Nominatim — free, no key required, ToS expects a
 *      descriptive User-Agent and ≤1 rps. The WotC scraper already calls
 *      Nominatim for reverse-geocoding, so no new dependency.
 *
 * Returns `null` when both fail. Callers fall back to "no coords" — never
 * block a UI flow on geocoder availability.
 */

const NOMINATIM_USER_AGENT = "playirl-gg/1.0 (+https://playirl.gg)";

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  /** Which provider produced the hit. Optional — older callers ignore it. */
  provider?: "google" | "nominatim";
}

async function tryGoogle(query: string, signal?: AbortSignal): Promise<GeocodeResult | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return null;
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", query);
  url.searchParams.set("key", key);
  try {
    const res = await fetch(url.toString(), { signal });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status?: string;
      results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
    };
    if (data.status !== "OK") return null;
    const loc = data.results?.[0]?.geometry?.location;
    const lat = loc?.lat;
    const lng = loc?.lng;
    if (lat == null || lng == null) return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { latitude: lat, longitude: lng, provider: "google" };
  } catch {
    return null;
  }
}

async function tryNominatim(query: string, signal?: AbortSignal): Promise<GeocodeResult | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  try {
    const res = await fetch(url.toString(), {
      headers: { "Accept-Language": "en", "User-Agent": NOMINATIM_USER_AGENT },
      signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (data.length === 0) return null;
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { latitude: lat, longitude: lng, provider: "nominatim" };
  } catch {
    return null;
  }
}

/**
 * Geocode a free-text address. Tries Google first when configured, falls back
 * to Nominatim. Returns null when no provider produces a result.
 */
export async function geocodeAddress(query: string, signal?: AbortSignal): Promise<GeocodeResult | null> {
  const q = (query ?? "").trim();
  if (!q) return null;
  const google = await tryGoogle(q, signal);
  if (google) return google;
  return tryNominatim(q, signal);
}

/**
 * Try several candidate query strings in order, returning the first successful
 * geocode. Use this when you have multiple reasonable phrasings — for instance
 * the address alone (cleanest for Nominatim) and the location-name + address
 * combo (richer context for Google / TopDeck-style "city, state" rows).
 *
 * Empty / whitespace-only candidates are skipped.
 */
/**
 * Coordinates → human label ("Philadelphia, PA", "19147"). Used by the
 * homepage location picker to display "Use my current location" results
 * without showing raw lat/lng.
 *
 * Nominatim only — Google's reverse-geocoding is paid and we don't need
 * its precision for city/zip-level labels. Returns null on any failure;
 * the caller is expected to fall back to displaying the rounded-md coords.
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<{ label: string } | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("format", "json");
    url.searchParams.set("addressdetails", "1");
    const res = await fetch(url.toString(), {
      headers: { "Accept-Language": "en", "User-Agent": NOMINATIM_USER_AGENT },
      signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      address?: {
        city?: string;
        town?: string;
        village?: string;
        hamlet?: string;
        suburb?: string;
        county?: string;
        state?: string;
        state_code?: string;
        postcode?: string;
      };
    };
    const a = data.address;
    if (!a) return null;
    const place = a.city || a.town || a.village || a.hamlet || a.suburb || a.county;
    const region = a.state_code?.toUpperCase() || a.state || "";
    if (place && region) return { label: `${place}, ${region}` };
    if (place) return { label: place };
    if (a.postcode) return { label: a.postcode };
    return null;
  } catch {
    return null;
  }
}

/**
 * Cached wrapper around `reverseGeocode` for hot-path callers like the
 * homepage SSR. Lat/lng pairs are rounded-md to ~1km precision (2 decimals,
 * roughly 1.1km in CONUS) before keying the cache, so adjacent URLs share
 * a single Nominatim hit. In-memory only — restarts cold-cache, but the
 * cache fills back up within seconds in production.
 *
 * Bounded at 256 entries (more than enough for "users sharing the same
 * link to a metro center"); evicts oldest insertion order when full.
 */
const labelCache = new Map<string, string>();
const LABEL_CACHE_MAX = 256;

export async function getLabelForCoords(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const cached = labelCache.get(key);
  if (cached !== undefined) return cached;

  const hit = await reverseGeocode(lat, lng, signal);
  const label = hit?.label ?? null;
  if (label) {
    if (labelCache.size >= LABEL_CACHE_MAX) {
      // Evict oldest insertion-order entry. Map preserves insertion order,
      // so the first key is the oldest.
      const firstKey = labelCache.keys().next().value;
      if (firstKey !== undefined) labelCache.delete(firstKey);
    }
    labelCache.set(key, label);
  }
  return label;
}

export async function geocodeFirstMatch(
  candidates: Array<string | null | undefined>,
  signal?: AbortSignal,
): Promise<GeocodeResult | null> {
  const seen = new Set<string>();
  for (const c of candidates) {
    const q = (c ?? "").trim();
    if (!q || seen.has(q)) continue;
    seen.add(q);
    const hit = await geocodeAddress(q, signal);
    if (hit) return hit;
  }
  return null;
}
