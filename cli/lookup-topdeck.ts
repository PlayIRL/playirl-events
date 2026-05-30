// Look up a single TopDeck tournament by TID and compare it against
// what our bulk-query would return for the same window. Built to
// answer "why does topdeck.gg/events show 72 EDH events near Philly
// while our POST /v2/tournaments returns 4 globally?"
//
// Usage:
//   TOPDECK_API_KEY=<value> npm run topdeck:lookup fnm-cedh-529
//   TOPDECK_API_KEY=<value> npm run topdeck:lookup fnm-cedh-529 --raw
//
// Output:
//   1. Full GET /v2/tournaments/{TID}/info response — proves API can see it
//   2. Bulk POST with our current parameters — shows whether this TID
//      appears in the bulk results
//   3. If missing from bulk, runs a series of variant queries to isolate
//      which parameter is filtering it out (no end, no start, alt format,
//      etc.) — each variant prints "appears? yes/no"
//
// `export {}` keeps this file an isolated TS module.
export {};

const API_BASE = "https://topdeck.gg/api/v2/tournaments";

function envRequired(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`✗ ${name} required. Run with: TOPDECK_API_KEY=<value> npm run topdeck:lookup <tid>`);
    process.exit(1);
  }
  return v;
}

interface TournamentLite {
  TID?: string;
  tid?: string;
  tournamentName?: string;
  startDate?: number;
  game?: string;
  format?: string;
  topCut?: number;
  eventData?: Record<string, unknown>;
  [k: string]: unknown;
}

