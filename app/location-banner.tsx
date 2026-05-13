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
    <div className="mb-4 rounded-md bg-blue-600 dark:bg-blue-500 text-white px-3 py-2 anim-fade-in flex items-center gap-3">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="w-4 h-4 shrink-0 text-blue-200"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      <p className="flex-1 min-w-0 truncate text-sm">
        Showing events in <span className="font-medium">{defaultLabel}</span>
      </p>
      <button
        onClick={openPicker}
        className="shrink-0 px-2.5 py-1 rounded-md bg-white text-blue-700 text-xs font-medium hover:bg-blue-50 transition cursor-pointer"
      >
        Change
      </button>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 -mr-1 p-1 text-blue-200 hover:text-white transition cursor-pointer"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
