import { getConfig } from "@/lib/runtime-config";
import { normalizeFormat } from "@/lib/formats";
import { isCedh } from "@/lib/format-style";
import { setScrapeProgress } from "@/lib/scraper-lock";

/**
 * TopDeck scraper — Typesense events index.
 *
 * Earlier iterations of this file used POST /api/v2/tournaments (the
 * documented bulk endpoint). Empirically that endpoint returns ONLY
 * completed tournaments — ones with swiss rounds, top cut, Elo data,
 * etc. Scheduled / Ongoing events (the entire upcoming-events catalog
 * the topdeck.gg website surfaces) are invisible to it. Confirmed via
 * cli/lookup-topdeck.ts: a known live event was 200-fetchable via
 * /v2/tournaments/{TID}/info with status="Ongoing", but missing from
 * every bulk-query variant we tried.
 *
 * The actual data source the topdeck.gg website uses is a Typesense
 * search index. Config (host, public search-only API key, collection
 * name) is loaded into a global on the homepage:
 *
 *   const TYPESENSE_HOST = '3utwcn9824msk5jlp-1.a2.typesense.net';
 *   const TYPESENSE_SEARCH_KEY = '3gKhXyfqlU8nPPGNhgZrpkFqRTD9J75x';
 *   const TYPESENSE_COLLECTION = 'events';
 *
 * Typesense's scoped-key model: search-only keys are intentionally
 * embeddable in browser JS — they grant read access to specific
 * collections with optional filter restrictions. Re-using the
 * topdeck.gg key the same way the website does is consistent with
 * its intended use; TopDeck's own attribution requirement is met
 * by the footer + about-page credit. Override host/key/collection
 * via env vars if TopDeck ever rotates the public key.
 *
 * Volume comparison vs the old bulk endpoint:
 *   POST /v2/tournaments + game=Magic + format=EDH + start=now + end=now+60d:
 *     → 4 tournaments globally (completed-only)
 *   Typesense events + publish:true + startDate:>=now + game=Magic:
 *     → 1,215 events globally (all future MTG events)
 *
 * Response shape per hit (relevant fields):
 *   id, eventName, format, game, startDate, endDate,
 *   coordinates: [lat, lng], location, city, state, country,
 *   eventPrice, eventCurrency, eventHeaderImage, tier, playersRegd,
 *   eventPlayerCap, publish, isConvention, isLeague, isCircuit
 */

const TYPESENSE_HOST = process.env.TOPDECK_TYPESENSE_HOST || "3utwcn9824msk5jlp-1.a2.typesense.net";
const TYPESENSE_KEY = process.env.TOPDECK_TYPESENSE_KEY || "3gKhXyfqlU8nPPGNhgZrpkFqRTD9J75x";
const TYPESENSE_COLLECTION = process.env.TOPDECK_TYPESENSE_COLLECTION || "events";

/** Typesense default `per_page` cap is 250 (raisable via collection
 *  config we don't control). 250 keeps us pulling a few pages tops for
 *  the ~1,200 MTG events currently in the global index. */
const PER_PAGE = 250;

/** Country-name → ISO-3166 alpha-2 lookup. Typesense rows carry country
 *  as full natural-language names ("United States", "Brasil") rather
 *  than ISO codes; this map normalizes them. The long tail returns ""
 *  and we leave the column blank rather than guess. */
