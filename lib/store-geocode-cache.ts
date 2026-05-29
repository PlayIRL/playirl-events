import { getDb } from "./db";

export interface CachedStoreGeocode {
  store_id: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
}

export function getCachedStoreAddress(storeId: string): string | null {
  const row = getDb()
    .prepare("SELECT address FROM store_geocode_cache WHERE store_id = ?")
    .get(storeId) as { address: string } | undefined;
  return row?.address ?? null;
}

/** Combined address + country cache lookup. Returns null on miss; country
 *  is "" for rows that pre-date the country_code column (still useful — the
 *  caller can re-resolve country from the grid anchor). */
export function getCachedStoreGeocode(storeId: string): { address: string; country: string } | null {
  const row = getDb()
    .prepare("SELECT address, country_code FROM store_geocode_cache WHERE store_id = ?")
    .get(storeId) as { address: string; country_code: string | null } | undefined;
  if (!row) return null;
  return { address: row.address, country: row.country_code ?? "" };
}

export function setCachedStoreAddress(
  storeId: string,
  address: string,
  latitude: number | null,
  longitude: number | null,
  countryCode: string = "",
): void {
  getDb()
    .prepare(
      `INSERT INTO store_geocode_cache (store_id, address, latitude, longitude, country_code)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(store_id) DO UPDATE SET
         address = excluded.address,
         latitude = excluded.latitude,
         longitude = excluded.longitude,
         country_code = excluded.country_code,
         cached_at = datetime('now')`,
    )
    .run(storeId, address, latitude, longitude, countryCode.toUpperCase());
}

export interface GeocodeCacheStats {
  /** Total cached store addresses. Each row was one Nominatim call avoided
   *  on the most recent scrape that re-encountered this store. */
  total: number;
  /** Most recent cache fill timestamp — useful for noticing when a scrape
   *  hasn't refreshed the cache (= scraper is failing silently). NULL if
   *  the cache is empty. */
  latestCachedAt: string | null;
}

export function getGeocodeCacheStats(): GeocodeCacheStats {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS total, MAX(cached_at) AS latest FROM store_geocode_cache")
    .get() as { total: number; latest: string | null };
  return { total: row.total, latestCachedAt: row.latest };
}
