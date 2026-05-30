// Diagnostic probe for the TopDeck Typesense events index — the same
// data source scrapers/topdeck.ts now consumes. Prints:
//   - total MTG events globally in our window (= scraper's expected
//     upper bound)
//   - breakdown by format and country
//   - a sample event's raw Typesense shape
//   - whether each event has coords (= scraper's ingest gate)
//
// Earlier versions of this probe tested the documented POST /v2/tournaments
// bulk endpoint, which turned out to be a completed-tournaments archive
// (Ongoing/Scheduled events invisible). Both endpoints are now superseded
// for ingestion; this file targets the search index the topdeck.gg
// website actually uses.
//
// Usage:
//   npm run topdeck:probe                          # 60d window, sample
//   npm run topdeck:probe -- --days=180            # widen the window
//   npm run topdeck:probe -- --raw                 # dump first hit verbatim
//   npm run topdeck:probe -- --format=EDH          # filter to one format
//
// No TOPDECK_API_KEY needed — the Typesense search key is public and
// embedded in topdeck.gg's homepage HTML. Override via env if it ever
// rotates.

// `export {}` makes this file an isolated TS module.
export {};

const TYPESENSE_HOST = process.env.TOPDECK_TYPESENSE_HOST || "3utwcn9824msk5jlp-1.a2.typesense.net";
const TYPESENSE_KEY = process.env.TOPDECK_TYPESENSE_KEY || "3gKhXyfqlU8nPPGNhgZrpkFqRTD9J75x";
const TYPESENSE_COLLECTION = process.env.TOPDECK_TYPESENSE_COLLECTION || "events";

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
  facet_counts?: Array<{
    field_name: string;
    counts: Array<{ value: string; count: number }>;
  }>;
  search_time_ms?: number;
}

interface CliArgs {
  days: number;
  format?: string;
  showRaw: boolean;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  let days = 60;
  let format: string | undefined;
  let showRaw = false;
  for (const a of argv) {
    if (a === "--raw" || a === "-v") { showRaw = true; continue; }
    const daysMatch = /^--days=(\d+)$/.exec(a);
    if (daysMatch) { days = Math.max(1, Math.min(3650, Number(daysMatch[1]))); continue; }
    const formatMatch = /^--format=(.+)$/.exec(a);
    if (formatMatch) { format = formatMatch[1]; continue; }
  }
  return { days, format, showRaw };
}