const COUNTRY_NAME_TO_ISO: Record<string, string> = {
  // North America
  "united states": "US", "usa": "US", "u.s.a.": "US", "u.s.": "US", "us": "US",
  "canada": "CA",
  "mexico": "MX", "méxico": "MX",
  // UK + Ireland
  "united kingdom": "GB", "uk": "GB", "great britain": "GB",
  "england": "GB", "scotland": "GB", "wales": "GB", "northern ireland": "GB",
  "ireland": "IE", "republic of ireland": "IE", "éire": "IE", "eire": "IE",
  // Western + Central Europe
  "germany": "DE", "deutschland": "DE",
  "france": "FR",
  "italy": "IT", "italia": "IT",
  "spain": "ES", "españa": "ES", "espana": "ES",
  "portugal": "PT",
  "netherlands": "NL", "holland": "NL", "the netherlands": "NL",
  "belgium": "BE", "belgique": "BE", "belgië": "BE",
  "austria": "AT", "österreich": "AT",
  "switzerland": "CH", "schweiz": "CH", "suisse": "CH",
  "luxembourg": "LU",
  // Nordic
  "sweden": "SE", "sverige": "SE",
  "norway": "NO", "norge": "NO",
  "denmark": "DK", "danmark": "DK",
  "finland": "FI", "suomi": "FI",
  "iceland": "IS",
  // Eastern Europe
  "poland": "PL", "polska": "PL",
  "czech republic": "CZ", "czechia": "CZ", "česko": "CZ",
  "slovakia": "SK",
  "hungary": "HU", "magyarország": "HU",
  "greece": "GR",
  "romania": "RO",
  "bulgaria": "BG",
  "ukraine": "UA",
  "lithuania": "LT", "latvia": "LV", "estonia": "EE",
  "slovenia": "SI", "croatia": "HR", "serbia": "RS",
  // Asia
  "japan": "JP", "日本": "JP",
  "china": "CN", "中国": "CN",
  "south korea": "KR", "korea": "KR", "republic of korea": "KR",
  "taiwan": "TW", "republic of china": "TW",
  "hong kong": "HK",
  "singapore": "SG",
  "thailand": "TH",
  "philippines": "PH",
  "indonesia": "ID",
  "malaysia": "MY",
  "vietnam": "VN", "viet nam": "VN",
  "india": "IN",
  // Oceania
  "australia": "AU",
  "new zealand": "NZ",
  // Latin America
  "brazil": "BR", "brasil": "BR",
  "argentina": "AR",
  "chile": "CL",
  "colombia": "CO",
  "peru": "PE", "perú": "PE",
  "venezuela": "VE",
  "uruguay": "UY",
  "ecuador": "EC",
  "bolivia": "BO",
  "paraguay": "PY",
  "costa rica": "CR",
  "guatemala": "GT",
  "el salvador": "SV",
  "honduras": "HN",
  "nicaragua": "NI",
  "panama": "PA", "panamá": "PA",
  "dominican republic": "DO", "república dominicana": "DO",
  "puerto rico": "PR",
  "cuba": "CU",
  // Middle East + Africa
  "israel": "IL",
  "united arab emirates": "AE", "uae": "AE",
  "saudi arabia": "SA",
  "turkey": "TR", "türkiye": "TR",
  "iran": "IR",
  "south africa": "ZA",
  "egypt": "EG",
  "nigeria": "NG",
  "morocco": "MA",
  "kenya": "KE",
};

function isoCountry(name: string | undefined): string {
  if (!name || typeof name !== "string") return "";
  const norm = name.trim().toLowerCase();
  if (!norm) return "";
  // Already ISO-2? (e.g. "US" — defensive; Typesense usually has full names)
  if (/^[a-z]{2}$/.test(norm)) return norm.toUpperCase();
  return COUNTRY_NAME_TO_ISO[norm] || "";
}

/** Currency codes from Typesense are lowercase (e.g. "usd"). Normalize
 *  to uppercase ISO-4217 to match our schema. */
function isoCurrency(raw: string | undefined): string {
  if (!raw || typeof raw !== "string") return "";
  const norm = raw.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(norm) ? norm : "";
}

interface TypesenseEvent {
  id: string;
  eventName?: string;
  format?: string;
  game?: string;
  startDate?: number;
  endDate?: number;
  coordinates?: [number, number];
  location?: string;
  city?: string;
  state?: string;
  country?: string;
  eventPrice?: number;
  eventCurrency?: string;
  eventHeaderImage?: string;
  tier?: string;
  playersRegd?: number;
  eventPlayerCap?: number;
  publish?: boolean;
  isConvention?: boolean;
  isLeague?: boolean;
  isCircuit?: boolean;
  totalEvents?: number;
}

interface TypesenseSearchResponse {
  found: number;
  out_of: number;
  page: number;
  hits: Array<{ document: TypesenseEvent }>;
  search_time_ms?: number;
}

