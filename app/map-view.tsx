"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  APIProvider,
  Map as GoogleMap,
  AdvancedMarker,
  InfoWindow,
  useMap,
} from "@vis.gl/react-google-maps";
import { FORMAT_BADGE, FORMAT_BADGE_DEFAULT } from "@/lib/format-style";
import { formatEventTime } from "@/lib/format-time";

const METERS_PER_MILE = 1609.344;
// Round to ~10m precision so events at the same physical venue collapse to a
// single pin even when their stored coords differ by a few decimal places.
const COORD_PRECISION = 4;
// Google's public demo Map ID — required to render AdvancedMarker. Swap with
// a project-specific Map ID created in Cloud Console for production styling.
const MAP_ID = "DEMO_MAP_ID";

interface EventRow {
  id: string;
  title: string;
  format: string;
  date: string;
  time: string;
  timezone: string;
  location: string;
  cost: string;
  store_url: string;
  latitude: number | null;
  longitude: number | null;
}

interface VenueGroup {
  /** Rounded lat/lng — the "key" the marker pins to. */
  lat: number;
  lng: number;
  /** Display name from the first event at this location. */
  label: string;
  events: EventRow[];
}

function groupByVenue(events: EventRow[]): VenueGroup[] {
  const groups = new Map<string, VenueGroup>();
  for (const ev of events) {
    if (ev.latitude == null || ev.longitude == null) continue;
    const lat = Number(ev.latitude.toFixed(COORD_PRECISION));
    const lng = Number(ev.longitude.toFixed(COORD_PRECISION));
    const key = `${lat},${lng}`;
    const existing = groups.get(key);
    if (existing) existing.events.push(ev);
    else groups.set(key, { lat, lng, label: ev.location || "Venue", events: [ev] });
  }
  for (const g of groups.values()) {
    g.events.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }
  return [...groups.values()];
}

