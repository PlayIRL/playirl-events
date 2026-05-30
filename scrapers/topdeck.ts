import { getConfig } from "@/lib/runtime-config";
import { normalizeFormat } from "@/lib/formats";
import { setScrapeProgress } from "@/lib/scraper-lock";

const API_URL = "https://topdeck.gg/api/v2/tournaments";

/** US state postal abbreviations + DC + the most common territories. Used
 *  as a cheap signal to stamp `country = "US"` on TopDeck rows that don't
 *  carry an explicit country field. */
const US_STATE_CODES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC","PR","VI","GU","AS","MP",
]);

/** Canadian province / territory postal abbreviations. Same pattern. */
const CA_PROVINCE_CODES = new Set([
  "AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT",
]);

/** Country-name → ISO-3166 alpha-2 lookup for the cases where
 *  `loc.address` is just a country name (typical for non-US TopDeck rows
 *  where city/state are blank). Lower-cased keys + common variants:
 *  the WebFetch'd v2 docs don't enumerate what TopDeck actually writes
 *  here, so we hedge by mapping multiple natural-language forms per
 *  country. Coverage is biased toward countries with active MTG scenes;
 *  the long tail returns "" and we leave the country column empty
 *  rather than guess. Extending: just add a key/value. */
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

/** Resolve an address-shaped string to an ISO-2 country code, or "". The
 *  comparison is whitespace- and case-insensitive against the lookup
 *  above. We also try the LAST comma-separated token — TopDeck addresses
 *  sometimes look like "Calle 9, Maipú, Chile" where the country is the
 *  last segment. Anything that doesn't match returns "" and the caller
 *  falls back to the no-country path. */
function inferCountryFromAddressName(addr: string | undefined): string {
  if (!addr || typeof addr !== "string") return "";
  const norm = addr.trim().toLowerCase();
  if (!norm) return "";
  if (COUNTRY_NAME_TO_ISO[norm]) return COUNTRY_NAME_TO_ISO[norm];
  // Try the last comma segment for "City, Region, Country" shapes.
  const segments = norm.split(",").map((s) => s.trim()).filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i--) {
    const hit = COUNTRY_NAME_TO_ISO[segments[i]];
    if (hit) return hit;
  }
  return "";
}

