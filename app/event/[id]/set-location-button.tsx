"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Small "Set location" button that triggers browser geolocation and writes
 * the result into the URL (`?lat=…&lng=…&loc=…`). The detail page reads
 * those params via `resolveUserLocation`, so after the round-trip the page
 * re-renders with a real "X mi away" line in place of this button.
 *
 * Mirrors the geolocation arm of LocationPicker on the homepage but without
 * the popover / manual-search shell — this is a single-purpose CTA inline
 * with the venue name.
 */
export default function SetLocationButton() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Geolocation unavailable");
      return;
    }
    setBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        let label = `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
        try {
          const res = await fetch("/api/geocode/reverse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ latitude, longitude }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.label) label = data.label as string;
        } catch {
          // Reverse-geocode failed — fall back to raw coords as the label.
        }
        const next = new URLSearchParams(searchParams?.toString() ?? "");
        next.set("loc", label);
        next.set("lat", latitude.toFixed(3));
        next.set("lng", longitude.toFixed(3));
        router.push(`?${next.toString()}`);
        router.refresh();
        setBusy(false);
      },
      (err) => {
        setBusy(false);
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location blocked"
            : "Couldn't locate",
        );
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60 * 60_000 },
    );
  }, [router, searchParams]);

  if (error) {
    return <span className="text-xs text-neutral-500 dark:text-neutral-400">{error}</span>;
  }

  return (
    <button
      type="button"
      onClick={handle}
      disabled={busy}
      className="inline-flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 hover:underline disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
      title="Use your current location to show how far this event is"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      {busy ? "Locating…" : "Set Your Location"}
    </button>
  );
}
