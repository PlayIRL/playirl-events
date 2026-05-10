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
      className="inline-flex items-center gap-0.5 px-1 py-px rounded-sm text-[9px] font-medium uppercase tracking-wider bg-cyan-400 text-cyan-950 dark:bg-cyan-300 dark:text-cyan-950"
    >
      <span
        aria-hidden="true"
        className="w-1 h-1 rounded-full bg-cyan-950 animate-pulse"
      />
      {!compact && "Now"}
    </span>
  );
}
