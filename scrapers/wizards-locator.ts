import { getConfig } from "@/lib/runtime-config";
import { getCachedStoreAddress, setCachedStoreAddress } from "@/lib/store-geocode-cache";
import type { ScrapeRegion } from "@/lib/scrape-grid";
import { normalizeFormat } from "@/lib/formats";

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

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
  const res = await fetch(url, {
    headers: { "User-Agent": "mtg-cal-bot/1.0 (https://github.com/i1986o/mtg-cal)" },
  });
  if (!res.ok) return "";
  const data = await res.json();
  const a = data.address;
  if (!a) return "";
  const parts = [
    a.house_number && a.road ? `${a.house_number} ${a.road}` : a.road || "",
    a.city || a.town || a.village || "",
    a.state || "",
    a.postcode || "",
  ].filter(Boolean);
  return parts.join(", ");
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
    all.push(...events);
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

  // Step 1: collect unique stores across all regions (dedup by store.id).
  const storesById = new Map<string, Store>();
  for (let i = 0; i < regions.length; i++) {
    const r = regions[i];
    const meters = Math.round(r.radiusMi * 1609.34);
    try {
      const stores = await fetchStoresAt(r.lat, r.lng, meters);
      let added = 0;
      for (const s of stores) {
        if (!storesById.has(s.id)) {
          storesById.set(s.id, s);
          added++;
        }
      }
      console.log(`[wotc] region ${i + 1}/${regions.length} ${r.label}: ${stores.length} stores (+${added} new, ${storesById.size} total)`);
    } catch (err: any) {
      console.warn(`[wotc] region ${r.label} stores fetch failed: ${err.message}`);
    }
  }

  console.log(`[wotc] ${storesById.size} unique stores across ${regions.length} regions`);

  // Step 2: reverse-geocode store addresses, using cache aggressively. Only
  // hit Nominatim for stores we've never seen before — at steady state this
  // is near-zero calls.
  const storeAddresses: Record<string, string> = {};
  let cacheHits = 0;
  let cacheMisses = 0;
  for (const s of storesById.values()) {
    const cached = getCachedStoreAddress(s.id);
    if (cached !== null) {
      storeAddresses[s.id] = cached;
      cacheHits++;
      continue;
    }
    const addr = await reverseGeocode(s.latitude, s.longitude);
    storeAddresses[s.id] = addr;
    setCachedStoreAddress(s.id, addr, s.latitude, s.longitude);
    cacheMisses++;
    // Nominatim asks for max 1 request/second.
    await new Promise((r) => setTimeout(r, NOMINATIM_DELAY_MS));
  }
  console.log(`[wotc] geocode: ${cacheHits} cache hits, ${cacheMisses} fresh lookups`);

  // Step 3: fetch events for each region, dedup by event id, hydrate with
  // store metadata.
  const eventsById = new Map<string, any>();
  for (let i = 0; i < regions.length; i++) {
    const r = regions[i];
    const meters = Math.round(r.radiusMi * 1609.34);
    try {
      const events = await fetchEventsAt(r.lat, r.lng, meters, startDate, endDate);
      let added = 0;
      for (const ev of events) {
        if (!eventsById.has(ev.id)) {
          eventsById.set(ev.id, ev);
          added++;
        }
      }
      console.log(`[wotc] region ${i + 1}/${regions.length} ${r.label}: ${events.length} events (+${added} new, ${eventsById.size} total)`);
    } catch (err: any) {
      console.warn(`[wotc] region ${r.label} events fetch failed: ${err.message}`);
    }
  }

  console.log(`[wotc] ${eventsById.size} unique events across ${regions.length} regions`);

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
    allEvents.push({
      id: "wotc-" + ev.id,
      title: (ev.title || "").trim(),
      format: normalizeFormat(ev.eventFormat?.name),
      date: (ev.scheduledStartTime || "").slice(0, 10),
      time: (ev.scheduledStartTime || "").slice(11, 16),
      timezone: "America/New_York",
      location: venueName,
      address: venueAddress,
      cost: fee ? (fee.amount === 0 ? "Free" : "$" + Math.round(fee.amount / 100)) : "",
      // store_url is the venue's external website — only the coord-matched
      // store list carries this; `ev.venue` doesn't include a URL.
      store_url: coordStore?.website || "",
      detail_url: storeId ? "https://locator.wizards.com/store/" + storeId + "/" : "",
      latitude: ev.latitude ?? null,
      longitude: ev.longitude ?? null,
      // WotC's searchEvents returns per-event coords — trust them.
      coords_source: ev.latitude != null && ev.longitude != null ? "source" : "none",
      source: "wizards-locator",
    });
  }

  return allEvents;
}
