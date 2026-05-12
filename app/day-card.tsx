"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { FORMAT_BADGE, FORMAT_BADGE_DEFAULT } from "@/lib/format-style";
import { formatEventTime } from "@/lib/format-time";
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
}

export default function DayCard({
  date,
  weekday,
  dayNum,
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
  dayNum: number;
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
  const { sentinelRef, isStuck } = useStickySentinel("-48px 0px 0px 0px");

  // Stagger-in animation for card shell + rows
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      wrapper.style.opacity = "1";
      wrapper.querySelectorAll<HTMLElement>("[data-row]").forEach((r) => (r.style.opacity = "1"));
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;

        timers.push(
          setTimeout(() => {
            wrapper.style.removeProperty("opacity");
            wrapper.classList.add("anim-fade-in-up");
          }, staggerBase)
        );

        wrapper.querySelectorAll<HTMLElement>("[data-row]").forEach((row, i) => {
          timers.push(
            setTimeout(() => {
              row.style.removeProperty("opacity");
              row.classList.add("anim-row-in");
            }, staggerBase + 80 + i * 45)
          );
        });

        observer.unobserve(wrapper);
      },
      { threshold: 0.04, rootMargin: "0px 0px -12px 0px" }
    );

    observer.observe(wrapper);
    return () => {
      observer.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [staggerBase]);

  const borderColor = isToday
    ? "border-blue-300 dark:border-blue-500/40"
    : "border-gray-100 dark:border-white/8";

  const hoverBorderColor = isToday
    ? "hover:border-blue-400 dark:hover:border-blue-400/60"
    : "hover:border-gray-200 dark:hover:border-white/15";

  const headingBg = isToday
    ? "bg-blue-50 dark:bg-[#0c1220]"
    : "bg-white dark:bg-[#0c1220]";

  return (
    <div ref={wrapperRef} style={{ opacity: 0 }} className={isPast && !isToday ? "opacity-70" : ""}>
      {/* Sentinel: zero-height, sits at the top of the card to detect when header pins */}
      <div ref={sentinelRef} className="h-0" />

      {/* Sticky date header */}
      <div className={`sticky top-[47px] z-[5] flex items-center gap-2.5 px-4 border transition-all duration-150 ${isStuck ? "py-1" : "py-2 rounded-t-xl"} ${borderColor} ${headingBg}`}>
        <span
          className={`inline-flex items-center justify-center rounded-full font-[family-name:var(--font-ultra)] font-bold shrink-0 transition-all duration-150 ${isStuck ? "w-6 h-6 text-xs" : "w-8 h-8 text-sm"} ${
            isToday ? "bg-blue-600 text-white" : "text-gray-900 dark:text-gray-200"
          }`}
        >
          {dayNum}
        </span>
        <span className={`transition-all duration-150 font-medium ${isStuck ? "text-xs" : "text-sm"} ${isToday ? "text-blue-700 dark:text-blue-300" : "text-gray-700 dark:text-gray-300"}`}>
          {headingLabel || weekday}
        </span>
        <span className={`ml-auto transition-all duration-150 text-gray-400 dark:text-gray-500 ${isStuck ? "text-[10px]" : "text-xs"}`}>
          {events.length === 0 ? "No events" : `${events.length} event${events.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {/* Events body */}
      {events.length > 0 && (
        <div className={`overflow-hidden rounded-b-xl border-b border-x divide-y transition-all duration-200 hover:shadow-md dark:hover:shadow-black/30 ${borderColor} ${hoverBorderColor} ${
          isToday ? "divide-blue-100 dark:divide-blue-500/20" : "divide-gray-100 dark:divide-white/8"
        }`}>
          {events.map((ev) => (
            <Link
              key={ev.id}
              href={`/event/${encodeURIComponent(ev.id)}`}
              data-row
              style={{ opacity: 0 }}
              className={`group flex items-center gap-3 px-4 py-2.5 transition-all duration-200 ${isToday ? "hover:bg-blue-100/50 dark:hover:bg-blue-400/10" : "hover:bg-gray-50 dark:hover:bg-white/5"}`}
            >
              <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0 w-14 transition-colors duration-200 group-hover:text-gray-500 dark:group-hover:text-gray-400">
                {formatEventTime(ev.date, ev.time, ev.timezone)}
              </span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={ev.imageUrl}
                alt=""
                className="w-10 h-10 rounded-md object-cover shrink-0 bg-gray-100 dark:bg-gray-800"
                loading="lazy"
              />
              <div className="flex-1 min-w-0 transition-transform duration-200 group-hover:translate-x-1">
                <span className={`px-1.5 py-0 rounded text-[10px] font-medium ${FORMAT_BADGE[ev.format] || FORMAT_BADGE_DEFAULT}`}>
                  {ev.format}
                </span>
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate mt-0.5">{ev.title}</p>
                {ev.location && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{ev.location}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className={`text-xs font-[family-name:var(--font-ultra)] font-bold transition-transform duration-200 group-hover:translate-x-0.5 ${ev.cost === "Free" ? "text-emerald-600 dark:text-emerald-400" : "text-gray-900 dark:text-white"}`}>
                  {ev.cost === "Free" ? "Free" : ev.cost || "\u2014"}
                </span>
                <SaveEventButton
                  eventId={ev.id}
                  initiallySaved={savedEventIds?.has(ev.id) ?? false}
                  compact
                  signedIn={signedIn}
                />
                {isAdmin && <AdminEventActions eventId={ev.id} />}
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 shrink-0 text-gray-300 dark:text-gray-600 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
