import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/session";
import { getEvent } from "@/lib/events";
import { getAttendees } from "@/lib/event-rsvps";
import SubpageShell from "../../../_components/SubpageShell";
import AttendeesCsvButton from "./AttendeesCsvButton";

export const dynamic = "force-dynamic";

/**
 * Host-only attendee roster. Same ownership-check semantics as the
 * per-event PATCH/DELETE endpoint — admins bypass; everyone else must
 * own the event.
 */
export default async function AttendeesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole(["user", "organizer", "admin"]);
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const event = getEvent(id);
  if (!event) return notFound();
  if (user.role !== "admin" && event.owner_id !== user.id) return notFound();

  const attendees = getAttendees(id);
  const going = attendees.filter((a) => a.status === "going");
  const maybe = attendees.filter((a) => a.status === "maybe");
  const cancelled = attendees.filter((a) => a.status === "cancelled");
  const capacityLabel = event.capacity != null ? ` / ${event.capacity}` : "";

  return (
    <SubpageShell
      title="Attendees"
      description={
        <>
          <Link href={`/event/${encodeURIComponent(id)}`} className="underline hover:text-neutral-700 dark:hover:text-neutral-300">{event.title}</Link>{" "}
          · {event.date}{event.time ? ` · ${event.time}` : ""}
        </>
      }
      maxWidth="max-w-3xl"
      actions={<AttendeesCsvButton eventId={id} eventTitle={event.title} attendees={attendees} />}
    >
      <Section title={`Going · ${going.length}${capacityLabel}`} rows={going} emptyText="No one's RSVP'd yet." />
      {maybe.length > 0 && <Section title={`Maybe · ${maybe.length}`} rows={maybe} />}
      {cancelled.length > 0 && (
        <Section title={`Cancelled · ${cancelled.length}`} rows={cancelled} muted />
      )}
    </SubpageShell>
  );
}

function Section({
  title,
  rows,
  emptyText,
  muted = false,
}: {
  title: string;
  rows: { user_id: string; email: string; name: string | null; created_at: string }[];
  emptyText?: string;
  muted?: boolean;
}) {
  return (
    <section className={muted ? "opacity-60" : undefined}>
      <h2 className="text-xs text-neutral-500 dark:text-neutral-400 font-semibold mb-2">
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400 italic">{emptyText ?? "—"}</p>
      ) : (
        <ul className="divide-y divide-neutral-100 dark:divide-white/8 border border-neutral-100 dark:border-white/8 rounded-lg overflow-hidden">
          {rows.map((r) => (
            <li key={r.user_id} className="px-4 py-2.5 flex items-baseline justify-between gap-3 bg-white dark:bg-neutral-900">
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                  {r.name ?? r.email.split("@")[0]}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{r.email}</p>
              </div>
              <time className="text-[11px] text-neutral-500 dark:text-neutral-400 tabular-nums shrink-0">
                {r.created_at.replace(" ", " · ")}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
