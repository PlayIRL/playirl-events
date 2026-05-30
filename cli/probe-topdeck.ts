// One-shot diagnostic: hit TopDeck's API directly with the local key and
// print the raw response shape so we can tell whether the silent "0 events"
// from the scraper means "API returned 0 tournaments" or "API returned N
// tournaments but the scraper's filter dropped every one."
//
// Specifically prints, per format:
//   - HTTP status + body length
//   - tournament count
//   - first tournament's shape (raw JSON, pretty-printed)
//   - whether the shape carries the lat/lng the scraper expects
//
// Usage:
//   TOPDECK_API_KEY=<value> npm run topdeck:probe
//   TOPDECK_API_KEY=<value> npm run topdeck:probe -- Standard Modern
//
// Grab TOPDECK_API_KEY from Railway → Variables (same value the prod
// scraper reads). Format names are TopDeck's exact strings — case
// sensitive. Defaults to a small sample if no formats are passed.

// `export {}` keeps this file an isolated TS module so top-level names
// don't collide with sibling cli/*.ts scripts on a project-wide tsc.
export {};

const API_URL = "https://topdeck.gg/api/v2/tournaments";
// Full set of MTG formats TopDeck accepts (per the v2 reference docs).
// Defaults to all 21 so a no-arg probe matches what the scraper actually
// fans out — useful for spotting which formats have any volume at all.
// Pass space-separated format names as args to narrow.
const DEFAULT_FORMATS = [
  "Standard", "Modern", "Pioneer", "Legacy", "Vintage", "Pauper", "Premodern",
  "Limited", "Sealed",
  "EDH", "Pauper EDH", "Duel Commander", "EDH Draft",
  "Historic", "Timeless", "Explorer",
  "Old School 93/94", "Canadian Highlander", "Tiny Leaders",
  "7pt Highlander", "Oathbreaker",
];

function envRequired(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`✗ ${name} is required.`);
    console.error(`  Find it in Railway → Variables → TOPDECK_API_KEY.`);
    console.error(`  Then: export ${name}=<value> && npm run topdeck:probe`);
    process.exit(1);
  }
  return v;
}

interface ProbeResult {
  format: string;
  status: number;
  bytes: number;
  ms: number;
  tournamentCount: number;
  withCoordsCount: number;
  withoutCoordsCount: number;
  error?: string;
}

/** Cap on per-request retry waits — mirrors the scraper. */
const PROBE_MAX_RETRY_WAIT_S = 30;

async function makeRequest(apiKey: string, format: string, start: number, end: number): Promise<Response> {
  const body = { game: "Magic: The Gathering", format, start, end, columns: [] };
  return fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: apiKey },
    body: JSON.stringify(body),
  });
}

