"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import EventTable, { type EventRow } from "../../_components/EventTable";
import StatCard from "../../_components/StatCard";
import { TableSkeleton } from "@/app/skeleton";

/**
 * /admin/events — paginated + filtered events listing.
 *
 * Why the rewrite:
 *   - Previous version loaded the first 5000 rows in one shot and did
 *     client-side filtering. At 120k+ events that's a 30-50MB JSON
 *     payload and a sluggish table render. Admins couldn't even SEE
 *     events past row 5000.
 *   - Now: server-side filtering on every dropdown, 50 rows per page,
 *     and a stat-card row at the top showing DB-wide aggregates so the
 *     admin always has context about what they're looking at.
 *
 * URL-driven state means the address bar is a sharable / bookmarkable
 * link into a specific slice ("?country=GB&status=pending&page=3").
 * Back/forward navigation works as expected.
 */

interface EventStats {
  total: number;
  byStatus: Record<string, number>;
  bySource: { source: string; count: number }[];
  byCountry: { country: string; count: number }[];
  byFormat: { format: string; count: number }[];
  byCurrency: { currency: string; count: number }[];
}

interface EventsResponse {
  events: EventRow[];
  total: number;
  page: number;
  limit: number;
  stats?: EventStats;
}

const STATUSES = ["all", "active", "skip", "pinned", "pending"] as const;
const PAGE_SIZE = 50;

function readUrlState(): {
  page: number;
  status: string;
  source: string;
  format: string;
  country: string;
  currency: string;
  q: string;
} {
  if (typeof window === "undefined") {
    return { page: 1, status: "all", source: "all", format: "all", country: "all", currency: "all", q: "" };
  }
  const p = new URLSearchParams(window.location.search);
  return {
    page: Math.max(1, Number(p.get("page") ?? "1") || 1),
    status: p.get("status") ?? "all",
    source: p.get("source") ?? "all",
    format: p.get("format") ?? "all",
    country: p.get("country") ?? "all",
    currency: p.get("currency") ?? "all",
    q: p.get("q") ?? "",
  };
}

