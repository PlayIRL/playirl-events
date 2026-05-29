"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

interface Settings {
  scrape_interval_hours: string;
  last_scrape: string;
  last_scrape_result: string;
  last_scrape_regions_wotc: string;
}

interface RegionStat {
  label: string;
  country?: string;
  storesFetched: number;
  storesError?: string;
  eventsFetched: number;
  eventsError?: string;
  durationMs: number;
}

interface RegionStatsPayload {
  ts: string;
  regions: RegionStat[];
}

interface HistoryRow {
  id: number;
  ts: string;
  summary: {
    scraped: number;
    deduped: number;
    added: number;
    updated: number;
    skipped: number;
    archived: number;
    durationMs?: number;
    scope?: "local" | "national";
    regions?: number;
    bySource?: Record<string, number>;
    failed?: Record<string, string>;
    /** What kicked off this scrape: "cron" | "admin-refresh" | "cli" |
     *  "startup" | "unknown". Missing on legacy rows that pre-date this
     *  column — those render as "—". */
    triggeredBy?: string;
    curation?: { active: number; skip: number; pending: number };
  } | null;
}

/** Render the trigger source as a friendly label + matching color. The
 *  raw values are kebab-case identifiers used elsewhere in logs; this
 *  function presents them. Keeps the label short enough to fit the
 *  table column without wrapping.
 *
 *  The default "unknown" case carries a real background pill (not just
 *  greyed text on transparent) so legacy rows whose triggeredBy never
 *  got recorded still LOOK like they have a value — otherwise the cell
 *  reads as blank and admins assume the column is broken.
 */
