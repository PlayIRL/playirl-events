import { getConfig } from "@/lib/runtime-config";
import { getCachedStoreGeocode, setCachedStoreAddress } from "@/lib/store-geocode-cache";
import type { ScrapeRegion } from "@/lib/scrape-grid";
import { normalizeFormat } from "@/lib/formats";
import { formatCost } from "@/lib/format-cost";
import { setSetting } from "@/lib/events";

/** Per-anchor stats captured during a scrape and persisted under the
 *  `last_scrape_regions_wotc` setting so /admin/scrapers can render a
 *  per-region health table. Anchors at the 197-region scale make aggregate
 *  numbers nearly useless — admins need to spot the one Tokyo anchor
 *  returning 11k events vs a sibling returning 200, or the Sapporo anchor
 *  that 5xx'd while the rest succeeded. */
export interface WotcRegionStat {
  label: string;
  country?: string;
  storesFetched: number;
  storesError?: string;
  eventsFetched: number;
  eventsError?: string;
  /** Wall-clock ms for stores + events fetch combined. Useful for spotting
   *  anchors near a timeout boundary. */
  durationMs: number;
}

const GRAPHQL_URL = "https://api.tabletop.wizards.com/silverbeak-griffin-service/graphql";
const PAGE_SIZE = 200;
const NOMINATIM_DELAY_MS = 1100;

const EVENTS_QUERY = `query searchEvents($q: EventSearchQuery!) {
  searchEvents(query: $q) {
    events {
      id title scheduledStartTime description tags status
      latitude longitude address
      entryFee { amount currency }
      eventFormat { name }
      venue { id name address }
    }
  }
}`;

const STORES_QUERY = `query storesByLocation($input: StoreByLocationInput!) {
  storesByLocation(input: $input) {
    stores { id name latitude longitude website phoneNumber }
  }
}`;

interface Store {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  website?: string;
  phoneNumber?: string;
  /** Pre-stamped from the grid anchor when known (international anchors set
   *  this). Used as a Nominatim-free hint for the event's country column. */
  country?: string;
}

async function fetchStoresAt(lat: number, lng: number, maxMeters: number): Promise<Store[]> {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operationName: "storesByLocation",
      variables: { input: { latitude: lat, longitude: lng, maxMeters } },
      query: STORES_QUERY,
    }),
  });
  if (!res.ok) throw new Error("WotC stores API HTTP error: " + res.status);
  const data = await res.json();
  if (data.errors) throw new Error("WotC stores GraphQL: " + data.errors[0].message);
  return data.data?.storesByLocation?.stores || [];
}

async function reverseGeocode(lat: number, lng: number): Promise<{ address: string; country: string }> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": "mtg-cal-bot/1.0 (https://github.com/i1986o/mtg-cal)" },
  });
  if (!res.ok) return { address: "", country: "" };
  const data = await res.json();
  const a = data.address;
  if (!a) return { address: "", country: "" };
  // Non-US countries don't have "state"; fall back to county or the country
  // name so a French address still gets a meaningful "City, Region" form.
  const region = a.state || a.county || (a.country_code?.toUpperCase() === "US" ? "" : a.country) || "";
  const parts = [
    a.house_number && a.road ? `${a.house_number} ${a.road}` : a.road || "",
    a.city || a.town || a.village || "",
    region,
    a.postcode || "",
  ].filter(Boolean);
  return {
    address: parts.join(", "),
    country: (a.country_code || "").toUpperCase(),
  };
}

function findStore(stores: Store[], lat: number, lng: number): Store | null {
  if (lat == null || lng == null) return null;
  let best: Store | null = null;
  let bestDist = Infinity;
  for (const s of stores) {
    const d = Math.abs(s.latitude - lat) + Math.abs(s.longitude - lng);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  // ~0.005 degrees ≈ 500m — bumped from 0.002 (200m) to catch GPS drift
  // between event coords and store coords. We already pick the *closest*
  // store inside the loop, so widening the cutoff just rescues borderline
  // matches, it doesn't introduce wrong ones across town.
  return bestDist < 0.005 ? best : null;
}

async function fetchEventsAt(
  lat: number,
  lng: number,
  maxMeters: number,
  startDate: string,
  endDate: string,
): Promise<any[]> {
  const all: any[] = [];
  let page = 0;
  while (true) {
    const res = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operationName: "searchEvents",
        variables: {
          q: { latitude: lat, longitude: lng, maxMeters, startDate, endDate, page, pageSize: PAGE_SIZE },
        },
        query: EVENTS_QUERY,
      }),
    });
    if (!res.ok) throw new Error("WotC API HTTP error: " + res.status);
    const data = await res.json();
    if (data.errors) throw new Error("WotC GraphQL: " + data.errors[0].message);
    const events = data.data?.searchEvents?.events;
    if (!events) throw new Error("No searchEvents in response");
    // Loop append (not `all.push(...events)`) — V8 RangeErrors at large N
    // when the spread becomes a megabyte+ of function args. Manual loop is
    // O(n) the same way without the call-stack cost.
    for (const ev of events) all.push(ev);
    if (events.length < PAGE_SIZE) break;
    page++;
  }
  return all;
}

