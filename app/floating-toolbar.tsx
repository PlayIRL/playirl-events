"use client";
import { useState } from "react";

function ListIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12" />
      <circle cx="4" cy="6.75" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="17.25" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
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
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
    </svg>
  );
}

export default function FloatingToolbar({ currentView }: { currentView: string }) {
  const [activeView, setActiveView] = useState(currentView);

  function setView(view: string) {
    if (view === activeView) return;
    setActiveView(view);
    const url = new URL(window.location.href);
    url.searchParams.set("view", view);
    setTimeout(() => { window.location.href = url.toString(); }, 220);
  }

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-40 flex"
      style={{ bottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
    >
      <div className="relative flex flex-row bg-neutral-100/80 dark:bg-neutral-900 rounded-md p-1 border border-neutral-200/60 dark:border-white/10 shadow-lg shadow-black/10 dark:shadow-black/40 backdrop-blur-sm">
        <div
          className="absolute top-1 bottom-1 w-16 rounded-md bg-white dark:bg-white/12 shadow-sm transition-transform duration-200 ease-out"
          style={{
            left: "4px",
            transform: `translateX(${activeView === "calendar" ? 68 : activeView === "map" ? 136 : 0}px)`,
          }}
        />
        <button
          onClick={() => setView("list")}
          title="List view"
          className={`relative z-10 flex flex-col items-center justify-center gap-0.5 w-16 h-12 rounded-md transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/40 dark:focus-visible:ring-white/20 ${activeView === "list" ? "text-neutral-900 dark:text-white" : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-400"}`}
        >
          <ListIcon />
          <span className="text-[10px] font-medium leading-none">List</span>
        </button>
        <button
          onClick={() => setView("calendar")}
          title="Calendar view"
          className={`relative z-10 flex flex-col items-center justify-center gap-0.5 w-16 h-12 rounded-md transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/40 dark:focus-visible:ring-white/20 ml-1 ${activeView === "calendar" ? "text-neutral-900 dark:text-white" : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-400"}`}
        >
          <CalendarIcon />
          <span className="text-[10px] font-medium leading-none">Calendar</span>
        </button>
        <button
          onClick={() => setView("map")}
          title="Map view"
          className={`relative z-10 flex flex-col items-center justify-center gap-0.5 w-16 h-12 rounded-md transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/40 dark:focus-visible:ring-white/20 ml-1 ${activeView === "map" ? "text-neutral-900 dark:text-white" : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-400"}`}
        >
          <MapIcon />
          <span className="text-[10px] font-medium leading-none">Map</span>
        </button>
      </div>
    </div>
  );
}
