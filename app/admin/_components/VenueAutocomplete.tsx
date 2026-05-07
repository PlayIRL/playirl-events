"use client";
import { useEffect, useRef, useState } from "react";

export interface Venue {
  name: string;
  address: string;
  store_url: string;
  latitude: number | null;
  longitude: number | null;
  usage_count: number;
}

/**
 * Venue-name input with a typeahead dropdown. Reads known venues from
 * /api/venues (aggregated from past events + linked Discord sources) and
 * offers them as the user types. Picking a suggestion fires `onPick` so the
 * parent form can autofill address, website, coordinates, etc.
 *
 * Free-text is always allowed — typing a brand-new venue name just doesn't
 * match anything and the form submits with a fresh location.
 */
export default function VenueAutocomplete({
  value,
  onChange,
  onPick,
  className,
  placeholder,
  id,
}: {
  value: string;
  onChange: (next: string) => void;
  onPick: (venue: Venue) => void;
  className?: string;
  placeholder?: string;
  id?: string;
}) {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/venues")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setVenues(data as Venue[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!focused) return;
    function onDown(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setFocused(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [focused]);

  const q = value.trim().toLowerCase();
  const matches = q
    ? venues.filter((v) => v.name.toLowerCase().includes(q)).slice(0, 8)
    : [];
  // Don't show dropdown when the current value is an exact match for a single venue.
  const exact =
    matches.length === 1 && matches[0].name.toLowerCase() === q;
  const showDropdown = focused && matches.length > 0 && !exact;

  function pick(venue: Venue) {
    onPick(venue);
    setFocused(false);
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input
        id={id}
        className={className}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setHighlight(0);
        }}
        onFocus={() => setFocused(true)}
        onKeyDown={(e) => {
          if (!showDropdown) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(matches[highlight]);
          } else if (e.key === "Escape") {
            setFocused(false);
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={showDropdown}
        aria-autocomplete="list"
      />
      {showDropdown && (
        <ul
          role="listbox"
          className="absolute z-20 left-0 right-0 mt-1 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md shadow-lg max-h-64 overflow-y-auto"
        >
          {matches.map((v, i) => (
            <li key={v.name} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()} /* prevent blur-before-click */
                onClick={() => pick(v)}
                onMouseEnter={() => setHighlight(i)}
                className={`w-full text-left px-3 py-2 transition ${
                  i === highlight ? "bg-neutral-100 dark:bg-neutral-800" : "hover:bg-neutral-50 dark:hover:bg-neutral-800/70"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm text-neutral-900 dark:text-neutral-100 truncate">{v.name}</span>
                  {v.usage_count > 1 && (
                    <span className="text-[10px] text-neutral-500 dark:text-neutral-400 shrink-0">
                      {v.usage_count} events
                    </span>
                  )}
                </div>
                {v.address && (
                  <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{v.address}</div>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
