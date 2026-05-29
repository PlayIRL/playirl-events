import { getConfig } from "@/lib/runtime-config";
import { normalizeFormat } from "@/lib/formats";

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

function inferCountryFromTopDeckLoc(
  raw: string | undefined,
  stateCode: string | undefined,
): string {
  // Explicit country wins — uppercase + ISO-2 validate.
  if (raw && typeof raw === "string") {
    const cc = raw.trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(cc)) return cc;
  }
  // No explicit country: lean on the state field. US state codes and
  // Canadian province codes are both two-letter and otherwise indistinguishable
  // from random strings, but together they cover the bulk of TopDeck rows.
  if (stateCode && typeof stateCode === "string") {
    const sc = stateCode.trim().toUpperCase();
    if (US_STATE_CODES.has(sc)) return "US";
    if (CA_PROVINCE_CODES.has(sc)) return "CA";
  }
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

export default async function fetchTopdeckEvents(sourceConfig: any = {}) {
  const apiKey = sourceConfig.apiKey || process.env.TOPDECK_API_KEY;
  if (!apiKey) {
    console.warn("[topdeck] No API key — set TOPDECK_API_KEY env var or config.sources.topdeck.apiKey");
    return [];
  }

  const config = getConfig();
  const now = Math.floor(Date.now() / 1000);
  const end = Math.floor((Date.now() + config.daysAhead * 24 * 60 * 60 * 1000) / 1000);

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Authorization": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      game: "Magic: The Gathering",
      start: now,
      end,
      columns: [],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`TopDeck API HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const tournaments = await res.json();
  if (!Array.isArray(tournaments)) {
    console.warn("[topdeck] Unexpected response shape:", typeof tournaments);
    return [];
  }

  console.log(`[topdeck] ${tournaments.length} MTG tournaments fetched from API`);

  // In "national" scope we ingest every event with valid coords and let the UI
  // (and ICS feed) filter by user-chosen lat/lng + radius. In "local" scope we
  // filter at ingest time against the configured center to keep the DB lean.
  const isNational = config.scrapeScope === "national";
  const maxMiles = config.searchRadiusMiles;
  const { lat, lng } = config.location;
  const nearby = [];

  for (const t of tournaments as any[]) {
    const loc = t.eventData || t.location || {};
    const tLat = loc.latitude;
    const tLng = loc.longitude;

    if (tLat == null || tLng == null) continue;

    if (!isNational) {
      const dist = haversineDistance(lat, lng, tLat, tLng);
      if (dist > maxMiles) continue;
    }

    const startDate = new Date(t.startDate * 1000);
    const format = normalizeFormat(t.format);

    // Country resolution: TopDeck's documented response shape doesn't
    // include an ISO country code. We forward any country-shaped field they
    // do surface (loc.country, loc.countryCode, loc.country_code) — if those
    // turn up empty, fall back to inferring from the state code: US state
    // codes map to "US"; Canadian province codes map to "CA"; anything else
    // we leave blank rather than mis-stamping. The admin's by-country
    // dashboard renders "—" for blanks so reality stays visible.
    const rawCountry: string | undefined =
      loc.country || loc.countryCode || loc.country_code;
    const country = inferCountryFromTopDeckLoc(rawCountry, loc.state);
    nearby.push({
      id: "topdeck-" + (t.TID || t.tid),
      title: (t.tournamentName || t.name || "").trim(),
      format,
      date: startDate.toISOString().slice(0, 10),
      time: startDate.toISOString().slice(11, 16),
      timezone: "America/New_York",
      location: loc.name || "",
      address: [loc.city, loc.state].filter(Boolean).join(", "),
      cost: "",
      currency: "",
      entry_fee_minor: null,
      country,
      store_url: "",
      detail_url: `https://topdeck.gg/event/${t.TID || t.tid}`,
      latitude: tLat,
      longitude: tLng,
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
  return nearby;
}
