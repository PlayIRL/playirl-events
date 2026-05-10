// Visual marker for events that are happening right now — distinct from
// the "completed" past styling (greyed) and the "upcoming" default
// (full color). Used by day-card.tsx and calendar-view.tsx so the badge
// stays consistent across both surfaces.
//
// Emerald rather than red because the brand palette reserves red for
// destructive actions; emerald is already the project's positive accent
// (used for "Free" cost and the active RSVP state). Saturated fill (not
// transparent) so the pill reads at a glance against both the format
// badge beside it and the page background — earlier 15%-alpha version
// was effectively invisible against the dark theme.

export function LivePill({ compact = false }: { compact?: boolean }) {
  return (
    <span
      aria-label="Happening now"
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-extrabold uppercase tracking-wider bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-50 shadow-sm shadow-emerald-700/30 dark:shadow-emerald-900/40"
    >
      <span
        aria-hidden="true"
        className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"
      />
      {!compact && "Now"}
    </span>
  );
}
