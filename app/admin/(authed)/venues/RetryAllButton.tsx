"use client";
import { useState } from "react";

interface ResultRow {
  name: string;
  source: string;
  image_url: string | null;
}

interface BulkResult {
  ok: boolean;
  attempted: number;
  counts: {
    og_scrape: number;
    places: number;
    street_view: number;
    none: number;
    skipped_manual: number;
    skipped_live: number;
  };
  results: ResultRow[];
}

export default function RetryAllButton() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!confirm("Retry the venue-image auto-fetcher for every venue without a real photo? This may take ~5–60 seconds and will hit the Google Places API.")) {
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    const res = await fetch("/api/admin/venues/retry-empty", { method: "POST" });
    setBusy(false);
    const data = (await res.json().catch(() => ({}))) as BulkResult & { error?: string };
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Bulk retry failed");
      return;
    }
    setResult(data);
    // Reload after a short pause so the per-row thumbnails refresh.
    setTimeout(() => window.location.reload(), 1500);
  }

  return (
    <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-md p-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">Bulk retry auto-fetch</h2>
          <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
            Re-runs the venue-image fetcher (og:image → Google Places → Street View) for every venue
            that doesn&apos;t already have a working photo. Skips manual uploads. Bypasses the 30-day backoff.
          </p>
          {error && <p className="text-xs text-red-600 dark:text-red-400 mt-2">{error}</p>}
          {result && (
            <div className="text-xs text-amber-900 dark:text-amber-200 mt-2 space-y-1">
              <div>Attempted {result.attempted}; skipped {result.counts.skipped_manual + result.counts.skipped_live} (already had photos).</div>
              <div>
                Results: places <b>{result.counts.places}</b>, og:image <b>{result.counts.og_scrape}</b>, street view <b>{result.counts.street_view}</b>, no source <b>{result.counts.none}</b>.
              </div>
              {result.results.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {result.results.map((r) => (
                    <li key={r.name}>
                      {r.source === "none" ? "✗" : "✓"} {r.name} → <span>{r.source}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="text-sm px-4 py-2 rounded-md bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50 shrink-0"
        >
          {busy ? "Working…" : "Retry all empty"}
        </button>
      </div>
    </div>
  );
}
