"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { FORMAT_BADGE, FORMAT_BADGE_DEFAULT, RCQ_BADGE, isRcq, showFormatBadge } from "@/lib/format-style";
import { dateStrInTz, eventDisplayStatus, formatEventTime, formatEventTimeParts, pickEventTimezone } from "@/lib/format-time";
import { formatDistance, haversineMiles, type DistanceUnit } from "@/lib/distance";
import { DEFAULT_LOCALE } from "@/lib/locale";
import { useStickySentinel } from "@/lib/use-sticky-sentinel";

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
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// YYYY-MM-DD in the app's anchor TZ (America/New_York). Used both for the
// today-cell highlight and for building the visible day grid — keeps day
// boundaries aligned with the server-rendered list view, which is also
// anchored to ET (see lib/format-time.ts:dateStrInTz).
function isoDate(date: Date): string {
  return dateStrInTz(date);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CalendarView({
  events,
  userLat = null,
  userLng = null,
  distanceUnit = "mi",
}: {
  events: EventRow[];
  /** Viewer's "from" coordinates. Null when no user signal is available
   *  (default Philly center) — distance is hidden so the cell stays compact. */
  userLat?: number | null;
  userLng?: number | null;
  /** Viewer's preferred distance unit. Defaults to "mi" so callers that
   *  don't thread it yet still render the legacy treatment. */
  distanceUnit?: DistanceUnit;
}) {
  const today = new Date();
  const todayStr = isoDate(today);
  // Mobile shows 3 days at a time; desktop shows the full 7-day week. Initial
  // SSR render uses 7 to avoid hydration mismatch — useEffect below switches
  // to 3 on first paint when matchMedia(max-width:639px) hits.
  const [viewSize, setViewSize] = useState<3 | 7>(7);
  const [viewStart, setViewStart] = useState(() => startOfWeek(today));
  const { sentinelRef, isStuck } = useStickySentinel("-80px 0px 0px 0px");

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const apply = (mobile: boolean) => {
      setViewSize(mobile ? 3 : 7);
      // Re-align the visible window when crossing the breakpoint: mobile users
      // land on today instead of a Sunday-aligned week so the most useful days
      // are immediately visible without paging.
      setViewStart(mobile ? startOfDay(today) : startOfWeek(today));
    };
    apply(mq.matches);
    const onChange = (e: MediaQueryListEvent) => apply(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
    // `today` is captured once per mount — recomputing on every render would
    // pin the alignment to the wall clock, not the user's intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byDate: Record<string, EventRow[]> = {};
  for (const ev of events) {
    if (!byDate[ev.date]) byDate[ev.date] = [];
    byDate[ev.date].push(ev);
  }

  const visibleDays = Array.from({ length: viewSize }, (_, i) => {
    const d = addDays(viewStart, i);
    return { date: isoDate(d), dayNum: d.getDate(), weekday: WEEKDAYS[d.getDay()] };
  });

  const viewEnd = addDays(viewStart, viewSize - 1);
  const sameMonth = viewStart.getMonth() === viewEnd.getMonth();
  const viewLabel = sameMonth
    ? `${viewStart.toLocaleDateString(DEFAULT_LOCALE, { month: "long", day: "numeric" })} – ${viewEnd.getDate()}, ${viewEnd.getFullYear()}`
    : `${viewStart.toLocaleDateString(DEFAULT_LOCALE, { month: "short", day: "numeric" })} – ${viewEnd.toLocaleDateString(DEFAULT_LOCALE, { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div>
      {/* Sentinel: detects when sticky frame pins to nav */}
      <div ref={sentinelRef} className="h-0" />

      {/* Sticky: week nav + day headers together */}
      <div className="sticky top-[var(--sticky-bar-h,0px)] z-[5] -mx-4 px-4 bg-white dark:bg-neutral-900">
        {/* Unified frame: rounded-md top corners only when not pinned.
            No `overflow-hidden` here — the today-column outline (drawn on the
            header cell below) needs to paint 1px OVER this frame's side border
            so it reaches the outer edge and stays aligned with the body
            column's outline, which does the same. The nav row instead rounds
            its own top corners (rounded-t-[7px], concentric inside this 1px
            border) so it doesn't poke past the frame's rounded-t-lg. */}
        <div className={`border border-b-0 border-neutral-200 dark:border-neutral-700 transition-all duration-150 ${isStuck ? "" : "rounded-t-lg"}`}>

          {/* Date-range navigation — advances by viewSize (3 on mobile, 7 on
              desktop) so each tap moves to the next chunk of visible days. */}
          <div className={`flex items-center justify-between py-1.5 px-2 border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 ${isStuck ? "" : "rounded-t-[7px]"}`}>
            <button
              onClick={() => setViewStart(addDays(viewStart, -viewSize))}
              className="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-500 dark:text-neutral-400 transition cursor-pointer"
              aria-label={viewSize === 3 ? "Previous 3 days" : "Previous week"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono font-normal tabular-nums tracking-[0.01em] text-neutral-900 dark:text-white">{viewLabel}</span>
              <button
                onClick={() => setViewStart(viewSize === 3 ? startOfDay(today) : startOfWeek(today))}
                className="text-xs font-medium px-2.5 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white transition cursor-pointer"
              >
                Today
              </button>
            </div>
            <button
              onClick={() => setViewStart(addDays(viewStart, viewSize))}
              className="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-500 dark:text-neutral-400 transition cursor-pointer"
              aria-label={viewSize === 3 ? "Next 3 days" : "Next week"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Day-header row */}
          <div>
            <div className={`grid gap-px bg-neutral-200 dark:bg-neutral-800 ${viewSize === 3 ? "grid-cols-3" : "grid-cols-7 sm:min-w-[560px]"}`}>
              {visibleDays.map((day, idx) => {
                const isToday = day.date === todayStr;
                const isFirstCol = idx === 0;
                const isLastCol = idx === visibleDays.length - 1;
                // Pull the today header cell 1px over the frame's side border
                // (matching the body cell's -ml/-mr) so its left/right stroke
                // lands on the outer frame edge and stays vertically aligned
                // with the body column's outline below.
                const todayPull = isToday
                  ? `${isFirstCol ? "-ml-px" : ""} ${isLastCol ? "-mr-px" : ""}`
                  : "";
                return (
                  <div
                    key={day.date}
                    className={`flex items-center justify-center gap-1.5 py-1.5 ${
                      isToday
                        ? `bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white shadow-[inset_1px_1px_0_0_#737373,inset_-1px_0_0_0_#737373,inset_0_-1px_0_0_#d4d4d4] dark:shadow-[inset_1px_1px_0_0_#a3a3a3,inset_-1px_0_0_0_#a3a3a3,inset_0_-1px_0_0_#525252] relative z-[1] ${todayPull}`
                        : "bg-white dark:bg-neutral-900 shadow-[inset_0_-1px_0_0_#d4d4d4] dark:shadow-[inset_0_-1px_0_0_#525252]"
                    }`}
                  >
                    <span className={`text-[10px] font-mono tabular-nums tracking-[0.01em] ${isToday ? "font-bold" : "font-medium text-neutral-500 dark:text-neutral-400"}`}>
                      {day.weekday}
                    </span>
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-mono tabular-nums font-bold shrink-0 ${
                      isToday
                        ? "bg-white text-neutral-900 dark:bg-neutral-900 dark:text-white"
                        : "text-neutral-900 dark:text-neutral-200"
                    }`}>
                      {day.dayNum}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>

      {/* Events body */}
      <div
        className="anim-fade-in"
        style={{ "--delay": "100ms" } as React.CSSProperties}
      >
        {/* No `overflow-hidden` here on purpose: the grid's 1px frame border
            (border-b/border-x) sits OUTSIDE the clip, so a clipped today
            outline can never cover it and a light frame "ghost" hairlines just
            outside the dark today stroke at the rounded corner. Instead we let
            cells paint freely, round the bottom corner cells so their square bg
            doesn't poke past the rounded frame, and pull the today cell 1px
            over the frame border so its dark stroke lands on the frame edge. */}
        <div className={`grid gap-px bg-neutral-200 dark:bg-neutral-800 border-b border-x border-neutral-200 dark:border-neutral-700 rounded-b-lg ${viewSize === 3 ? "grid-cols-3" : "grid-cols-7 sm:min-w-[560px]"}`}>
          {visibleDays.map((day, idx) => {
            const isToday = day.date === todayStr;
            const isPast = day.date < todayStr;
            const dayEvents = byDate[day.date] || [];
            const isFirstCol = idx === 0;
            const isLastCol = idx === visibleDays.length - 1;
            // Non-today corner cells round to 7px (= 8px frame radius − 1px
            // border) so they nest concentrically inside the frame.
            const cornerRound = `${isFirstCol ? "rounded-bl-[7px]" : ""} ${isLastCol ? "rounded-br-[7px]" : ""}`;
            // Today at a corner: pull the cell 1px over the frame border
            // (-mb/-ml/-mr) and round to the frame's full 8px so the dark today
            // stroke lands exactly on the frame edge, covering the light border
            // that would otherwise ghost just outside the outline. Today in a
            // middle column only needs -mb-px to cover the bottom border.
            const todayCover = isToday
              ? `-mb-px ${isFirstCol ? "-ml-px rounded-bl-[8px]" : ""} ${isLastCol ? "-mr-px rounded-br-[8px]" : ""}`
              : "";

            return (
              <div
                key={day.date}
                className={`flex flex-col min-h-[320px] bg-white dark:bg-neutral-900 ${
                  isToday ? "shadow-[inset_1px_-1px_0_0_#737373,inset_-1px_0_0_0_#737373] dark:shadow-[inset_1px_-1px_0_0_#a3a3a3,inset_-1px_0_0_0_#a3a3a3] relative z-[1]" : ""
                } ${isToday ? todayCover : cornerRound} ${isPast && !isToday ? "opacity-70" : ""}`}
              >
                <div className="flex-1 flex flex-col gap-1 p-1.5">
                  {dayEvents.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-[10px] text-neutral-300 dark:text-neutral-700">—</div>
                  ) : (
                    dayEvents.map((ev) => {
                      // Three-tier display: completed = greyed, in_progress
                      // = LIVE indicator, upcoming = default. See
                      // lib/format-time.ts:eventDisplayStatus.
                      const status = eventDisplayStatus(ev.date, ev.time);
                      const distanceLabel =
                        userLat != null && userLng != null && ev.latitude != null && ev.longitude != null
                          ? formatDistance(haversineMiles(userLat, userLng, ev.latitude, ev.longitude), distanceUnit)
                          : "";
                      return (
                      <Link
                        key={ev.id}
                        href={`/event/${encodeURIComponent(ev.id)}`}
                        title={`${ev.title}${ev.location ? ` · ${ev.location}` : ""}${distanceLabel ? ` · ${distanceLabel}` : ""}${ev.cost ? ` · ${ev.cost}` : ""} · ${formatEventTime(ev.date, ev.time, pickEventTimezone(ev))}`}
                        className={`group block rounded-md p-2 transition-all duration-150 hover:-translate-y-px hover:shadow-sm ${status === "completed" ? "opacity-50 saturate-50" : ""} ${isToday ? "hover:bg-neutral-100 dark:hover:bg-white/[0.06]" : "hover:bg-black/[0.04] dark:hover:bg-white/10"}`}
                      >
                        <div className="flex flex-col gap-px">
                          {/* When the event is in progress the time shifts
                              to sky blue with a leading pulse dot — same
                              treatment as the day-card row, scaled down
                              for the calendar cell. */}
                          {(() => {
                            // Stacked time + zone keeps the live pill from
                            // spilling out of the narrow calendar cell when
                            // the venue's zone isn't Eastern (e.g. CET / JST
                            // events stamped as "6:00 PM GMT+2" used to
                            // overflow the column).
                            const parts = formatEventTimeParts(ev.date, ev.time, pickEventTimezone(ev));
                            if (status === "in_progress") {
                              return (
                                <div className="inline-flex flex-col leading-tight text-[10px] font-mono tabular-nums font-medium text-white anim-live-shine rounded px-1 py-0.5 self-start whitespace-nowrap">
                                  {/* Slot-machine flip: time ↔ "LIVE" ↔ time.
                                      Three stacked rows scroll through; rows 1
                                      and 3 are identical (time) so the loop is
                                      seamless. Labels are centered in the chip's
                                      width (no dot). */}
                                  <span className="overflow-hidden block" style={{ height: "1lh" }}>
                                    <span className="anim-live-label-cycle">
                                      <span className="flex items-center justify-center">
                                        <span><span className="sr-only">Happening now: </span>{parts.time}</span>
                                      </span>
                                      <span aria-hidden="true" className="flex items-center justify-center">
                                        <span>LIVE</span>
                                      </span>
                                      <span aria-hidden="true" className="flex items-center justify-center">
                                        <span>{parts.time}</span>
                                      </span>
                                    </span>
                                  </span>
                                  {parts.zoneAbbr && (
                                    <span className="text-[9px] opacity-90 text-center">{parts.zoneAbbr}</span>
                                  )}
                                </div>
                              );
                            }
                            return (
                              <div className="flex flex-col leading-tight text-[10px] font-mono tabular-nums text-neutral-500 dark:text-neutral-400">
                                <span>{parts.time}</span>
                                {parts.zoneAbbr && (
                                  <span className="text-[9px] text-neutral-400 dark:text-neutral-500">{parts.zoneAbbr}</span>
                                )}
                              </div>
                            );
                          })()}
                          {(showFormatBadge(ev.format) || isRcq(ev.title)) && (
                            <div className="inline-flex items-center gap-1 flex-wrap">
                              {showFormatBadge(ev.format) && (
                                <span className={`px-1.5 py-0.5 rounded-sm text-[11px] font-bold tracking-wide font-[family-name:var(--font-card-title)] ${FORMAT_BADGE[ev.format] || FORMAT_BADGE_DEFAULT}`}>
                                  {ev.format}
                                </span>
                              )}
                              {isRcq(ev.title) && (
                                <span className={`${RCQ_BADGE} px-1 py-0.5 text-[9px]`} title="Regional Championship Qualifier">
                                  RCQ
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="text-xs font-medium text-neutral-900 dark:text-white leading-tight line-clamp-2 mt-1 group-hover:text-neutral-700 dark:group-hover:text-neutral-100">
                          {ev.title}
                        </div>
                        {ev.location && (
                          <div className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate mt-0.5">{ev.location}</div>
                        )}
                        {distanceLabel && (
                          <div className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate leading-tight">
                            {distanceLabel}
                          </div>
                        )}
                      </Link>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
