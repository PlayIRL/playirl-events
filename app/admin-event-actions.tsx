"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Inline admin moderation controls that render on public event cards when the
 * viewer has an admin session. Each action POSTs to /api/admin/events/bulk and
 * refreshes the page on success. Stops propagation so the parent Link isn't
 * followed when the admin clicks a control.
 */
export default function AdminEventActions({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function act(e: React.MouseEvent, action: "pin" | "skip" | "delete") {
    e.preventDefault();
    e.stopPropagation();
    if (action === "delete" && !confirm("Delete this event? This cannot be undone.")) return;
    setBusy(action);
    await fetch("/api/admin/events/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [eventId], action }),
    });
    setBusy(null);
    startTransition(() => router.refresh());
  }

  return (
    <span
      className="ml-0.5 flex items-center gap-0.5 pl-1 border-l border-neutral-200 dark:border-white/10"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={(e) => act(e, "pin")}
        disabled={busy !== null}
        title="Pin event (admin)"
        aria-label="Pin event"
        className="w-6 h-6 rounded-md flex items-center justify-center text-neutral-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10 disabled:opacity-50"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v7" />
          <path d="M5 9h14l-2 6H7z" />
          <path d="M12 15v7" />
        </svg>
      </button>
      <button
        type="button"
        onClick={(e) => act(e, "skip")}
        disabled={busy !== null}
        title="Hide event (skip, admin)"
        aria-label="Hide event"
        className="w-6 h-6 rounded-md flex items-center justify-center text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C6 20 2 12 2 12a19.77 19.77 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c6 0 10 8 10 8a19.77 19.77 0 0 1-3.12 4.34" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      </button>
      <button
        type="button"
        onClick={(e) => act(e, "delete")}
        disabled={busy !== null}
        title="Delete event (admin)"
        aria-label="Delete event"
        className="w-6 h-6 rounded-md flex items-center justify-center text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-2 14H7L5 6" />
          <path d="M10 11v6M14 11v6" />
        </svg>
      </button>
    </span>
  );
}