function triggerBadge(triggeredBy: string | undefined): { label: string; className: string } {
  switch (triggeredBy) {
    case "cron":
      return { label: "auto", className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" };
    case "admin-refresh":
      return { label: "manual", className: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" };
    case "cli":
      return { label: "cli", className: "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300" };
    case "startup":
      return { label: "startup", className: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" };
    default:
      return { label: "unknown", className: "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400" };
  }
}

interface RunningStatus {
  runningSince: string;
  runningSource: string;
}

export default function ScrapersPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [result, setResult] = useState<string>("");
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [running, setRunning] = useState<RunningStatus | null>(null);

  async function loadSettings() {
    const res = await fetch("/api/admin/settings");
    if (res.ok) setSettings(await res.json());
  }
  async function loadHistory() {
    const res = await fetch("/api/admin/scrape-history?limit=20");
    if (res.ok) {
      const data = await res.json();
      setHistory(data.history ?? []);
    }
  }
  async function loadRunning(): Promise<RunningStatus | null> {
    const res = await fetch("/api/admin/refresh");
    if (!res.ok) return null;
    const data = await res.json();
    return data.running ?? null;
  }
  useEffect(() => {
    loadSettings();
    loadHistory();
    loadRunning().then(setRunning);
  }, []);

  // Poll every 5s while a scrape is running so the admin sees live
  // progress without manual refreshes. When the scrape completes (lock
  // releases → /api/admin/refresh returns null), reload settings +
  // history once to surface the new last_scrape and the new history row,
  // then stop polling.
  useEffect(() => {
    if (!running) return;
    const interval = setInterval(async () => {
      const status = await loadRunning();
      if (!status) {
        setRunning(null);
        await loadSettings();
        await loadHistory();
        clearInterval(interval);
        return;
      }
      setRunning(status);
    }, 5000);
    return () => clearInterval(interval);
  }, [running]);

  async function runScrape() {
    setRefreshing(true);
    setResult("");
    const res = await fetch("/api/admin/refresh", { method: "POST" });
    const data = await res.json();
    if (res.status === 202) {
      // Fire-and-forget: scrape started, polling takes over from here.
      setResult(`Scrape started at ${new Date(data.startedAt).toLocaleTimeString()} — this page will update when it completes.`);
      setRunning({ runningSince: data.startedAt, runningSource: data.source });
    } else if (res.status === 409) {
      setResult(`Already running (started ${new Date(data.runningSince).toLocaleTimeString()} by ${data.runningSource}).`);
      setRunning({ runningSince: data.runningSince, runningSource: data.runningSource });
    } else {
      setResult(`Error: ${data.error ?? `HTTP ${res.status}`}`);
    }
    setRefreshing(false);
  }

  async function saveInterval(hours: number) {
    await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scrape_interval_hours: hours }),
    });
    loadSettings();
  }

  const last = settings?.last_scrape ? new Date(settings.last_scrape).toLocaleString() : "never";

  // Decode the per-region health blob and pre-compute the views the table
  // needs (sorted variants, total event count). useMemo keeps this off the
  // hot render path when nothing in settings changed.
  const regionStats = useMemo<RegionStatsPayload | null>(() => {
    const raw = settings?.last_scrape_regions_wotc;
    if (!raw) return null;
    try {
      return JSON.parse(raw) as RegionStatsPayload;
    } catch {
      return null;
    }
  }, [settings?.last_scrape_regions_wotc]);
  const [regionSort, setRegionSort] = useState<"events" | "stores" | "duration" | "errors" | "label">("events");
  const sortedRegions = useMemo(() => {
    if (!regionStats) return [] as RegionStat[];
    const rows = [...regionStats.regions];
    const dir = regionSort === "label" ? 1 : -1; // numeric sorts descend
    rows.sort((a, b) => {
      switch (regionSort) {
        case "events":   return dir * (a.eventsFetched - b.eventsFetched);
        case "stores":   return dir * (a.storesFetched - b.storesFetched);
        case "duration": return dir * (a.durationMs - b.durationMs);
        case "errors": {
          const ae = (a.storesError ? 1 : 0) + (a.eventsError ? 1 : 0);
          const be = (b.storesError ? 1 : 0) + (b.eventsError ? 1 : 0);
          return dir * (ae - be);
        }
        case "label":
        default:
          return dir * a.label.localeCompare(b.label);
      }
    });
    return rows;
  }, [regionStats, regionSort]);

  // Compute the next expected daily cron tick (9 UTC). Same schedule the
  // GitHub Actions workflow uses; surfaced in the Scheduled scraping
  // section so admins see when the next automatic run will fire without
  // opening the Actions tab.
  const nextScheduledTickIso = (() => {
    const next = new Date();
    next.setUTCHours(9, 0, 0, 0);
    if (next.getTime() <= Date.now()) next.setUTCDate(next.getUTCDate() + 1);
    return next.toISOString();
  })();

  // Find the most recent history row that was actually fired by the cron
  // (not a manual click). Used by the Scheduled scraping panel below to
  // show "last auto run" — distinct from `lastScrape` which counts any
  // run regardless of source. Falls back to null on a DB that pre-dates
  // the triggeredBy field (legacy rows have no source recorded).
  const lastAutoRun = useMemo(() => {
    return history.find((r) => r.summary?.triggeredBy === "cron") ?? null;
  }, [history]);
  const hoursSinceLastAuto = lastAutoRun
    ? (Date.now() - new Date(lastAutoRun.ts.includes("T") ? lastAutoRun.ts : lastAutoRun.ts + "Z").getTime()) / 3_600_000
    : Infinity;
  const autoHealth: "ok" | "warn" | "loud" | "never" =
    !Number.isFinite(hoursSinceLastAuto) ? "never"
      : hoursSinceLastAuto > 48 ? "loud"
        : hoursSinceLastAuto > 28 ? "warn"
          : "ok";
  const msUntilNext = new Date(nextScheduledTickIso).getTime() - Date.now();
  const hoursUntilNext = msUntilNext / 3_600_000;
  const untilNextLabel = hoursUntilNext < 1
    ? `in ${Math.max(1, Math.round(msUntilNext / 60_000))} min`
    : `in ${Math.round(hoursUntilNext)}h`;

  return (
    // max-w-6xl (was 3xl): the Recent runs table now has 9 columns and the
    // WotC region health table is also wide. Matches /admin's dashboard
    // width so the admin app feels cohesive across sections.
    <div className="p-6 lg:p-8 max-w-6xl">
      <h1 className="text-2xl font-[family-name:var(--font-ultra)] font-bold text-neutral-900 dark:text-neutral-100 mb-6">
        Scrapers
      </h1>

      <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md p-5 mb-4">
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-3">Manual refresh</h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
          Last run: <span>{last}</span>
        </p>
        <button
          onClick={runScrape}
          disabled={refreshing || !!running}
          className="bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50 transition"
        >
          {running ? "Scraping…" : refreshing ? "Starting…" : "Refresh now"}
        </button>
        {running && (
          <p className="text-xs text-neutral-600 dark:text-neutral-300 mt-3">
            ⏳ {running.runningSource} scrape running since {new Date(running.runningSince).toLocaleTimeString()} · cold runs take ~10–15 min
          </p>
        )}
        {result && (
          <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-3">{result}</p>
        )}
      </section>

      {/* Scheduled scraping — promotes what was previously a single line
          buried in Manual refresh into its own section. One card per
          scheduled job so admins can see at a glance what's running,
          how often, when the next fire is, and whether the last
          automatic execution looks healthy. */}
      <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md p-5 mb-4">
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
          <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Scheduled scraping</h2>
          <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
            Schedules live in <code className="text-[10px]">.github/workflows/</code>
          </span>
        </div>

        <div className="space-y-3">
          {/* Daily heavy scrape — the WotC + TopDeck sweep that produces
              the bulk of the catalogue. */}
          <div className="border border-neutral-200 dark:border-neutral-800 rounded-md p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
              <div className="flex items-center gap-2">
                <span className="inline-block px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  auto
                </span>
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  Daily multi-region scrape
                </h3>
              </div>
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ${
                  autoHealth === "ok" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : autoHealth === "warn" ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                  : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                }`}
              >
                {autoHealth === "ok" ? "healthy"
                  : autoHealth === "warn" ? "delayed"
                  : autoHealth === "loud" ? "stuck"
                  : "never run"}
              </span>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
              Sweeps every enabled grid in <Link href="/admin/config" className="underline hover:text-neutral-700 dark:hover:text-neutral-300">Site config → Regions</Link>.
              Hits WotC&apos;s store + event GraphQL plus any other enabled sources.
            </p>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-y-2 gap-x-4 text-xs">
              <div>
                <dt className="text-neutral-500 dark:text-neutral-400">Frequency</dt>
                <dd className="text-neutral-700 dark:text-neutral-300 font-mono">daily · 09:00 UTC</dd>
              </div>
              <div>
                <dt className="text-neutral-500 dark:text-neutral-400">Next run</dt>
                <dd className="text-neutral-700 dark:text-neutral-300">
                  {new Date(nextScheduledTickIso).toLocaleString()}{" "}
                  <span className="text-neutral-500 dark:text-neutral-500">({untilNextLabel})</span>
                </dd>
              </div>
              <div>
                <dt className="text-neutral-500 dark:text-neutral-400">Last auto run</dt>
                <dd className="text-neutral-700 dark:text-neutral-300">
                  {lastAutoRun
                    ? new Date(lastAutoRun.ts.includes("T") ? lastAutoRun.ts : lastAutoRun.ts + "Z").toLocaleString()
                    : <span className="text-neutral-500">never (no cron run yet)</span>}
                  {lastAutoRun && (
                    <span className="text-neutral-500 dark:text-neutral-500"> ({Math.round(hoursSinceLastAuto)}h ago)</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-neutral-500 dark:text-neutral-400">Workflow</dt>
                <dd>
                  <a
                    href="https://github.com/PlayIRL/playirl-events/actions/workflows/scrape.yml"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-neutral-700 dark:text-neutral-300 underline hover:no-underline"
                  >
                    scrape.yml ↗
                  </a>
                </dd>
              </div>
            </dl>
          </div>

          {/* Discord-only frequent pull — per the production runbook, an
              optional Railway Cron (every 15 min) hits /api/scrape-discord
              so new guild-side scheduled events land in PlayIRL within
              minutes rather than waiting for the daily heavy scrape. We
              can't directly verify it's running from this page (no
              dedicated history table), but surface it so admins know it
              exists + where it lives. */}
          <div className="border border-neutral-200 dark:border-neutral-800 rounded-md p-4 opacity-90">
            <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
              <div className="flex items-center gap-2">
                <span className="inline-block px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  auto
                </span>
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  Discord-only pull
                </h3>
              </div>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                external schedule
              </span>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
              Light pull of Discord guild scheduled events so newly-created Discord events
              land in PlayIRL within ~15 min instead of waiting for the daily heavy scrape.
            </p>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-y-2 gap-x-4 text-xs">
              <div>
                <dt className="text-neutral-500 dark:text-neutral-400">Frequency</dt>
                <dd className="text-neutral-700 dark:text-neutral-300 font-mono">every 15 min</dd>
              </div>
              <div>
                <dt className="text-neutral-500 dark:text-neutral-400">Scheduled by</dt>
                <dd className="text-neutral-700 dark:text-neutral-300">Railway Cron</dd>
              </div>
              <div>
                <dt className="text-neutral-500 dark:text-neutral-400">Endpoint</dt>
                <dd className="text-neutral-700 dark:text-neutral-300 font-mono text-[10px]">POST /api/scrape-discord</dd>
              </div>
              <div>
                <dt className="text-neutral-500 dark:text-neutral-400">Setup docs</dt>
                <dd>
                  <a
                    href="https://github.com/PlayIRL/playirl-events/blob/main/docs/PRODUCTION_FILL_RUNBOOK.md#also-add-a-discord-only-frequent-pull"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-neutral-700 dark:text-neutral-300 underline hover:no-underline"
                  >
                    runbook ↗
                  </a>
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md p-5 mb-4">
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-3">Recent runs</h2>
        {history.length === 0 ? (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">No scrape history yet — runScraper writes a row to scrape_history on each run.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-neutral-500 dark:text-neutral-400 text-left border-b border-neutral-200 dark:border-neutral-700">
                  <th className="py-1.5 pr-3 font-normal">When</th>
                  <th className="py-1.5 pr-3 font-normal">Trigger</th>
                  <th className="py-1.5 pr-3 font-normal">Mode</th>
                  <th className="py-1.5 pr-3 font-normal text-right">Scraped</th>
                  <th className="py-1.5 pr-3 font-normal text-right">+New</th>
                  <th className="py-1.5 pr-3 font-normal text-right">Skip</th>
                  <th className="py-1.5 pr-3 font-normal text-right">Pend</th>
                  <th className="py-1.5 pr-3 font-normal text-right">Time</th>
                  <th className="py-1.5 font-normal">Sources</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => {
                  const s = row.summary;
                  // Source breakdown: bySource is the set of sources the
                  // scraper ATTEMPTED, failed is the subset that threw.
                  // Union = the full attempted set; (attempted - failed)
                  // gave us the OK list. A source can appear in bySource
                  // with count=0 yet not be in failed (just no events that
                  // run — fine, still "ok"). The order is stable across
                  // runs because we sort alphabetically.
                  const attempted = new Set<string>([
                    ...Object.keys(s?.bySource ?? {}),
                    ...Object.keys(s?.failed ?? {}),
                  ]);
                  const failedSet = new Set(Object.keys(s?.failed ?? {}));
                  const sourceEntries = [...attempted].sort().map((name) => ({
                    name,
                    ok: !failedSet.has(name),
                    count: s?.bySource?.[name] ?? 0,
                    error: s?.failed?.[name],
                  }));
                  const trigger = triggerBadge(s?.triggeredBy);
                  return (
                    <tr key={row.id} className="border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                      <td className="py-1.5 pr-3 text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
                        {new Date(row.ts.includes("T") ? row.ts : row.ts + "Z").toLocaleString()}
                      </td>
                      <td className="py-1.5 pr-3">
                        <span className={`inline-block px-1.5 py-0.5 rounded-md text-[10px] font-medium ${trigger.className}`}>
                          {trigger.label}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 text-neutral-600 dark:text-neutral-400">
                        {s?.scope ? (s.scope === "national" ? "multi-region" : s.scope) : "—"}{s?.regions ? ` · ${s.regions}r` : ""}
                      </td>
                      <td className="py-1.5 pr-3 text-right text-neutral-700 dark:text-neutral-300">{s?.scraped ?? "—"}</td>
                      <td className="py-1.5 pr-3 text-right text-emerald-700 dark:text-emerald-400">+{s?.added ?? 0}</td>
                      <td className="py-1.5 pr-3 text-right text-neutral-500 dark:text-neutral-400">{s?.curation?.skip ?? 0}</td>
                      <td className="py-1.5 pr-3 text-right text-amber-700 dark:text-amber-400">{s?.curation?.pending ?? 0}</td>
                      <td className="py-1.5 pr-3 text-right text-neutral-500 dark:text-neutral-400">
                        {s?.durationMs != null ? `${(s.durationMs / 1000).toFixed(1)}s` : "—"}
                      </td>
                      <td className="py-1.5">
                        {sourceEntries.length === 0 ? (
                          <span className="text-neutral-400">—</span>
                        ) : (
                          <span className="inline-flex flex-wrap gap-x-2 gap-y-0.5">
                            {sourceEntries.map((src) => (
                              <span
                                key={src.name}
                                className={src.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}
                                title={src.ok ? `${src.name}: ${src.count} events` : `${src.name} failed: ${src.error ?? "unknown error"}`}
                              >
                                {src.ok ? "✓" : "✗"} {src.name}
                              </span>
                            ))}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {regionStats && (
        <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md p-5 mb-4">
          <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
            <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
              WotC region health
            </h2>
            <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
              {regionStats.regions.length} anchors · captured {new Date(regionStats.ts).toLocaleString()}
            </span>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
            Per-anchor event + store counts from the last WotC scrape. Sort by
            errors first to triage failures; sort by events to spot outliers
            (Tokyo&apos;s 11k vs Boston&apos;s 3k is real, but a JP anchor
            returning 0 events isn&apos;t).
          </p>
          <div className="flex gap-2 items-center mb-3">
            <label className="text-xs text-neutral-600 dark:text-neutral-400">Sort by:</label>
            <select
              value={regionSort}
              onChange={(e) => setRegionSort(e.target.value as typeof regionSort)}
              className="text-xs px-2 py-1 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
            >
              <option value="events">Events ↓</option>
              <option value="stores">Stores ↓</option>
              <option value="duration">Duration ↓</option>
              <option value="errors">Errors first</option>
              <option value="label">Label A→Z</option>
            </select>
          </div>
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto border border-neutral-100 dark:border-neutral-800 rounded-md">
            <table className="w-full text-xs">
              <thead className="bg-neutral-50 dark:bg-neutral-900 sticky top-0">
                <tr className="text-neutral-500 dark:text-neutral-400 text-left">
                  <th className="py-1.5 px-3 font-normal">Region</th>
                  <th className="py-1.5 px-3 font-normal">CC</th>
                  <th className="py-1.5 px-3 font-normal text-right">Stores</th>
                  <th className="py-1.5 px-3 font-normal text-right">Events</th>
                  <th className="py-1.5 px-3 font-normal text-right">Time</th>
                  <th className="py-1.5 px-3 font-normal">Errors</th>
                </tr>
              </thead>
              <tbody>
                {sortedRegions.map((r, i) => {
                  const hasError = r.storesError || r.eventsError;
                  return (
                    <tr
                      key={`${r.label}-${i}`}
                      className={`border-t border-neutral-100 dark:border-neutral-800 ${hasError ? "bg-red-50/30 dark:bg-red-950/20" : ""}`}
                    >
                      <td className="py-1.5 px-3 text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
                        {r.label}
                      </td>
                      <td className="py-1.5 px-3 text-neutral-500 dark:text-neutral-400 font-mono">
                        {r.country ?? "—"}
                      </td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-neutral-700 dark:text-neutral-300">
                        {r.storesFetched}
                      </td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-neutral-700 dark:text-neutral-300">
                        {r.eventsFetched.toLocaleString()}
                      </td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-neutral-500 dark:text-neutral-400">
                        {(r.durationMs / 1000).toFixed(1)}s
                      </td>
                      <td className="py-1.5 px-3 text-red-700 dark:text-red-400 max-w-[300px] truncate" title={[r.storesError, r.eventsError].filter(Boolean).join(" | ")}>
                        {[r.storesError, r.eventsError].filter(Boolean).join(" · ")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md p-5">
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-1">Auto-refresh interval</h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">How often the scheduled task runs (the CI cron also runs independently).</p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={168}
            value={settings?.scrape_interval_hours ?? ""}
            onChange={(e) => setSettings((s) => s ? { ...s, scrape_interval_hours: e.target.value } : s)}
            className="w-24 px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
          />
          <span className="text-sm text-neutral-500 dark:text-neutral-400">hours</span>
          <button
            onClick={() => saveInterval(Number(settings?.scrape_interval_hours ?? 24))}
            className="ml-3 text-xs px-3 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            Save
          </button>
        </div>
      </section>
    </div>
  );
}
