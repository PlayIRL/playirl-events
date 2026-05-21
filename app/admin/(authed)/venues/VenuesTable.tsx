"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import VenueQuickRetryButton from "./VenueQuickRetryButton";
import type { VenueImageSource } from "@/lib/venues";

// Client-side filterable + sortable + paginated table. The full venue list
// ships from the server (typically 1000-2000 rows on prod-scale data) but we
// only paint a windowed subset to keep the initial render fast — incremental
// "Load more" expands by PAGE_SIZE on demand.

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

const FILTERS = ["all", "missing image", "manual", "auto-fetched"] as const;
type Filter = (typeof FILTERS)[number];

type SortKey = "events" | "name" | "address" | "source";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 50;

// Per-column default sort direction. Numeric/quantitative columns default
// to "highest first" because that's the more useful starting view; text
// columns default to A→Z.
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  events: "desc",
  name: "asc",
  address: "asc",
  source: "asc",
};

function compareNullsLast(a: string | null, b: string | null, dir: SortDir): number {
  if (a === b) return 0;
  if (a === null || a === "") return 1; // empty sorts to end regardless of dir
  if (b === null || b === "") return -1;
  return dir === "asc" ? a.localeCompare(b) : b.localeCompare(a);
}

export default function VenuesTable({ venues }: { venues: VenueRowData[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("events");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);

  // Reset the visible window whenever filters or sort change, so the user
  // doesn't end up scrolling through a stale slice of a different ordering.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, filter, sortKey, sortDir]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = venues.filter((v) => {
      if (q && !`${v.name} ${v.address}`.toLowerCase().includes(q)) return false;
      if (filter === "missing image" && v.imageUrl) return false;
      if (filter === "manual" && v.imageSource !== "manual") return false;
      if (filter === "auto-fetched" &&
        (v.imageSource === null || v.imageSource === "manual")) return false;
      return true;
    });

    // Stable sort by the active key, then by name as a tie-breaker so equal
    // event counts (or same source) get a predictable order.
    const sorted = [...rows];
    sorted.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "events") {
        cmp = sortDir === "asc" ? a.usageCount - b.usageCount : b.usageCount - a.usageCount;
      } else if (sortKey === "name") {
        cmp = sortDir === "asc"
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name);
      } else if (sortKey === "address") {
        cmp = compareNullsLast(a.address || null, b.address || null, sortDir);
      } else if (sortKey === "source") {
        cmp = compareNullsLast(a.imageSource ?? null, b.imageSource ?? null, sortDir);
      }
      if (cmp !== 0) return cmp;
      return a.name.localeCompare(b.name);
    });
    return sorted;
  }, [venues, query, filter, sortKey, sortDir]);

  const visible = filtered.slice(0, visibleCount);
  const remaining = filtered.length - visible.length;

  function onSortClick(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(DEFAULT_DIR[key]);
    }
  }

  function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
    if (!active) {
      return (
        <span className="opacity-30 text-[9px] ml-1" aria-hidden>
          ↕
        </span>
      );
    }
    return (
      <span className="text-[10px] ml-1" aria-hidden>
        {dir === "asc" ? "▲" : "▼"}
      </span>
    );
  }

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
        <span className="text-xs text-neutral-500 dark:text-neutral-400 ml-auto">
          {filtered.length === venues.length
            ? `${venues.length.toLocaleString()} venues`
            : `${filtered.length.toLocaleString()} of ${venues.length.toLocaleString()}`}
        </span>
      </div>

      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md overflow-hidden">
        {/* Horizontal scroll wrapper — at narrow widths the right-most
           "actions" column would otherwise be clipped by the page max-w. */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="text-xs text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-950/40">
              <tr>
                <th className="text-left font-medium px-3 py-2 w-20">Image</th>
                <th className="text-left font-medium px-3 py-2 min-w-[180px]">
                  <button
                    type="button"
                    onClick={() => onSortClick("name")}
                    className="inline-flex items-center hover:text-neutral-900 dark:hover:text-neutral-100 transition"
                  >
                    Name
                    <SortIcon active={sortKey === "name"} dir={sortDir} />
                  </button>
                </th>
                <th className="text-left font-medium px-3 py-2 min-w-[200px] hidden md:table-cell">
                  <button
                    type="button"
                    onClick={() => onSortClick("address")}
                    className="inline-flex items-center hover:text-neutral-900 dark:hover:text-neutral-100 transition"
                  >
                    Address
                    <SortIcon active={sortKey === "address"} dir={sortDir} />
                  </button>
                </th>
                <th className="text-right font-medium px-3 py-2 w-24">
                  <button
                    type="button"
                    onClick={() => onSortClick("events")}
                    className="inline-flex items-center hover:text-neutral-900 dark:hover:text-neutral-100 transition"
                  >
                    Events
                    <SortIcon active={sortKey === "events"} dir={sortDir} />
                  </button>
                </th>
                <th className="text-left font-medium px-3 py-2 w-28">
                  <button
                    type="button"
                    onClick={() => onSortClick("source")}
                    className="inline-flex items-center hover:text-neutral-900 dark:hover:text-neutral-100 transition"
                  >
                    Source
                    <SortIcon active={sortKey === "source"} dir={sortDir} />
                  </button>
                </th>
                <th className="text-right font-medium px-3 py-2 w-24" />
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
        </div>

        {filtered.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
            No venues match your filters.
          </div>
        ) : remaining > 0 ? (
          <div className="px-3 py-2 flex items-center justify-between gap-3 bg-neutral-50 dark:bg-neutral-950/40 border-t border-neutral-200 dark:border-neutral-800 text-xs">
            <span className="text-neutral-500 dark:text-neutral-400">
              Showing {visible.length.toLocaleString()} of {filtered.length.toLocaleString()}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                className="px-3 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                Load {Math.min(PAGE_SIZE, remaining)} more
              </button>
              <button
                type="button"
                onClick={() => setVisibleCount(filtered.length)}
                className="px-3 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                Show all ({filtered.length.toLocaleString()})
              </button>
            </div>
          </div>
        ) : (
          <div className="px-3 py-2 text-xs text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-950/40 border-t border-neutral-200 dark:border-neutral-800">
            All {filtered.length.toLocaleString()} loaded.
          </div>
        )}
      </div>
    </div>
  );
}
