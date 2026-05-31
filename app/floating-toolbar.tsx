"use client";
import { useEffect, useRef, useState } from "react";

const ICON = "w-5 h-5 sm:w-6 sm:h-6";

function ListIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={ICON} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12" />
      <circle cx="4" cy="6.75" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="17.25" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={ICON} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 3v3m8-3v3M4 9h16M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
      <circle cx="8" cy="13" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="13" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="16" cy="13" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="8" cy="17" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={ICON} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
    </svg>
  );
}

export default function FloatingToolbar({ currentView }: { currentView: string }) {
  const [activeView, setActiveView] = useState(currentView);
  const ref = useRef<HTMLDivElement>(null);

  function setView(view: string) {
    if (view === activeView) return;
    setActiveView(view);
    const url = new URL(window.location.href);
    url.searchParams.set("view", view);
    setTimeout(() => { window.location.href = url.toString(); }, 220);
  }

  // iOS Safari refuses to anchor `position: fixed; bottom` reliably to
  // the *visible* viewport — the toolbar drifts above where the URL bar
  // ends, leaving a large empty band beneath. CSS alone can't fix this
  // across iOS versions (interactiveWidget=resizes-content helped on
  // some, hurt on others). Belt-and-braces: dynamically track the
  // VisualViewport and translate the toolbar so its bottom edge sits
  // 12px above the actual visible bottom regardless of URL-bar state.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      if (!ref.current) return;
      // How far the visible-viewport bottom is from the layout-viewport
      // bottom. When URL bar is hidden this is 0; when shown it's the
      // URL bar height. Adding it to our base offset keeps the toolbar
      // pinned to the visible bottom.
      const layoutBottomGap = Math.max(
        0,
        window.innerHeight - vv.height - vv.offsetTop,
      );
      // Use the modern `translate` property (NOT `transform`) so this
      // composes correctly with Tailwind 4's `-translate-x-1/2` — which
      // in v4 compiles to the `translate` property, not `transform`.
      // Setting `style.transform` would stack on top of Tailwind's
      // translate and shift the toolbar a full element-width too far
      // left (the toolbar gets `-50%` twice, ending up off-screen).
      ref.current.style.translate = `-50% -${layoutBottomGap}px`;
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="fixed left-1/2 -translate-x-1/2 z-40 flex"
      // Base offset is the home-indicator safe area; the useEffect above
      // adds a JS-tracked translateY on iOS Safari when the URL bar is
      // taking visible-viewport space. `transform` is overwritten by the
      // effect on iOS — the inline `-translate-x-1/2` class is just the
      // SSR fallback for the first frame before hydration runs.
      style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="relative flex flex-row bg-white dark:bg-neutral-950 rounded-md p-1 border border-neutral-200 dark:border-white/15 shadow-xl shadow-black/15 dark:shadow-black/50">
        {/* Sliding selection pill — width matches a single button, transform
            step = button width + 4px gap. Tailwind generates both mobile
            (60/120px) and sm: (84/168px) variants so the bar tracks the
            active tab at either breakpoint without runtime media queries. */}
        <div
          className={`absolute top-1 bottom-1 left-1 w-14 sm:w-20 rounded-md bg-neutral-100 dark:bg-neutral-800 shadow-sm transition-transform duration-200 ease-out ${
            activeView === "calendar"
              ? "translate-x-[60px] sm:translate-x-[84px]"
              : activeView === "map"
                ? "translate-x-[120px] sm:translate-x-[168px]"
                : "translate-x-0"
          }`}
        />
        <button
          onClick={() => setView("list")}
          title="List view"
          className={`relative z-10 flex flex-col items-center justify-center gap-1 w-14 h-14 sm:w-20 sm:h-16 rounded-md transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/40 dark:focus-visible:ring-white/20 ${activeView === "list" ? "text-neutral-900 dark:text-white" : "text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white"}`}
        >
          <ListIcon />
          <span className="text-[11px] sm:text-xs font-semibold leading-none">List</span>
        </button>
        <button
          onClick={() => setView("calendar")}
          title="Calendar view"
          className={`relative z-10 flex flex-col items-center justify-center gap-1 w-14 h-14 sm:w-20 sm:h-16 rounded-md transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/40 dark:focus-visible:ring-white/20 ml-1 ${activeView === "calendar" ? "text-neutral-900 dark:text-white" : "text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white"}`}
        >
          <CalendarIcon />
          <span className="text-[11px] sm:text-xs font-semibold leading-none">Calendar</span>
        </button>
        <button
          onClick={() => setView("map")}
          title="Map view"
          className={`relative z-10 flex flex-col items-center justify-center gap-1 w-14 h-14 sm:w-20 sm:h-16 rounded-md transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/40 dark:focus-visible:ring-white/20 ml-1 ${activeView === "map" ? "text-neutral-900 dark:text-white" : "text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white"}`}
        >
          <MapIcon />
          <span className="text-[11px] sm:text-xs font-semibold leading-none">Map</span>
        </button>
      </div>
    </div>
  );
}
