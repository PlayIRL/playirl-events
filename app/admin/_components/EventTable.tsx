"use client";
import { useState } from "react";
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
  // Legacy prop — kept for back-compat with the organizer events view.
  // Has no effect now that filter UI lives in the parent page; ignored.
  showSourceFilter?: boolean;
  onChange?: () => void;
}

export default function EventTable({
  events,
  editHref,
  patchEndpoint,
  deleteEndpoint,
  bulkEndpoint,
  onChange,
}: EventTableProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  // Filtering + pagination now lives in /admin/events page level — this
  // component just renders the page of rows the parent passes in. The
  // local filter UI was removed when those concerns moved server-side;
  // at 120k+ events, client-side filter dropdowns over an unbounded
  // dump don't scale.
  const filtered = events;
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
