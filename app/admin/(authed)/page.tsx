import Link from "next/link";
import { getDb } from "@/lib/db";
import { getSetting } from "@/lib/events";
import { getGeocodeCacheStats } from "@/lib/store-geocode-cache";
import { requireRole } from "@/lib/session";
import StatCard from "../_components/StatCard";
import RecentActivity from "../_components/RecentActivity";

interface CountRow { count: number }

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  await requireRole("admin");
  const db = getDb();

  const eventTotal = (db.prepare("SELECT COUNT(*) as count FROM events").get() as CountRow).count;
  const eventActive = (db.prepare("SELECT COUNT(*) as count FROM events WHERE status = 'active'").get() as CountRow).count;
  const eventPinned = (db.prepare("SELECT COUNT(*) as count FROM events WHERE status = 'pinned'").get() as CountRow).count;
  const eventSkip = (db.prepare("SELECT COUNT(*) as count FROM events WHERE status = 'skip'").get() as CountRow).count;
  const eventPending = (db.prepare("SELECT COUNT(*) as count FROM events WHERE status = 'pending'").get() as CountRow).count;
  const userTotal = (db.prepare("SELECT COUNT(*) as count FROM users").get() as CountRow).count;
  const adminCount = (db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as CountRow).count;
  const organizerCount = (db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'organizer'").get() as CountRow).count;

  const lastScrape = getSetting("last_scrape");
  interface LastResult {
    scraped: number;
    added: number;
    updated: number;
    durationMs?: number;
    scope?: "local" | "national";
    regions?: number;
    bySource?: Record<string, number>;
    failed?: Record<string, string>;
    curation?: { active: number; skip: number; pending: number };
  }
  let lastResult: LastResult | null = null;
  try {
    lastResult = JSON.parse(getSetting("last_scrape_result") || "null");
  } catch { /* keep null */ }
  const failedSources = Object.keys(lastResult?.failed ?? {});
  const geocodeStats = getGeocodeCacheStats();
  const lastResultHint = lastResult
    ? [
        `${lastResult.scraped} scraped · +${lastResult.added} new · ~${lastResult.updated} updated`,
        lastResult.durationMs != null ? `${(lastResult.durationMs / 1000).toFixed(1)}s` : null,
        // Display label translates the stored "national" value to the
        // user-facing "multi-region" framing introduced when the scrape
        // grew beyond one country. The DB still stores "national".
        lastResult.scope
          ? `${lastResult.scope === "national" ? "multi-region" : lastResult.scope}${lastResult.regions ? ` · ${lastResult.regions} region${lastResult.regions === 1 ? "" : "s"}` : ""}`
          : null,
        failedSources.length > 0 ? `⚠ failed: ${failedSources.join(", ")}` : null,
      ].filter(Boolean).join(" · ")
    : undefined;

  const bySource = db.prepare(`
    SELECT source, COUNT(*) as count
    FROM events
    WHERE status IN ('active','pinned')
    GROUP BY source
    ORDER BY count DESC
  `).all() as { source: string; count: number }[];

  // Country breakdown: at-a-glance gauge for whether international scraping
  // is producing rows. Rows whose `country` is empty (pre-existing data or
  // sources that don't carry one) are bucketed under "—" so they don't get
  // silently dropped from the total.
  const byCountryRaw = db.prepare(`
    SELECT COALESCE(NULLIF(country, ''), '—') AS country, COUNT(*) AS count
    FROM events
    WHERE status IN ('active','pinned')
    GROUP BY COALESCE(NULLIF(country, ''), '—')
    ORDER BY count DESC
  `).all() as { country: string; count: number }[];
  const totalForCountryBar = byCountryRaw.reduce((s, r) => s + r.count, 0);

  // Stale-scrape alarm. The daily GitHub Actions cron should fire `/api/scrape`
  // around 9 UTC — even with the ±4h GitHub Actions free-tier skew, the
  // longest legal gap between two successful scrapes is ~28 hours. We
  // alarm at >36h (warn) and >60h (loud), giving a buffer for a single
  // missed tick before paging the admin. Banner sits at the very top of
  // the dashboard so it's the first thing admins see.
  const lastScrapeMs = lastScrape ? new Date(lastScrape).getTime() : 0;
  const hoursSinceLastScrape = lastScrapeMs > 0 ? (Date.now() - lastScrapeMs) / 3_600_000 : Infinity;
  const scrapeAlarmLevel: "ok" | "warn" | "loud" =
    !Number.isFinite(hoursSinceLastScrape) ? "loud"
      : hoursSinceLastScrape > 60 ? "loud"
        : hoursSinceLastScrape > 36 ? "warn"
          : "ok";

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      {scrapeAlarmLevel !== "ok" && (
        <div
          className={`mb-6 rounded-md border px-4 py-3 text-sm ${
            scrapeAlarmLevel === "loud"
              ? "border-red-300 bg-red-50 text-red-900 dark:border-red-500/40 dark:bg-red-950/30 dark:text-red-200"
              : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-200"
          }`}
        >
          <div className="flex items-start gap-3">
            <span className="text-base leading-tight" aria-hidden="true">
              {scrapeAlarmLevel === "loud" ? "🚨" : "⚠️"}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold">
                {scrapeAlarmLevel === "loud"
                  ? `No scrape has run in ${Number.isFinite(hoursSinceLastScrape) ? `${Math.round(hoursSinceLastScrape)}h` : "a long time"} — auto-scraping appears broken.`
                  : `Last scrape was ${Math.round(hoursSinceLastScrape)}h ago — a daily tick may have been skipped.`}
              </p>
              <p className="text-xs mt-1 opacity-90">
                The daily cron lives at <code className="text-[11px]">.github/workflows/scrape.yml</code> and fires at 09:00 UTC.
                Check the Actions tab for recent runs, or hit{" "}
                <Link href="/admin/scrapers" className="underline">/admin/scrapers</Link>{" "}
                to refresh manually.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-end justify-between mb-6">
        <h1 className="text-2xl font-[family-name:var(--font-ultra)] font-bold text-neutral-900 dark:text-neutral-100">
          Dashboard
        </h1>
        <Link href="/admin/scrapers" className="text-sm text-neutral-900 dark:text-white hover:underline">
          Run a scrape →
        </Link>
      </div>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard label="Events total" value={eventTotal} />
        <StatCard label="Active" value={eventActive} />
        <StatCard label="Pinned" value={eventPinned} />
        <StatCard label="Skip / pending" value={`${eventSkip} / ${eventPending}`} />
        <StatCard label="Users" value={userTotal} hint={`${adminCount} admin · ${organizerCount} organizer`} />
        <StatCard
          label="Last scrape"
          value={lastScrape ? new Date(lastScrape).toLocaleString() : "—"}
          hint={lastResultHint}
        />
        <StatCard
          label="Geocode cache"
          value={geocodeStats.total}
          hint={geocodeStats.latestCachedAt
            ? `latest: ${new Date(geocodeStats.latestCachedAt.includes("T") ? geocodeStats.latestCachedAt : geocodeStats.latestCachedAt + "Z").toLocaleString()}`
            : "empty — first scrape will warm it"}
        />
      </section>

      <RecentActivity />

      <section className="grid md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md p-5">
          <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-3">Active events by source</h2>
          {bySource.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">No active events.</p>
          ) : (
            <ul className="space-y-1.5">
              {bySource.map((r) => (
                <li key={r.source} className="flex items-center gap-3 text-sm">
                  <span className="text-xs text-neutral-500 dark:text-neutral-400 w-32 truncate">{r.source}</span>
                  <div className="flex-1 h-2 bg-neutral-100 dark:bg-neutral-800 rounded-md overflow-hidden">
                    <div
                      className="h-full bg-neutral-900 dark:bg-white"
                      style={{ width: `${Math.max(2, Math.round((r.count / Math.max(1, eventActive)) * 100))}%` }}
                    />
                  </div>
                  <span className="text-xs text-neutral-600 dark:text-neutral-400 w-10 text-right tabular-nums">{r.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md p-5">
          <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-1">Active events by country</h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
            International scraping confirms here. &quot;—&quot; means the row predates the country column or the source didn&apos;t stamp one.
          </p>
          {byCountryRaw.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">No active events.</p>
          ) : (
            <ul className="space-y-1.5">
              {byCountryRaw.map((r) => (
                <li key={r.country} className="flex items-center gap-3 text-sm">
                  <span className="text-xs text-neutral-500 dark:text-neutral-400 w-12 truncate font-mono tabular-nums">{r.country}</span>
                  <div className="flex-1 h-2 bg-neutral-100 dark:bg-neutral-800 rounded-md overflow-hidden">
                    <div
                      className="h-full bg-neutral-900 dark:bg-white"
                      style={{ width: `${Math.max(2, Math.round((r.count / Math.max(1, totalForCountryBar)) * 100))}%` }}
                    />
                  </div>
                  <span className="text-xs text-neutral-600 dark:text-neutral-400 w-10 text-right tabular-nums">{r.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
