/**
 * IP → coarse lat/lng. Used as a server-side fallback to populate the
 * user's "from" location when they haven't set one explicitly via URL,
 * prefs, or the browser geolocation prompt.
 *
 * Provider: ipapi.co (free, no key, ~1k req/day per IP). City-level
 * precision is plenty for "show me events within N miles" — typical
 * accuracy is <10 mi in CONUS.
 *
 * Privacy/perf:
 * - Strictly server-side; the IP never leaves the server (we send it to
 *   ipapi.co, but it isn't echoed to the client).
 * - In-memory LRU cache keyed by IP, 24h TTL. Cold-cache on restart, but
 *   refills within seconds in production.
 * - 1.5s timeout so a slow third-party never blocks page render. On
 *   failure / private IP / unparseable response, returns null and the
 *   caller falls back to the app's hardcoded default location.
 */

export interface IpGeoResult {
  latitude: number;
  longitude: number;
  /** ISO 3166 alpha-2 country code from ipapi.co's response, uppercase.
   *  Optional because pre-cached entries from before this column may have
   *  been written without it. Callers should fall back to DEFAULT_COUNTRY
   *  when missing. */
  countryCode?: string;
}

interface CacheEntry {
  value: IpGeoResult | null;
  expiresAt: number;
}

const TTL_MS = 24 * 60 * 60 * 1000;
// Tight timeout so a slow upstream never blocks the SSR critical path. ipapi.co
// usually answers in <200ms; if it doesn't, we'd rather render with the
// hardcoded default than make every visitor wait. Negative-cached on miss so
// repeated misses within the TTL don't repeatedly burn the budget.
const TIMEOUT_MS = 500;
const CACHE_MAX = 1024;
const cache = new Map<string, CacheEntry>();

// Persistent layer: backed by ip_geo_cache table. Looked up after the in-memory
// LRU but before the network call, so a restart doesn't stampede ipapi.co.
// Dynamic import keeps lib/db.ts out of edge-runtime bundles that might import
// this file in the future — better-sqlite3 is Node-only.
async function readDiskCache(ip: string): Promise<IpGeoResult | null | undefined> {
  try {
    const { prepareCached } = await import("./db");
    const row = prepareCached(
      "SELECT latitude, longitude, country_code, expires_at FROM ip_geo_cache WHERE ip = ?",
    ).get(ip) as { latitude: number | null; longitude: number | null; country_code: string | null; expires_at: number } | undefined;
    if (!row) return undefined;
    if (row.expires_at < Date.now()) return undefined;
    if (row.latitude == null || row.longitude == null) return null;
    return {
      latitude: row.latitude,
      longitude: row.longitude,
      countryCode: row.country_code ?? undefined,
    };
  } catch {
    return undefined;
  }
}

async function writeDiskCache(ip: string, value: IpGeoResult | null): Promise<void> {
  try {
    const { prepareCached } = await import("./db");
    prepareCached(
      `INSERT INTO ip_geo_cache (ip, latitude, longitude, country_code, expires_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(ip) DO UPDATE SET
         latitude = excluded.latitude,
         longitude = excluded.longitude,
         country_code = excluded.country_code,
         expires_at = excluded.expires_at`,
    ).run(
      ip,
      value?.latitude ?? null,
      value?.longitude ?? null,
      value?.countryCode ?? null,
      Date.now() + TTL_MS,
    );
  } catch {
    // Disk cache is opportunistic — failure (DB locked, schema mismatch in
    // dev, etc.) is non-fatal because the in-memory LRU still covers us.
  }
}

/**
 * Returns true for IPs that don't make sense to look up — loopback, RFC1918
 * private ranges, IPv6 unique-local. These hit ipapi.co with predictable
 * "Reserved IP Address" errors and waste a request.
 */
function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  if (ip === "::1" || ip.startsWith("127.")) return true;
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  if (ip.startsWith("169.254.")) return true;
  if (ip.startsWith("fc") || ip.startsWith("fd")) return true; // IPv6 ULA
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  return false;
}

export async function geolocateIp(ip: string): Promise<IpGeoResult | null> {
  if (isPrivateIp(ip)) return null;

  const now = Date.now();
  const cached = cache.get(ip);
  if (cached && cached.expiresAt > now) return cached.value;

  // Try persistent layer before network. Warm restarts pay one SQLite read
  // (~sub-ms) instead of a 500ms timeout-bounded HTTP call.
  const fromDisk = await readDiskCache(ip);
  if (fromDisk !== undefined) {
    cache.set(ip, { value: fromDisk, expiresAt: now + TTL_MS });
    return fromDisk;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let result: IpGeoResult | null = null;
  try {
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (res.ok) {
      const data = (await res.json()) as {
        latitude?: number;
        longitude?: number;
        country_code?: string;
        error?: boolean;
      };
      if (
        !data.error &&
        typeof data.latitude === "number" &&
        typeof data.longitude === "number" &&
        Number.isFinite(data.latitude) &&
        Number.isFinite(data.longitude)
      ) {
        result = {
          latitude: data.latitude,
          longitude: data.longitude,
          countryCode: data.country_code?.toUpperCase(),
        };
      }
    }
  } catch {
    result = null;
  } finally {
    clearTimeout(timer);
  }

  if (cache.size >= CACHE_MAX) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(ip, { value: result, expiresAt: now + TTL_MS });
  // Fire-and-forget the persistent write — no point making the caller wait
  // on a cache update they'll never read in this request.
  void writeDiskCache(ip, result);
  return result;
}

/**
 * Extract the client IP from a Next.js request headers bag. X-Forwarded-For
 * carries a comma-separated chain (left-most is the original client). Falls
 * back to X-Real-IP when the proxy chain is simpler.
 */
export function clientIpFromHeaders(h: Headers): string {
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip")?.trim() ?? "";
}
