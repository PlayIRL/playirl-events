"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import EventTable, { type EventRow } from "@/app/admin/_components/EventTable";

// Client wrapper around the admin EventTable, hydrated with the SSR-rendered
// initial events list. After any inline status change / bulk action / delete,
// router.refresh() re-runs the server query — keeping this list in sync with
// the per-venue getEventsForVenue() call upstream.

export default function VenueEventsTable({ initial }: { initial: EventRow[] }) {
  const router = useRouter();
  const [events, setEvents] = useState<EventRow[]>(initial);

  // Keep local state in sync when the server prop changes (router.refresh).
  useEffect(() => {
    setEvents(initial);
  }, [initial]);

  const onChange = useCallback(() => {
    router.refresh();
  }, [router]);

  return (
    <EventTable
      events={events}
      editHref={(id) => `/admin/events/${encodeURIComponent(id)}/edit`}
      patchEndpoint={(id) => `/api/admin/events/${encodeURIComponent(id)}`}
      deleteEndpoint={(id) => `/api/admin/events/${encodeURIComponent(id)}`}
      bulkEndpoint="/api/admin/events/bulk"
      // Source filter isn't very interesting on a per-venue page (most rows
      // share the same scraper source) — keep it on for completeness but
      // could hide it if it adds noise.
      showSourceFilter={true}
      onChange={onChange}
    />
  );
}
