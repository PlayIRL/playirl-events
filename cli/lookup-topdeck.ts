// Look up a single TopDeck event by its slug ID (the part after
// topdeck.gg/event/) in both the Typesense events index AND the
// legacy GET /v2/tournaments/{TID}/info endpoint, then verify it
// would be ingested by scrapers/topdeck.ts.
//
// Earlier versions of this CLI tested whether a known-live event
// appeared in the POST /v2/tournaments bulk results — that diagnosis
// is what surfaced the Typesense endpoint. Now ingestion is via
// Typesense; this CLI is a "does this row exist + would we keep it"
// check for any individual event.
//
// Usage:
//   npm run topdeck:lookup fnm-cedh-529
//   npm run topdeck:lookup fnm-cedh-529 --raw       # full document
//   TOPDECK_API_KEY=<value> npm run topdeck:lookup fnm-cedh-529  # also hit /info

// `export {}` keeps this file an isolated TS module.
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
  publish?: boolean;
  isConvention?: boolean;
  totalEvents?: number;
}

async function typesenseLookup(id: string): Promise<{ status: number; doc: TypesenseEvent | null; raw: unknown }> {
  // Direct document GET is the fastest path. Falls back to a filter
  // search if the document API is restricted on this collection.
  const url = `https://${TYPESENSE_HOST}/collections/${TYPESENSE_COLLECTION}/documents/${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    headers: { "X-TYPESENSE-API-KEY": TYPESENSE_KEY },
  });
  const text = await res.text();
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* keep as string */ }
  if (res.status === 200 && parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return { status: 200, doc: parsed as TypesenseEvent, raw: parsed };
  }
  // Fall through to a filter search.
  const params = new URLSearchParams({
    q: "*",
    query_by: "eventName",
    filter_by: `id:=${id}`,
    per_page: "1",
  });
  const searchRes = await fetch(`https://${TYPESENSE_HOST}/collections/${TYPESENSE_COLLECTION}/documents/search?${params}`, {
    headers: { "X-TYPESENSE-API-KEY": TYPESENSE_KEY },
  });
  if (!searchRes.ok) return { status: searchRes.status, doc: null, raw: await searchRes.text() };
  const body = (await searchRes.json()) as { hits: Array<{ document: TypesenseEvent }> };
  return { status: searchRes.status, doc: body.hits[0]?.document ?? null, raw: body };
}

interface InfoResult {
  status: number;
  body: Record<string, unknown> | null;
  raw: unknown;
}

async function legacyInfo(apiKey: string, tid: string): Promise<InfoResult> {
  const res = await fetch(`https://topdeck.gg/api/v2/tournaments/${encodeURIComponent(tid)}/info`, {
    headers: { Authorization: apiKey },
  });
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* keep as string */ }
  if (typeof body === "object" && body !== null && !Array.isArray(body)) {
    return { status: res.status, body: body as Record<string, unknown>, raw: body };
  }
  return { status: res.status, body: null, raw: body };
}

