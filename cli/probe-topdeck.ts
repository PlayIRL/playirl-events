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
const DEFAULT_FORMATS = ["Standard", "Modern", "EDH"];

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

async function probeFormat(apiKey: string, format: string, start: number, end: number): Promise<void> {
  console.log(`\n── format=${format} ────────────────────────────────`);
  const body = { game: "Magic: The Gathering", format, start, end, columns: [] };
  const startedAt = Date.now();
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: apiKey },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const ms = Date.now() - startedAt;
  console.log(`HTTP ${res.status} · ${text.length}B · ${ms}ms`);

  if (!res.ok) {
    console.log(`Response body (first 500B): ${text.slice(0, 500)}`);
    return;
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    console.log(`Could not parse JSON. First 500B: ${text.slice(0, 500)}`);
    return;
  }

  if (!Array.isArray(json)) {
    console.log(`Unexpected shape: typeof = ${typeof json}. Keys: ${
      typeof json === "object" && json !== null ? Object.keys(json).join(", ") : "(not object)"
    }`);
    console.log(`First 500B: ${text.slice(0, 500)}`);
    return;
  }

  console.log(`tournaments: ${json.length}`);
  if (json.length === 0) {
    console.log(`(empty array — TopDeck reports no tournaments for this format in the window)`);
    return;
  }

  const first = json[0] as Record<string, unknown>;
  console.log(`first tournament keys: ${Object.keys(first).join(", ")}`);

  // The scraper reads: const loc = t.eventData || t.location || {}; tLat = loc.latitude; tLng = loc.longitude
  const eventData = first.eventData as Record<string, unknown> | undefined;
  const location = first.location as Record<string, unknown> | undefined;
  const loc = eventData ?? location ?? {};
  const tLat = (loc as { latitude?: unknown }).latitude;
  const tLng = (loc as { longitude?: unknown }).longitude;
  console.log(`scraper filter check:`);
  console.log(`  eventData present? ${eventData != null}`);
  console.log(`  location present?  ${location != null}`);
  console.log(`  resolved loc keys: ${Object.keys(loc).join(", ") || "(none)"}`);
  console.log(`  tLat: ${JSON.stringify(tLat)} · tLng: ${JSON.stringify(tLng)}`);
  if (tLat == null || tLng == null) {
    console.log(`  ⚠ scraper would DROP this row (missing coords on the expected path)`);
  } else {
    console.log(`  ✓ scraper would KEEP this row`);
  }
  console.log(`\nFull first tournament JSON:`);
  console.log(JSON.stringify(first, null, 2).split("\n").map((l) => "  " + l).join("\n"));
}

async function main() {
  const apiKey = envRequired("TOPDECK_API_KEY");
  const formats = process.argv.slice(2);
  const list = formats.length > 0 ? formats : DEFAULT_FORMATS;

  // Same window the scraper uses: now → now + 60 days (default daysAhead).
  const now = Math.floor(Date.now() / 1000);
  const end = now + 60 * 24 * 60 * 60;
  console.log(`\n🃏 Probing TopDeck for ${list.length} format(s): ${list.join(", ")}`);
  console.log(`window: ${new Date(now * 1000).toISOString()} → ${new Date(end * 1000).toISOString()}\n`);

  for (const fmt of list) {
    try {
      await probeFormat(apiKey, fmt, now, end);
    } catch (err) {
      console.error(`format=${fmt} probe threw:`, err);
    }
  }
  console.log(`\nDone.`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
