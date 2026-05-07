"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { FORMAT_BADGE, FORMAT_BADGE_DEFAULT } from "@/lib/format-style";
import { eventHasStarted, formatEventTime } from "@/lib/format-time";
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

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isoDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CalendarView({ events }: { events: EventRow[] }) {
  const today = new Date();
  const todayStr = isoDate(today);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today));
  const { sentinelRef, isStuck } = useStickySentinel("-80px 0px 0px 0px");

  const headerScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);

  // Sync horizontal scroll between hidden header scroller and visible body scroller
  useEffect(() => {
    const header = headerScrollRef.current;
    const body = bodyScrollRef.current;
    if (!header || !body) return;
    const onBodyScroll = () => { header.scrollLeft = body.scrollLeft; };
    const onHeaderScroll = () => { body.scrollLeft = header.scrollLeft; };
    body.addEventListener("scroll", onBodyScroll, { passive: true });
    header.addEventListener("scroll", onHeaderScroll, { passive: true });
    return () => {
      body.removeEventListener("scroll", onBodyScroll);
      header.removeEventListener("scroll", onHeaderScroll);
    };
  }, []);

  const byDate: Record<string, EventRow[]> = {};
  for (const ev of events) {
    if (!byDate[ev.date]) byDate[ev.date] = [];
    byDate[ev.date].push(ev);
  }

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStart, i);
    return { date: isoDate(d), dayNum: d.getDate(), weekday: WEEKDAYS[d.getDay()] };
  });

  const weekEnd = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  const weekLabel = sameMonth
    ? `${weekStart.toLocaleDateString("en-US", { month: "long", day: "numeric" })} – ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`
    : `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div>
      {/* Sentinel: detects when sticky frame pins to nav */}
      <div ref={sentinelRef} className="h-0" />

      {/* Sticky: week nav + day headers together */}
      <div className="sticky top-[var(--sticky-bar-h,0px)] z-[5] -mx-4 px-4 bg-white dark:bg-neutral-900">
        {/* Unified frame: rounded-md top corners only when not pinned */}
        <div className={`border border-b-0 border-neutral-200 dark:border-neutral-700 overflow-hidden transition-all duration-150 ${isStuck ? "" : "rounded-t-md"}`}>

          {/* Week navigation — compact, bottom border acts as divider */}
          <div className="flex items-center justify-between py-1.5 px-2 border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
            <button
              onClick={() => setWeekStart(addDays(weekStart, -7))}
              className="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-500 dark:text-neutral-400 transition cursor-pointer"
              aria-label="Previous week"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-[family-name:var(--font-ultra)] font-bold text-neutral-900 dark:text-white tracking-wider">{weekLabel}</span>
              <button
                onClick={() => setWeekStart(startOfWeek(today))}
                className="text-[10px] px-1.5 py-0.5 rounded-md bg-neutral-100 dark:bg-white/5 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-white/10 transition cursor-pointer"
              >
                Today
              </button>
            </div>
            <button
              onClick={() => setWeekStart(addDays(weekStart, 7))}
              className="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-500 dark:text-neutral-400 transition cursor-pointer"
              aria-label="Next week"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Day-header row — hidden scrollbar, synced to body */}
          <div
            ref={headerScrollRef}
            className="overflow-x-auto"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
          >
            <div className="min-w-[560px] grid grid-cols-7 gap-px bg-neutral-200 dark:bg-neutral-800">
              {weekDays.map((day) => {
                const isToday = day.date === todayStr;
                return (
                  <div
                    key={day.date}
                    className={`flex items-center justify-center gap-1.5 py-1.5 ${isToday ? "bg-white dark:bg-white/[0.18]" : "bg-white dark:bg-neutral-900"}`}
                  >
                    <span className={`text-[10px] ${isToday ? "font-bold text-neutral-900 dark:text-white" : "font-medium text-neutral-500 dark:text-neutral-400"}`}>
                      {day.weekday}
                    </span>
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-[family-name:var(--font-ultra)] font-bold shrink-0 ${
                      isToday ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "text-neutral-900 dark:text-neutral-200"
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
        ref={bodyScrollRef}
        className="overflow-x-auto -mx-4 px-4 anim-fade-in"
        style={{ "--delay": "100ms" } as React.CSSProperties}
      >
        <div className="min-w-[560px] grid grid-cols-7 gap-px bg-neutral-200 dark:bg-neutral-800 border-b border-x border-neutral-200 dark:border-neutral-700 rounded-b-md overflow-hidden">
          {weekDays.map((day) => {
            const isToday = day.date === todayStr;
            const isPast = day.date < todayStr;
            const dayEvents = byDate[day.date] || [];

            return (
              <div
                key={day.date}
                className={`flex flex-col min-h-[320px] ${
                  isToday
                    ? "bg-white dark:bg-white/[0.12] outline-2 outline-neutral-900 dark:outline-white -outline-offset-2 relative z-[1]"
                    : "bg-white dark:bg-neutral-900"
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
