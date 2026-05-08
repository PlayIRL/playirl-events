"use client";
import { useEffect, useState } from "react";

interface Settings {
  scrape_interval_hours: string;
  last_scrape: string;
  last_scrape_result: string;
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
    curation?: { active: number; skip: number; pending: number };
  } | null;
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

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
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
          className="bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-4 py-2 rounded-md text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 transition"
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
                  <th className="py-1.5 pr-3 font-normal">Scope</th>
                  <th className="py-1.5 pr-3 font-normal text-right">Scraped</th>
                  <th className="py-1.5 pr-3 font-normal text-right">+New</th>
                  <th className="py-1.5 pr-3 font-normal text-right">Skip</th>
                  <th className="py-1.5 pr-3 font-normal text-right">Pend</th>
                  <th className="py-1.5 pr-3 font-normal text-right">Time</th>
                  <th className="py-1.5 font-normal">Failed</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => {
                  const s = row.summary;
                  const failed = s?.failed ? Object.keys(s.failed) : [];
                  return (
                    <tr key={row.id} className="border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                      <td className="py-1.5 pr-3 text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
                        {new Date(row.ts.includes("T") ? row.ts : row.ts + "Z").toLocaleString()}
                      </td>
                      <td className="py-1.5 pr-3 text-neutral-600 dark:text-neutral-400">
                        {s?.scope ?? "—"}{s?.regions ? ` · ${s.regions}r` : ""}
                      </td>
                      <td className="py-1.5 pr-3 text-right text-neutral-700 dark:text-neutral-300">{s?.scraped ?? "—"}</td>
                      <td className="py-1.5 pr-3 text-right text-emerald-700 dark:text-emerald-400">+{s?.added ?? 0}</td>
                      <td className="py-1.5 pr-3 text-right text-neutral-500 dark:text-neutral-400">{s?.curation?.skip ?? 0}</td>
                      <td className="py-1.5 pr-3 text-right text-amber-700 dark:text-amber-400">{s?.curation?.pending ?? 0}</td>
                      <td className="py-1.5 pr-3 text-right text-neutral-500 dark:text-neutral-400">
                        {s?.durationMs != null ? `${(s.durationMs / 1000).toFixed(1)}s` : "—"}
                      </td>
                      <td className="py-1.5 text-red-700 dark:text-red-400">
                        {failed.length > 0 ? failed.join(",") : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
