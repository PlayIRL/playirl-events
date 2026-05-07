"use client";

const SEG_BTN = "flex items-center justify-center w-7 h-7 rounded-md transition-all cursor-pointer";
const SEG_ACTIVE = "bg-white dark:bg-white/15 shadow-sm text-neutral-900 dark:text-white";
const SEG_INACTIVE = "text-neutral-500 dark:text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300";

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

function CalendarDaysIcon() {
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

export default function ViewToggle({ currentView }: { currentView: string }) {
  function setView(view: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("view", view);
    window.location.href = url.toString();
  }

  return (
    <div className="flex flex-col gap-0.5 bg-neutral-100 dark:bg-white/5 rounded-xl p-0.5 border border-neutral-100 dark:border-white/8 shadow-sm">
      <button onClick={() => setView("list")} title="List view" className={`${SEG_BTN} ${currentView === "list" ? SEG_ACTIVE : SEG_INACTIVE}`}>
        <ListIcon />
      </button>
      <button onClick={() => setView("calendar")} title="Calendar view" className={`${SEG_BTN} ${currentView === "calendar" ? SEG_ACTIVE : SEG_INACTIVE}`}>
        <CalendarDaysIcon />
      </button>
    </div>
  );
}
