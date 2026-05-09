"use client";

// Banner shown on the event detail page when the user's RSVP was
// auto-promoted from `waitlist` to `going` by someone else cancelling.
// The promotion timestamp is set in lib/event-rsvps.ts setRsvp(); we clear
// it here on dismiss so the banner only shows once per promotion.
//
// Without this banner, the user has no way to discover the promotion until
// they happen to RSVP-check the event again — which defeats the point of
// auto-promotion. Inline visible state change isn't enough either: most
// users come back to the event by following a link from the homepage and
// don't notice the RSVP segment flipped from "Waitlist · #2" to "Going".

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function WaitlistPromotedBanner({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  if (dismissed) return null;

  async function dismiss() {
    setBusy(true);
    setDismissed(true); // optimistic
    await fetch(`/api/events/${encodeURIComponent(eventId)}/rsvp/ack-promotion`, {
      method: "POST",
    }).catch(() => {
      // Network failed — leave the optimistic dismiss in place; next page
      // load will re-render the banner if the server still has promoted_at.
      // No need to roll back the UI; doing so would feel buggy.
    });
    setBusy(false);
    startTransition(() => router.refresh());
  }

  return (
    <div
      role="status"
      className="mb-6 flex items-start gap-3 rounded-md border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-3 anim-fade-in"
    >
      <span className="text-2xl leading-none shrink-0" aria-hidden>
        🎉
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
          You came off the waitlist
        </p>
        <p className="text-xs text-emerald-800 dark:text-emerald-300/90 leading-relaxed mt-0.5">
          A spot opened up and you&apos;re now in. Your RSVP was promoted from
          waitlist to going automatically — see you there.
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        disabled={busy}
        aria-label="Dismiss"
        className="shrink-0 -mr-1 -mt-1 p-1 text-emerald-700 dark:text-emerald-300 hover:text-emerald-900 dark:hover:text-emerald-200 disabled:opacity-50"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
