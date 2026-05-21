"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import VenueQuickRetryButton from "./VenueQuickRetryButton";
import type { VenueImageSource } from "@/lib/venues";

// Client-side filterable table. The full venue list ships from the server
// (typically 1000-2000 rows on prod-scale data) but we only render the
// matching subset up to `limit` so the browser doesn't paint thousands of
// thumbnails on first load.

export interface VenueRowData {
  name: string;
  slug: string;
  address: string;
  usageCount: number;
  imageUrl: string;
  imageSource: VenueImageSource | null;
}

const SOURCE_LABELS: Record<VenueImageSource, { label: string; className: string }> = {
  manual: {
    label: "manual",
    className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  },
  og_scrape: {
    label: "og:image",
    className: "bg-neutral-100 text-neutral-700 dark:bg-white/[0.06] dark:text-neutral-300",
  },
  places: {
    label: "places",
    className: "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  },
  street_view: {
    label: "streetview",
    className: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  },
};

const LIMIT_OPTIONS = [50, 100, 250, 1000] as const;

const FILTERS = ["all", "missing image", "manual", "auto-fetched"] as const;
type Filter = (typeof FILTERS)[number];

export default function VenuesTable({ venues }: { venues: VenueRowData[] }) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState<number>(50);
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return venues.filter((v) => {
      if (q && !`${v.name} ${v.address}`.toLowerCase().includes(q)) return false;
      if (filter === "missing image" && v.imageUrl) return false;
      if (filter === "manual" && v.imageSource !== "manual") return false;
      if (filter === "auto-fetched" &&
        (v.imageSource === null || v.imageSource === "manual")) return false;
      return true;
    });
  }, [venues, query, filter]);

  const visible = filtered.slice(0, limit);
  const truncated = filtered.length > visible.length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or address…"
          className="flex-1 min-w-[200px] px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-400/40 dark:focus:ring-white/20"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          className="px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
        >
          {FILTERS.map((f) => (
            <option key={f} value={f}>
              {f === "all" ? "All venues" : f}
            </option>
          ))}
        </select>
        <select
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
        >
          {LIMIT_OPTIONS.map((n) => (
            <option key={n} value={n}>
              Show {n}
            </option>
          ))}
        </select>
        <span className="text-xs text-neutral-500 dark:text-neutral-400 ml-auto">
          {filtered.length === venues.length
            ? `${venues.length} venues`
            : `${filtered.length} of ${venues.length}`}
        </span>
      </div>

      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-950/40">
            <tr>
              <th className="text-left font-medium px-3 py-2 w-20">Image</th>
              <th className="text-left font-medium px-3 py-2">Name</th>
              <th className="text-left font-medium px-3 py-2 hidden md:table-cell">Address</th>
              <th className="text-right font-medium px-3 py-2 w-20">Events</th>
              <th className="text-left font-medium px-3 py-2 w-24">Source</th>
              <th className="text-right font-medium px-3 py-2 w-32" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {visible.map((v) => {
              const sourceMeta = v.imageSource ? SOURCE_LABELS[v.imageSource] : null;
              return (
                <tr
                  key={v.slug + v.name}
                  className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/venues/${v.slug}`}
                      className="block w-14 h-10 rounded-md overflow-hidden bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center"
                    >
                      {v.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={v.imageUrl}
                          alt=""
                          width={56}
                          height={40}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <span className="text-[9px] text-neutral-500 dark:text-neutral-400">
                          none
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="px-3 py-2 min-w-0">
                    <Link
                      href={`/admin/venues/${v.slug}`}
                      className="font-medium text-neutral-900 dark:text-neutral-100 hover:underline truncate block"
                    >
                      {v.name}
                    </Link>
                    {v.address && (
                      <span className="text-xs text-neutral-500 dark:text-neutral-400 truncate md:hidden block">
                        {v.address}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 hidden md:table-cell text-neutral-600 dark:text-neutral-400 text-xs truncate max-w-md">
                    {v.address || "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-neutral-700 dark:text-neutral-300">
                    {v.usageCount}
                  </td>
                  <td className="px-3 py-2">
                    {sourceMeta ? (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-md ${sourceMeta.className}`}
                      >
                        {sourceMeta.label}
                      </span>
                    ) : (
                      <span className="text-[10px] text-neutral-400 dark:text-neutral-600">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <VenueQuickRetryButton venueName={v.name} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {truncated && (
          <div className="px-3 py-2 text-xs text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-950/40 border-t border-neutral-200 dark:border-neutral-800">
            Showing first {visible.length} of {filtered.length} matches.
            Increase the "Show" limit or refine your search to see more.
          </div>
        )}
        {filtered.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
            No venues match your filters.
          </div>
        )}
      </div>
    </div>
  );
}
