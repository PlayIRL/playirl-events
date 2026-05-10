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
    <div className="mb-6 rounded-md border border-dashed border-neutral-200 dark:border-white/15 bg-neutral-50/60 dark:bg-white/5 p-4 space-y-3 anim-fade-in">
      {/* Section header — explicit about who sees this and why. The
          dotted border alone signaled "admin zone" but the previous
          tiny "Host" tag was easy to miss; promote to a real header
          + helper line so the host knows the controls below aren't
          public to attendees. */}
      <div className="flex items-center gap-2">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-4 h-4 text-neutral-400 dark:text-neutral-500 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 leading-tight">
            Host controls
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-tight">
            Only visible to you and admins.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/account/events/${encodeURIComponent(eventId)}/edit`}
          className="inline-flex items-center justify-center gap-1 h-7 px-2 rounded-md bg-white dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-neutral-700 dark:text-neutral-300 text-xs font-medium hover:bg-neutral-50 dark:hover:bg-white/10 transition"
        >
          Edit
        </Link>
        <Link
          href={`/account/events/${encodeURIComponent(eventId)}/attendees`}
          className="inline-flex items-center justify-center gap-1 h-7 px-2 rounded-md bg-white dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-neutral-700 dark:text-neutral-300 text-xs font-medium hover:bg-neutral-50 dark:hover:bg-white/10 transition"
        >
          Attendees
        </Link>
        {visibility === "private" && (
          <Link
            href={`/account/events/${encodeURIComponent(eventId)}/invites`}
            className="inline-flex items-center justify-center gap-1 h-7 px-2 rounded-md bg-white dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-neutral-700 dark:text-neutral-300 text-xs font-medium hover:bg-neutral-50 dark:hover:bg-white/10 transition"
          >
            Invites
          </Link>
        )}
        {!cancelled && (
          <button
            type="button"
            onClick={cancelEvent}
            disabled={busy}
            className="ml-auto inline-flex items-center justify-center gap-1 h-7 px-2 rounded-md bg-white dark:bg-white/5 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 text-xs font-medium hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50 transition cursor-pointer"
          >
            {busy ? "Cancelling…" : "Cancel event"}
          </button>
        )}
      </div>
    </div>
  );
}