function inferCountryFromTopDeckLoc(
  raw: string | undefined,
  stateCode: string | undefined,
  address: string | undefined,
): string {
  // Explicit country wins — uppercase + ISO-2 validate. (Legacy field;
  // TopDeck v2's eventData shape doesn't include this, but kept for
  // safety against future re-additions or non-bulk endpoints.)
  if (raw && typeof raw === "string") {
    const cc = raw.trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(cc)) return cc;
  }
  // State-code path covers the bulk of TopDeck rows (US events + Canada).
  if (stateCode && typeof stateCode === "string") {
    const sc = stateCode.trim().toUpperCase();
    if (US_STATE_CODES.has(sc)) return "US";
    if (CA_PROVINCE_CODES.has(sc)) return "CA";
  }
  // Fall back to parsing the address string. International TopDeck rows
  // routinely have empty city + state + an `address` field carrying just
  // the country name ("Chile", "Germany"). Name lookup salvages those.
  const fromAddress = inferCountryFromAddressName(address);
  if (fromAddress) return fromAddress;
  return "";
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** TopDeck's POST /v2/tournaments requires BOTH `game` and `format` —
 *  per their OpenAPI spec at https://topdeck.gg/openapi.json. There's no
 *  wildcard or "all formats" value, so we fan out one query per format
 *  and merge. The OpenAPI spec keeps `format` as a free-form string;
 *  the enumeration of valid values lives only in the v2 reference docs
 *  at https://topdeck.gg/docs/tournaments-v2.
 *
 *  This list is the exhaustive set of MTG formats TopDeck accepts (as
 *  of the v2 docs read on 2026-05-30). Earlier iterations of this file
 *  shipped "Brawl", "Booster Draft", and "Prerelease" — none of which
 *  are valid TopDeck formats; they were returning empty arrays silently
 *  and burning rate-limit budget. "Booster Draft" is "Limited" in
 *  TopDeck's vocabulary. "Brawl" and "Prerelease" aren't tracked at all
 *  (Prerelease events show up via WotC's API anyway).
 *
 *  Format names are case-sensitive. EDH is TopDeck's term for Commander;
 *  the downstream normalizer rewrites it to "Commander" for display so
 *  the homepage filter chip stays clean. The micro-formats at the bottom
 *  (Old School / Tiny Leaders / Oathbreaker / etc.) see few events but
 *  cost ~one API call each — cheap enough to include for full coverage.
 *  Each format = +1 API call per scrape; rate limit on this endpoint is
 *  "lower than the default 100/min" per the v2 docs, but `Promise.allSettled`
 *  on the fan-out isolates per-format 429s so partial throttling won't
 *  poison the whole run. */
const TOPDECK_MTG_FORMATS = [
  // Constructed (most-organized)
  "Standard",
  "Modern",
  "Pioneer",
  "Legacy",
  "Vintage",
  "Pauper",
  "Premodern",
  // Limited
  "Limited",         // TopDeck's term for what we used to call "Booster Draft"
  "Sealed",
  // Commander family
  "EDH",             // Commander
  "Pauper EDH",
  "Duel Commander",
  "EDH Draft",
  // Other / casual / community
  "Historic",
  "Timeless",
  "Explorer",
  "Old School 93/94",
  "Canadian Highlander",
  "Tiny Leaders",
  "7pt Highlander",
  "Oathbreaker",
];

// Module-level counter for progress reporting. Incremented inside the
// parallel fan-out so the admin UI can see "TopDeck · 7/21 formats" as
// queries land. Reset at the top of each scrape run (only one scrape
// in flight per process, lock guarantees that).
let topdeckFormatsCompleted = 0;
let topdeckEventsAccum = 0;

async function fetchTopdeckForFormat(
  apiKey: string,
  format: string,
  start: number,
  end: number,
  totalFormats: number,
): Promise<unknown[]> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Authorization": apiKey,
      "Content-Type": "application/json",
      // Identify ourselves so TopDeck can spot us in their telemetry —
      // useful for them if they ever need to coordinate on rate-limit
      // tuning, and the polite default for any API caller. Includes a
      // contact-shaped URL per the conventional `User-Agent` form.
      "User-Agent": "PlayIRL.gg-events/1.0 (+https://playirl.gg)",
    },
    body: JSON.stringify({
      game: "Magic: The Gathering",
      format,
      start,
      end,
      // Skip the standings payload — we don't store per-player data and
      // the empty `{}` placeholders that come back still bloat the
      // response. `columns: []` is honored per the OpenAPI default
      // override path.
      columns: [],
      // Filter out single-player / two-player "tournaments" that show up
      // as TO test data or cancelled events. 4 = minimum viable swiss
      // (two pairings × one round) — still permissive enough that
      // legitimate small LGS events stay in.
      participantMin: 4,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`TopDeck API HTTP ${res.status} (format=${format}): ${text.slice(0, 200)}`);
  }
  const tournaments = await res.json();
  if (!Array.isArray(tournaments)) {
    console.warn(`[topdeck] format=${format}: unexpected response shape ${typeof tournaments}`);
    topdeckFormatsCompleted++;
    setScrapeProgress({
      phase: "TopDeck",
      message: `format=${format} returned no array`,
      current: topdeckFormatsCompleted,
      total: totalFormats,
      events: topdeckEventsAccum,
    });
    return [];
  }
  topdeckFormatsCompleted++;
  topdeckEventsAccum += tournaments.length;
  setScrapeProgress({
    phase: "TopDeck",
    message: `format=${format} · ${tournaments.length} tournaments (running total ${topdeckEventsAccum.toLocaleString()})`,
    current: topdeckFormatsCompleted,
    total: totalFormats,
    events: topdeckEventsAccum,
  });
  return tournaments;
}

