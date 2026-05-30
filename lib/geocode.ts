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
  /** ISO 3166 alpha-2 country code, uppercase ("US", "GB", "JP"). Optional
   *  because not every provider response includes it; callers that need
   *  it should fall back to a downstream reverse-geocode. */
  countryCode?: string;
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
      results?: Array<{
        geometry?: { location?: { lat?: number; lng?: number } };
        address_components?: Array<{ short_name?: string; types?: string[] }>;
      }>;
    };
    if (data.status !== "OK") return null;
    const top = data.results?.[0];
    const loc = top?.geometry?.location;
    const lat = loc?.lat;
    const lng = loc?.lng;
    if (lat == null || lng == null) return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const countryCode = top?.address_components
      ?.find((c) => c.types?.includes("country"))
      ?.short_name?.toUpperCase();
    return { latitude: lat, longitude: lng, provider: "google", countryCode };
  } catch {
    return null;
  }
}

async function tryNominatim(query: string, signal?: AbortSignal): Promise<GeocodeResult | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");
  try {
    const res = await fetch(url.toString(), {
      headers: { "Accept-Language": "en", "User-Agent": NOMINATIM_USER_AGENT },
      signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      lat: string;
      lon: string;
      address?: { country_code?: string };
    }>;
    if (data.length === 0) return null;
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const countryCode = data[0].address?.country_code?.toUpperCase();
    return { latitude: lat, longitude: lng, provider: "nominatim", countryCode };
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
): Promise<{ label: string; countryCode?: string } | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // Cap Nominatim at 800ms even when no external signal is provided. Without
  // this, a stalled upstream blocks the SSR response indefinitely. Compose
  // with the caller's signal so an admin/CLI flow that wants longer can
  // pass its own AbortController.
  const localCtrl = new AbortController();
  const timer = setTimeout(() => localCtrl.abort(), 800);
  const onAbort = () => localCtrl.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("format", "json");
    url.searchParams.set("addressdetails", "1");
    const res = await fetch(url.toString(), {
      headers: { "Accept-Language": "en", "User-Agent": NOMINATIM_USER_AGENT },
      signal: localCtrl.signal,
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
        country?: string;
        country_code?: string;
      };
    };
    const a = data.address;
    if (!a) return null;
    const place = a.city || a.town || a.village || a.hamlet || a.suburb || a.county;
    const countryCode = a.country_code?.toUpperCase();
    // For US/Canada/Australia (state-coded), keep the "Place, ST" form users
    // expect. For other countries, prefer "Place, Country" so a "London"
    // result reads as "London, UK" rather than ambiguous between Greater
    // London and London, Ontario.
    const isStateCoded = countryCode === "US" || countryCode === "CA" || countryCode === "AU";
    const region = isStateCoded
      ? a.state_code?.toUpperCase() || a.state || ""
      : a.country || "";
    if (place && region) return { label: `${place}, ${region}`, countryCode };
    if (place) return { label: place, countryCode };
    if (a.postcode) return { label: a.postcode, countryCode };
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
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
// Persistent labels live a week — city names don't drift on the timescales we
// care about, and after restart we'd rather render "Brooklyn, NY" from disk
// than wait on Nominatim again. The in-memory layer in front of this keeps
// hot-path lookups sub-microsecond.
const DISK_LABEL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function readDiskLabel(key: string): Promise<string | undefined> {
  try {
    const { prepareCached } = await import("./db");
    const row = prepareCached(
      "SELECT label, expires_at FROM coord_label_cache WHERE coord_key = ?",
    ).get(key) as { label: string; expires_at: number } | undefined;
    if (!row || row.expires_at < Date.now()) return undefined;
    return row.label;
  } catch {
    return undefined;
  }
}

async function writeDiskLabel(key: string, label: string): Promise<void> {
  try {
    const { prepareCached } = await import("./db");
    prepareCached(
      `INSERT INTO coord_label_cache (coord_key, label, expires_at)
       VALUES (?, ?, ?)
       ON CONFLICT(coord_key) DO UPDATE SET
         label = excluded.label,
         expires_at = excluded.expires_at`,
    ).run(key, label, Date.now() + DISK_LABEL_TTL_MS);
  } catch {
    // Non-fatal — see notes in ip-geo.ts.
  }
}

export async function getLabelForCoords(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const cached = labelCache.get(key);
  if (cached !== undefined) return cached;

  // Persistent layer between memory and network — survives container restarts.
  const fromDisk = await readDiskLabel(key);
  if (fromDisk !== undefined) {
    labelCache.set(key, fromDisk);
    return fromDisk;
  }

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
    void writeDiskLabel(key, label);
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
