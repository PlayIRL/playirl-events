// Loading placeholders used while client-fetched data is in flight. Three
// presets cover the shapes we render: a generic block (`Skeleton`), an
// admin-table outline (`TableSkeleton`), and a stacked-card outline
// (`CardListSkeleton`). Replaces bare "Loading…" text — feedback closer
// to the eventual layout reduces the perceived wait + minimizes layout
// shift when real rows arrive.
//
// Animations honor `prefers-reduced-motion`: Tailwind's `animate-pulse`
// already does the right thing (its keyframes are paused under
// `prefers-reduced-motion: reduce`), so no extra logic needed.

interface SkeletonProps {
  /** Tailwind classes; usually a width (`w-24`, `w-1/3`) and height (`h-3`). */
  className?: string;
}

export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-800 ${className}`}
      aria-hidden="true"
    />
  );
}

interface TableSkeletonProps {
  rows?: number;
  cols?: number;
}

/** Admin-table loading state. Renders a header row + N body rows of
 *  shimmer blocks at the same widths real cells would occupy. */
export function TableSkeleton({ rows = 8, cols = 4 }: TableSkeletonProps) {
  return (
    <div className="p-4 space-y-3" aria-busy="true" aria-live="polite">
      <div className="flex gap-4 pb-2 border-b border-neutral-100 dark:border-white/8">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

interface CardListSkeletonProps {
  rows?: number;
}

/** Stacked-card loading state. Used by the account / personal-feed pages
 *  (My Events, Saved, Sources) where the eventual UI is a vertical list
 *  of bordered cards rather than a grid. */
export function CardListSkeleton({ rows = 3 }: CardListSkeletonProps) {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md p-4 space-y-2"
        >
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

interface FormSkeletonProps {
  fields?: number;
}

/** Form loading state — used on admin config / flags pages where the
 *  eventual layout is a series of label+control rows. */
export function FormSkeleton({ fields = 5 }: FormSkeletonProps) {
  return (
    <div className="space-y-4 p-4" aria-busy="true" aria-live="polite">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}
