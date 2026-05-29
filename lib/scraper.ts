import { fetchAllSources, ScrapedEvent } from "@/scrapers";
import { upsertEvents, archiveOldEvents, setSetting } from "./events";
import { fetchVenueImage } from "./venue-image-fetcher";
import { getVenueDefault, venueKey } from "./venues";
import { geocodeFirstMatch } from "./geocode";
import { uploadFileExists } from "./upload-storage";
import { applyDiscordAutoApprove, classifyEvent } from "./curation-rules";
import { getConfig } from "./runtime-config";

function normalize(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

/** Re-geocode every event whose `coords_source` is anything other than
 *  `"source"` and that has an address. Mutates the events in place. Failures
 *  leave the original (suspect) coords alone — better than nothing. Runs
 *  serially with a tiny delay to be a polite Nominatim/Google citizen. */
const COORD_RECONCILE_DELAY_MS = 200;

async function reconcileEventCoords(events: ScrapedEvent[]): Promise<void> {
  const targets = events.filter(
    (ev) => ev.coords_source && ev.coords_source !== "source" && Boolean(ev.address),
  );
  if (targets.length === 0) return;
  console.log(`[geocode] reconciling ${targets.length} event(s) with untrusted coords`);

  for (const ev of targets) {
    // Try address alone first (cleaner for Nominatim, which trips on
    // duplicated tokens like "Hamiltons Hand 226 Walnut, 226 Walnut St…"),
    // then fall back to the richer "name, address" combo for sources where
    // the address alone is too vague (e.g. TopDeck's "city, state").
    const candidates = [ev.address, ev.location ? `${ev.location}, ${ev.address}` : null];
    try {
      const hit = await geocodeFirstMatch(candidates);
      if (hit) {
        const before = ev.latitude != null && ev.longitude != null
          ? `${ev.latitude.toFixed(4)},${ev.longitude.toFixed(4)}`
          : "null";
        ev.latitude = hit.latitude;
        ev.longitude = hit.longitude;
        // Promote to "source"-grade trust now that the lat/lng matches the
        // address — downstream consumers (and re-runs) treat it as authoritative.
        ev.coords_source = "source";
        console.log(
          `[geocode] ✓ ${ev.id} (${before} → ${hit.latitude.toFixed(4)},${hit.longitude.toFixed(4)} via ${hit.provider})`,
        );
      } else {
        console.log(`[geocode] · ${ev.id} no match for "${ev.address}"; keeping fallback coords`);
      }
    } catch (err) {
      console.warn(`[geocode] unexpected error for ${ev.id}:`, err);
    }
    await new Promise((r) => setTimeout(r, COORD_RECONCILE_DELAY_MS));
  }
}

/** How long to wait between auto-fetch attempts before re-trying a venue we
 *  already failed on. Prevents the scraper from re-hammering Google's APIs on
 *  every run for venues that simply don't have a photo available. */
const VENUE_FETCH_RETRY_DAYS = 30;
const VENUE_FETCH_MAX_ATTEMPTS = 3;
const VENUE_FETCH_DELAY_MS = 250;

interface SkipDecision {
  skip: boolean;
  reason: string;
}

function shouldSkipVenueFetch(name: string): SkipDecision {
  const existing = getVenueDefault(name);
  if (!existing) return { skip: false, reason: "no existing row" };
  if (existing.image_source === "manual") return { skip: true, reason: "manual override" };
  // Self-heal: a non-empty image_url whose underlying file is missing (e.g.
  // Railway volume reset, file manually deleted) should NOT short-circuit a
  // re-fetch. Without this, prior runs' broken URLs stick forever.
  if (existing.image_url) {
    if (uploadFileExists(existing.image_url)) {
      return { skip: true, reason: `image_url exists on disk (${existing.image_source ?? "?"})` };
    }
    return { skip: false, reason: `image_url set but file missing — re-fetch (${existing.image_source ?? "?"})` };
  }
  // Empty image_url = previous attempts failed. Back off if recent + at cap.
  if ((existing.attempt_count ?? 0) < VENUE_FETCH_MAX_ATTEMPTS) {
    return { skip: false, reason: `empty image_url, attempt_count=${existing.attempt_count ?? 0}` };
  }
  if (!existing.last_fetched_at) {
    return { skip: false, reason: `at attempt cap but last_fetched_at unset` };
  }
  const ageMs = Date.now() - new Date(existing.last_fetched_at).getTime();
  if (ageMs < VENUE_FETCH_RETRY_DAYS * 24 * 60 * 60 * 1000) {
    return { skip: true, reason: `cap reached (${existing.attempt_count} tries, ${Math.floor(ageMs / 86400000)}d ago)` };
  }
  return { skip: false, reason: `cap reached but ${VENUE_FETCH_RETRY_DAYS}d elapsed — retry` };
}

async function enqueueVenueImageFetches(events: ScrapedEvent[]): Promise<void> {
  // Reduce events down to one record per venue, preferring rows with the most
  // info (store_url, coords, address). Skip venues we already have an image
  // for, manual overrides, and recently-failed attempts.
  //
  // Logs the skip decision per unique venue so prod issues are debuggable
  // from Railway logs without redeploying.
  const byKey = new Map<string, ScrapedEvent>();
  const seenKeys = new Set<string>();
  let skippedCount = 0;
  for (const ev of events) {
    if (!ev.location) continue;
    const key = venueKey(ev.location);
    if (!key) continue;
    if (seenKeys.has(key)) {
      // Already decided for this venue. Just merge richer metadata if relevant.
      const existing = byKey.get(key);
      if (existing) {
        const score = (e: ScrapedEvent) =>
          (e.store_url ? 4 : 0) +
          (e.detail_url ? 2 : 0) +
          (e.latitude != null && e.longitude != null ? 1 : 0);
        if (score(ev) > score(existing)) byKey.set(key, ev);
      }
      continue;
    }
    seenKeys.add(key);
    const decision = shouldSkipVenueFetch(ev.location);
    console.log(`[venue-image] ${decision.skip ? "SKIP" : "FETCH"} "${ev.location}" — ${decision.reason}`);
    if (decision.skip) {
      skippedCount++;
      continue;
    }
    byKey.set(key, ev);
  }

  console.log(`[venue-image] decision summary: ${byKey.size} to fetch, ${skippedCount} skipped`);
  if (byKey.size === 0) return;
  console.log(`[venue-image] attempting auto-fetch for ${byKey.size} venue(s)`);

  for (const ev of byKey.values()) {
    try {
      const outcome = await fetchVenueImage({
        name: ev.location,
        address: ev.address,
        store_url: ev.store_url,
        detail_url: ev.detail_url,
        latitude: ev.latitude,
        longitude: ev.longitude,
      });
      if (outcome.source !== "none") {
        console.log(`[venue-image] ✓ ${ev.location} via ${outcome.source}`);
      } else {
        console.log(`[venue-image] · ${ev.location}: no source produced an image`);
      }
    } catch (err) {
      // Defensive: fetchVenueImage already swallows internal errors, so this
      // would only fire on a programming bug. Log and continue.
      console.warn(`[venue-image] unexpected error for "${ev.location}":`, err);
    }
    // Small inter-request gap so we don't burst external APIs.
    await new Promise((r) => setTimeout(r, VENUE_FETCH_DELAY_MS));
  }
}

function dedupeAcrossSources(events: ScrapedEvent[]): ScrapedEvent[] {
  // Pass 1: dedupe by id
  const seenIds = new Set<string>();
  const byId = events.filter((e) => {
    if (seenIds.has(e.id)) return false;
    seenIds.add(e.id);
    return true;
  });

  // Pass 2: dedupe by fingerprint (cross-source)
  const seen = new Map<string, ScrapedEvent>();
  const result: ScrapedEvent[] = [];

  for (const e of byId) {
    const fp = normalize(e.title) + "|" + e.date + "|" + normalize(e.location);
    if (seen.has(fp)) {
      const existing = seen.get(fp)!;
      console.log(`[dedupe] cross-source duplicate: "${e.title}" (${e.source}) matches "${existing.title}" (${existing.source}) — keeping ${existing.source}`);
      continue;
    }
    seen.set(fp, e);
    result.push(e);
  }

  return result;
}

export interface ScrapeResult {
  scraped: number;
  deduped: number;
  added: number;
  updated: number;
  skipped: number;
  archived: number;
  /** Wall-clock duration of the scrape, in milliseconds. */
  durationMs: number;
  /** Effective scrape scope ("local" or "national") at the time of the run. */
  scope: "local" | "national";
  /** Number of regions swept. 1 in local mode, len(scrapeRegions) in national. */
  regions: number;
  /** Per-source raw event counts (pre-dedupe). */
  bySource: Record<string, number>;
  /** Sources that threw, with their error messages. Empty on full success. */
  failed: Record<string, string>;
  /** What kicked off this scrape — surfaced in the admin Recent-runs
   *  table so an admin can tell at a glance whether the last refresh
   *  was a cron tick, an "Run now" button press, the CLI, or the
   *  startup auto-fill. Free-form string; known values today are
   *  "cron", "admin-refresh", "cli", "startup", and "unknown" (legacy
   *  rows that pre-date this field). */
  triggeredBy: string;
  /** Curation decisions across all events. */
  curation: { active: number; skip: number; pending: number };
  timestamp: string;
}

/**
 * Run the full scrape pipeline.
 *
 * @param triggeredBy — Free-form identifier for what kicked this off,
 *   stored in scrape_history so the admin Recent-runs table can show
 *   "cron" vs "admin-refresh" vs "cli" vs "startup". Each caller is
 *   responsible for passing the right value; defaults to "unknown" so
 *   the function is still callable in tests + ad-hoc scripts without
 *   noise.
 */
export async function runScraper(triggeredBy: string = "unknown"): Promise<ScrapeResult> {
  console.log("🃏 MTG Calendar — Scraper Run");
  console.log(`   ${new Date().toISOString()} (triggered by: ${triggeredBy})`);
  const startedAt = Date.now();
  const cfg = getConfig();

  // 1. Fetch from all sources
  const { events: scraped, stats } = await fetchAllSources();
  console.log(`[sources] Total scraped: ${scraped.length}`);

  // 2. Dedupe
  const deduped = dedupeAcrossSources(scraped);
  console.log(`[dedupe] After dedup: ${deduped.length}`);

  // 2a. Reconcile untrusted coords against the address. Sources that don't
  // expose per-event lat/lng (today: Discord falling back to GUILD_COORDS)
  // get re-geocoded from their address, so the stored coords actually point
  // at the venue rather than at a guild-wide default.
  await reconcileEventCoords(deduped);

  // 2b. Auto-curation. Classify each event into active/skip/pending based on
  // title (non-MTG keyword blocklist) and source trust. The upsert path
  // preserves existing manual statuses (skip, pinned, pending), so this only
  // affects fresh inserts and never clobbers an admin's decision.
  const curation = { active: 0, skip: 0, pending: 0 };
  for (const ev of deduped) {
    const decision = classifyEvent(ev);
    ev.status = decision.status;
    curation[decision.status]++;
    if (decision.status === "skip") {
      console.log(`[curation] SKIP "${ev.title}" — ${decision.reason}`);
    }
  }
  // Post-classification override: bump Discord events from auto-approved
  // guilds (discord_guild_settings.auto_approve=1) from 'pending' → 'active'
  // so trusted guilds skip the manual review queue. classifyEvent stays a
  // pure function; the per-guild trust flag is applied here as a separate
  // step. We retally curation.active / curation.pending to reflect the
  // override in the admin scraper-history view.
  const autoApproved = applyDiscordAutoApprove(deduped);
  if (autoApproved > 0) {
    curation.active += autoApproved;
    curation.pending -= autoApproved;
    console.log(`[curation] auto-approved ${autoApproved} discord event(s) from trusted guilds`);
  }
  console.log(`[curation] active=${curation.active} skip=${curation.skip} pending=${curation.pending}`);

  // 3. Upsert into database
  const result = upsertEvents(deduped);
  console.log(`[db] +${result.added} new | ~${result.updated} updated | ${result.skipped} pinned`);

  // 3a. Best-effort: try to grab a real photo for any newly-seen venue. This
  // never throws out of the scraper — if it fails, render-time falls back to
  // a Google Maps Static image (see lib/event-image.ts).
  await enqueueVenueImageFetches(deduped);

  // 4. Archive old events
  const archived = archiveOldEvents(90);
  if (archived > 0) console.log(`[db] Archived ${archived} old events`);

  // 5. Update last scrape timestamp + structured result. Admin UI reads
  // last_scrape_result to surface duration, per-source breakdown, failures,
  // and curation tally without any other plumbing.
  const now = new Date().toISOString();
  const durationMs = Date.now() - startedAt;
  const scope = cfg.scrapeScope;
  const regions = scope === "national" ? cfg.scrapeRegions.length : 1;
  const summary: ScrapeResult = {
    scraped: scraped.length,
    deduped: deduped.length,
    ...result,
    archived,
    durationMs,
    scope,
    regions,
    bySource: stats.bySource,
    failed: stats.failed,
    triggeredBy,
    curation,
    timestamp: now,
  };
  setSetting("last_scrape", now);
  setSetting("last_scrape_result", JSON.stringify(summary));
  // Append to scrape_history for trend analysis at /admin/scrape-stats. The
  // append-only table is bounded by the cleanup below (keep last 200 rows)
  // so it doesn't grow unbounded over a year of daily scrapes.
  try {
    const db = (await import("./db")).getDb();
    db.prepare("INSERT INTO scrape_history (summary) VALUES (?)").run(JSON.stringify(summary));
    db.prepare("DELETE FROM scrape_history WHERE id NOT IN (SELECT id FROM scrape_history ORDER BY id DESC LIMIT 200)").run();
  } catch (err) {
    console.warn("[scrape] failed to write scrape_history:", err);
  }

  console.log(`[scrape] done in ${(durationMs / 1000).toFixed(1)}s — scope=${scope} regions=${regions}`);
  if (Object.keys(stats.failed).length > 0) {
    console.warn(`[scrape] FAILED sources: ${Object.keys(stats.failed).join(", ")}`);
  }

  return summary;
}