async function main() {
  const args = process.argv.slice(2);
  const showRaw = args.includes("--raw");
  const ids = args.filter((a) => !a.startsWith("-"));
  if (ids.length === 0) {
    console.error("✗ pass an event slug, e.g.: npm run topdeck:lookup fnm-cedh-529");
    console.error("  (the slug is the part after topdeck.gg/event/)");
    process.exit(1);
  }
  const id = ids[0];

  // ── Step 1: Typesense — the source the scraper actually uses ───────
  console.log(`\n══ Step 1: Typesense events index ═══════════════════════════════════\n`);
  const ts = await typesenseLookup(id);
  console.log(`HTTP ${ts.status}`);
  if (ts.status !== 200 || !ts.doc) {
    console.log(`✗ Not found in Typesense.`);
    if (showRaw) console.log(`Raw: ${JSON.stringify(ts.raw).slice(0, 500)}`);
    console.log(`\nLikely reasons:`);
    console.log(`  - The slug is wrong (check topdeck.gg/event/${id} in browser)`);
    console.log(`  - The event has publish:false (organizer hasn't published yet)`);
    console.log(`  - The event was deleted`);
  } else {
    const d = ts.doc;
    const coords = Array.isArray(d.coordinates) ? d.coordinates : null;
    const coordOk = coords && coords[0] != null && coords[1] != null && !(coords[0] === 0 && coords[1] === 0);
    console.log(`✓ found in Typesense`);
    console.log(`  name:        ${d.eventName ?? "(blank)"}`);
    console.log(`  game:        ${d.game}`);
    console.log(`  format:      ${d.format}`);
    console.log(`  startDate:   ${d.startDate} (${d.startDate ? new Date(d.startDate * 1000).toISOString() : "?"})`);
    console.log(`  endDate:     ${d.endDate ? new Date(d.endDate * 1000).toISOString() : "(none)"}`);
    console.log(`  coordinates: ${JSON.stringify(coords)}  ${coordOk ? "✓" : "⚠ would be DROPPED by scraper"}`);
    console.log(`  location:    ${d.location ?? "(blank)"}`);
    console.log(`  city/state:  ${[d.city, d.state].filter(Boolean).join(", ") || "(blank)"}`);
    console.log(`  country:     ${d.country ?? "(blank)"}`);
    console.log(`  price:       ${d.eventPrice ?? "?"} ${d.eventCurrency ?? ""}`);
    console.log(`  tier:        ${d.tier ?? "(blank)"}`);
    console.log(`  playersRegd: ${d.playersRegd ?? "?"}`);
    console.log(`  publish:     ${d.publish}`);
    console.log(`  isConvention:${d.isConvention} (totalEvents=${d.totalEvents ?? 0})`);
    if (showRaw) {
      console.log(`\nFull document:`);
      console.log(JSON.stringify(d, null, 2).split("\n").map((l) => "  " + l).join("\n"));
    }
    // Decide whether the scraper would ingest it.
    console.log(`\nScraper-ingest decision:`);
    const reasons: string[] = [];
    if (!d.publish) reasons.push("publish=false");
    if (!coordOk) reasons.push("missing/zero coords");
    if (d.game !== "Magic: The Gathering") reasons.push(`game=${d.game} (we filter on Magic)`);
    if (d.isConvention && (d.totalEvents ?? 0) === 0) reasons.push("isConvention with 0 sub-events");
    if (d.startDate && d.startDate * 1000 < Date.now()) reasons.push("startDate is in the past");
    if (reasons.length === 0) console.log(`  ✓ would be ingested`);
    else console.log(`  ✗ would be skipped: ${reasons.join(", ")}`);
  }

  // ── Step 2: Optional legacy /v2/tournaments/{TID}/info ─────────────
  const apiKey = process.env.TOPDECK_API_KEY;
  if (!apiKey) {
    console.log(`\n══ Step 2: legacy GET /v2/tournaments/${id}/info ════════════════════\n`);
    console.log(`  (skipped — set TOPDECK_API_KEY env var to also probe the legacy endpoint)`);
    return;
  }
  console.log(`\n══ Step 2: legacy GET /v2/tournaments/${id}/info ════════════════════\n`);
  const info = await legacyInfo(apiKey, id);
  console.log(`HTTP ${info.status}`);
  if (info.status !== 200 || !info.body) {
    console.log(`Body: ${JSON.stringify(info.raw).slice(0, 400)}`);
  } else {
    const b = info.body;
    console.log(`  name:      ${b.name ?? "(blank)"}`);
    console.log(`  status:    ${JSON.stringify(b.status)}`);
    console.log(`  game:      ${b.game}`);
    console.log(`  format:    ${b.format}`);
    console.log(`  startDate: ${b.startDate} (${b.startDate ? new Date((b.startDate as number) * 1000).toISOString() : "?"})`);
    if (showRaw) {
      console.log(`\nFull /info response:`);
      console.log(JSON.stringify(b, null, 2).split("\n").map((l) => "  " + l).join("\n"));
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
