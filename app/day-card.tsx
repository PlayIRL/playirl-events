"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FORMAT_BADGE, FORMAT_BADGE_DEFAULT, RCQ_BADGE, isRcq, showFormatBadge } from "@/lib/format-style";
import { eventDisplayStatus, formatEventTime } from "@/lib/format-time";
import { formatDistanceMiles, haversineMiles } from "@/lib/distance";
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
  store_url: string;
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
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Tracking reveal state in React (instead of mutating element.style
  // imperatively) is what keeps content visible across router.refresh().
  // The previous version cleared opacity via removeProperty in an effect;
  // when JSX re-rendered (e.g. after a location change) it re-applied
  // style={{ opacity: 0 }} but the effect deps hadn't changed, so the
  // dead-after-unobserve observer couldn't restore visibility. Today's
  // card was hit because its observer fired on first paint and self-
  // unobserved; later cards survived because their observers stayed
  // attached and re-fired when layout shifted.
  const [revealed, setRevealed] = useState(false);

  // Stagger-in animation for card shell + rows
  useEffect(() => {
    if (revealed) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setRevealed(true);
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        timer = setTimeout(() => setRevealed(true), staggerBase);
        observer.unobserve(wrapper);
      },
      { threshold: 0.04, rootMargin: "0px 0px -12px 0px" },
    );

    observer.observe(wrapper);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [staggerBase, revealed]);

  // "Today" pops via a thicker high-contrast frame; bg matches other day
  // cards so the page bg flows behind a single bordered shape.
  const frameBorder = isToday
    ? "border-2 border-neutral-200 dark:border-white/10"
    : "border border-neutral-300 dark:border-white/15";

  // Past day cards land at 70% opacity (subtle "this is history" treatment);
  // today + future render at full color. The CSS var is read by the
  // `fadeInUp` keyframe's `to` rule so the dim survives the reveal anim.
  const wrapperOpacity = isPast && !isToday ? 0.7 : 1;

  return (
    <div
      ref={wrapperRef}
      style={
        revealed
          ? ({ "--wrapper-opacity": wrapperOpacity } as React.CSSProperties)
          : ({ opacity: 0, "--wrapper-opacity": wrapperOpacity } as React.CSSProperties)
      }
      className={`${revealed ? "anim-fade-in-up" : ""} ${isPast && !isToday ? "opacity-70" : ""}`}
    >
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
          <span className={`text-base font-[family-name:var(--font-ultra)] font-black tracking-[0.01em] ${isToday ? "" : "text-neutral-900 dark:text-neutral-100"}`}>
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

        {events.map((ev, i) => {
            // Three-tier display state — see lib/format-time.ts. "Completed"
            // events are dimmed so the eye skips past them; "in_progress"
            // events stay full-color but pick up a LIVE pill so users can
            // spot what's happening right now at a glance.
            const status = eventDisplayStatus(ev.date, ev.time);
            const distanceLabel =
              userLat != null && userLng != null && ev.latitude != null && ev.longitude != null
                ? formatDistanceMiles(haversineMiles(userLat, userLng, ev.latitude, ev.longitude))
                : "";
            return (
            <Link
              key={ev.id}
              href={`/event/${encodeURIComponent(ev.id)}`}
              data-row
              // --row-opacity drives the `to` value in the fadeInRow keyframe
              // so completed rows actually land at 50% — without it, the
              // animation's `to: opacity: 1` (fill-mode both) overrode the
              // opacity-50 class and rows rendered full-color after reveal.
              style={
                revealed
                  ? ({ animationDelay: `${80 + i * 45}ms`, "--row-opacity": status === "completed" ? 0.5 : 1 } as React.CSSProperties)
                  : ({ opacity: 0, "--row-opacity": status === "completed" ? 0.5 : 1 } as React.CSSProperties)
              }
              className={`${revealed ? "anim-row-in" : ""} ${status === "in_progress" ? "anim-live-row" : ""} group flex items-center gap-3 sm:gap-4 px-3 sm:px-4 ${status === "completed" ? "py-2 sm:py-2.5 saturate-50" : "py-4 sm:py-5"} ${isToday ? "hover:bg-neutral-100 dark:hover:bg-white/[0.04]" : "hover:bg-neutral-50 dark:hover:bg-white/5"}`}
            >
              {/* Desktop: time as a fixed left column. When the event is
                  in progress the time itself shifts to a high-energy sky
                  blue and gets a small pulsing-dot prefix — punchy enough
                  to draw the eye, no shouty badge. */}
              {/* Column is w-24 (not w-16) so the in-progress outline
                  has room for the widest time strings like "11:30 PM"
                  without the ring clipping or the text wrapping. */}
              <div className="hidden sm:block shrink-0 w-24">
                {status === "in_progress" ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-mono tabular-nums font-medium text-emerald-600 dark:text-emerald-400 anim-live-ring rounded-md px-1.5 py-0.5 whitespace-nowrap">
                    <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 anim-live-pulse shrink-0" />
                    <span><span className="sr-only">Happening now: </span>{formatEventTime(ev.date, ev.time, ev.timezone)}</span>
                  </span>
                ) : (
                  <span className="text-sm font-mono tabular-nums text-neutral-500 dark:text-neutral-400 transition-colors duration-200 group-hover:text-neutral-700 dark:group-hover:text-neutral-200">
                    {formatEventTime(ev.date, ev.time, ev.timezone)}
                  </span>
                )}
              </div>
              {/* Image is decorative on mobile (most events render the same
                  source-type SVG placeholder) so we drop it under sm to give
                  the title and location the room they need. Completed rows
                  drop it on all viewports too — past events render in the
                  condensed layout so a long backlog doesn't dominate. */}
              {status !== "completed" && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={ev.imageUrl}
                  alt=""
                  width={56}
                  height={56}
                  className={`hidden sm:block w-14 h-14 rounded-md shrink-0 bg-neutral-100 ${
                    ev.imageFit === "cover" ? "object-cover" : "object-contain p-1"
                  }`}
                  loading="lazy"
                  decoding="async"
                />
              )}
              <div className="flex-1 min-w-0">
                {/* Mobile mirrors the desktop column: when in-progress
                    the time line picks up a leading pulse dot + emerald
                    color shift, otherwise renders flat neutral. */}
                <div className="block sm:hidden mb-1">
                  {status === "in_progress" ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-mono tabular-nums font-medium text-emerald-600 dark:text-emerald-400 anim-live-ring rounded-md px-1.5 py-0.5 whitespace-nowrap">
                      <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 anim-live-pulse shrink-0" />
                      <span><span className="sr-only">Happening now: </span>{formatEventTime(ev.date, ev.time, ev.timezone)}</span>
                    </span>
                  ) : (
                    <span className="text-xs font-mono tabular-nums text-neutral-500 dark:text-neutral-400">
                      {formatEventTime(ev.date, ev.time, ev.timezone)}
                    </span>
                  )}
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
                {/* Free events normally pop with bold emerald — except on
                    completed rows, where the row is already dimmed and
                    de-saturated. Forcing those back to neutral + regular
                    weight stops the "Free" label from competing with
                    upcoming free events further up the list. */}
                <span className={`text-sm font-mono tabular-nums ${status !== "completed" && ev.cost === "Free" ? "font-bold text-emerald-600 dark:text-emerald-400" : "font-normal text-neutral-700 dark:text-neutral-300"}`}>
                  {ev.cost === "Free" ? "Free" : ev.cost || "\u2014"}
                </span>
              </div>
            </Link>
            );
          })}
      </div>
    </div>
  );
}
