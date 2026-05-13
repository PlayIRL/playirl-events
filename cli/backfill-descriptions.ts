/**
 * One-off: backfill empty `description` on WotC events in the local DB by
 * re-querying the wizards-locator GraphQL endpoint. Local preview only —
 * the backup snapshot we pulled predates PR #179, so all rows have empty
 * descriptions even though the API has them. Targets the Philly preview
 * area to keep this fast.
 */
import { getDb } from "@/lib/db";
import { config } from "@/lib/config";

const GRAPHQL_URL = "https://api.tabletop.wizards.com/silverbeak-griffin-service/graphql";
const PAGE_SIZE = 50;

const EVENTS_QUERY = `query searchEvents($q: EventSearchQuery!) {
  searchEvents(query: $q) {
    events { id description }
  }
}`;

function milesToMeters(mi: number) {
  return Math.round(mi * 1609.34);
}

async function fetchPage(startDate: string, endDate: string, page: number) {
  const body = JSON.stringify({
    operationName: "searchEvents",
    variables: {
      q: {
        latitude: config.location.lat,
        longitude: config.location.lng,
        maxMeters: milesToMeters(config.searchRadiusMiles),
        startDate,
        endDate,
        page,
        pageSize: PAGE_SIZE,
      },
    },
    query: EVENTS_QUERY,
  });
  if (page === 1) console.log(`[backfill] request body: ${body}`);
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (!res.ok) throw new Error(`WotC API HTTP ${res.status}`);
  const data = await res.json();
  if (data.errors) throw new Error(`GraphQL: ${data.errors[0].message}`);
  const events = data.data?.searchEvents?.events ?? [];
  console.log(`[backfill]   page ${page}: ${events.length} events`);
  return events;
}

async function main() {
  const today = new Date();
  const end = new Date();
  end.setDate(end.getDate() + config.daysAhead);
  const startDate = today.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);

  console.log(`[backfill] fetching descriptions for ${startDate} → ${endDate} around ${config.location.city}`);

  const all: { id: string; description: string }[] = [];
  for (let page = 1; page < 50; page++) {
    const batch = await fetchPage(startDate, endDate, page);
    if (!batch.length) break;
    for (const ev of batch) {
      all.push({ id: "wotc-" + ev.id, description: (ev.description || "").trim() });
    }
    if (batch.length < PAGE_SIZE) break;
  }

  console.log(`[backfill] fetched ${all.length} events from WotC`);
  const withDesc = all.filter((e) => e.description.length > 0);
  console.log(`[backfill] ${withDesc.length} have non-empty descriptions`);

  const db = getDb();
  const upd = db.prepare("UPDATE events SET description = ? WHERE id = ? AND (description IS NULL OR description = '')");
  let touched = 0;
  const tx = db.transaction((rows: typeof withDesc) => {
    for (const r of rows) {
      const info = upd.run(r.description, r.id);
      if (info.changes > 0) touched++;
    }
  });
  tx(withDesc);
  console.log(`[backfill] updated ${touched} rows`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
