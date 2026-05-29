"use client";

// Location picker popover for the homepage filter bar's "Philly" chip.
// Three input methods + a reset, in one compact dropdown that matches the
// other ChipSelect popovers in radius-selector.tsx.
//
// State is plumbed through URL params (`loc` / `lat` / `lng`) — the picker
// itself is purely client-side. The page reads those params, resolves
// (URL → user_preferences → config.location.default), and feeds the result
// into getActiveEvents. The picker doesn't need to know anything about
// persistence; that lives server-side in app/page.tsx.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { DEFAULT_LOCALE } from "@/lib/locale";
import { t } from "@/lib/i18n";

const PROMPTED_KEY = "playirl-loc-prompted";

// Kept in sync with the ChipSelect trigger in `app/radius-selector.tsx`
// — outline chip + caret to read clearly as a clickable filter on mobile.
const CHIP_TRIGGER =
  "inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-white font-[family-name:var(--font-ultra)] focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/40 dark:focus-visible:ring-white/20 cursor-pointer bg-transparent hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-500 active:opacity-80 transition-colors duration-150";
// Portal-rendered popover (see positioning logic below). `fixed` so it
// escapes ancestor stacking contexts and the StickyBar's `position:
// sticky` scroller; width caps at `calc(100vw - 16px)` to keep the
// popover inside the viewport on narrow phones where the trigger sits
// far from the right edge.
const POPOVER =
  "fixed z-50 w-72 max-w-[calc(100vw-16px)] bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-white/10 rounded-md shadow-xl overflow-y-auto overscroll-contain max-h-[70vh]";
const PRIMARY_BTN =
  "w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white hover:bg-neutral-200 dark:hover:bg-neutral-700 transition disabled:opacity-50 cursor-pointer";
const INPUT =
  "w-full px-2.5 py-2 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-400/40 dark:focus:ring-white/20";

interface Props {
  /** Currently-displayed label in the chip. Defaults to "Philly". */
  currentLabel: string;
  /** True when the user has actively chosen a non-default location. Drives
   *  the visibility of the "Reset to default" link. */
  isCustom: boolean;
  /** Server-side `defaultLabel` for the chip (typically "Philly"). */
  defaultLabel: string;
  /** Server-resolved viewer locale. Threaded down so the placeholder text
   *  matches SSR (no hydration mismatch); defaults to en-US for back-compat
   *  with any callers not yet passing it. */
  locale?: string;
}

