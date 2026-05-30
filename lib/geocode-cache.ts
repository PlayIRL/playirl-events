// Server-only cached wrappers around the pure-network geocode calls in
// `lib/geocode.ts`. Split out so client components that need the network
// helpers (forms that hit `geocodeAddress` from the browser) can import
// `lib/geocode` without dragging better-sqlite3 into the browser bundle —
// which fails the build (`Module not found: Can't resolve 'fs'`) because
// next.config's `serverExternalPackages` only covers server bundling.
//
// The `server-only` import throws at build time if this module is ever
// transitively reached from a client bundle, so future regressions surface
// immediately instead of as cryptic missing-module errors.
import "server-only";
import { reverseGeocode } from "./geocode";
import { prepareCached } from "./db";

const labelCache = new Map<string, string>();
const LABEL_CACHE_MAX = 256;

// Persistent labels live a week — city names don't drift on the timescales we
// care about, and after restart we'd rather render "Brooklyn, NY" from disk
// than wait on Nominatim again. The in-memory layer in front of this keeps
// hot-path lookups sub-microsecond.
const DISK_LABEL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function readDiskLabel(key: string): string | undefined {
  try {
    const row = prepareCached(
      "SELECT label, expires_at FROM coord_label_cache WHERE coord_key = ?",
    ).get(key) as { label: string; expires_at: number } | undefined;
    if (!row || row.expires_at < Date.now()) return undefined;
    return row.label;
  } catch {
    return undefined;
  }
}

function writeDiskLabel(key: string, label: string): void {
  try {
    prepareCached(
      `INSERT INTO coord_label_cache (coord_key, label, expires_at)
       VALUES (?, ?, ?)
       ON CONFLICT(coord_key) DO UPDATE SET
         label = excluded.label,
         expires_at = excluded.expires_at`,
    ).run(key, label, Date.now() + DISK_LABEL_TTL_MS);
  } catch {
    // Disk cache is opportunistic — failure (DB locked, schema mismatch in
    // dev, etc.) is non-fatal because the in-memory LRU still covers us.
  }
}

/**
 * Cached coord→label resolver for hot-path callers like the homepage SSR.
 * Lat/lng pairs are rounded to ~1km precision (2 decimals, roughly 1.1km
 * in CONUS) before keying the cache, so adjacent URLs share a single
 * Nominatim hit. Layered cache:
 *
 *   in-memory LRU (request-cheap)
 *     → persistent SQLite (survives restart)
 *       → live Nominatim call
 */
export async function getLabelForCoords(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const cached = labelCache.get(key);
  if (cached !== undefined) return cached;

  const fromDisk = readDiskLabel(key);
  if (fromDisk !== undefined) {
    labelCache.set(key, fromDisk);
    return fromDisk;
  }

  const hit = await reverseGeocode(lat, lng, signal);
  const label = hit?.label ?? null;
  if (label) {
    if (labelCache.size >= LABEL_CACHE_MAX) {
      const firstKey = labelCache.keys().next().value;
      if (firstKey !== undefined) labelCache.delete(firstKey);
    }
    labelCache.set(key, label);
    writeDiskLabel(key, label);
  }
  return label;
}
