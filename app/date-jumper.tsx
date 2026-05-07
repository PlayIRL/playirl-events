"use client";

// Quick navigation for users who want to skim future dates without
// click-click-click through "Next week". Two controls in one row:
//
//   1. A native date input — pick any future date, the page jumps there
//      via the offset query param (offset = days from today).
//   2. A "Back to this week" pill — only renders when offset > 0, and
//      clears the offset so users don't have to scroll back through
//      the list to return to today.

import { useRouter, useSearchParams } from "next/navigation";

interface Props {
  currentOffset: number;
}

export default function DateJumper({ currentOffset }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);

  // What's currently selected in the date input — render the day the
  // current offset lands on so the input shows where the user is.
  const selectedDate = new Date(today);
  selectedDate.setDate(selectedDate.getDate() + currentOffset);
  const selectedStr = selectedDate.toISOString().slice(0, 10);

  function jumpTo(dateStr: string) {
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d.getTime())) return;
    const days = Math.max(0, Math.round((d.getTime() - today.getTime()) / 86_400_000));
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    if (days === 0) next.delete("offset");
    else next.set("offset", String(days));
    router.push(`?${next.toString()}`);
    // Same-path query changes don't bust the App Router cache; refresh()
    // forces the server component to re-run so the events list updates.
    router.refresh();
  }

  function backToThisWeek() {
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    next.delete("offset");
    router.push(next.toString() ? `?${next.toString()}` : "/");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <input
        type="date"
        value={selectedStr}
        min={todayStr}
        onChange={e => jumpTo(e.target.value)}
        aria-label="Jump to date"
        className="px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-400/40 dark:focus:ring-white/20"
      />
      {currentOffset > 0 && (
        <button
          type="button"
          onClick={backToThisWeek}
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md bg-neutral-100 dark:bg-white/[0.06] border border-neutral-100 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs font-medium hover:bg-neutral-200 dark:hover:bg-white/[0.1] hover:text-neutral-900 dark:hover:text-white transition cursor-pointer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to this week
        </button>
      )}
    </div>
  );
}
