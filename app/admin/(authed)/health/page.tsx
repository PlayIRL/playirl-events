import fs from "fs";
import { requireRole } from "@/lib/session";
import { getDb, getDbPath } from "@/lib/db";
import { getGeocodeCacheStats } from "@/lib/store-geocode-cache";
import StatCard from "../../_components/StatCard";

export const dynamic = "force-dynamic";

/**
 * /admin/health — database health & per-source diagnostics.
 *
 * Read-only at-a-glance dashboard for two operational questions:
 *   1. Is the storage layer growing reasonably (size, table sizes, WAL)?
 *   2. Is each source returning the data quality we expect (country
 *      stamping, currency, coords, address coverage)?
 *
 * All numbers are computed server-side via straightforward SQL aggregates.
 * The events table is the hot spot — ~120k+ rows — but the SUM(CASE WHEN…)
 * pattern is one full scan and uses the existing source / status / date
 * indexes where the predicates allow.
 *
 * Render is purely static — no client interactivity in v1. If the page
 * becomes a bottleneck (slow scans on a much larger DB), turn the rows
 * into materialized snapshots written by the scraper.
 */

interface SourceStats {
  source: string;
  total: number;
  active: number;
  skip: number;
  pending: number;
  pinned: number;
  added_7d: number;
  added_30d: number;
  missing_country: number;
  missing_currency: number;
  missing_coords: number;
  missing_address: number;
  missing_image: number;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function fileSizeOrZero(path: string): number {
  try {
    return fs.statSync(path).size;
  } catch {
    return 0;
  }
}

function pct(num: number, denom: number): string {
  if (denom <= 0) return "—";
  return `${((num / denom) * 100).toFixed(0)}%`;
}

/** Heat-tinted text color for a coverage %. >95 = good (emerald),
 *  70-95 = warn (amber), <70 = bad (red). Picks the colour scheme that
 *  matches the rest of the admin app. */
function coverageColor(num: number, denom: number): string {
  if (denom <= 0) return "text-neutral-400 dark:text-neutral-500";
  const p = (num / denom) * 100;
  if (p >= 95) return "text-emerald-700 dark:text-emerald-400";
  if (p >= 70) return "text-amber-700 dark:text-amber-400";
  return "text-red-700 dark:text-red-400";
}

export default async function HealthPage() {
  await requireRole("admin");
  const db = getDb();
  const dbPath = getDbPath();

  // --- Database file footprint ---
  const dbSize = fileSizeOrZero(dbPath);
  const walSize = fileSizeOrZero(dbPath + "-wal");
  const shmSize = fileSizeOrZero(dbPath + "-shm");
  const totalSize = dbSize + walSize + shmSize;

  // Row counts per table. Sorted by name for a stable display; bytes per
  // row aren't easily knowable from SQLite without VACUUM, so we just show
  // counts and let admins infer size from totals.
  const tableNames = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string }[];
  const tableCounts = tableNames.map((t) => {
    try {
      const r = db.prepare(`SELECT COUNT(*) AS n FROM "${t.name}"`).get() as { n: number };
      return { name: t.name, count: r.n };
    } catch {
      return { name: t.name, count: 0 };
    }
  });

  // --- Per-source aggregates ---
  // One pass over the events table; SQLite optimizes the SUM(CASE) into
  // an in-memory aggregate. At ~120k rows the query runs in <100ms.
  const sourceStats = db
    .prepare(`
      SELECT
        source,
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status = 'skip' THEN 1 ELSE 0 END) AS skip,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'pinned' THEN 1 ELSE 0 END) AS pinned,
        SUM(CASE WHEN added_date >= date('now', '-7 day') THEN 1 ELSE 0 END) AS added_7d,
        SUM(CASE WHEN added_date >= date('now', '-30 day') THEN 1 ELSE 0 END) AS added_30d,
        SUM(CASE WHEN status IN ('active','pinned') AND (country IS NULL OR country = '') THEN 1 ELSE 0 END) AS missing_country,
        SUM(CASE WHEN status IN ('active','pinned') AND (currency IS NULL OR currency = '') THEN 1 ELSE 0 END) AS missing_currency,
        SUM(CASE WHEN status IN ('active','pinned') AND (latitude IS NULL OR longitude IS NULL) THEN 1 ELSE 0 END) AS missing_coords,
        SUM(CASE WHEN status IN ('active','pinned') AND (address IS NULL OR address = '') THEN 1 ELSE 0 END) AS missing_address,
        SUM(CASE WHEN status IN ('active','pinned') AND (image_url IS NULL OR image_url = '') THEN 1 ELSE 0 END) AS missing_image
      FROM events
      GROUP BY source
      ORDER BY total DESC
    `)
    .all() as SourceStats[];

