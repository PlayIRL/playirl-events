// Visual marker for events that are happening right now — distinct from
// the "completed" past styling (greyed) and the "upcoming" default
// (full color). Used by day-card.tsx and calendar-view.tsx so the badge
// stays consistent across both surfaces.
//
// Emerald rather than red because the brand palette reserves red for
// destructive actions; emerald is already the project's positive accent
// (used for "Free" cost and the active RSVP state).

export function LivePill({ compact = false }: { compact?: boolean }) {
  return (
    <span
      aria-label="Happening now"
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30"
    >
      <span
        aria-hidden="true"
        className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse"
      />
      {!compact && "Live"}
    </span>
  );
}
