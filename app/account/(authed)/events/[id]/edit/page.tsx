import { notFound } from "next/navigation";
import { getEvent } from "@/lib/events";
import { requireRole } from "@/lib/session";
import EventForm from "../../../../../admin/_components/EventForm";
import SubpageShell from "../../../_components/SubpageShell";
import DiscordEventsPanel from "./DiscordEventsPanel";

export const dynamic = "force-dynamic";

export default async function AccountEditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(["user", "organizer", "admin"]);
  const { id } = await params;
  const event = getEvent(id);
  if (!event) notFound();
  if (user.role !== "admin" && event.owner_id !== user.id) notFound();

  return (
    <SubpageShell title="Edit event" maxWidth="max-w-3xl">
      <EventForm
        endpoint={`/api/account/events/${encodeURIComponent(event.id)}`}
        method="PATCH"
        redirectTo="/account/events"
        showStatus={false}
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
      <DiscordEventsPanel eventId={event.id} />
    </SubpageShell>
  );
}
