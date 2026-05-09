"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import EventTable, { type EventRow } from "../../_components/EventTable";
import { TableSkeleton } from "@/app/skeleton";

export default function AdminEventsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/events");
    setEvents(res.ok ? await res.json() : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <div className="flex items-end justify-between mb-6">
        <h1 className="text-2xl font-[family-name:var(--font-ultra)] font-bold text-neutral-900 dark:text-neutral-100">
          Events
        </h1>
        <Link
          href="/admin/events/new"
          className="bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-4 py-2 rounded-md text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition"
        >
          + New event
        </Link>
      </div>

      {loading ? (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md overflow-hidden">
          <TableSkeleton rows={8} cols={5} />
        </div>
      ) : (
        <EventTable
          events={events}
          editHref={(id) => `/admin/events/${encodeURIComponent(id)}/edit`}
          patchEndpoint={(id) => `/api/admin/events/${encodeURIComponent(id)}`}
          deleteEndpoint={(id) => `/api/admin/events/${encodeURIComponent(id)}`}
          bulkEndpoint="/api/admin/events/bulk"
          onChange={load}
        />
      )}
    </div>
  );
}