  // For coverage %, the denominator is "active + pinned" — skip/pending
  // events shouldn't count against the source's data quality because
  // they're not surfaced publicly anyway.
  const activeBySource = new Map(sourceStats.map((s) => [s.source, s.active + s.pinned]));

  // --- Date range of the corpus ---
  const dateRange = db
    .prepare(`
      SELECT
        MIN(date) AS first_event,
        MAX(date) AS last_event,
        MIN(added_date) AS first_added,
        MAX(added_date) AS last_added
      FROM events
    `)
    .get() as { first_event: string | null; last_event: string | null; first_added: string | null; last_added: string | null };

  // --- Geocode cache ---
  const geo = getGeocodeCacheStats();

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      <h1 className="text-2xl font-[family-name:var(--font-ultra)] font-bold text-neutral-900 dark:text-neutral-100 mb-2">
        Database health
      </h1>
      <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">
        Storage footprint, per-source ingestion, and data-quality coverage across the events table.
        All numbers are live; refresh the page to recompute.
      </p>

      {/* --- DB footprint stat cards ----------------------------------- */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard
          label="DB size"
          value={fmtBytes(dbSize)}
          hint={walSize > 0 ? `+ ${fmtBytes(walSize)} WAL` : "no WAL — quiescent"}
        />
        <StatCard
          label="Total disk"
          value={fmtBytes(totalSize)}
          hint={`${dbPath.includes("/data/") ? "volume" : "ephemeral"} · ${tableCounts.length} tables`}
        />
        <StatCard
          label="Event date range"
          value={dateRange.first_event && dateRange.last_event ? `${dateRange.first_event} → ${dateRange.last_event}` : "—"}
          hint={dateRange.first_added ? `first added ${dateRange.first_added}` : undefined}
        />
        <StatCard
          label="Geocode cache"
          value={geo.total.toLocaleString()}
          hint={geo.latestCachedAt
            ? `latest ${new Date(geo.latestCachedAt.includes("T") ? geo.latestCachedAt : geo.latestCachedAt + "Z").toLocaleString()}`
            : "empty"}
        />
      </section>

      {/* --- Per-source breakdown -------------------------------------- */}
      <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md p-5 mb-4">
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-1">Events by source</h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
          Status split + recent additions per source. Pending = events awaiting admin review;
          Skip = filtered by curation rules (non-MTG keywords, etc.).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-neutral-500 dark:text-neutral-400">
              <tr className="border-b border-neutral-200 dark:border-neutral-700 text-left">
                <th className="py-1.5 pr-3 font-normal">Source</th>
                <th className="py-1.5 pr-3 font-normal text-right">Total</th>
                <th className="py-1.5 pr-3 font-normal text-right">Active</th>
                <th className="py-1.5 pr-3 font-normal text-right">Pinned</th>
                <th className="py-1.5 pr-3 font-normal text-right">Pending</th>
                <th className="py-1.5 pr-3 font-normal text-right">Skip</th>
                <th className="py-1.5 pr-3 font-normal text-right">+7d</th>
                <th className="py-1.5 font-normal text-right">+30d</th>
              </tr>
            </thead>
            <tbody>
              {sourceStats.length === 0 ? (
                <tr><td colSpan={8} className="py-3 text-neutral-500 dark:text-neutral-400">No events.</td></tr>
              ) : (
                sourceStats.map((s) => (
                  <tr key={s.source} className="border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                    <td className="py-1.5 pr-3 text-neutral-700 dark:text-neutral-300 font-mono">{s.source || "(empty)"}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-neutral-900 dark:text-neutral-100">{s.total.toLocaleString()}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{s.active.toLocaleString()}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-neutral-600 dark:text-neutral-400">{s.pinned.toLocaleString()}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-amber-700 dark:text-amber-400">{s.pending.toLocaleString()}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-neutral-500 dark:text-neutral-400">{s.skip.toLocaleString()}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-neutral-700 dark:text-neutral-300">{s.added_7d.toLocaleString()}</td>
                    <td className="py-1.5 text-right tabular-nums text-neutral-700 dark:text-neutral-300">{s.added_30d.toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* --- Data-quality coverage ------------------------------------- */}
      <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md p-5 mb-4">
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-1">Data quality (active + pinned only)</h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
          What fraction of each source&apos;s visible events carry each field.
          Coverage colors: <span className="text-emerald-700 dark:text-emerald-400">≥95%</span> ·
          {" "}<span className="text-amber-700 dark:text-amber-400">70-95%</span> ·
          {" "}<span className="text-red-700 dark:text-red-400">&lt;70%</span>.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-neutral-500 dark:text-neutral-400">
              <tr className="border-b border-neutral-200 dark:border-neutral-700 text-left">
                <th className="py-1.5 pr-3 font-normal">Source</th>
                <th className="py-1.5 pr-3 font-normal text-right">Visible</th>
                <th className="py-1.5 pr-3 font-normal text-right">Country</th>
                <th className="py-1.5 pr-3 font-normal text-right">Currency</th>
                <th className="py-1.5 pr-3 font-normal text-right">Coords</th>
                <th className="py-1.5 pr-3 font-normal text-right">Address</th>
                <th className="py-1.5 font-normal text-right">Image</th>
              </tr>
            </thead>
            <tbody>
              {sourceStats.length === 0 ? (
                <tr><td colSpan={7} className="py-3 text-neutral-500 dark:text-neutral-400">No events.</td></tr>
              ) : (
                sourceStats.map((s) => {
                  const visible = activeBySource.get(s.source) ?? 0;
                  return (
                    <tr key={s.source} className="border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                      <td className="py-1.5 pr-3 text-neutral-700 dark:text-neutral-300 font-mono">{s.source || "(empty)"}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-neutral-700 dark:text-neutral-300">{visible.toLocaleString()}</td>
                      <td className={`py-1.5 pr-3 text-right tabular-nums ${coverageColor(visible - s.missing_country, visible)}`}>{pct(visible - s.missing_country, visible)}</td>
                      <td className={`py-1.5 pr-3 text-right tabular-nums ${coverageColor(visible - s.missing_currency, visible)}`}>{pct(visible - s.missing_currency, visible)}</td>
                      <td className={`py-1.5 pr-3 text-right tabular-nums ${coverageColor(visible - s.missing_coords, visible)}`}>{pct(visible - s.missing_coords, visible)}</td>
                      <td className={`py-1.5 pr-3 text-right tabular-nums ${coverageColor(visible - s.missing_address, visible)}`}>{pct(visible - s.missing_address, visible)}</td>
                      <td className={`py-1.5 text-right tabular-nums ${coverageColor(visible - s.missing_image, visible)}`}>{pct(visible - s.missing_image, visible)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* --- Table sizes ----------------------------------------------- */}
      <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md p-5">
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-1">Tables</h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
          Row counts per table. Spikes in <code>scrape_history</code> or
          {" "}<code>discord_subscription_activity</code> usually mean the
          bounded-retention cleanup didn&apos;t run; everything else should
          grow gradually with usage.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1.5 text-xs">
          {tableCounts
            .sort((a, b) => b.count - a.count)
            .map((t) => (
              <div key={t.name} className="flex items-baseline justify-between gap-3 border-b border-neutral-100 dark:border-neutral-800 py-1">
                <span className="text-neutral-700 dark:text-neutral-300 font-mono truncate" title={t.name}>{t.name}</span>
                <span className="tabular-nums text-neutral-500 dark:text-neutral-400">{t.count.toLocaleString()}</span>
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}
