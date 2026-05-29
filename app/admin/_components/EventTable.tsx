"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import StatusBadge from "./StatusBadge";

export interface EventRow {
  id: string;
  title: string;
  format: string;
  date: string;
  time: string;
  location: string;
  source: string;
  source_type?: string;
  status: string;
  owner_id?: string | null;
  notes?: string;
  /** ISO 3166 alpha-2 country code stamped by the scraper. Empty for legacy
   *  rows or sources without country signal — those show up under "—" in
   *  the filter so they stay reviewable. */
  country?: string;
  /** ISO 4217 currency for the entry fee. Empty for free / unknown. */
  currency?: string;
}

export interface EventTableProps {
  events: EventRow[];
  // Where to link the "edit" action — function so admin and organizer can route differently.
  editHref: (id: string) => string;
  // Endpoints used for inline status changes / delete / bulk. These are admin-only by default.
  patchEndpoint?: (id: string) => string;
  deleteEndpoint?: (id: string) => string;
  bulkEndpoint?: string;
  // Hide the "source" filter (organizer view doesn't need it).
  showSourceFilter?: boolean;
  onChange?: () => void;
}

const STATUSES = ["all", "active", "skip", "pinned", "pending"] as const;

export default function EventTable({
  events,
  editHref,
  patchEndpoint,
  deleteEndpoint,
  bulkEndpoint,
  showSourceFilter = true,
  onChange,
}: EventTableProps) {
  const [statusFilter, setStatusFilter] = useState<(typeof STATUSES)[number]>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [formatFilter, setFormatFilter] = useState<string>("all");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [currencyFilter, setCurrencyFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const sources = useMemo(() => {
    const set = new Set(events.map((e) => e.source).filter(Boolean));
    return ["all", ...Array.from(set).sort()];
  }, [events]);
  const formats = useMemo(() => {
    const set = new Set(events.map((e) => e.format).filter(Boolean));
    return ["all", ...Array.from(set).sort()];
  }, [events]);
  // Country + currency filter options: bucket blanks under "—" so admins
  // can isolate rows that the scraper couldn't stamp. Auto-populated from
  // present data so the dropdown only shows what's actually in the table —
  // a US-only DB doesn't bloat the filter with 25 unused country codes.
  const countries = useMemo(() => {
    const set = new Set(events.map((e) => e.country || "—"));
    return ["all", ...Array.from(set).sort()];
  }, [events]);
  const currencies = useMemo(() => {
    const set = new Set(events.map((e) => e.currency || "—"));
    return ["all", ...Array.from(set).sort()];
  }, [events]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return events.filter((e) => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (showSourceFilter && sourceFilter !== "all" && e.source !== sourceFilter) return false;
      if (formatFilter !== "all" && e.format !== formatFilter) return false;
      if (countryFilter !== "all" && (e.country || "—") !== countryFilter) return false;
      if (currencyFilter !== "all" && (e.currency || "—") !== currencyFilter) return false;
      if (q && !`${e.title} ${e.location}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [events, statusFilter, sourceFilter, formatFilter, countryFilter, currencyFilter, query, showSourceFilter]);

  const allSelected = filtered.length > 0 && filtered.every((e) => selected.has(e.id));

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((e) => e.id)));
    }
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function changeStatus(id: string, status: string) {
    if (!patchEndpoint) return;
    setBusy(true);
    await fetch(patchEndpoint(id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusy(false);
    onChange?.();
  }

  async function deleteOne(id: string) {
    if (!deleteEndpoint) return;
    if (!confirm("Delete this event?")) return;
    setBusy(true);
    await fetch(deleteEndpoint(id), { method: "DELETE" });
    setSelected((prev) => {
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
    setBusy(false);
    onChange?.();
  }

  async function bulkAction(action: "pin" | "skip" | "activate" | "delete") {
    if (!bulkEndpoint || selected.size === 0) return;
    if (action === "delete" && !confirm(`Delete ${selected.size} event(s)?`)) return;
    setBusy(true);
    await fetch(bulkEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selected), action }),
    });
    setSelected(new Set());
    setBusy(false);
    onChange?.();
  }

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md overflow-hidden">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center p-3 border-b border-neutral-200 dark:border-neutral-700">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title or location…"
          className="px-3 py-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 min-w-[200px]"
        />
        <FilterSelect label="Status" value={statusFilter} onChange={(v) => setStatusFilter(v as typeof statusFilter)} options={STATUSES as readonly string[]} />
        {showSourceFilter && (
          <FilterSelect label="Source" value={sourceFilter} onChange={setSourceFilter} options={sources} />
        )}
        <FilterSelect label="Format" value={formatFilter} onChange={setFormatFilter} options={formats} />
        {/* Country + currency filters only render when there's more than one
            distinct value present in the dataset (i.e. the "all" sentinel
            plus at least one real value). Keeps the bar tidy on US-only
            installs and only blooms once intl scraping is on. */}
        {countries.length > 2 && (
          <FilterSelect label="Country" value={countryFilter} onChange={setCountryFilter} options={countries} />
        )}
        {currencies.length > 2 && (
          <FilterSelect label="Currency" value={currencyFilter} onChange={setCurrencyFilter} options={currencies} />
        )}
        <span className="ml-auto text-xs text-neutral-500 dark:text-neutral-400">
          {filtered.length} of {events.length}
        </span>
      </div>

      {/* Bulk action bar */}
      {bulkEndpoint && (
        <div className={`flex gap-2 items-center p-3 border-b border-neutral-200 dark:border-neutral-700 transition ${selected.size === 0 ? "opacity-50" : ""}`}>
          <span className="text-xs text-neutral-600 dark:text-neutral-400 mr-2">{selected.size} selected</span>
          <BulkButton onClick={() => bulkAction("activate")} disabled={selected.size === 0 || busy}>Activate</BulkButton>
          <BulkButton onClick={() => bulkAction("pin")} disabled={selected.size === 0 || busy}>Pin</BulkButton>
          <BulkButton onClick={() => bulkAction("skip")} disabled={selected.size === 0 || busy}>Skip</BulkButton>
          <BulkButton onClick={() => bulkAction("delete")} disabled={selected.size === 0 || busy} variant="danger">Delete</BulkButton>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-800 text-xs text-neutral-500 dark:text-neutral-400">
            <tr>
              {bulkEndpoint && (
                <th className="px-3 py-2 w-10">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" />
                </th>
              )}
              <th className="text-left px-3 py-2">Event</th>
              <th className="text-left px-3 py-2 hidden md:table-cell">Date / Location</th>
              <th className="text-left px-3 py-2 hidden lg:table-cell">Source</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-right px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {filtered.map((ev) => (
              <tr key={ev.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                {bulkEndpoint && (
                  <td className="px-3 py-2 align-top">
                    <input type="checkbox" checked={selected.has(ev.id)} onChange={() => toggleOne(ev.id)} aria-label={`Select ${ev.title}`} />
                  </td>
                )}
                <td className="px-3 py-2 align-top">
                  <div className="font-medium text-neutral-900 dark:text-neutral-100">{ev.title || <em className="text-neutral-400">(untitled)</em>}</div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 flex gap-2 flex-wrap">
                    {ev.format && <span className="bg-neutral-100 dark:bg-neutral-800 px-1.5 rounded-md">{ev.format}</span>}
                    {ev.source_type && ev.source_type !== "scraper" && (
                      <span className="bg-neutral-100 dark:bg-white/[0.06] text-neutral-700 dark:text-neutral-300 px-1.5 rounded-md">{ev.source_type}</span>
                    )}
                    {/* Country chip — only renders when populated so US-era
                        rows + sources without country signal don't get a
                        useless dash. Currency renders adjacent so admins
                        can spot the JPY-priced events at a glance during
                        a quick scroll. */}
                    {ev.country && (
                      <span className="bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300 px-1.5 rounded-md font-mono tabular-nums">
                        {ev.country}
                      </span>
                    )}
                    {ev.currency && ev.currency !== "USD" && (
                      <span className="bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 px-1.5 rounded-md font-mono tabular-nums">
                        {ev.currency}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 align-top hidden md:table-cell text-neutral-600 dark:text-neutral-400">
                  <div>{ev.date} {ev.time}</div>
                  <div className="text-xs">{ev.location}</div>
                </td>
                <td className="px-3 py-2 align-top hidden lg:table-cell text-xs text-neutral-500 dark:text-neutral-400">
                  {ev.source}
                </td>
                <td className="px-3 py-2 align-top">
                  {patchEndpoint ? (
                    <select
                      value={ev.status}
                      onChange={(e) => changeStatus(ev.id, e.target.value)}
                      disabled={busy}
                      className="text-xs px-2 py-1 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                    >
                      <option value="active">active</option>
                      <option value="skip">skip</option>
                      <option value="pinned">pinned</option>
                      <option value="pending">pending</option>
                    </select>
                  ) : (
                    <StatusBadge status={ev.status} />
                  )}
                </td>
                <td className="px-3 py-2 align-top text-right whitespace-nowrap">
                  <Link
                    href={editHref(ev.id)}
                    className="text-xs text-neutral-900 dark:text-white hover:underline mr-3"
                  >
                    Edit
                  </Link>
                  {deleteEndpoint && (
                    <button
                      onClick={() => deleteOne(ev.id)}
                      disabled={busy}
                      className="text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={bulkEndpoint ? 6 : 5} className="text-center text-sm text-neutral-500 dark:text-neutral-400 py-8">
                  No events match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

function BulkButton({ onClick, disabled, variant, children }: { onClick: () => void; disabled?: boolean; variant?: "danger"; children: React.ReactNode }) {
  const cls = variant === "danger"
    ? "border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
    : "border-neutral-300 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-xs px-3 py-1 rounded-md border disabled:opacity-50 transition ${cls}`}
    >
      {children}
    </button>
  );
}
