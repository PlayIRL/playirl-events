// Visual marker for events that are happening right now — distinct from
// the "completed" past styling (greyed) and the "upcoming" default
// (full color). Used by day-card.tsx and calendar-view.tsx so the badge
// stays consistent across both surfaces.
//
// Bright sky-blue with a colored glow shadow for a neon feel — sits
// above the event time so the "happening now" cue reads as a status
// flag, not as another inline tag.

export function LivePill({ compact = false }: { compact?: boolean }) {
  return (
    <span
      aria-label="Happening now"
      className="inline-flex items-center gap-0.5 px-1 py-px rounded-sm text-[9px] font-extrabold uppercase tracking-wider bg-sky-500 text-white shadow-[0_0_8px_rgba(14,165,233,0.55)] dark:bg-sky-400 dark:text-sky-950 dark:shadow-[0_0_10px_rgba(56,189,248,0.6)]"
    >
      <span
        aria-hidden="true"
        className="w-1 h-1 rounded-full bg-white dark:bg-sky-950 animate-pulse"
      />
      {!compact && "Now"}
    </span>
  );
}