async function probeFormat(apiKey: string, format: string, start: number, end: number, verbose: boolean): Promise<ProbeResult> {
  const result: ProbeResult = {
    format, status: 0, bytes: 0, ms: 0, tournamentCount: 0, withCoordsCount: 0, withoutCoordsCount: 0,
  };
  if (verbose) console.log(`\n── format=${format} ────────────────────────────────`);
  const startedAt = Date.now();
  let res: Response;
  try {
    res = await makeRequest(apiKey, format, start, end);
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    if (verbose) console.log(`fetch threw: ${result.error}`);
    return result;
  }
  let text = await res.text();
  result.status = res.status;
  result.bytes = text.length;
  result.ms = Date.now() - startedAt;
  if (verbose) console.log(`HTTP ${res.status} · ${text.length}B · ${result.ms}ms`);

  // Mirror the scraper's 429 self-retry so the probe shows what a real
  // scrape would actually ingest (not just whichever formats happened
  // to fit in the rate-limit bucket on the first wave). One retry, with
  // the wait from retryAfterSeconds (JSON body) or Retry-After header,
  // capped at PROBE_MAX_RETRY_WAIT_S.
  if (res.status === 429) {
    let waitS = 0;
    try {
      const body = JSON.parse(text);
      if (typeof body?.retryAfterSeconds === "number") waitS = body.retryAfterSeconds;
    } catch { /* fall through to header */ }
    if (!waitS) {
      const headerVal = Number(res.headers.get("retry-after") ?? "");
      if (Number.isFinite(headerVal) && headerVal > 0) waitS = headerVal;
    }
    if (waitS <= 0) waitS = 2;
    waitS = Math.min(waitS, PROBE_MAX_RETRY_WAIT_S);
    if (verbose) console.log(`429 — waiting ${waitS}s then retrying once`);
    await new Promise((r) => setTimeout(r, waitS * 1000 + 250));
    try {
      res = await makeRequest(apiKey, format, start, end);
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
      if (verbose) console.log(`retry fetch threw: ${result.error}`);
      return result;
    }
    text = await res.text();
    result.status = res.status;
    result.bytes = text.length;
    result.ms = Date.now() - startedAt;
    if (verbose) console.log(`retry HTTP ${res.status} · ${text.length}B · ${result.ms}ms`);
  }

  if (!res.ok) {
    result.error = `HTTP ${res.status}`;
    if (verbose) console.log(`Response body (first 500B): ${text.slice(0, 500)}`);
    return result;
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    result.error = "non-JSON response";
    if (verbose) console.log(`Could not parse JSON. First 500B: ${text.slice(0, 500)}`);
    return result;
  }

  if (!Array.isArray(json)) {
    result.error = `non-array (${typeof json})`;
    if (verbose) console.log(`Unexpected shape; first 500B: ${text.slice(0, 500)}`);
    return result;
  }

  result.tournamentCount = json.length;
  if (json.length === 0) {
    if (verbose) console.log(`(empty)`);
    return result;
  }

  // Count rows the scraper's coord filter would keep vs drop.
  for (const t of json as Record<string, unknown>[]) {
    const loc = (t.eventData as Record<string, unknown>) ?? (t.location as Record<string, unknown>) ?? {};
    const lat = (loc as { lat?: unknown; latitude?: unknown }).lat ?? (loc as { lat?: unknown; latitude?: unknown }).latitude;
    const lng = (loc as { lng?: unknown; longitude?: unknown }).lng ?? (loc as { lng?: unknown; longitude?: unknown }).longitude;
    if (lat == null || lng == null) result.withoutCoordsCount++;
    else result.withCoordsCount++;
  }
  if (verbose) {
    console.log(`tournaments: ${json.length} (${result.withCoordsCount} with coords, ${result.withoutCoordsCount} without)`);
    const first = json[0] as Record<string, unknown>;
    console.log(`first tournament keys: ${Object.keys(first).join(", ")}`);
    console.log(`\nFull first tournament JSON:`);
    console.log(JSON.stringify(first, null, 2).split("\n").map((l) => "  " + l).join("\n"));
  }
  return result;
}

