"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  eventId: string;
  initiallySaved: boolean;
  /** When true, render a tiny icon-only button (for use on dense event cards). */
  compact?: boolean;
  /** Shown when the user isn't signed in — links them to /account/login instead of toggling. */
  signedIn?: boolean;
  className?: string;
}

export default function SaveEventButton({ eventId, initiallySaved, compact = false, signedIn = true, className = "" }: Props) {
  const router = useRouter();
  const [saved, setSaved] = useState(initiallySaved);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function toggle(e: React.MouseEvent | React.KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!signedIn) {
      router.push(`/account/login?from=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    if (busy) return;
    setBusy(true);
    const next = !saved;
    setSaved(next); // optimistic
    const res = await fetch(`/api/account/saves/${encodeURIComponent(eventId)}`, {
      method: next ? "PUT" : "DELETE",
    });
    if (!res.ok) {
      setSaved(!next); // rollback
    }
    setBusy(false);
    startTransition(() => router.refresh());
  }

  const label = saved ? "Saved" : "Save";
  const title = signedIn
    ? saved
      ? "Remove from your saved events"
      : "Save to your events"
    : "Sign in to save events";

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        title={title}
        aria-label={title}
        aria-pressed={saved}
        className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition ${
          saved
            ? "text-neutral-900 dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800"
            : // On hover-capable devices (mouse/trackpad), de-emphasize the
              // unsaved icon until the row is hovered so cards stay quiet.
              // On touch (no hover), keep it visible — hover-reveal isn't
              // discoverable when there's no cursor.
              "text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 [@media(hover:hover)]:sm:opacity-0 [@media(hover:hover)]:sm:group-hover:opacity-100 [@media(hover:hover)]:sm:focus-visible:opacity-100"
        } ${busy ? "opacity-50" : ""} ${className}`}
      >
        <StarIcon filled={saved} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      title={title}
      aria-pressed={saved}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition border ${
        saved
          ? "bg-neutral-900 text-white border-neutral-900 hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:border-white dark:hover:bg-neutral-100"
          : "bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50 dark:bg-neutral-900 dark:text-neutral-200 dark:border-neutral-700 dark:hover:bg-neutral-800"
      } ${busy ? "opacity-50" : ""} ${className}`}
    >
      <StarIcon filled={saved} />
      {label}
    </button>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
