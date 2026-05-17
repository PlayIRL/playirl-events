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
}

interface CacheEntry {
  value: IpGeoResult | null;
  expiresAt: number;
}

const TTL_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 1500;
const CACHE_MAX = 1024;
const cache = new Map<string, CacheEntry>();

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
        error?: boolean;
      };
      if (
        !data.error &&
        typeof data.latitude === "number" &&
        typeof data.longitude === "number" &&
        Number.isFinite(data.latitude) &&
        Number.isFinite(data.longitude)
      ) {
        result = { latitude: data.latitude, longitude: data.longitude };
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