export default function AdminEventsPage() {
  const [state, setState] = useState(readUrlState);
  const [data, setData] = useState<EventsResponse | null>(null);
  const [stats, setStats] = useState<EventStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Mirror state → URL so bookmarks/back-forward work. `replaceState`
  // because every filter tick changing the history stack would be
  // obnoxious — back-button should hop to the last "real" navigation,
  // not undo every keystroke of search input.
  useEffect(() => {
    const p = new URLSearchParams();
    if (state.page !== 1) p.set("page", String(state.page));
    if (state.status !== "all") p.set("status", state.status);
    if (state.source !== "all") p.set("source", state.source);
    if (state.format !== "all") p.set("format", state.format);
    if (state.country !== "all") p.set("country", state.country);
    if (state.currency !== "all") p.set("currency", state.currency);
    if (state.q) p.set("q", state.q);
    const next = p.toString() ? `?${p.toString()}` : window.location.pathname;
    window.history.replaceState(null, "", next);
  }, [state]);

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    p.set("page", String(state.page));
    p.set("limit", String(PAGE_SIZE));
    if (state.status !== "all") p.set("status", state.status);
    if (state.source !== "all") p.set("source", state.source);
    if (state.format !== "all") p.set("format", state.format);
    if (state.country !== "all") p.set("country", state.country);
    if (state.currency !== "all") p.set("currency", state.currency);
    if (state.q) p.set("q", state.q);
    // Stats only on the first page of an unfiltered or freshly-loaded
    // view — they're DB-wide and don't change when the admin paginates.
    // Refresh them on every load anyway so the cards stay current; the
    // extra ~150ms is in the noise.
    p.set("include_stats", "1");
    const res = await fetch(`/api/admin/events?${p.toString()}`);
    if (res.ok) {
      const json = (await res.json()) as EventsResponse;
      setData(json);
      if (json.stats) setStats(json.stats);
    }
    setLoading(false);
  }, [state]);

  // load() internally calls setLoading + setData; React's lint flags
  // "setState inside an effect" as a smell because it can trigger a
  // cascade. Here it's intentional: every filter change should refetch.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  // Debounce the search input so we don't fire a request on every keystroke.
  // 300ms is the typical "feels instant but doesn't thrash" balance.
  const [searchInput, setSearchInput] = useState(state.q);
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== state.q) {
        setState((s) => ({ ...s, q: searchInput, page: 1 }));
      }
    }, 300);
    return () => clearTimeout(t);
    // We intentionally only depend on searchInput; state.q would create
    // a loop where setting state.q from inside this effect triggers it
    // again on the next render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  function update<K extends keyof typeof state>(key: K, value: typeof state[K]) {
    setState((s) => ({ ...s, [key]: value, page: key === "page" ? (value as number) : 1 }));
  }

  // Derive filter option sets from stats so admin only sees values that
  // actually exist in the DB. Saves a "Wargames" entry under format from
  // ever appearing in the filter dropdown if there are zero such events.
  const sourceOptions = useMemo(() => ["all", ...(stats?.bySource.map((s) => s.source) ?? [])], [stats]);
  const formatOptions = useMemo(() => ["all", ...(stats?.byFormat.map((s) => s.format) ?? [])], [stats]);
  const countryOptions = useMemo(() => ["all", ...(stats?.byCountry.map((s) => s.country) ?? [])], [stats]);
  const currencyOptions = useMemo(() => ["all", ...(stats?.byCurrency.map((s) => s.currency) ?? [])], [stats]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const showingFrom = data && data.total > 0 ? (data.page - 1) * data.limit + 1 : 0;
  const showingTo = data ? Math.min(data.page * data.limit, data.total) : 0;

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <div className="flex items-end justify-between mb-6 gap-3 flex-wrap">
        <h1 className="text-2xl font-[family-name:var(--font-ultra)] font-bold text-neutral-900 dark:text-neutral-100">
          Events
          {stats && <span className="ml-3 text-base text-neutral-500 dark:text-neutral-400 font-normal">{stats.total.toLocaleString()} total</span>}
        </h1>
        <Link
          href="/admin/events/new"
          className="bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-neutral-200 dark:hover:bg-neutral-700 transition"
        >
          + New event
        </Link>
      </div>

      {/* DB-wide overview cards. Independent of the current filter so the
          admin always has the same context. Clicking a status card sets
          the corresponding filter; clicking a country / format / source
          pill below does the same. */}
      {stats && (
        <>
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <button onClick={() => update("status", "active")} className="text-left">
              <StatCard label="Active" value={(stats.byStatus.active ?? 0).toLocaleString()} />
            </button>
            <button onClick={() => update("status", "pending")} className="text-left">
              <StatCard label="Pending review" value={(stats.byStatus.pending ?? 0).toLocaleString()} />
            </button>
            <button onClick={() => update("status", "skip")} className="text-left">
              <StatCard label="Skip (filtered)" value={(stats.byStatus.skip ?? 0).toLocaleString()} />
            </button>
            <button onClick={() => update("status", "pinned")} className="text-left">
              <StatCard label="Pinned" value={(stats.byStatus.pinned ?? 0).toLocaleString()} />
            </button>
          </section>

          {/* Top-5 pill rows. Mobile-friendly (wraps gracefully); each
              pill is clickable to filter the table. The "more" indicator
              hints there are additional values not shown — those are
              still selectable via the dropdown filters below. */}
          <section className="mb-6 space-y-2">
            <PillRow
              label="Source"
              items={stats.bySource.slice(0, 8)}
              total={stats.total}
              keyFn={(x) => x.source}
              activeValue={state.source}
              onSelect={(v) => update("source", v)}
              fullCount={stats.bySource.length}
            />
            <PillRow
              label="Country"
              items={stats.byCountry.slice(0, 12)}
              total={stats.total}
              keyFn={(x) => x.country}
              activeValue={state.country}
              onSelect={(v) => update("country", v)}
              fullCount={stats.byCountry.length}
              mono
            />
            <PillRow
              label="Format"
              items={stats.byFormat.slice(0, 10)}
              total={stats.total}
              keyFn={(x) => x.format}
              activeValue={state.format}
              onSelect={(v) => update("format", v)}
              fullCount={stats.byFormat.length}
            />
          </section>
        </>
      )}

      {/* Filter controls. Mirror the URL state; changing any of them
          resets to page 1 because the result set just changed. */}
      <section className="flex flex-wrap items-center gap-2 mb-3">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search title or location…"
          className="px-3 py-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 min-w-[220px]"
        />
        <FilterSelect label="Status" value={state.status} onChange={(v) => update("status", v)} options={STATUSES as readonly string[]} />
        <FilterSelect label="Source" value={state.source} onChange={(v) => update("source", v)} options={sourceOptions} />
        <FilterSelect label="Format" value={state.format} onChange={(v) => update("format", v)} options={formatOptions} />
        {countryOptions.length > 2 && (
          <FilterSelect label="Country" value={state.country} onChange={(v) => update("country", v)} options={countryOptions} />
        )}
        {currencyOptions.length > 2 && (
          <FilterSelect label="Currency" value={state.currency} onChange={(v) => update("currency", v)} options={currencyOptions} />
        )}
        {(state.status !== "all" || state.source !== "all" || state.format !== "all" || state.country !== "all" || state.currency !== "all" || state.q) && (
          <button
            onClick={() => setState({ page: 1, status: "all", source: "all", format: "all", country: "all", currency: "all", q: "" })}
            className="text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 px-2 py-1"
          >
            Reset filters
          </button>
        )}
        <span className="ml-auto text-xs text-neutral-500 dark:text-neutral-400">
          {data && data.total > 0
            ? `Showing ${showingFrom.toLocaleString()}–${showingTo.toLocaleString()} of ${data.total.toLocaleString()}`
            : data ? "No matches" : ""}
        </span>
      </section>

      {loading && !data ? (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md overflow-hidden">
          <TableSkeleton rows={10} cols={5} />
        </div>
      ) : (
        <EventTable
          events={data?.events ?? []}
          editHref={(id) => `/admin/events/${encodeURIComponent(id)}/edit`}
          patchEndpoint={(id) => `/api/admin/events/${encodeURIComponent(id)}`}
          deleteEndpoint={(id) => `/api/admin/events/${encodeURIComponent(id)}`}
          bulkEndpoint="/api/admin/events/bulk"
          onChange={load}
        />
      )}

      {/* Pagination footer. Buttons disabled at the edges; the page
          numbers shown are the current ± 2 with first/last anchors so
          big jumps are one click. */}
      {data && totalPages > 1 && (
        <nav className="flex items-center justify-center gap-1 mt-4 flex-wrap" aria-label="Pagination">
          <PageButton disabled={state.page <= 1} onClick={() => update("page", state.page - 1)}>← Prev</PageButton>
          {paginationWindow(state.page, totalPages).map((p, i) =>
            p === "…" ? (
              <span key={`gap-${i}`} className="px-2 text-neutral-400">…</span>
            ) : (
              <PageButton key={p} active={p === state.page} onClick={() => update("page", p as number)}>{p}</PageButton>
            ),
          )}
          <PageButton disabled={state.page >= totalPages} onClick={() => update("page", state.page + 1)}>Next →</PageButton>
        </nav>
      )}
    </div>
  );
}

