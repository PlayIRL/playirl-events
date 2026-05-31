// Server component — no hooks, no event handlers. SaveEventButton and
// AdminEventActions stay as client components nested inside; their
// "use client" directives make them hydration islands. Removing
// "use client" here drops ~215 events × DayCard hydration cost on
// the homepage, which was the bulk of the perceived "slow to spring
// to life" delay on initial load.
import Image from "next/image";
import Link from "next/link";
import { FORMAT_BADGE, FORMAT_BADGE_DEFAULT, RCQ_BADGE, isRcq, showFormatBadge } from "@/lib/format-style";
import { eventDisplayStatus, formatEventTime, formatEventTimeParts, pickEventTimezone } from "@/lib/format-time";
import { formatDistance, haversineMiles, type DistanceUnit } from "@/lib/distance";
import SaveEventButton from "./save-event-button";
import AdminEventActions from "./admin-event-actions";

interface EventRow {
  id: string;
  title: string;
  format: string;
  date: string;
  time: string;
  timezone: string;
  location: string;
  cost: string;
  latitude: number | null;
  longitude: number | null;
  /** Pre-resolved image URL (uploaded photo, scraped cover, venue default, or placeholder). */
  imageUrl: string;
  /** Suggested object-fit for this image — "cover" crops photos to fill;
   *  "contain" letterboxes logos and SVG icons so they aren't mangled. */
  imageFit: "cover" | "contain";
}