export default function LocationPicker({ currentLabel, isCustom, defaultLabel, locale = DEFAULT_LOCALE }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"geo" | "search" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Click-outside-to-close. Both the trigger wrapper AND the portal-
  // rendered menu count as "inside" — the menu lives in document.body so
  // clicks inside it would otherwise look like outside-clicks.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (wrapperRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Anchor the portal-rendered popover under the trigger and clamp it to
  // the viewport. Matches the pattern used by the Subscribe / Create
  // event dropdowns in `app/radius-selector.tsx`.
  useEffect(() => {
    if (!open) { setPos(null); return; }
    const raf = requestAnimationFrame(() => {
      if (!wrapperRef.current || !menuRef.current) return;
      const trigger = wrapperRef.current.getBoundingClientRect();
      const menu = menuRef.current.getBoundingClientRect();
      const MARGIN = 8;
      let left = trigger.right - menu.width;
      left = Math.max(MARGIN, Math.min(window.innerWidth - menu.width - MARGIN, left));
      setPos({ top: trigger.bottom + 8, left });
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // Close on scroll/resize so the popover doesn't get stranded when its
  // anchor scrolls away under fixed positioning.
  //
  // EXCEPT when focus is inside the popover: on mobile, focusing the
  // search input opens the virtual keyboard, which fires both a resize
  // (viewport shrinks) and a scroll (browser pulls the focused input
  // into view) — which would unconditionally close the popover before
  // the user could type a single character. Guarding on activeElement
  // distinguishes "user scrolled the page" from "keyboard appeared
  // because the user is using the popover".
  useEffect(() => {
    if (!open) return;
    const onChange = () => {
      if (menuRef.current?.contains(document.activeElement)) return;
      setOpen(false);
    };
    window.addEventListener("scroll", onChange, { passive: true });
    window.addEventListener("resize", onChange);
    return () => {
      window.removeEventListener("scroll", onChange);
      window.removeEventListener("resize", onChange);
    };
  }, [open]);

  // Auto-focus input when popover opens.
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const commitLocation = useCallback(
    (label: string, lat: number, lng: number) => {
      const next = new URLSearchParams(searchParams?.toString() ?? "");
      next.set("loc", label);
      // Round to 3 decimals (~110m) before putting in the URL — privacy +
      // shorter URLs. Plenty precise for a mile-radius filter.
      next.set("lat", lat.toFixed(3));
      next.set("lng", lng.toFixed(3));
      router.push(`?${next.toString()}`);
      // App Router caches by URL segment; same-path query changes don't
      // invalidate. refresh() forces the server component to re-run so the
      // events list reflects the new lat/lng.
      router.refresh();
      setOpen(false);
      setError(null);
      setQuery("");
    },
    [router, searchParams],
  );

  const useGeolocation = useCallback(() => {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Your browser doesn't support geolocation.");
      return;
    }
    setBusy("geo");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res = await fetch("/api/geocode/reverse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ latitude, longitude }),
          });
          const data = await res.json().catch(() => ({}));
          const label =
            res.ok && data.label
              ? (data.label as string)
              : `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
          commitLocation(label, latitude, longitude);
        } catch {
          // Even on reverse-geocode failure, we can still use the coords —
          // just display them as the label.
          commitLocation(`${latitude.toFixed(2)}, ${longitude.toFixed(2)}`, latitude, longitude);
        } finally {
          setBusy(null);
          try { localStorage.setItem(PROMPTED_KEY, "1"); } catch {}
        }
      },
      (err) => {
        setBusy(null);
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Browser blocked location access."
            : "Couldn't get your location.",
        );
        try { localStorage.setItem(PROMPTED_KEY, "1"); } catch {}
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60 * 60_000 },
    );
  }, [commitLocation]);

  const submitSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setError(null);
    setBusy("search");
    try {
      const res = await fetch(`/api/geocode/forward?q=${encodeURIComponent(q)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.latitude !== "number") {
        setError(res.status === 429 ? "Too many requests — wait a moment." : "No matches found.");
        return;
      }
      commitLocation(data.label ?? q, data.latitude, data.longitude);
    } catch {
      setError("Search failed.");
    } finally {
      setBusy(null);
    }
  }, [query, commitLocation]);

  const reset = useCallback(() => {
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    next.delete("loc");
    next.delete("lat");
    next.delete("lng");
    router.push(next.toString() ? `?${next.toString()}` : "/");
    router.refresh();
    setOpen(false);
  }, [router, searchParams]);

  // Auto-detect on first visit. Triggers exactly once per browser (sentinel
  // in localStorage) and only if the user hasn't already set a location via
  // URL params.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isCustom) return;
    let prompted = false;
    try { prompted = localStorage.getItem(PROMPTED_KEY) === "1"; } catch {}
    if (prompted) return;
    // Defer one tick so the page renders before the prompt — feels less
    // jarring than asking on the very first paint.
    const t = setTimeout(useGeolocation, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        className={CHIP_TRIGGER}
        title={isCustom ? `Showing events near ${currentLabel}. Click to change.` : "Click to change location"}
      >
        <span>{currentLabel}</span>
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 shrink-0 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          className={POPOVER}
          style={{
            top: pos ? `${pos.top}px` : -9999,
            left: pos ? `${pos.left}px` : -9999,
            visibility: pos ? "visible" : "hidden",
          }}
        >
          <div className="px-3 py-2.5 border-b border-neutral-100 dark:border-white/8">
            <p className="text-[10px] font-semibold text-neutral-500 dark:text-neutral-400">
              Choose location
            </p>
          </div>

          <div className="p-3 space-y-3">
            <button
              onClick={useGeolocation}
              disabled={busy === "geo"}
              className={PRIMARY_BTN}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 11.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9c0 6-7 13-7 13s-7-7-7-13a7 7 0 1114 0z" />
              </svg>
              {busy === "geo" ? "Locating…" : "Use my current location"}
            </button>

            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-700" />
              <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                or search
              </span>
              <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-700" />
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); submitSearch(); }}
              className="space-y-2"
            >
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("location_picker.placeholder", undefined, locale)}
                className={INPUT}
                disabled={busy === "search"}
              />
              <button
                type="submit"
                disabled={!query.trim() || busy === "search"}
                className="w-full inline-flex items-center justify-center px-3 py-2 text-sm font-medium rounded-md border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition disabled:opacity-50 cursor-pointer"
              >
                {busy === "search" ? "Searching…" : "Search"}
              </button>
            </form>

            {error && (
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            )}
          </div>

          {isCustom && (
            <div className="px-3 py-2 border-t border-neutral-100 dark:border-white/8">
              <button
                onClick={reset}
                className="text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition"
              >
                ← Reset to default ({defaultLabel})
              </button>
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
