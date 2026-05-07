import Link from "next/link";
import { getDb } from "@/lib/db";
import { getSetting } from "@/lib/events";
import { getGeocodeCacheStats } from "@/lib/store-geocode-cache";
import { requireRole } from "@/lib/session";
import StatCard from "../_components/StatCard";

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
        lastResult.scope ? `${lastResult.scope}${lastResult.regions ? ` · ${lastResult.regions} region${lastResult.regions === 1 ? "" : "s"}` : ""}` : null,
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

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      <div className="flex items-end justify-between mb-6">
        <h1 className="text-2xl font-[family-name:var(--font-ultra)] font-bold text-neutral-900 dark:text-neutral-100">
          Dashboard
        </h1>
        <Link href="/admin/scrapers" className="text-sm text-amber-700 dark:text-amber-400 hover:underline">
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

      <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md p-5">
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-3">Active events by source</h2>
        {bySource.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">No active events.</p>
        ) : (
          <ul className="space-y-1.5">
            {bySource.map((r) => (
              <li key={r.source} className="flex items-center gap-3 text-sm">
                <span className="font-mono text-xs text-neutral-500 dark:text-neutral-400 w-32 truncate">{r.source}</span>
                <div className="flex-1 h-2 bg-neutral-100 dark:bg-neutral-800 rounded-md overflow-hidden">
                  <div
                    className="h-full bg-amber-500 dark:bg-amber-500"
                    style={{ width: `${Math.max(2, Math.round((r.count / Math.max(1, eventActive)) * 100))}%` }}
                  />
                </div>
                <span className="text-xs text-neutral-600 dark:text-neutral-400 w-10 text-right">{r.count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
