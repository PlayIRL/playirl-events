"use client";

import dynamic from "next/dynamic";

// react-leaflet pokes at `window` at module load, so MapView must never run in
// the SSR pass. This thin wrapper lets the server-rendered page.tsx hand off
// rendering to a client-only chunk without dragging the leaflet bundle into
// the initial HTML payload.
const MapView = dynamic(() => import("./map-view"), {
  ssr: false,
  loading: () => (
    <div className="rounded-lg overflow-hidden border border-neutral-200 dark:border-white/15 h-[70vh] min-h-[420px] flex items-center justify-center text-sm text-neutral-500 dark:text-neutral-400">
      Loading map…
    </div>
  ),
});

export default MapView;