async function main() {
  const apiKey = envRequired("TOPDECK_API_KEY");
  // Args after the script path become explicit format names; everything
  // else uses the full 21-format default. `--verbose` (anywhere) opts
  // into the noisy per-format dump.
  const rawArgs = process.argv.slice(2);
  const verbose = rawArgs.includes("--verbose") || rawArgs.includes("-v");
  const formats = rawArgs.filter((a) => !a.startsWith("-"));
  const list = formats.length > 0 ? formats : DEFAULT_FORMATS;

  // Same window the scraper uses: now → now + 60 days (default daysAhead).
  const now = Math.floor(Date.now() / 1000);
  const end = now + 60 * 24 * 60 * 60;
  // Match the scraper's concurrency default — full-parallel probes used
  // to 429 half the formats and produce misleading "low volume" reads.
  // Env override: TOPDECK_CONCURRENCY=<n>. Capped at 10 by the scraper;
  // we accept the same cap here.
  const rawCc = Number(process.env.TOPDECK_CONCURRENCY);
  const concurrency = Number.isFinite(rawCc) && rawCc > 0 && rawCc <= 10 ? Math.floor(rawCc) : 2;
  console.log(`\n🃏 Probing TopDeck across ${list.length} format(s)`);
  console.log(`window:      ${new Date(now * 1000).toISOString()} → ${new Date(end * 1000).toISOString()}`);
  console.log(`concurrency: ${concurrency} (set TOPDECK_CONCURRENCY to override)`);
  console.log(`mode:        ${verbose ? "verbose (per-format dump)" : "summary only (pass -v for per-format detail)"}\n`);

  // Throttled fan-out — small worker pool to stay under TopDeck's bulk
  // endpoint rate limit. Each worker pulls the next format off the
  // queue as soon as it finishes the previous one, so wall-clock is
  // ~ceil(list.length / concurrency) × per-format latency.
  const queue = [...list];
  const results: ProbeResult[] = [];
  async function worker(): Promise<void> {
    while (true) {
      const fmt = queue.shift();
      if (!fmt) return;
      try {
        const r = await probeFormat(apiKey, fmt, now, end, verbose);
        results.push(r);
      } catch (err) {
        results.push({
          format: fmt, status: 0, bytes: 0, ms: 0, tournamentCount: 0,
          withCoordsCount: 0, withoutCoordsCount: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, () => worker()));

  // Summary table — sorted by tournament count desc so the heavy
  // formats are at the top. Highlights mismatches between
  // "tournaments returned" and "tournaments that would survive the
  // scraper's coord filter" so we can tell whether the bottleneck is
  // upstream volume or our local filtering.
  console.log(`\n══ Summary ══════════════════════════════════════════`);
  console.log(`format                       HTTP   total  w/coords  no-coords  status`);
  const sorted = [...results].sort((a, b) => b.tournamentCount - a.tournamentCount);
  let totalTournaments = 0;
  let totalWithCoords = 0;
  let totalWithoutCoords = 0;
  for (const r of sorted) {
    totalTournaments += r.tournamentCount;
    totalWithCoords += r.withCoordsCount;
    totalWithoutCoords += r.withoutCoordsCount;
    const fmt = r.format.padEnd(28);
    const status = r.status.toString().padStart(4);
    const total = r.tournamentCount.toString().padStart(6);
    const withC = r.withCoordsCount.toString().padStart(9);
    const withoutC = r.withoutCoordsCount.toString().padStart(10);
    const note = r.error ? `⚠ ${r.error}` : r.tournamentCount === 0 ? "(empty)" : "✓";
    console.log(`${fmt}  ${status}  ${total}  ${withC}  ${withoutC}   ${note}`);
  }
  console.log(`─────────────────────────────────────────────────────`);
  console.log(`TOTAL                              ${totalTournaments.toString().padStart(6)}  ${totalWithCoords.toString().padStart(9)}  ${totalWithoutCoords.toString().padStart(10)}`);

  // Flag throttled formats prominently — a 429 means the format
  // genuinely has unknown volume, not zero. Easy to miss in the table
  // if you don't read the right column. Note: the scraper itself
  // self-retries 429s once with the API's `Retry-After`, so prod runs
  // won't show this gap as often as the probe does.
  const throttled = results.filter((r) => r.status === 429);
  if (throttled.length > 0) {
    console.log(`\n⚠ ${throttled.length} format(s) hit HTTP 429: ${throttled.map((t) => t.format).join(", ")}`);
    console.log(`  Re-run with TOPDECK_CONCURRENCY=2 if 429s persist; the scraper itself self-retries 429s once.`);
  }

  console.log(`\nThe scraper would ingest ~${totalWithCoords} of these ${totalTournaments} tournaments`);
  console.log(`(rows in "no-coords" get silently dropped by the lat/lng filter at scrapers/topdeck.ts).`);
  if (totalWithCoords > 0) {
    console.log(`Anything below ~${totalWithCoords} active topdeck rows in /admin/health means cross-source dedup`);
    console.log(`is folding TopDeck events into WotC duplicates — investigate lib/scraper.ts coordFingerprint.`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
