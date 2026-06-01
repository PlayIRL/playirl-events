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
import { DEFAULT_LOCALE } from "@/lib/locale";
import { t } from "@/lib/i18n";

const DISMISSED_KEY = "playirl-loc-banner-dismissed";

interface Props {
  /** True when the page is rendering with the global default location.
   *  When false, the banner never shows — user has chosen a location. */
  isDefault: boolean;
  /** Default label shown in the banner copy ("Philly", etc.). */
  defaultLabel: string;
  /** Server-resolved BCP-47 locale used to translate the banner copy.
   *  Defaults to en-US for back-compat with callers that haven't threaded
   *  it through yet. */
  locale?: string;
}

export default function LocationBanner({ isDefault, defaultLabel, locale = DEFAULT_LOCALE }: Props) {
  const tr = (key: string, params?: Record<string, string | number>) => t(key, params, locale);
  // Hidden during SSR + first paint so we don't flash the banner for users
  // who already dismissed it. Mount → check localStorage → render.
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isDefault) return;
    let dismissed = false;
    try { dismissed = localStorage.getItem(DISMISSED_KEY) === "1"; } catch {}
    if (!dismissed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShow(true);
    }
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

  // The "showing_in" template carries a {place} slot. Interpolating a
  // zero-width-space sentinel lets us split on it and bold the label
  // independently — works regardless of word order across locales (e.g.
  // "Events in X" vs "À X, événements").
  const SEN = "​";
  const showingParts = tr("homepage.showing_in", { place: SEN }).split(SEN);

  return (
    <div className="mb-4 rounded-md border border-blue-300 dark:border-blue-500 text-blue-700 dark:text-blue-400 px-3 py-2 anim-fade-in flex items-center gap-3">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="w-4 h-4 shrink-0"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path fillRule="evenodd" clipRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" />
      </svg>
      <p className="flex-1 min-w-0 truncate text-sm">
        {showingParts[0]}
        <span className="font-medium">{defaultLabel}</span>
        {showingParts[1] ?? ""}
      </p>
      <button
        onClick={openPicker}
        className="shrink-0 px-2.5 py-1 rounded-md border border-blue-300 dark:border-blue-500 text-blue-700 dark:text-blue-400 text-xs font-semibold hover:bg-blue-50 dark:hover:bg-blue-500/15 transition cursor-pointer"
      >
        {tr("homepage.change")}
      </button>
      <button
        onClick={dismiss}
        aria-label={tr("homepage.dismiss")}
        className="shrink-0 -mr-1 p-1 text-blue-500/70 dark:text-blue-400/70 hover:text-blue-700 dark:hover:text-blue-300 transition cursor-pointer"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
