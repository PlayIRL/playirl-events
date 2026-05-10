"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { FORMAT_BADGE, FORMAT_BADGE_DEFAULT } from "@/lib/format-style";
import { dateStrInTz, eventHasStarted, formatEventTime } from "@/lib/format-time";
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

export default function CalendarView({ events }: { events: EventRow[] }) {
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
    ? `${viewStart.toLocaleDateString("en-US", { month: "long", day: "numeric" })} – ${viewEnd.getDate()}, ${viewEnd.getFullYear()}`
    : `${viewStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${viewEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div>
      {/* Sentinel: detects when sticky frame pins to nav */}
      <div ref={sentinelRef} className="h-0" />

      {/* Sticky: week nav + day headers together */}
      <div className="sticky top-[var(--sticky-bar-h,0px)] z-[5] -mx-4 px-4 bg-white dark:bg-neutral-900">
        {/* Unified frame: rounded-md top corners only when not pinned */}
        <div className={`border border-b-0 border-neutral-200 dark:border-neutral-700 overflow-hidden transition-all duration-150 ${isStuck ? "" : "rounded-t-lg"}`}>

          {/* Date-range navigation — advances by viewSize (3 on mobile, 7 on
              desktop) so each tap moves to the next chunk of visible days. */}
          <div className="flex items-center justify-between py-1.5 px-2 border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
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
              <span className="text-sm font-[family-name:var(--font-ultra)] font-bold text-neutral-900 dark:text-white tracking-wider">{viewLabel}</span>
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
              {visibleDays.map((day) => {
                const isToday = day.date === todayStr;
                return (
                  <div
                    key={day.date}
                    className={`flex items-center justify-center gap-1.5 py-1.5 ${
                      isToday
                        ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                        : "bg-white dark:bg-neutral-900"
                    }`}
                  >
                    <span className={`text-[10px] ${isToday ? "font-bold" : "font-medium text-neutral-500 dark:text-neutral-400"}`}>
                      {day.weekday}
                    </span>
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-[family-name:var(--font-ultra)] font-bold shrink-0 ${
                      isToday ? "" : "text-neutral-900 dark:text-neutral-200"
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
        <div className={`grid gap-px bg-neutral-200 dark:bg-neutral-800 border-b border-x border-neutral-200 dark:border-neutral-700 rounded-b-lg overflow-hidden ${viewSize === 3 ? "grid-cols-3" : "grid-cols-7 sm:min-w-[560px]"}`}>
          {visibleDays.map((day) => {
            const isToday = day.date === todayStr;
            const isPast = day.date < todayStr;
            const dayEvents = byDate[day.date] || [];

            return (
              <div
                key={day.date}
                className={`flex flex-col min-h-[320px] bg-white dark:bg-neutral-900 ${
                  isToday ? "outline-2 outline-neutral-900 dark:outline-white -outline-offset-2 relative z-[1]" : ""
                } ${isPast && !isToday ? "opacity-70" : ""}`}
              >
                <div className="flex-1 flex flex-col gap-1 p-1.5">
                  {dayEvents.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-[10px] text-neutral-300 dark:text-neutral-700">—</div>
                  ) : (
                    dayEvents.map((ev) => {
                      const past = eventHasStarted(ev.date, ev.time);
                      return (
                      <Link
                        key={ev.id}
                        href={`/event/${encodeURIComponent(ev.id)}`}
                        title={`${ev.title}${ev.location ? ` · ${ev.location}` : ""}${ev.cost ? ` · ${ev.cost}` : ""} · ${formatEventTime(ev.date, ev.time, ev.timezone)}`}
                        className={`group block rounded-md p-2 transition-all duration-150 hover:-translate-y-px hover:shadow-sm ${past ? "opacity-50 saturate-50" : ""} ${isToday ? "hover:bg-neutral-100 dark:hover:bg-white/[0.06]" : "hover:bg-black/[0.04] dark:hover:bg-white/10"}`}
                      >
                        <div className="flex flex-col gap-px">
                          <div className="text-[10px] text-neutral-500 dark:text-neutral-400 leading-none">{formatEventTime(ev.date, ev.time, ev.timezone)}</div>
                          <div>
                            <span className={`px-1.5 py-0.5 rounded-sm text-[10px] font-bold ${FORMAT_BADGE[ev.format] || FORMAT_BADGE_DEFAULT}`}>
                              {ev.format}
                            </span>
                          </div>
                        </div>
                        <div className="text-xs font-medium text-neutral-900 dark:text-white leading-tight line-clamp-2 mt-1 group-hover:text-neutral-700 dark:group-hover:text-neutral-100">
                          {ev.title}
                        </div>
                        {ev.location && (
                          <div className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate mt-0.5">{ev.location}</div>
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