/** Generate a compact pagination window: first / current±2 / last with
 *  ellipses where appropriate. Stays under 10 items even at 2400+ pages. */
function paginationWindow(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const window: (number | "…")[] = [1];
  const start = Math.max(2, current - 2);
  const end = Math.min(total - 1, current + 2);
  if (start > 2) window.push("…");
  for (let i = start; i <= end; i++) window.push(i);
  if (end < total - 1) window.push("…");
  window.push(total);
  return window;
}

function PageButton({ children, onClick, disabled, active }: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-xs px-2.5 py-1 rounded-md border transition ${
        active
          ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
          : "border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

function PillRow<T>({
  label,
  items,
  total,
  keyFn,
  activeValue,
  onSelect,
  fullCount,
  mono = false,
}: {
  label: string;
  items: (T & { count: number })[];
  total: number;
  keyFn: (item: T) => string;
  activeValue: string;
  onSelect: (value: string) => void;
  fullCount: number;
  mono?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex items-baseline gap-2 flex-wrap">
      <span className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400 min-w-[60px]">{label}</span>
      {items.map((item) => {
        const k = keyFn(item);
        const active = activeValue === k;
        const pctOfTotal = total > 0 ? (item.count / total) * 100 : 0;
        return (
          <button
            key={k}
            onClick={() => onSelect(active ? "all" : k)}
            className={`text-xs px-2 py-0.5 rounded-md border transition ${mono ? "font-mono" : ""} ${
              active
                ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                : "border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            }`}
            title={`${pctOfTotal.toFixed(1)}% of all events`}
          >
            {k}
            <span className={`ml-1.5 tabular-nums ${active ? "" : "text-neutral-500 dark:text-neutral-500"}`}>{item.count.toLocaleString()}</span>
          </button>
        );
      })}
      {fullCount > items.length && (
        <span className="text-[11px] text-neutral-400 dark:text-neutral-500">+{fullCount - items.length} more</span>
      )}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: readonly string[] }) {
  return (
    <label className="text-xs text-neutral-600 dark:text-neutral-400 flex items-center gap-1">
      <span>{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm px-2 py-1 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