export default function DayCard({
  date,
  weekday,
  isToday,
  isPast,
  events,
  headingLabel,
  staggerBase = 0,
  signedIn = false,
  isAdmin = false,
  savedEventIds,
  userLat = null,
  userLng = null,
  fakeLiveEventIds,
  distanceUnit = "mi",
}: {
  date: string;
  weekday: string;
  isToday: boolean;
  isPast: boolean;
  events: EventRow[];
  headingLabel?: string;
  staggerBase?: number;
  signedIn?: boolean;
  isAdmin?: boolean;
  savedEventIds?: Set<string>;
  /** Viewer's "from" coordinates. Null when no user signal exists (default
   *  Philly center) — distance is hidden in that case to avoid showing a
   *  meaningless number. */
  userLat?: number | null;
  userLng?: number | null;
  /** Dev-only: any event whose ID is in this set is forced to render as
   *  in_progress so the live treatment can be previewed without waiting
   *  for real in-progress events. Wired through page.tsx behind a
   *  NODE_ENV check — production passes an empty set. */
  fakeLiveEventIds?: Set<string>;
  /** Viewer's preferred unit. Server-resolved from the IP country (US/UK ->
   *  "mi", everyone else -> "km"). Defaults to "mi" for back-compat in
   *  callers that haven't threaded it yet. */
  distanceUnit?: DistanceUnit;
}) {
  // Wrapper: visible from first paint, no entrance animation. Previously
  // the wrapper was gated behind hydration + IntersectionObserver +
  // setTimeout, so every card started invisible until JS executed —
  // that gate is what made the page feel slow to "spring to life."
  // Per-row fade-in still runs (anim-row-in below) for subtle polish
  // on initial paint and re-renders.
  const frameBorder = isToday
    ? "border-2 border-neutral-200 dark:border-white/10"
    : "border border-neutral-300 dark:border-white/15";

  return (
    <div className={isPast && !isToday ? "opacity-70" : ""}>
      {/* Single bordered frame around heading + rows. overflow-clip clips
          children to the rounded corners without creating a scroll
          container, so the sticky heading still anchors to the viewport
          (overflow-hidden would break that). */}
      <div className={`overflow-clip rounded-lg divide-y divide-neutral-200 dark:divide-white/10 bg-white dark:bg-neutral-900 ${frameBorder}`}>
        <div
          className={`sticky top-[var(--sticky-bar-h,0px)] z-[5] flex items-center gap-2.5 px-4 py-4 ${
            isToday
              ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white"
              : "bg-white dark:bg-neutral-900"
          }`}
        >
          <span className={`text-base font-mono font-normal tabular-nums tracking-[0.01em] ${isToday ? "" : "text-neutral-900 dark:text-neutral-100"}`}>
            {headingLabel || weekday}
          </span>
          {events.length > 0 && (
            <span
              aria-label={`${events.length} event${events.length === 1 ? "" : "s"}`}
              className={`inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-bold font-mono tabular-nums ${
                isToday
                  ? "bg-black/10 text-neutral-900 dark:bg-white/15 dark:text-white"
                  : "bg-neutral-100 text-neutral-700 dark:bg-white/10 dark:text-neutral-300"
              }`}
            >
              {events.length}
            </span>
          )}
        </div>

        {(() => {
          // Per-row stagger for the live animations (chip pulse / shine /
          // row sweep) so simultaneous live rows don't strobe in unison.
          // Hash the event ID into a delay across the full 6s sweep
          // cycle — deterministic (SSR-safe, no hydration mismatch) but
          // visibly uncorrelated row-to-row. Beats a fixed-step offset,
          // which still read as synchronized when adjacent rows landed
          // on neighboring slots.
          const liveIds = new Set<string>();
          for (const ev of events) {
            const isLive =
              fakeLiveEventIds?.has(ev.id) ||
              eventDisplayStatus(ev.date, ev.time) === "in_progress";
            if (isLive) liveIds.add(ev.id);
          }
          // djb2 — small, fast, well-distributed for short keys like our
          // "wotc-12345" / "td-abc" event IDs.
          const hashId = (s: string): number => {
            let h = 5381;
            for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
            return h;
          };
          return events.map((ev, i) => {
            // Three-tier display state — see lib/format-time.ts. "Completed"
            // events are dimmed so the eye skips past them; "in_progress"
            // events stay full-color but pick up a LIVE pill so users can
            // spot what's happening right now at a glance.
            const status = fakeLiveEventIds?.has(ev.id) ? "in_progress" : eventDisplayStatus(ev.date, ev.time);
            // Randomize phase across the full 6s sweep cycle. ms-resolution
            // → 6000 possible phases, effectively continuous distribution.
            const liveDelay = liveIds.has(ev.id)
              ? `${(hashId(ev.id) % 6000) / 1000}s`
              : undefined;
            const distanceLabel =
              userLat != null && userLng != null && ev.latitude != null && ev.longitude != null
                ? formatDistance(haversineMiles(userLat, userLng, ev.latitude, ev.longitude), distanceUnit)
                : "";
            // Row-fade animation timing + completed-row opacity override
            // + live-row stagger. Animation triggers unconditionally from
            // SSR (the `anim-row-in` class + fadeInRow keyframe) — no
            // hydration gate. The wrapper-level reveal effect we used to
            // depend on is gone; rows now animate in once on first paint
            // with a small per-row stagger.
            const baseStyle: React.CSSProperties = {
              animationDelay: `${80 + i * 45}ms`,
              "--row-opacity": status === "completed" ? 0.5 : 1,
            } as React.CSSProperties;
            const rowStyle: React.CSSProperties = liveDelay !== undefined
              ? ({ ...baseStyle, "--live-delay": liveDelay } as React.CSSProperties)
              : baseStyle;
            return (
            <Link
              key={ev.id}
              href={`/event/${encodeURIComponent(ev.id)}`}
              data-row
              // --row-opacity drives the `to` value in the fadeInRow keyframe
              // so completed rows actually land at 50% — without it, the
              // animation's `to: opacity: 1` (fill-mode both) overrode the
              // opacity-50 class and rows rendered full-color after reveal.
              // --live-delay (when set) staggers the three live animations
              // so simultaneous live rows don't strobe in lockstep.
              style={rowStyle}
              className={`anim-row-in ${status === "in_progress" ? "anim-live-row" : ""} group flex items-center gap-3 sm:gap-4 px-3 sm:px-4 ${status === "completed" ? "py-2 sm:py-2.5 saturate-50" : "py-4 sm:py-5"} ${isToday ? "hover:bg-neutral-100 dark:hover:bg-white/[0.04]" : "hover:bg-neutral-50 dark:hover:bg-white/5"}`}
            >
              {/* Desktop: time as a fixed left column. When the event is
                  in progress the time itself shifts to a high-energy sky
                  blue and gets a small pulsing-dot prefix — punchy enough
                  to draw the eye, no shouty badge. */}
              {/* Column is w-24 (not w-16) so the in-progress outline
                  has room for the widest time strings like "11:30 PM"
                  without the ring clipping or the text wrapping. */}
              {/* Time column. Two visual variants share one structural
                  pattern: a time line (mandatory) optionally over a zone
                  abbreviation (only for non-Eastern venues). Stacking
                  them keeps the live-pill width under the column's w-24
                  budget so it doesn't overlap the thumbnail to its
                  right. The non-live variant relies on the parent's
                  natural wrapping; the live variant uses whitespace-nowrap
                  to prevent the pill's pulse dot from drifting onto its
                  own line, so we have to stack explicitly. */}
              <div className="hidden sm:block shrink-0 w-20">
                {(() => {
                  const parts = formatEventTimeParts(ev.date, ev.time, pickEventTimezone(ev));
                  if (status === "in_progress") {
                    return (
                      <span className="inline-flex flex-col items-start text-sm font-mono tabular-nums font-medium text-white anim-live-shine rounded-md px-1.5 py-0.5 whitespace-nowrap leading-tight">
                        {/* Single-line viewport (1lh tall) clips the inner
                            cycle so only one label is visible at a time.
                            Cycle stacks the time + "LIVE NOW" vertically;
                            translateY in the keyframes swaps which one
                            shows. */}
                        <span className="overflow-hidden block" style={{ height: "1lh" }}>
                          <span className="anim-live-label-cycle">
                            <span className="inline-flex items-center gap-1.5">
                              <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-black anim-live-pulse shrink-0" />
                              <span><span className="sr-only">Happening now: </span>{parts.time}</span>
                            </span>
                            <span aria-hidden="true" className="inline-flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-black anim-live-pulse shrink-0" />
                              <span>LIVE NOW</span>
                            </span>
                            {/* Third child = identical copy of the first.
                                Lets the keyframe loop from translateY(-66.6%)
                                back to 0% with no visible jump — the eye
                                sees one continuous one-direction scroll. */}
                            <span aria-hidden="true" className="inline-flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-black anim-live-pulse shrink-0" />
                              <span>{parts.time}</span>
                            </span>
                          </span>
                        </span>
                        {parts.zoneAbbr && (
                          <span className="text-[10px] opacity-90 pl-3.5">{parts.zoneAbbr}</span>
                        )}
                      </span>
                    );
                  }
                  return (
                    <span className="inline-flex flex-col text-sm font-mono tabular-nums text-neutral-500 dark:text-neutral-400 transition-colors duration-200 group-hover:text-neutral-700 dark:group-hover:text-neutral-200 leading-tight">
                      <span>{parts.time}</span>
                      {parts.zoneAbbr && (
                        <span className="text-[10px] text-neutral-400 dark:text-neutral-500">{parts.zoneAbbr}</span>
                      )}
                    </span>
                  );
                })()}
              </div>
              {/* Image is decorative on mobile (most events render the same
                  source-type SVG placeholder) so we drop it under sm to give
                  the title and location the room they need. Completed rows
                  drop it on all viewports too — past events render in the
                  condensed layout so a long backlog doesn't dominate. */}
              {status !== "completed" && (
                // next/image generates a 56px-wide webp variant for the
                // browser instead of shipping the original (which can be up
                // to 4 MB per saveUpload's cap). `unoptimized` for SVG paths
                // and external static maps that next/image's optimizer can't
                // re-encode usefully. `sizes` is fixed at 56px since the
                // thumbnail never grows beyond that.
                <Image
                  src={ev.imageUrl}
                  alt=""
                  width={56}
                  height={56}
                  className={`hidden sm:block w-14 h-14 rounded-md shrink-0 bg-neutral-100 ${
                    ev.imageFit === "cover" ? "object-cover" : "object-contain p-1"
                  }`}
                  sizes="56px"
                  loading="lazy"
                  decoding="async"
                  unoptimized={ev.imageUrl.endsWith(".svg") || ev.imageUrl.startsWith("https://maps.googleapis.com")}
                />
              )}
              <div className="flex-1 min-w-0">
                {/* Mobile mirrors the desktop column: when in-progress
                    the time line picks up a leading pulse dot + emerald
                    color shift, otherwise renders flat neutral. */}
                <div className="block sm:hidden mb-1">
                  {(() => {
                    const parts = formatEventTimeParts(ev.date, ev.time, pickEventTimezone(ev));
                    if (status === "in_progress") {
                      return (
                        <span className="inline-flex items-center text-xs font-mono tabular-nums font-medium text-white anim-live-shine rounded-md px-1.5 py-0.5 whitespace-nowrap leading-tight">
                          {/* Same slot-machine swap as the desktop chip —
                              alternates between the start time and "LIVE NOW". */}
                          <span className="overflow-hidden block" style={{ height: "1lh" }}>
                            <span className="anim-live-label-cycle">
                              <span className="inline-flex items-center gap-1.5">
                                <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-black anim-live-pulse shrink-0" />
                                <span>
                                  <span className="sr-only">Happening now: </span>{parts.time}
                                  {parts.zoneAbbr && <span className="opacity-90 ml-1">{parts.zoneAbbr}</span>}
                                </span>
                              </span>
                              <span aria-hidden="true" className="inline-flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-black anim-live-pulse shrink-0" />
                                <span>LIVE NOW</span>
                              </span>
                              {/* Third child = identical copy of the first
                                  (see desktop chip for the keyframe-loop
                                  trick). */}
                              <span aria-hidden="true" className="inline-flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-black anim-live-pulse shrink-0" />
                                <span>
                                  {parts.time}
                                  {parts.zoneAbbr && <span className="opacity-90 ml-1">{parts.zoneAbbr}</span>}
                                </span>
                              </span>
                            </span>
                          </span>
                        </span>
                      );
                    }
                    return (
                      <span className="text-xs font-mono tabular-nums text-neutral-500 dark:text-neutral-400">
                        {parts.time}
                        {parts.zoneAbbr && <span className="text-neutral-400 ml-1">{parts.zoneAbbr}</span>}
                      </span>
                    );
                  })()}
                </div>
                {/* Format badge sits above the title — it's the
                    fastest way to scan "what kind of event is this".
                    Suppressed entirely for "Other" / empty formats so
                    the row doesn't carry a meaningless chip. */}
                {status !== "completed" && (showFormatBadge(ev.format) || isRcq(ev.title)) && (
                  <div className="inline-flex items-center gap-1 mb-1 flex-wrap">
                    {showFormatBadge(ev.format) && (
                      <span className={`inline-block px-2 py-0.5 rounded-sm text-[11px] font-bold tracking-wide font-[family-name:var(--font-card-title)] ${FORMAT_BADGE[ev.format] || FORMAT_BADGE_DEFAULT}`}>
                        {ev.format}
                      </span>
                    )}
                    {isRcq(ev.title) && (
                      <span className={`${RCQ_BADGE} px-1.5 py-0.5 text-[10px]`} title="Regional Championship Qualifier">
                        RCQ
                      </span>
                    )}
                  </div>
                )}
                <p className={`${status === "completed" ? "text-sm" : "text-base sm:text-lg"} font-[family-name:var(--font-ultra)] font-bold tracking-[0.01em] text-neutral-900 dark:text-white ${status === "completed" ? "truncate" : "line-clamp-2 sm:line-clamp-none sm:truncate"}`}>{ev.title}</p>
                {ev.location && (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
                    {ev.location}
                    {distanceLabel && <span className="ml-1.5">· {distanceLabel}</span>}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isAdmin && <AdminEventActions eventId={ev.id} />}
                <SaveEventButton
                  eventId={ev.id}
                  initiallySaved={savedEventIds?.has(ev.id) ?? false}
                  compact
                  signedIn={signedIn}
                />
                {/* Price sits at the row's right edge so it visually
                    aligns with the "X events" count in the day header
                    above. Save-star reveals on hover to its left.
                    "Free" is the standout \u2014 bolder + colored. Paid
                    prices stay quiet (regular weight, default ink). */}
                {/* Free events pop with bold sky-blue. Emerald is reserved
                    for the "happening now" live treatment — using a
                    different hue here avoids a color collision when a
                    free event is also in progress. On completed rows the
                    row is already dimmed and de-saturated, so Free drops
                    back to neutral + regular weight to keep it from
                    competing with upcoming free events further up the list. */}
                <span className={`text-sm font-mono tabular-nums ${status !== "completed" && ev.cost === "Free" ? "font-bold text-sky-600 dark:text-sky-400" : "font-normal text-neutral-700 dark:text-neutral-300"}`}>
                  {ev.cost === "Free" ? "Free" : ev.cost || "\u2014"}
                </span>
              </div>
            </Link>
            );
          });
        })()}
      </div>
    </div>
  );
}