export default async function fetchWizardsEvents(_sourceConfig = {}) {
  const config = getConfig();
  const startDate = new Date().toISOString().slice(0, 10);
  const endDate = new Date(Date.now() + config.daysAhead * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // Decide which regions to sweep. National = full CONUS grid; local = single
  // configured center.
  const regions: ScrapeRegion[] =
    config.scrapeScope === "national"
      ? config.scrapeRegions
      : [
          {
            label: `${config.location.city}, ${config.location.state}`,
            lat: config.location.lat,
            lng: config.location.lng,
            radiusMi: config.searchRadiusMiles,
          },
        ];

  console.log(`[wotc] sweeping ${regions.length} region(s) (scope: ${config.scrapeScope})`);

  // Per-region telemetry — populated as we sweep and serialized at the end
  // so the admin /admin/scrapers page can render a per-anchor health table.
  // Key by index (parallel to `regions`) so step 3's event loop can update
  // the same entry without an O(n) lookup by label.
  const regionStats: WotcRegionStat[] = regions.map((r) => ({
    label: r.label,
    country: r.country,
    storesFetched: 0,
    eventsFetched: 0,
    durationMs: 0,
  }));

  // Step 1: collect unique stores across all regions (dedup by store.id).
  // Pre-stamp `country` from the grid anchor when the anchor carries one —
  // that's the cheap path for international grids that won't otherwise hit
  // Nominatim for every store.
  const storesById = new Map<string, Store>();
  for (let i = 0; i < regions.length; i++) {
    const r = regions[i];
    const meters = Math.round(r.radiusMi * 1609.34);
    const startedAt = Date.now();
    try {
      const stores = await fetchStoresAt(r.lat, r.lng, meters);
      let added = 0;
      for (const s of stores) {
        if (!storesById.has(s.id)) {
          storesById.set(s.id, { ...s, country: r.country });
          added++;
        }
      }
      regionStats[i].storesFetched = stores.length;
      regionStats[i].durationMs += Date.now() - startedAt;
      console.log(`[wotc] region ${i + 1}/${regions.length} ${r.label}: ${stores.length} stores (+${added} new, ${storesById.size} total)`);
    } catch (err: any) {
      regionStats[i].storesError = err?.message ?? String(err);
      regionStats[i].durationMs += Date.now() - startedAt;
      console.warn(`[wotc] region ${r.label} stores fetch failed: ${err.message}`);
    }
  }

  console.log(`[wotc] ${storesById.size} unique stores across ${regions.length} regions`);

  // Step 2: reverse-geocode store addresses, using cache aggressively. Only
  // hit Nominatim for stores we've never seen before — at steady state this
  // is near-zero calls. The cache also remembers country_code so non-cached
  // international stores get one Nominatim call, then become free forever.
  //
  // Nominatim's public endpoint throttles aggressively (1 req/sec hard limit,
  // bursts can stall for 30s+). With ~2000+ new intl stores in a single
  // sweep that's hours of wall-clock — and silent 429 responses get cached
  // as empty addresses anyway. The escape hatch: stores from grid anchors
  // that pre-stamp `country` (i.e. all international anchors) skip
  // Nominatim entirely. We forgo the street address for those rows but keep
  // store name + coords + country + venue address (when the WotC GraphQL
  // payload carries one in `ev.venue.address`). Addresses can be backfilled
  // on demand later (admin tool / per-event hit when a user opens the page).
  // Override with PLAYIRL_FULL_NOMINATIM=1 to opt back in to the slow path.
  const storeAddresses: Record<string, string> = {};
  const storeCountries: Record<string, string> = {};
  const skipNominatim = process.env.PLAYIRL_FULL_NOMINATIM !== "1";
  let cacheHits = 0;
  let cacheMisses = 0;
  let intlSkips = 0;
  for (const s of storesById.values()) {
    const cached = getCachedStoreGeocode(s.id);
    if (cached !== null) {
      storeAddresses[s.id] = cached.address;
      // Cache may pre-date country_code (cached.country === ""); fall back to
      // the grid anchor's country when the cache is silent.
      storeCountries[s.id] = cached.country || s.country || "";
      cacheHits++;
      continue;
    }
    // Intl-grid stores already carry a country code from the anchor; skip
    // Nominatim and persist an empty address to mark "checked, no street
    // address available" — same cache shape Nominatim failures would
    // produce, so retries stay cheap.
    if (skipNominatim && s.country) {
      storeAddresses[s.id] = "";
      storeCountries[s.id] = s.country;
      setCachedStoreAddress(s.id, "", s.latitude, s.longitude, s.country);
      intlSkips++;
      continue;
    }
    const { address, country } = await reverseGeocode(s.latitude, s.longitude);
    storeAddresses[s.id] = address;
    storeCountries[s.id] = country || s.country || "";
    setCachedStoreAddress(s.id, address, s.latitude, s.longitude, storeCountries[s.id]);
    cacheMisses++;
    // Nominatim asks for max 1 request/second.
    await new Promise((r) => setTimeout(r, NOMINATIM_DELAY_MS));
  }
  console.log(
    `[wotc] geocode: ${cacheHits} cache hits, ${cacheMisses} fresh Nominatim lookups, ${intlSkips} intl skipped (grid-stamped country)`,
  );

  // Step 3: fetch events for each region, dedup by event id, hydrate with
  // store metadata.
  const eventsById = new Map<string, any>();
  for (let i = 0; i < regions.length; i++) {
    const r = regions[i];
    const meters = Math.round(r.radiusMi * 1609.34);
    const startedAt = Date.now();
    try {
      const events = await fetchEventsAt(r.lat, r.lng, meters, startDate, endDate);
      let added = 0;
      for (const ev of events) {
        if (!eventsById.has(ev.id)) {
          eventsById.set(ev.id, ev);
          added++;
        }
      }
      regionStats[i].eventsFetched = events.length;
      regionStats[i].durationMs += Date.now() - startedAt;
      console.log(`[wotc] region ${i + 1}/${regions.length} ${r.label}: ${events.length} events (+${added} new, ${eventsById.size} total)`);
    } catch (err: any) {
      regionStats[i].eventsError = err?.message ?? String(err);
      regionStats[i].durationMs += Date.now() - startedAt;
      console.warn(`[wotc] region ${r.label} events fetch failed: ${err.message}`);
    }
  }

  console.log(`[wotc] ${eventsById.size} unique events across ${regions.length} regions`);

  // Persist per-region stats so /admin/scrapers can render the health table.
  // Stored as a single settings row — small (~30KB for 197 regions) and
  // overwritten each run, so no cleanup needed.
  try {
    setSetting(
      "last_scrape_regions_wotc",
      JSON.stringify({ ts: new Date().toISOString(), regions: regionStats }),
    );
  } catch (err) {
    console.warn(`[wotc] failed to persist region stats: ${err}`);
  }

  // Step 4: shape into ScrapedEvent rows. Venue resolution order:
  //   1. `ev.venue.{name,address,id}` returned with the event itself —
  //      what the GraphQL query already asks for. Previously ignored,
  //      which left ~47% of WotC events with empty venue columns despite
  //      having valid coords.
  //   2. Coord-matched store from the separately-fetched stores list +
  //      its reverse-geocoded address (still useful when `ev.venue` is
  //      null — gives us name, website, and store-detail URL).
  //   3. Top-level `ev.address` as a final address fallback.
  const stores = [...storesById.values()];
  const allEvents: any[] = [];
  for (const ev of eventsById.values()) {
    const fee = ev.entryFee;
    const coordStore = findStore(stores, ev.latitude, ev.longitude);
    const venueName = ev.venue?.name || coordStore?.name || "";
    const venueAddress =
      ev.venue?.address ||
      (coordStore ? storeAddresses[coordStore.id] || "" : "") ||
      ev.address ||
      "";
    const storeId = ev.venue?.id || coordStore?.id || null;
    // Country comes from the coord-matched store (which inherited it from
    // either the grid anchor or Nominatim). Currency from WotC's entryFee.
    const country = coordStore ? storeCountries[coordStore.id] || "" : "";
    const currency = fee?.currency ? String(fee.currency).toUpperCase() : "";
    const entryFeeMinor = fee ? Math.round(fee.amount) : null;
    // Render cost via the currency-aware formatter so non-USD events show
    // "€8" / "¥500" rather than "$8" / "$5". Falls through to the legacy
    // "$X" string when currency is missing — keeps existing US rows
    // behaviorally identical even in the no-currency edge case.
    const formattedCost = formatCost(entryFeeMinor, currency);
    const cost = formattedCost
      || (fee ? (fee.amount === 0 ? "Free" : "$" + Math.round(fee.amount / 100)) : "");
    allEvents.push({
      id: "wotc-" + ev.id,
      title: (ev.title || "").trim(),
      format: normalizeFormat(ev.eventFormat?.name),
      date: (ev.scheduledStartTime || "").slice(0, 10),
      time: (ev.scheduledStartTime || "").slice(11, 16),
      timezone: "America/New_York",
      location: venueName,
      address: venueAddress,
      description: (ev.description || "").trim(),
      cost,
      currency,
      entry_fee_minor: entryFeeMinor,
      country,
      // store_url is the venue's external website — only the coord-matched
      // store list carries this; `ev.venue` doesn't include a URL.
      store_url: coordStore?.website || "",
      // Per-event deep-link on WotC's locator. The SPA's router defines
      // exactly three routes (verified by grepping the bundle):
      //   /events/:eventId   ← THIS — note plural "events"
      //   /store/:orgId
      //   /search/:query
      // An earlier attempt at /event/{id} (singular) 404'd because that
      // route doesn't exist. The plural /events/{id} resolves to the
      // event's own page and works regardless of whether a venue is
      // attached.
      detail_url: "https://locator.wizards.com/events/" + ev.id,
      latitude: ev.latitude ?? null,
      longitude: ev.longitude ?? null,
      // WotC's searchEvents returns per-event coords — trust them.
      coords_source: ev.latitude != null && ev.longitude != null ? "source" : "none",
      source: "wizards-locator",
    });
  }

  return allEvents;
}