async function search(filter: string, perPage: number, page = 1, facetBy?: string): Promise<TypesenseSearchResponse> {
  const params = new URLSearchParams({
    q: "*",
    query_by: "eventName",
    filter_by: filter,
    sort_by: "startDate:asc",
    per_page: String(perPage),
    page: String(page),
  });
  if (facetBy) params.set("facet_by", facetBy);
  const url = `https://${TYPESENSE_HOST}/collections/${TYPESENSE_COLLECTION}/documents/search?${params}`;
  const res = await fetch(url, {
    headers: {
      "X-TYPESENSE-API-KEY": TYPESENSE_KEY,
      "User-Agent": "PlayIRL.gg-events-probe/1.0 (+https://playirl.gg)",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Typesense HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  return res.json() as Promise<TypesenseSearchResponse>;
}

function buildFilter(days: number, format?: string): string {
  const now = Math.floor(Date.now() / 1000);
  const end = now + days * 24 * 60 * 60;
  const parts = [
    `publish:true`,
    `startDate:>=${now}`,
    `startDate:<=${end}`,
    `game:\`Magic: The Gathering\``,
    `(isConvention:false || totalEvents:>0)`,
  ];
  if (format) parts.push(`format:\`${format}\``);
  return parts.join(" && ");
}

function pct(num: number, denom: number): string {
  if (denom <= 0) return "—";
  return `${((num / denom) * 100).toFixed(1)}%`;
}

async function main() {
  const args = parseArgs();
  const now = Math.floor(Date.now() / 1000);
  const end = now + args.days * 24 * 60 * 60;
  console.log(`\n🃏 Probing TopDeck Typesense events index`);
  console.log(`window:  ${new Date(now * 1000).toISOString()} → ${new Date(end * 1000).toISOString()} (${args.days} days)`);
  if (args.format) console.log(`format:  ${args.format}`);
  console.log(`host:    ${TYPESENSE_HOST}`);
  console.log(`collection: ${TYPESENSE_COLLECTION}\n`);

  // Single facet query gets us totals + per-format breakdown + per-country breakdown in two calls.
  const filter = buildFilter(args.days, args.format);
  const formatFacet = await search(filter, 0, 1, "format");
  const countryFacet = await search(filter, 0, 1, "country");
  console.log(`══ Volume ═══════════════════════════════════════════════════════════`);
  console.log(`${formatFacet.found.toLocaleString()} matching events (of ${formatFacet.out_of.toLocaleString()} in collection)`);
  console.log(`search time: ${formatFacet.search_time_ms ?? "?"}ms`);

  const formatCounts = formatFacet.facet_counts?.find((f) => f.field_name === "format")?.counts ?? [];
  const countryCounts = countryFacet.facet_counts?.find((f) => f.field_name === "country")?.counts ?? [];

  console.log(`\n══ By format (top 20) ═══════════════════════════════════════════════`);
  console.log(`format                                count    share`);
  for (const c of formatCounts.slice(0, 20)) {
    console.log(`  ${(c.value || "(blank)").padEnd(36)}${c.count.toString().padStart(6)}   ${pct(c.count, formatFacet.found)}`);
  }

  console.log(`\n══ By country (top 15) ══════════════════════════════════════════════`);
  console.log(`country                               count    share`);
  for (const c of countryCounts.slice(0, 15)) {
    console.log(`  ${(c.value || "(blank)").padEnd(36)}${c.count.toString().padStart(6)}   ${pct(c.count, countryFacet.found)}`);
  }

  // Pull one page to count rows with coords (= scraper-eligible).
  const sample = await search(filter, 250, 1);
  let withCoords = 0;
  let withoutCoords = 0;
  let zeroCoords = 0;
  for (const h of sample.hits) {
    const c = h.document.coordinates;
    if (!Array.isArray(c) || c.length !== 2 || c[0] == null || c[1] == null) {
      withoutCoords++;
    } else if (c[0] === 0 && c[1] === 0) {
      zeroCoords++;
    } else {
      withCoords++;
    }
  }
  const total = withCoords + withoutCoords + zeroCoords;
  console.log(`\n══ Coord coverage (first ${total} rows) ═══════════════════════════════`);
  console.log(`  ✓ with coords:       ${withCoords.toString().padStart(4)}  (${pct(withCoords, total)})`);
  console.log(`  · missing coords:    ${withoutCoords.toString().padStart(4)}  (${pct(withoutCoords, total)})`);
  console.log(`  · zero coords (0,0): ${zeroCoords.toString().padStart(4)}  (${pct(zeroCoords, total)})`);
  // Extrapolate to the full result set.
  const projectedIngest = total > 0 ? Math.round((withCoords / total) * formatFacet.found) : 0;
  console.log(`  → scraper would ingest ~${projectedIngest.toLocaleString()} of ${formatFacet.found.toLocaleString()} events`);

  if (args.showRaw && sample.hits.length > 0) {
    console.log(`\n══ Sample event (raw) ═══════════════════════════════════════════════`);
    console.log(JSON.stringify(sample.hits[0].document, null, 2));
  } else if (sample.hits.length > 0) {
    const first = sample.hits[0].document;
    console.log(`\n══ Sample event ═════════════════════════════════════════════════════`);
    console.log(`  id:           ${first.id}`);
    console.log(`  name:         ${first.eventName ?? "(blank)"}`);
    console.log(`  format:       ${first.format}`);
    console.log(`  startDate:    ${first.startDate} (${first.startDate ? new Date(first.startDate * 1000).toISOString() : "?"})`);
    console.log(`  location:     ${first.location ?? "(blank)"}`);
    console.log(`  city/state:   ${[first.city, first.state].filter(Boolean).join(", ") || "(blank)"}`);
    console.log(`  country:      ${first.country ?? "(blank)"}`);
    console.log(`  coordinates:  ${JSON.stringify(first.coordinates)}`);
    console.log(`  price:        ${first.eventPrice} ${first.eventCurrency ?? ""}`);
    console.log(`  playersRegd:  ${first.playersRegd}`);
    console.log(`  (pass --raw for the full document)`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