async function getInfo(apiKey: string, tid: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${API_BASE}/${encodeURIComponent(tid)}/info`, {
    headers: { Authorization: apiKey },
  });
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* keep as string */ }
  return { status: res.status, body };
}

interface BulkVariant {
  label: string;
  body: Record<string, unknown>;
}

async function runBulk(apiKey: string, body: Record<string, unknown>): Promise<{ status: number; tournaments: TournamentLite[]; raw: unknown }> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: apiKey },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* keep as string */ }
  const tournaments = Array.isArray(parsed) ? (parsed as TournamentLite[]) : [];
  return { status: res.status, tournaments, raw: parsed };
}

function tidOf(t: TournamentLite): string {
  return String(t.TID ?? t.tid ?? "");
}

async function main() {
  const apiKey = envRequired("TOPDECK_API_KEY");
  const args = process.argv.slice(2);
  const showRaw = args.includes("--raw");
  const tids = args.filter((a) => !a.startsWith("-"));
  if (tids.length === 0) {
    console.error("✗ pass at least one TID, e.g.: npm run topdeck:lookup fnm-cedh-529");
    process.exit(1);
  }
  const targetTid = tids[0];

  // ── Step 1: GET /info for the known TID ─────────────────────────────
  console.log(`\n══ Step 1: lookup ${targetTid} via GET /v2/tournaments/${targetTid}/info ══\n`);
  const info = await getInfo(apiKey, targetTid);
  console.log(`HTTP ${info.status}`);
  if (info.status === 404) {
    console.log(`⚠ API returns 404 for this TID. Either the slug is wrong, or this event isn't exposed to API consumers.`);
    process.exit(1);
  }
  if (info.status !== 200) {
    console.log(`Body: ${JSON.stringify(info.body).slice(0, 500)}`);
    process.exit(1);
  }
  const infoRecord = info.body as Record<string, unknown>;
  const startDate = infoRecord.startDate as number | undefined;
  const endDate = infoRecord.endDate as number | undefined;
  const eventGame = infoRecord.game as string | undefined;
  const eventFormat = infoRecord.format as string | undefined;
  const eventStatus = infoRecord.status as string | undefined;
  const eventTier = (infoRecord.tier as unknown) ?? (infoRecord.tierName as unknown);
  console.log(`✓ event exists in API`);
  console.log(`  name:       ${infoRecord.name ?? infoRecord.tournamentName ?? "(none)"}`);
  console.log(`  game:       ${eventGame}`);
  console.log(`  format:     ${eventFormat}`);
  console.log(`  startDate:  ${startDate} (${startDate ? new Date(startDate * 1000).toISOString() : "n/a"})`);
  console.log(`  endDate:    ${endDate} (${endDate ? new Date(endDate * 1000).toISOString() : "n/a"})`);
  console.log(`  status:     ${JSON.stringify(eventStatus)}   ← likely culprit if bulk excludes some statuses`);
  console.log(`  tier:       ${JSON.stringify(eventTier)}`);
  if (showRaw) {
    console.log(`\nFull /info response:`);
    console.log(JSON.stringify(infoRecord, null, 2).split("\n").map((l) => "  " + l).join("\n"));
  } else {
    console.log(`  keys:       ${Object.keys(infoRecord).join(", ")}`);
    console.log(`  (pass --raw to see the full /info payload)`);
  }

  // ── Step 2: bulk POST with current scraper parameters ──────────────
  console.log(`\n══ Step 2: bulk POST with current scraper parameters (game + format + 60d window) ══\n`);
  if (!eventGame || !eventFormat) {
    console.log(`⚠ /info response didn't include game or format — can't replicate scraper search.`);
    process.exit(1);
  }
  const now = Math.floor(Date.now() / 1000);
  const end = now + 60 * 24 * 60 * 60;
  const baseBody = { game: eventGame, format: eventFormat, start: now, end, columns: [] as string[] };
  const baseRes = await runBulk(apiKey, baseBody);
  console.log(`HTTP ${baseRes.status} · ${baseRes.tournaments.length} tournaments returned`);
  const baseHit = baseRes.tournaments.find((t) => tidOf(t) === targetTid);
  console.log(`Target TID ${targetTid} in bulk results? ${baseHit ? "✓ YES" : "✗ NO"}`);

  // What `status` / shape do the bulk-returned events have, vs our missing
  // target? If status differs, we've found a hidden filter.
  if (baseRes.tournaments.length > 0) {
    console.log(`\nStatus / key shape of bulk-returned events (compare against the target above):`);
    for (let i = 0; i < Math.min(3, baseRes.tournaments.length); i++) {
      const t = baseRes.tournaments[i];
      const tStatus = (t as Record<string, unknown>).status as string | undefined;
      const tStart = t.startDate;
      const tKeys = Object.keys(t).slice(0, 10).join(", ");
      console.log(`  · ${tidOf(t)}  status=${JSON.stringify(tStatus)}  startDate=${tStart} (${tStart ? new Date(tStart * 1000).toISOString().slice(0, 16) : "?"})`);
      console.log(`    keys: ${tKeys}${Object.keys(t).length > 10 ? "…" : ""}`);
    }
  }

  if (baseHit) {
    console.log(`\n→ Bulk query already returns this event. The 72-vs-4 gap must be something else (window? region?).`);
    return;
  }

  // ── Step 3: variant queries to isolate the filter ───────────────────
  console.log(`\n══ Step 3: variant queries — which parameter is hiding this event? ══\n`);
  const eventStart = startDate ?? now;
  // Pick a window that DEFINITELY brackets the event date.
  const wideStart = eventStart - 7 * 24 * 60 * 60;
  const wideEnd = eventStart + 7 * 24 * 60 * 60;

  const variants: BulkVariant[] = [
    { label: "no `end` (only start = now)",                  body: { game: eventGame, format: eventFormat, start: now, columns: [] } },
    { label: "no `start` (only end = now+60d)",              body: { game: eventGame, format: eventFormat, end, columns: [] } },
    { label: "tight window around event ±7d",                body: { game: eventGame, format: eventFormat, start: wideStart, end: wideEnd, columns: [] } },
    { label: "tight window ±7d + status=scheduled",          body: { game: eventGame, format: eventFormat, start: wideStart, end: wideEnd, status: "scheduled", columns: [] } },
    { label: "tight window ±7d + status=all",                body: { game: eventGame, format: eventFormat, start: wideStart, end: wideEnd, status: "all", columns: [] } },
    { label: "tight window ±7d + includeScheduled:true",     body: { game: eventGame, format: eventFormat, start: wideStart, end: wideEnd, includeScheduled: true, columns: [] } },
    { label: "tight window ±7d + scheduled:true",            body: { game: eventGame, format: eventFormat, start: wideStart, end: wideEnd, scheduled: true, columns: [] } },
    { label: "tight window ±7d + completed:false",           body: { game: eventGame, format: eventFormat, start: wideStart, end: wideEnd, completed: false, columns: [] } },
    { label: "tight window ±7d + tier=all",                  body: { game: eventGame, format: eventFormat, start: wideStart, end: wideEnd, tier: "all", columns: [] } },
    { label: "last: 14 (recent 14 days)",                    body: { game: eventGame, format: eventFormat, last: 14, columns: [] } },
    { label: "TID lookup mode (uppercase)",                  body: { TID: targetTid, columns: [] } },
    { label: "TID lookup mode (lowercase)",                  body: { tid: targetTid, columns: [] } },
    { label: "participantMin: 1",                            body: { game: eventGame, format: eventFormat, start: now, end, participantMin: 1, columns: [] } },
    { label: "participantMin: 0",                            body: { game: eventGame, format: eventFormat, start: now, end, participantMin: 0, columns: [] } },
  ];

  for (const v of variants) {
    const r = await runBulk(apiKey, v.body);
    if (r.status === 429) {
      console.log(`  · ${v.label.padEnd(48)} HTTP 429 (skipped)`);
      // Small wait so we don't blast the rate limit on every variant.
      await new Promise((res) => setTimeout(res, 3000));
      continue;
    }
    if (r.status !== 200) {
      console.log(`  · ${v.label.padEnd(48)} HTTP ${r.status}`);
      continue;
    }
    const hit = r.tournaments.find((t) => tidOf(t) === targetTid);
    const tag = hit ? "✓ HIT" : "✗ miss";
    console.log(`  · ${v.label.padEnd(48)} ${r.tournaments.length.toString().padStart(4)} tournaments · ${tag}`);
    // Small spacing between calls so we don't tank ourselves on the rate
    // limit while running the experiment battery.
    await new Promise((res) => setTimeout(res, 800));
  }

  console.log(`\nIf one of the variants shows ✓ HIT, that's the parameter we're sending wrong.`);
  console.log(`Run with --raw for the full /info payload of ${targetTid}.\n`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
