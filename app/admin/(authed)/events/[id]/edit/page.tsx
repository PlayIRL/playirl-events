import { notFound } from "next/navigation";
import Link from "next/link";
import { getEvent } from "@/lib/events";
import EventForm from "../../../../_components/EventForm";

export const dynamic = "force-dynamic";

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = getEvent(id);
  if (!event) notFound();

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-[family-name:var(--font-ultra)] font-bold text-neutral-900 dark:text-neutral-100">
          Edit event
        </h1>
        <Link href="/admin/events" className="text-sm text-neutral-900 dark:text-white hover:underline">
          ← Back to events
        </Link>
      </div>
      <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
        {event.id} · {event.source}{event.source_type ? ` · ${event.source_type}` : ""}
      </p>
      <EventForm
        endpoint={`/api/admin/events/${encodeURIComponent(event.id)}`}
        method="PATCH"
        redirectTo="/admin/events"
        initial={{
          title: event.title,
          format: event.format,
          date: event.date,
          time: event.time,
          timezone: event.timezone,
          location: event.location,
          address: event.address,
          cost: event.cost,
          store_url: event.store_url,
          detail_url: event.detail_url,
          latitude: event.latitude != null ? String(event.latitude) : "",
          longitude: event.longitude != null ? String(event.longitude) : "",
          status: event.status,
          notes: event.notes,
          image_url: event.image_url ?? "",
          capacity: event.capacity != null ? String(event.capacity) : "",
          rsvp_enabled: event.rsvp_enabled === 1,
          visibility: event.visibility,
        }}
      />
    </div>
  );
}
