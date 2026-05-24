"use client";
import { useEffect, useRef } from "react";
import { useStickySentinel } from "@/lib/use-sticky-sentinel";

export default function StickyBar({ children }: { children: React.ReactNode }) {
  const { sentinelRef, isStuck } = useStickySentinel();
  const barRef = useRef<HTMLDivElement>(null);

  // Publish the bar's actual rendered height as a CSS variable so children
  // that sit just below it (day-card heading, calendar-view weekday header)
  // can use `top-[var(--sticky-bar-h)]` and stay flush with the bar across
  // viewports — the chip bar wraps to a second line under sm, so a static
  // offset would either gap on desktop or clip on mobile.
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const update = () => {
      // getBoundingClientRect for sub-pixel precision (offsetHeight rounds
      // up). Then subtract 1px so the day heading overlaps the bar's bottom
      // edge — without the overlap, sub-pixel rendering drift in CSS sticky
      // leaves a visible hairline gap between the bar and the heading.
      const h = el.getBoundingClientRect().height - 1;
      document.documentElement.style.setProperty("--sticky-bar-h", `${h}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Publish the chip-top offset that account-chip / account-menu read for
  // their `sm:top-[var(--chip-top)]` rule. Page at top → 1rem (the classic
  // top-4 corner placement). Page scrolled past the bar's natural position
  // → below the now-pinned bar so the chip and bar don't collide. On mobile
  // the day-card heading strip is also pinned right under the bar, so the
  // chip needs to clear that too (~3rem tall) — otherwise the chip floats
  // over the "Today · N events" line. Desktop keeps the tight 1rem gap
  // since the chip sits in the page's right margin, not over content.
  useEffect(() => {
    if (!isStuck) {
      document.documentElement.style.setProperty("--chip-top", "1rem");
      return;
    }
    const update = () => {
      const isMobile = window.matchMedia("(max-width: 639px)").matches;
      document.documentElement.style.setProperty(
        "--chip-top",
        `calc(var(--sticky-bar-h, 3rem) + ${isMobile ? "4rem" : "1rem"})`,
      );
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [isStuck]);

  return (
    <>
      <div ref={sentinelRef} className="h-0 w-0" />
      <div
        ref={barRef}
        className={`sticky top-0 z-10 py-3 mb-6 bg-white dark:bg-neutral-950 border-b transition-[border-color,box-shadow] duration-300 ${
          isStuck
            ? "border-neutral-200 dark:border-neutral-800 shadow-[0_8px_24px_-10px_rgba(0,0,0,0.05)] dark:shadow-[0_8px_24px_-10px_rgba(0,0,0,0.18)]"
            : "border-transparent"
        }`}
        style={{ marginLeft: "calc(-50vw + 50%)", marginRight: "calc(-50vw + 50%)", paddingLeft: "calc(50vw - 50%)", paddingRight: "calc(50vw - 50%)" } as React.CSSProperties}
      >
        {children}
      </div>
    </>
  );
}
