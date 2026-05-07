import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/session";
import { getEvent } from "@/lib/events";
import { listInvites } from "@/lib/event-invites";
import SubpageShell from "../../../_components/SubpageShell";
import InvitesManager from "./InvitesManager";

export const dynamic = "force-dynamic";

/**
 * Host-only invite manager. Lets the host generate share-link tokens
 * (each one is a `?token=…` URL that bypasses the visibility gate on the
 * event detail page) and revoke them.
 *
 * Public events don't need invites — the page still renders so the host
 * can switch visibility first if they got here by accident.
 */
export default async function InvitesPage({
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

  const invites = listInvites(id);

  return (
    <SubpageShell
      title="Invites"
      description={
        <>
          <Link href={`/event/${encodeURIComponent(id)}`} className="underline hover:text-neutral-700 dark:hover:text-neutral-300">{event.title}</Link>{" "}
          · {event.date}{event.time ? ` · ${event.time}` : ""}
        </>
      }
      maxWidth="max-w-3xl"
    >
      {event.visibility === "public" && (
        <div className="rounded-md border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          This event is currently <strong>public</strong>. Anyone can already view it
          without an invite. Switch to <strong>Private</strong> on the{" "}
          <Link href={`/account/events/${encodeURIComponent(id)}/edit`} className="underline">edit page</Link>{" "}
          first if you want to gate access.
        </div>
      )}

      <InvitesManager eventId={id} initialInvites={invites} />
    </SubpageShell>
  );
}