/** Build the Typesense filter expression. Always restricts to published
 *  MTG events with future startDate. Optional local-scope scoping adds a
 *  coordinates radius. Conventions with zero sub-events are excluded to
 *  match the website's default behavior (the website's filter literally
 *  ORs isConvention:false || totalEvents:>0). */
function buildFilter(opts: { startSeconds: number; endSeconds: number; local?: { lat: number; lng: number; radiusKm: number } }): string {
  const parts = [
    `publish:true`,
    `startDate:>=${opts.startSeconds}`,
    `startDate:<=${opts.endSeconds}`,
    `game:\`Magic: The Gathering\``,
    `(isConvention:false || totalEvents:>0)`,
  ];
  if (opts.local) {
    parts.push(`coordinates:(${opts.local.lat}, ${opts.local.lng}, ${opts.local.radiusKm} km)`);
  }
  return parts.join(" && ");
}

async function fetchPage(filter: string, page: number, perPage: number): Promise<TypesenseSearchResponse> {
  const params = new URLSearchParams({
    q: "*",
    query_by: "eventName",
    filter_by: filter,
    sort_by: "startDate:asc",
    per_page: String(perPage),
    page: String(page),
  });
  const url = `https://${TYPESENSE_HOST}/collections/${TYPESENSE_COLLECTION}/documents/search?${params}`;
  const res = await fetch(url, {
    headers: {
      "X-TYPESENSE-API-KEY": TYPESENSE_KEY,
      "User-Agent": "PlayIRL.gg-events/1.0 (+https://playirl.gg)",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Typesense HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<TypesenseSearchResponse>;
}

export default async function fetchTopdeckEvents(_sourceConfig: unknown = {}) {
  const config = getConfig();
  const now = Math.floor(Date.now() / 1000);
  const end = now + config.daysAhead * 24 * 60 * 60;

  // Build the filter. In national/global scope we don't pass a coord
  // radius — the orchestrator's lat/lng filtering on the UI side takes
  // care of presenting events nearest the viewer. In "local" scope
  // (Philly seed admin's still-on-staging local mode) we narrow at
  // query time to keep the row count tight.
  const isLocal = config.scrapeScope === "local";
  const filter = buildFilter({
    startSeconds: now,
    endSeconds: end,
    local: isLocal
      ? {
          lat: config.location.lat,
          lng: config.location.lng,
          // Convert configured miles → km for Typesense.
          radiusKm: Math.round(config.searchRadiusMiles * 1.609344),
        }
      : undefined,
  });

  setScrapeProgress({
    phase: "TopDeck",
    message: `Querying Typesense events index${isLocal ? ` (≤${config.searchRadiusMiles}mi)` : " (global)"}…`,
    current: 0,
    total: 0,
  });

  // Page 1 also tells us total `found` so we can bound the loop.
  let page = 1;
  const firstPage = await fetchPage(filter, page, PER_PAGE);
  const found = firstPage.found;
  console.log(`[topdeck] Typesense: ${found} matching events (of ${firstPage.out_of} total in collection)`);

  // Defensive cap — if TopDeck ever has 100k+ MTG events scheduled,
  // we don't want a single scrape to ingest the entire world in one
  // pass. 4000 = ~16 pages of 250, plenty of headroom.
  const HARD_CAP = 4000;
  const totalToFetch = Math.min(found, HARD_CAP);

  const rawEvents: TypesenseEvent[] = firstPage.hits.map((h) => h.document);
  setScrapeProgress({
    phase: "TopDeck",
    message: `Page 1 · ${rawEvents.length}/${totalToFetch}`,
    current: rawEvents.length,
    total: totalToFetch,
    events: rawEvents.length,
  });

  // Subsequent pages, sequentially. Typesense is fast (~5-20ms/page) so
  // parallel fan-out gains nothing and risks tripping their per-key
  // request budget. Sequential keeps us polite and within obvious limits.
  while (rawEvents.length < totalToFetch) {
    page++;
    const next = await fetchPage(filter, page, PER_PAGE);
    if (next.hits.length === 0) break;
    for (const h of next.hits) rawEvents.push(h.document);
    setScrapeProgress({
      phase: "TopDeck",
      message: `Page ${page} · ${rawEvents.length}/${totalToFetch}`,
      current: rawEvents.length,
      total: totalToFetch,
      events: rawEvents.length,
    });
    // Polite pause between pages — Typesense doesn't document a rate
    // limit for free-tier search but 50ms is invisible to scrape
    // wall-clock and keeps us off their burst radar.
    await new Promise((r) => setTimeout(r, 50));
  }

  console.log(`[topdeck] Typesense: pulled ${rawEvents.length} events across ${page} pages`);

  // Convert into our schema. Drop rows with no coordinates — they
  // can't be placed on the map / radius filters. Typesense rows with
  // missing coords are rare (test events, mis-configured tournaments).
  const events: Record<string, unknown>[] = [];
  let droppedNoCoords = 0;
  for (const t of rawEvents) {
    const coords = Array.isArray(t.coordinates) && t.coordinates.length === 2 ? t.coordinates : null;
    const tLat = coords ? coords[0] : null;
    const tLng = coords ? coords[1] : null;

    if (tLat == null || tLng == null || !Number.isFinite(tLat) || !Number.isFinite(tLng)) {
      droppedNoCoords++;
      continue;
    }
    // The website considers (0, 0) a placeholder. Skip those too.
    if (tLat === 0 && tLng === 0) {
      droppedNoCoords++;
      continue;
    }

    const startDate = t.startDate ? new Date(t.startDate * 1000) : null;
    if (!startDate) continue;

    // Promote Commander → cEDH when the title carries the marker
    // (matches the equivalent override in scrapers/wizards-locator.ts).
    // TopDeck is heavily Commander-weighted (~80%), so a substantial
    // fraction of those flip to cEDH here.
    const eventName = (t.eventName || "").trim();
    const rawFormat = normalizeFormat(t.format);
    const format = rawFormat === "Commander" && isCedh(eventName) ? "cEDH" : rawFormat;
    const country = isoCountry(t.country);
    const currency = isoCurrency(t.eventCurrency);
    // Typesense stores eventPrice as a number in major units (e.g. 50
    // for $50). Convert to minor units (cents) for our schema.
    const priceMajor = typeof t.eventPrice === "number" && Number.isFinite(t.eventPrice) ? t.eventPrice : null;
    const entryFeeMinor = priceMajor == null ? null : Math.round(priceMajor * 100);
    // Display cost: "Free" / "$50" / etc. The currency-aware formatter
    // downstream will handle non-USD; here we provide a sensible
    // fallback for the legacy `cost` column.
    const cost = priceMajor == null
      ? ""
      : priceMajor === 0
        ? "Free"
        : `${currency === "USD" || !currency ? "$" : ""}${priceMajor}${currency && currency !== "USD" ? ` ${currency}` : ""}`;

    // Address: prefer the full `location` string (which is usually a
    // street-level address). Fall back to "city, state" if it's
    // missing or empty.
    const address = (t.location && t.location.trim()) || [t.city, t.state].filter(Boolean).join(", ") || "";

    events.push({
      id: "topdeck-" + t.id,
      title: eventName,
      format,
      date: startDate.toISOString().slice(0, 10),
      time: startDate.toISOString().slice(11, 16),
      // The website renders local time per the event's coords but we
      // don't have that signal directly; America/New_York is a safe
      // default since the bulk of TopDeck volume is US, and the
      // downstream timezone picker (lib/format-time.ts) overrides
      // this from coords when rendering anyway.
      timezone: "America/New_York",
      location: t.city && t.state ? `${t.city}, ${t.state}` : (t.city || t.state || ""),
      address,
      cost,
      currency,
      entry_fee_minor: entryFeeMinor,
      country,
      store_url: "",
      detail_url: `https://topdeck.gg/event/${t.id}`,
      latitude: tLat,
      longitude: tLng,
      // Typesense rows carry exact organizer-provided coords — trust them.
      coords_source: "source",
      // Organizer-uploaded header image when present.
      image_url: t.eventHeaderImage && t.eventHeaderImage.trim() ? t.eventHeaderImage.trim() : "",
      source: "topdeck",
    });
  }

  if (droppedNoCoords > 0) {
    console.log(`[topdeck] dropped ${droppedNoCoords}/${rawEvents.length} events with missing/zero coords`);
  }
  console.log(`[topdeck] ingested ${events.length} events`);
  return events;
}
