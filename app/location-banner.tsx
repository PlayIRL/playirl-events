"use client";

// Persistent first-visit nudge for users still on the default location.
// Shows whenever the homepage is rendering with the global default
// (currently "Philly") AND the user hasn't explicitly dismissed the
// banner. Goal: give a clearly visible "set your location" affordance to
// users who declined or never saw the browser's auto-geolocation prompt.
//
// Distinct from the location-picker's silent auto-prompt — that fires
// once via navigator.geolocation and has no UI fallback if denied. This
// banner *is* the UI fallback.
//
// Dismissed-state lives in localStorage under DISMISSED_KEY. Setting any
// non-default location (which clears `isLocationCustom=false`) makes the
// banner stop rendering on subsequent loads even without dismissal.

import { useEffect, useState } from "react";

const DISMISSED_KEY = "playirl-loc-banner-dismissed";

interface Props {
  /** True when the page is rendering with the global default location.
   *  When false, the banner never shows — user has chosen a location. */
  isDefault: boolean;
  /** Default label shown in the banner copy ("Philly", etc.). */
  defaultLabel: string;
}

export default function LocationBanner({ isDefault, defaultLabel }: Props) {
  // Hidden during SSR + first paint so we don't flash the banner for users
  // who already dismissed it. Mount → check localStorage → render.
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isDefault) return;
    let dismissed = false;
    try { dismissed = localStorage.getItem(DISMISSED_KEY) === "1"; } catch {}
    if (!dismissed) setShow(true);
  }, [isDefault]);

  function dismiss() {
    setShow(false);
    try { localStorage.setItem(DISMISSED_KEY, "1"); } catch {}
  }

  function openPicker() {
    // The location picker is the underlined location chip in the filter
    // bar. We don't have a direct ref here (it's a separate client
    // component on the same page), so trigger a click on the button by
    // selector. Falls back to scrolling the chip into view if the click
    // can't fire — defensive against future selector changes.
    const trigger = document.querySelector<HTMLButtonElement>(
      'button[title*="location" i], button[title*="change" i]',
    );
    if (trigger) {
      trigger.scrollIntoView({ behavior: "smooth", block: "center" });
      // Slight delay so the scroll lands before the popover opens — the
      // user's eye should already be on the chip when it expands.
      setTimeout(() => trigger.click(), 250);
    }
  }

  if (!show) return null;

  return (
    <div className="mb-4 mx-auto max-w-2xl rounded-md border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 anim-fade-in">
      <div className="flex items-start gap-3">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-5 h-5 shrink-0 mt-0.5 text-amber-700 dark:text-amber-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
            Showing events in {defaultLabel}
          </p>
          <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-0.5">
            Not where you are? Pick your city to find events near you.
          </p>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={openPicker}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-600 dark:bg-amber-500 text-white text-xs font-medium hover:bg-amber-700 dark:hover:bg-amber-400 transition"
            >
              Change location
            </button>
            <button
              onClick={dismiss}
              className="px-2 py-1.5 text-xs text-amber-800 dark:text-amber-300 hover:text-amber-950 dark:hover:text-amber-100 transition"
            >
              Dismiss
            </button>
          </div>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 -mr-1 -mt-1 p-1 text-amber-700/70 dark:text-amber-400/70 hover:text-amber-900 dark:hover:text-amber-200 transition"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