// Haversine — used for the radius computation below so we don't need to load
// the optional `geometry` library just for `computeDistanceBetween`.
function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const x = sinDLat * sinDLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export default function MapView({
  events,
  centerLat,
  centerLng,
  radiusMiles,
}: {
  events: EventRow[];
  centerLat: number;
  centerLng: number;
  radiusMiles: number;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;
  const groups = useMemo(() => groupByVenue(events), [events]);
  const center = useMemo(() => ({ lat: centerLat, lng: centerLng }), [centerLat, centerLng]);
  const totalMapped = groups.reduce((sum, g) => sum + g.events.length, 0);
  const unmapped = events.length - totalMapped;

  const [pendingSearch, setPendingSearch] = useState<{ lat: number; lng: number; radiusMiles: number } | null>(null);
  const [activeVenue, setActiveVenue] = useState<VenueGroup | null>(null);

  function applyPendingSearch() {
    if (!pendingSearch) return;
    const url = new URL(window.location.href);
    url.searchParams.set("lat", pendingSearch.lat.toFixed(5));
    url.searchParams.set("lng", pendingSearch.lng.toFixed(5));
    url.searchParams.set("radius", String(pendingSearch.radiusMiles));
    window.location.href = url.toString();
  }

  if (!apiKey) {
    return (
      <div className="rounded-lg border border-neutral-200 dark:border-white/15 bg-white dark:bg-neutral-900 p-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
        Google Maps API key not configured. Set <code className="text-xs">NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY</code> in the environment.
      </div>
    );
  }

  return (
    <div className="relative rounded-lg overflow-hidden border border-neutral-200 dark:border-white/15 h-[70vh] min-h-[420px]">
        <APIProvider apiKey={apiKey}>
          <GoogleMap
            mapId={MAP_ID}
            defaultCenter={center}
            defaultZoom={11}
            disableDefaultUI={false}
            gestureHandling="greedy"
            clickableIcons={false}
            className="h-full w-full"
          >
            <FitBounds groups={groups} fallback={center} />
            <RadiusCircle center={center} radiusMeters={radiusMiles * METERS_PER_MILE} />
            <MovementWatcher
              initialCenter={center}
              onMoved={(p) => setPendingSearch(p)}
            />

            {groups.map((g) => (
              <AdvancedMarker
                key={`${g.lat},${g.lng}`}
                position={{ lat: g.lat, lng: g.lng }}
                onClick={() => setActiveVenue(g)}
              >
                <CountBadge count={g.events.length} />
              </AdvancedMarker>
            ))}

            {activeVenue && (
              <InfoWindow
                position={{ lat: activeVenue.lat, lng: activeVenue.lng }}
                onCloseClick={() => setActiveVenue(null)}
                pixelOffset={[0, -36]}
              >
                <VenuePopup venue={activeVenue} />
              </InfoWindow>
            )}
          </GoogleMap>
        </APIProvider>

        {pendingSearch && (
          <button
            onClick={applyPendingSearch}
            className="absolute top-3 left-1/2 -translate-x-1/2 z-[1] inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-sm font-medium shadow-lg hover:bg-neutral-800 dark:hover:bg-neutral-200 transition cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v8m-4-4h8m6 0a10 10 0 11-20 0 10 10 0 0120 0z" />
            </svg>
            Recenter
          </button>
        )}

        {/* Stats badge — bottom-center overlay. Sits above the Google attribution
            line via a small bottom offset so it doesn't compete with it. */}
        <div className="absolute bottom-7 left-1/2 -translate-x-1/2 z-[1] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-neutral-900/90 dark:bg-neutral-100/90 text-white dark:text-neutral-900 text-xs font-medium shadow-lg backdrop-blur-sm pointer-events-none">
          <span>
            {groups.length} venue{groups.length === 1 ? "" : "s"} · {totalMapped} mapped event{totalMapped === 1 ? "" : "s"}
          </span>
          {unmapped > 0 && (
            <span className="text-neutral-400 dark:text-neutral-500" title="Events without geocoded coordinates aren't shown on the map">
              · {unmapped} unmapped
            </span>
          )}
        </div>
      </div>
  );
}

function CountBadge({ count }: { count: number }) {
  // Custom div-marker styling — sized by event count so denser venues stand
  // out, capped so a 100-event venue doesn't blow up the map.
  const size = Math.min(28 + Math.log2(count) * 6, 48);
  return (
    <div
      style={{
        width: size,
        height: size,
        background: "#171717",
        color: "white",
        border: "2px solid white",
        borderRadius: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 600,
        fontSize: count > 99 ? 11 : 13,
        boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
        cursor: "pointer",
      }}
    >
      {count}
    </div>
  );
}

function VenuePopup({ venue }: { venue: VenueGroup }) {
  return (
    <div style={{ minWidth: 200, maxWidth: 280 }}>
      <div className="text-sm font-semibold text-neutral-900 mb-1.5">
        {venue.label}
      </div>
      <ul className="space-y-1.5 max-h-64 overflow-y-auto">
        {venue.events.map((ev) => (
          <li key={ev.id}>
            <Link
              href={`/event/${encodeURIComponent(ev.id)}`}
              className="block text-xs leading-snug hover:underline"
            >
              <div className="text-neutral-500">
                {formatShortDate(ev.date)} · {formatEventTime(ev.date, ev.time, ev.timezone)}
              </div>
              <div className="text-neutral-900 font-medium">{ev.title}</div>
              {ev.format && (
                <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded-sm text-[9px] font-bold ${FORMAT_BADGE[ev.format] || FORMAT_BADGE_DEFAULT}`}>
                  {ev.format}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Recenters / re-zooms the map whenever the visible event set changes —
// useful when filters or date jumps move the pins outside the previous view.
function FitBounds({ groups, fallback }: { groups: VenueGroup[]; fallback: { lat: number; lng: number } }) {
  const map = useMap();
  const lastSig = useRef("");
  useEffect(() => {
    if (!map) return;
    const sig = groups.map((g) => `${g.lat},${g.lng}`).sort().join("|");
    if (sig === lastSig.current) return;
    lastSig.current = sig;
    if (groups.length === 0) {
      map.setCenter(fallback);
      map.setZoom(11);
      return;
    }
    if (groups.length === 1) {
      map.setCenter({ lat: groups[0].lat, lng: groups[0].lng });
      map.setZoom(13);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    groups.forEach((g) => bounds.extend({ lat: g.lat, lng: g.lng }));
    map.fitBounds(bounds, 60);
  }, [groups, map, fallback]);
  return null;
}

// Renders the active filter radius as a circle. Imperative because vis.gl
// doesn't ship a Circle component — we mount it on the map and clean up on
// unmount or center/radius change.
function RadiusCircle({
  center,
  radiusMeters,
}: {
  center: { lat: number; lng: number };
  radiusMeters: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const circle = new google.maps.Circle({
      map,
      center,
      radius: radiusMeters,
      strokeColor: "#171717",
      strokeOpacity: 0.7,
      strokeWeight: 1.5,
      fillColor: "#171717",
      fillOpacity: 0.05,
      clickable: false,
    });
    return () => {
      circle.setMap(null);
    };
  }, [map, center, radiusMeters]);
  return null;
}

// Watches map idle events; when the user pans/zooms away from the active
// search center, the parent shows a Recenter button. The new radius is the
// distance from the map's center to the closest viewport edge midpoint, so
// the next search neatly fits the visible map.
function MovementWatcher({
  initialCenter,
  onMoved,
}: {
  initialCenter: { lat: number; lng: number };
  onMoved: (p: { lat: number; lng: number; radiusMiles: number } | null) => void;
}) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const handler = () => {
      const c = map.getCenter();
      if (!c) return;
      const lat = c.lat();
      const lng = c.lng();
      const moved =
        Math.abs(lat - initialCenter.lat) > 0.001 ||
        Math.abs(lng - initialCenter.lng) > 0.001;
      if (!moved) {
        onMoved(null);
        return;
      }
      const bounds = map.getBounds();
      if (!bounds) return;
      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();
      const cLat = c.lat();
      const cLng = c.lng();
      const meters = Math.min(
        metersBetween({ lat: cLat, lng: cLng }, { lat: cLat, lng: ne.lng() }),
        metersBetween({ lat: cLat, lng: cLng }, { lat: cLat, lng: sw.lng() }),
        metersBetween({ lat: cLat, lng: cLng }, { lat: ne.lat(), lng: cLng }),
        metersBetween({ lat: cLat, lng: cLng }, { lat: sw.lat(), lng: cLng }),
      );
      onMoved({ lat, lng, radiusMiles: Math.max(1, Math.round(meters / METERS_PER_MILE)) });
    };
    const listener = map.addListener("idle", handler);
    return () => listener.remove();
  }, [map, initialCenter, onMoved]);
  return null;
}

function formatShortDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
