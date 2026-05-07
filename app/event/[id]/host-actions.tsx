"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * Bar of host-only controls that floats above the rest of the event card —
 * cancel, manage invites, edit. Visibility is gated server-side; this
 * component just renders the buttons when the host loads their own event.
 */
export default function HostActions({
  eventId,
  cancelled,
  visibility,
}: {
  eventId: string;
  cancelled: boolean;
  visibility: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function cancelEvent() {
    if (
      !confirm(
        "Cancel this event?\n\n• A 'cancelled' banner will replace the RSVP controls.\n• All current RSVPs will be marked cancelled.\n• The event stays visible to attendees so they can confirm.\n\nThis can't be un-done from the UI.",
      )
    ) {
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/account/events/${encodeURIComponent(eventId)}/cancel`, {
      method: "POST",
    });
    setBusy(false);
    if (res.ok) {
      startTransition(() => router.refresh());
    } else {
      const json = await res.json().catch(() => ({}));
      alert(`Couldn't cancel: ${json.error ?? res.status}`);
    }
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-neutral-200 dark:border-white/15 bg-neutral-50/60 dark:bg-white/5 px-3 py-2 anim-fade-in">
      <span className="text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 mr-1">
        Host
      </span>
      <Link
        href={`/account/events/${encodeURIComponent(eventId)}/edit`}
        className="inline-flex items-center justify-center gap-1 h-7 px-2 rounded-lg bg-white dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-neutral-700 dark:text-neutral-300 text-xs font-medium hover:bg-neutral-50 dark:hover:bg-white/10 transition"
      >
        Edit
      </Link>
      <Link
        href={`/account/events/${encodeURIComponent(eventId)}/attendees`}
        className="inline-flex items-center justify-center gap-1 h-7 px-2 rounded-lg bg-white dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-neutral-700 dark:text-neutral-300 text-xs font-medium hover:bg-neutral-50 dark:hover:bg-white/10 transition"
      >
        Attendees
      </Link>
      {visibility === "private" && (
        <Link
          href={`/account/events/${encodeURIComponent(eventId)}/invites`}
          className="inline-flex items-center justify-center gap-1 h-7 px-2 rounded-lg bg-white dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-neutral-700 dark:text-neutral-300 text-xs font-medium hover:bg-neutral-50 dark:hover:bg-white/10 transition"
        >
          Invites
        </Link>
      )}
      {!cancelled && (
        <button
          type="button"
          onClick={cancelEvent}
          disabled={busy}
          className="ml-auto inline-flex items-center justify-center gap-1 h-7 px-2 rounded-lg bg-white dark:bg-white/5 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 text-xs font-medium hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50 transition cursor-pointer"
        >
          {busy ? "Cancelling…" : "Cancel event"}
        </button>
      )}
    </div>
  );
}
