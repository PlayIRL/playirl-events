"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { CardListSkeleton } from "@/app/skeleton";

interface EventRow {
  id: string;
  title: string;
  format: string;
  date: string;
  time: string;
  location: string;
  cost: string;
  status: string;
  notes: string;
  capacity: number | null;
  rsvp_enabled: number;
  rejected_at: string | null;
  rejection_reason: string;
}

export default function MyEventsList() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/account/events");
    setEvents(res.ok ? await res.json() : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(id: string) {
    if (!confirm("Delete this event? This cannot be undone.")) return;
    setBusyId(id);
    await fetch(`/api/account/events/${encodeURIComponent(id)}`, { method: "DELETE" });
    setBusyId(null);
    load();
  }

  const today = new Date().toISOString().slice(0, 10);
  // Rejected events are status='skip' with rejected_at stamped — split them
  // out of the past/upcoming buckets so the host sees them as a distinct
  // section with the admin's reason rather than mixed into "Past."
  const rejected = events.filter((e) => e.rejected_at);
  const pending = events.filter((e) => !e.rejected_at && e.status === "pending");
  const upcoming = events.filter((e) => !e.rejected_at && e.status !== "pending" && e.date >= today);
  const past = events.filter((e) => !e.rejected_at && e.status !== "pending" && e.date < today);

  if (loading) return <CardListSkeleton rows={3} />;

  if (events.length === 0) {
    return (
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md p-8 text-center">
        <p className="text-4xl mb-3">📝</p>
        <p className="text-neutral-500 dark:text-neutral-400 text-sm">You haven't created any events yet.</p>
        <Link
          href="/account/events/new"
          className="inline-block mt-3 text-sm text-neutral-900 dark:text-white hover:underline"
        >
          Submit your first one →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <Section
          title="Pending admin review"
          count={pending.length}
          hint="These aren't visible on the public calendar yet."
          events={pending}
          busyId={busyId}
          onRemove={remove}
        />
      )}
      {rejected.length > 0 && (
        <Section
          title="Rejected"
          count={rejected.length}
          hint="An admin declined these. The reason is shown on each card — fix the issue and submit a new event if it's something you can correct."
          events={rejected}
          busyId={busyId}
          onRemove={remove}
          showRejection
        />
      )}
      {upcoming.length > 0 && (
        <Section title="Upcoming" count={upcoming.length} events={upcoming} busyId={busyId} onRemove={remove} />
      )}
      {past.length > 0 && <Section title="Past" count={past.length} events={past} busyId={busyId} onRemove={remove} dim />}
    </div>
  );
}

function Section({
  title,
  count,
  hint,
  events,
  busyId,
  onRemove,
  dim = false,
  showRejection = false,
}: {
  title: string;
  count: number;
  hint?: string;
  events: EventRow[];
  busyId: string | null;
  onRemove: (id: string) => void;
  dim?: boolean;
  /** When true, render rejection_reason inline beneath each row. */
  showRejection?: boolean;
}) {
  return (
    <section>
      <div className="mb-2">
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          {title} <span className="text-xs font-normal text-neutral-500 dark:text-neutral-400">· {count}</span>
        </h2>
        {hint && <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">{hint}</p>}
      </div>
      <ul
        className={`bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md divide-y divide-neutral-100 dark:divide-neutral-800 ${
          dim ? "opacity-70" : ""
        }`}
      >
        {events.map((e) => (
          <li key={e.id} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {e.date}
                  {e.time ? ` · ${e.time}` : ""}
                </span>
                <span className="font-medium text-neutral-900 dark:text-neutral-100 truncate">
                  {e.title || <em className="text-neutral-400">(untitled)</em>}
                </span>
                {e.format && (
                  <span className="text-[10px] bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 px-1.5 rounded-md">
                    {e.format}
                  </span>
                )}
                <StatusPill status={e.rejected_at ? "rejected" : e.status} />
              </div>
              {e.location && (
                <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">📍 {e.location}</div>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              {e.rsvp_enabled === 1 && (
                <Link
                  href={`/account/events/${encodeURIComponent(e.id)}/attendees`}
                  className="text-xs px-3 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  Attendees
                </Link>
              )}
              <Link
                href={`/account/events/${encodeURIComponent(e.id)}/edit`}
                className="text-xs px-3 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                Edit
              </Link>
              <button
                onClick={() => onRemove(e.id)}
                disabled={busyId === e.id}
                className="text-xs px-3 py-1.5 rounded-md border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
            </div>
            {showRejection && e.rejected_at && (
              <div className="ml-0 sm:ml-2 rounded-md border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 text-red-900 dark:text-red-200 text-xs px-3 py-2">
                <p className="font-semibold">Admin's note:</p>
                <p className="leading-relaxed whitespace-pre-wrap">
                  {e.rejection_reason || "No reason given."}
                </p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    active: {
      label: "Live",
      cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
    },
    pinned: {
      label: "Pinned",
      cls: "bg-neutral-100 text-neutral-700 border-neutral-200 dark:bg-white/[0.06] dark:text-neutral-300 dark:border-white/15",
    },
    pending: {
      label: "Pending review",
      cls: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
    },
    rejected: {
      label: "Rejected",
      cls: "bg-red-50 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
    },
    skip: {
      label: "Hidden",
      cls: "bg-neutral-100 text-neutral-600 border-neutral-300 dark:bg-neutral-800 dark:text-neutral-400 dark:border-neutral-700",
    },
  };
  const style = map[status] ?? map.active;
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-md border ${style.cls}`}>{style.label}</span>;
}
