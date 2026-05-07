"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FORMAT_BADGE, FORMAT_BADGE_DEFAULT } from "@/lib/format-style";
import { eventHasStarted, formatEventTime } from "@/lib/format-time";
import { useStickySentinel } from "@/lib/use-sticky-sentinel";
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
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { sentinelRef, isStuck } = useStickySentinel("-80px 0px 0px 0px");
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

  // "Today" should look like the brightest, most live element on the
  // page — not a tinted/dimmed version. Strategy: pure white bg in
  // light mode, lifted off-the-dark bg in dark mode, all wrapped in a
  // thick high-contrast frame so the day visibly pops out of the stack.
  const borderColor = isToday
    ? "border-2 border-neutral-900 dark:border-white"
    : "border border-neutral-300 dark:border-white/15";

  const headingBg = isToday
    ? "bg-white dark:bg-white/[0.18]"
    : "bg-white dark:bg-neutral-900";

  const bodyBg = isToday
    ? "bg-white dark:bg-white/[0.12]"
    : "bg-white dark:bg-neutral-900";

  return (
    <div
      ref={wrapperRef}
      style={revealed ? undefined : { opacity: 0 }}
      className={`${revealed ? "anim-fade-in-up" : ""} ${isPast && !isToday ? "opacity-70" : ""}`}
    >
      {/* Sentinel: zero-height, sits at the top of the card to detect when header pins */}
      <div ref={sentinelRef} className="h-0" />

      {/* Sticky date header */}
      <div className={`sticky top-[var(--sticky-bar-h,0px)] z-[5] flex items-center gap-2.5 px-4 ${isStuck ? "py-1" : "py-2 rounded-t-xl"} ${borderColor} ${headingBg}`}>
        <span className={`${isStuck ? "text-sm" : "text-base"} ${isToday ? "font-bold text-neutral-900 dark:text-white" : "font-medium text-neutral-700 dark:text-neutral-300"}`}>
          {headingLabel || weekday}
        </span>
        <span className={`ml-auto text-neutral-500 dark:text-neutral-400 ${isStuck ? "text-xs" : "text-sm"}`}>
          {events.length === 0 ? "No events" : `${events.length} event${events.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {/* Events body */}
      {events.length > 0 && (
        <div className={`overflow-hidden rounded-b-xl divide-y divide-neutral-200 dark:divide-white/10 ${isToday ? "border-x-2 border-b-2 border-neutral-900 dark:border-white" : "border-x border-b border-neutral-300 dark:border-white/15"} ${bodyBg}`}>
          {events.map((ev, i) => {
            // Per-row "already started" check — an event whose start
            // moment is in the past gets rendered as inactive (greyed
            // out) instead of being hidden, so users see what they
            // missed without it crowding the upcoming list.
            const past = eventHasStarted(ev.date, ev.time);
            return (
            <Link
              key={ev.id}
              href={`/event/${encodeURIComponent(ev.id)}`}
              data-row
              style={revealed ? { animationDelay: `${80 + i * 45}ms` } : { opacity: 0 }}
              className={`${revealed ? "anim-row-in" : ""} group flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-4 sm:py-5 ${past ? "opacity-50 saturate-50" : ""} ${isToday ? "hover:bg-neutral-100 dark:hover:bg-white/[0.04]" : "hover:bg-neutral-50 dark:hover:bg-white/5"}`}
            >
              {/* Desktop: time as a fixed left column. Mobile: hidden here
                  and rendered above the title (see middle div below) so the
                  full row width goes to the title. */}
              <span className="hidden sm:block text-sm text-neutral-500 dark:text-neutral-400 shrink-0 w-16 transition-colors duration-200 group-hover:text-neutral-700 dark:group-hover:text-neutral-200">
                {formatEventTime(ev.date, ev.time, ev.timezone)}
              </span>
              {/* Image is decorative on mobile (most events render the same
                  source-type SVG placeholder) so we drop it under sm to give
                  the title and location the room they need. Container bg is
                  light in both themes so logos with baked-in white bgs blend. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={ev.imageUrl}
                alt=""
                className={`hidden sm:block w-12 h-12 rounded-md shrink-0 bg-neutral-100 ${
                  ev.imageFit === "cover" ? "object-cover" : "object-contain p-0.5"
                }`}
                loading="lazy"
              />
              <div className="flex-1 min-w-0">
                <span className="block sm:hidden text-xs text-neutral-500 dark:text-neutral-400">
                  {formatEventTime(ev.date, ev.time, ev.timezone)}
                </span>
                <p className="text-base sm:text-lg font-semibold tracking-tight text-neutral-900 dark:text-white line-clamp-2 sm:line-clamp-none sm:truncate">{ev.title}</p>
                <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                  <span className={`px-2 py-0.5 rounded-sm text-[10px] font-bold shrink-0 ${FORMAT_BADGE[ev.format] || FORMAT_BADGE_DEFAULT}`}>
                    {ev.format}
                  </span>
                  {ev.location && (
                    <>
                      <span className="text-xs text-neutral-300 dark:text-neutral-600 shrink-0">·</span>
                      <span className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{ev.location}</span>
                    </>
                  )}
                </div>
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
                <span className={`text-sm font-[family-name:var(--font-ultra)] ${ev.cost === "Free" ? "font-bold text-emerald-600 dark:text-emerald-400" : "font-normal text-neutral-700 dark:text-neutral-300"}`}>
                  {ev.cost === "Free" ? "Free" : ev.cost || "\u2014"}
                </span>
              </div>
            </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