export default async function fetchTopdeckEvents(sourceConfig: any = {}) {
  const apiKey = sourceConfig.apiKey || process.env.TOPDECK_API_KEY;
  if (!apiKey) {
    console.warn("[topdeck] No API key — set TOPDECK_API_KEY env var or config.sources.topdeck.apiKey");
    return [];
  }

  const config = getConfig();
  const now = Math.floor(Date.now() / 1000);
  const end = Math.floor((Date.now() + config.daysAhead * 24 * 60 * 60 * 1000) / 1000);

  // Fan out one query per format, run in parallel since they're independent.
  // Promise.allSettled so one format failing doesn't poison the others —
  // we still surface the failure in logs but keep ingesting the rest.
  // Dedupe on TID because a single tournament could theoretically be tagged
  // with multiple formats; practical observation is that this almost never
  // happens, but the dedupe is cheap insurance.
  // Reset module counters before the fan-out so progress reporting
  // starts from zero each scrape (lock prevents concurrent runs).
  topdeckFormatsCompleted = 0;
  topdeckEventsAccum = 0;
  setScrapeProgress({
    phase: "TopDeck",
    message: `Querying ${TOPDECK_MTG_FORMATS.length} formats…`,
    current: 0,
    total: TOPDECK_MTG_FORMATS.length,
  });
  const settled = await Promise.allSettled(
    TOPDECK_MTG_FORMATS.map((fmt) => fetchTopdeckForFormat(apiKey, fmt, now, end, TOPDECK_MTG_FORMATS.length).then(
      (rows) => ({ fmt, rows }),
    )),
  );
  const failures: string[] = [];
  const byTid = new Map<string, any>();
  for (let i = 0; i < settled.length; i++) {
    const fmt = TOPDECK_MTG_FORMATS[i];
    const res = settled[i];
    if (res.status === "rejected") {
      const msg = res.reason instanceof Error ? res.reason.message : String(res.reason);
      console.warn(`[topdeck] format=${fmt} FAILED: ${msg}`);
      failures.push(`${fmt}: ${msg}`);
      continue;
    }
    for (const t of res.value.rows as Array<{ TID?: string; tid?: string }>) {
      const tid = String(t.TID ?? t.tid ?? "");
      if (!tid) continue;
      if (!byTid.has(tid)) byTid.set(tid, t);
    }
    console.log(`[topdeck] format=${fmt}: ${res.value.rows.length} tournaments`);
  }

  // If EVERY format query failed, surface that as a thrown error so
  // scrape_history records the failure and the admin Sources column shows
  // ✗ topdeck. Partial failures (1-2 formats down) are warnings, not errors.
  if (failures.length === TOPDECK_MTG_FORMATS.length) {
    throw new Error(`TopDeck all formats failed. First: ${failures[0]}`);
  }
  if (failures.length > 0) {
    console.warn(`[topdeck] ${failures.length}/${TOPDECK_MTG_FORMATS.length} format queries failed (continuing with the rest)`);
  }

  const tournaments = [...byTid.values()];
  console.log(`[topdeck] ${tournaments.length} unique MTG tournaments across ${TOPDECK_MTG_FORMATS.length - failures.length} formats`);

  // In "national" scope we ingest every event with valid coords and let the UI
  // (and ICS feed) filter by user-chosen lat/lng + radius. In "local" scope we
  // filter at ingest time against the configured center to keep the DB lean.
  const isNational = config.scrapeScope === "national";
  const maxMiles = config.searchRadiusMiles;
  const { lat, lng } = config.location;
  const nearby = [];

  // Coords live under `eventData.lat` / `eventData.lng` in TopDeck v2's
  // current response. Older payloads used `latitude` / `longitude` (full
  // names), so we accept both: the `??` chain keeps the scraper resilient
  // if TopDeck ever swaps back, and any future rename will trip the
  // "dropped N tournaments" warning below loudly rather than silently
  // zeroing out the source again.
  let droppedNoCoords = 0;
  for (const t of tournaments as any[]) {
    const loc = t.eventData || t.location || {};
    const tLat = loc.lat ?? loc.latitude;
    const tLng = loc.lng ?? loc.longitude;

    if (tLat == null || tLng == null) {
      droppedNoCoords++;
      continue;
    }

    if (!isNational) {
      const dist = haversineDistance(lat, lng, tLat, tLng);
      if (dist > maxMiles) continue;
    }

    const startDate = new Date(t.startDate * 1000);
    const format = normalizeFormat(t.format);

    // Country resolution priority:
    //   1. Explicit country code (legacy fields — v2 doesn't write these,
    //      but cheap to forward in case TopDeck re-adds them).
    //   2. State code → US state codes map to "US", CA province codes map
    //      to "CA". Covers nearly all North American rows.
    //   3. Address-name lookup. International TopDeck rows routinely have
    //      empty city/state and a `loc.address` carrying the country
    //      name as English/native ("Chile", "Deutschland"). Parses to
    //      ISO-2 via the COUNTRY_NAME_TO_ISO map above.
    //   4. Empty string. Surfaces as "—" in the admin by-country
    //      dashboard rather than guessing.
    const rawCountry: string | undefined =
      loc.country || loc.countryCode || loc.country_code;
    const country = inferCountryFromTopDeckLoc(rawCountry, loc.state, loc.address);

    // Header image — TopDeck v2 provides `eventData.headerImage` for
    // events whose organizer uploaded a banner. Empty when none was
    // set. Most fields TopDeck returns are absolute URLs; defend against
    // a hypothetical relative path by prefixing the origin.
    const rawHeaderImage: string = typeof loc.headerImage === "string" ? loc.headerImage.trim() : "";
    const imageUrl = rawHeaderImage
      ? (rawHeaderImage.startsWith("http") ? rawHeaderImage : `https://topdeck.gg${rawHeaderImage.startsWith("/") ? "" : "/"}${rawHeaderImage}`)
      : "";

    nearby.push({
      id: "topdeck-" + (t.TID || t.tid),
      title: (t.tournamentName || t.name || "").trim(),
      format,
      date: startDate.toISOString().slice(0, 10),
      time: startDate.toISOString().slice(11, 16),
      timezone: "America/New_York",
      // `loc.address` is a new TopDeck v2 field that often carries a
      // country-shaped string ("Chile", "Germany") when city/state are
      // blank — common for non-US events. Use it as a fallback for the
      // address column so international rows aren't shipped with an
      // empty address.
      location: loc.name || "",
      address: [loc.city, loc.state].filter(Boolean).join(", ") || loc.address || "",
      cost: "",
      currency: "",
      entry_fee_minor: null,
      country,
      store_url: "",
      detail_url: `https://topdeck.gg/event/${t.TID || t.tid}`,
      latitude: tLat,
      longitude: tLng,
      // Optional: organizer-uploaded banner. Empty when TopDeck doesn't
      // carry one — the UI falls back to format-tinted placeholder
      // exactly like it does for source-less or image-less events from
      // other scrapers.
      image_url: imageUrl,
      // TopDeck's API returns per-tournament coords — trust them.
      coords_source: "source",
      source: "topdeck",
    });
  }

  if (isNational) {
    console.log(`[topdeck] ${nearby.length} events with coords (national scope, no radius filter)`);
  } else {
    console.log(`[topdeck] ${nearby.length} events within ${maxMiles}mi radius`);
  }

  // Loud warning when the coord filter eats every tournament. Previously
  // this was silent: the scrape would report ✓ topdeck · 0 events with
  // no failure recorded, and an admin had to run cli/probe-topdeck.ts to
  // discover a schema rename had broken the ingest. Surface it cheaply
  // so the next field rename trips an alarm instead of a void.
  if (tournaments.length > 0 && nearby.length === 0) {
    console.warn(
      `[topdeck] ⚠ DROPPED ALL ${tournaments.length} tournaments at coord filter ` +
      `(${droppedNoCoords} missing lat/lng). Likely a TopDeck schema rename — ` +
      `run \`npm run topdeck:probe\` to inspect the current response shape.`,
    );
  } else if (droppedNoCoords > 0) {
    console.log(`[topdeck] dropped ${droppedNoCoords}/${tournaments.length} tournaments at coord filter (missing lat/lng)`);
  }
  return nearby;
}
