export const dynamic = "force-dynamic";

import { getActiveEvents, getFormats, getSetting, setSetting } from "@/lib/events";
import { getSavedEventIds } from "@/lib/event-saves";
import { getPreferences, setPreferences } from "@/lib/user-preferences";
import { getCurrentUser } from "@/lib/session";
import { resolveEventImage } from "@/lib/event-image";
import { dateStrInTz } from "@/lib/format-time";
import { getLabelForCoords } from "@/lib/geocode";
import { config } from "@/lib/config";
import DateJumper from "./date-jumper";
import RadiusSelector from "./radius-selector";
import CalendarView from "./calendar-view";
import MapView from "./map-view-loader";
import StickyBar from "./sticky-bar";
import FloatingToolbar from "./floating-toolbar";
import AboutInfoButton from "./about-info-button";
import LocationBanner from "./location-banner";
import DayCard from "./day-card";
import Reveal from "./reveal";
import Link from "next/link";
import AccountChip from "./account-chip";
import { PlayIrlLogo } from "./playirl-logo";

function dayHeadingLabel(dateStr: string, todayStr: string, tomorrowStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
  const monthDay = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (dateStr === todayStr) return `Today · ${weekday}, ${monthDay}`;
  if (dateStr === tomorrowStr) return `Tomorrow · ${weekday}, ${monthDay}`;
  return `${weekday}, ${monthDay}`;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{
    format?: string; radius?: string; days?: string; view?: string; offset?: string;
    /** Location override (URL primary). Triple of label + lat + lng. */
    loc?: string; lat?: string; lng?: string;
  }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const signedIn = !!user && !user.suspended;

  // Filter defaults: URL param > per-user prefs (signed-in) > global setting (signed-out) > hardcoded default.
  const prefs = signedIn ? getPreferences(user.id) : null;
  const defaultRadius = prefs?.radius_miles ?? parseInt(getSetting("search_radius_miles") || "10", 10);
  const defaultDays = prefs?.days_ahead ?? 7;
  const defaultFormat = prefs?.formats[0] ?? "";

  const currentRadius = params.radius ? parseInt(params.radius, 10) : defaultRadius;
  const currentView = params.view || "list";
  // Map view defaults to today (1 day) instead of the global week default —
  // a map of the next 7 days clusters too many pins to be useful for "what's
  // happening tonight". Explicit `?days=` always wins.
  const currentDays = params.days
    ? parseInt(params.days, 10)
    : currentView === "map" ? 1 : defaultDays;
  const currentFormat = params.format ?? defaultFormat;
  const currentOffset = params.offset ? Math.max(0, parseInt(params.offset, 10)) : 0;

  // Location resolution: URL params > user_preferences > config.location default.
  // Default label is "Philly" — the brand-friendly short form rather than the
  // formal "Philadelphia, PA" so the chip stays compact on small viewports.
  const DEFAULT_LOCATION_LABEL = "Philly";
  const urlLat = params.lat ? parseFloat(params.lat) : NaN;
  const urlLng = params.lng ? parseFloat(params.lng) : NaN;
  const hasUrlLocation = Number.isFinite(urlLat) && Number.isFinite(urlLng) && urlLat >= -90 && urlLat <= 90 && urlLng >= -180 && urlLng <= 180;
  const hasPrefsLocation = prefs?.location_lat != null && prefs?.location_lng != null;
  const currentLocationLat = hasUrlLocation ? urlLat : (hasPrefsLocation ? prefs!.location_lat! : config.location.lat);
  const currentLocationLng = hasUrlLocation ? urlLng : (hasPrefsLocation ? prefs!.location_lng! : config.location.lng);
  // Label resolution: explicit `loc` param wins. Otherwise, when the URL
  // carries lat/lng but no label, reverse-geocode (cached by ~1km grid) so
  // the chip reflects the actual filter location instead of stale "Philly".
  // Falls back to the default label if Nominatim is unavailable.
  let currentLocationLabel: string;
  if (hasUrlLocation) {
    const explicit = params.loc?.trim();
    if (explicit) {
      currentLocationLabel = explicit;
    } else {
      const resolved = await getLabelForCoords(urlLat, urlLng);
      currentLocationLabel = resolved ?? DEFAULT_LOCATION_LABEL;
    }
  } else if (hasPrefsLocation && prefs!.location_label) {
    currentLocationLabel = prefs!.location_label;
  } else {
    currentLocationLabel = DEFAULT_LOCATION_LABEL;
  }
  const isLocationCustom = hasUrlLocation || hasPrefsLocation;

  // Persist any filter change so the next visit restores it.
  if (signedIn && user) {
    const patch: Parameters<typeof setPreferences>[1] = {};
    if (params.radius && currentRadius !== prefs?.radius_miles) patch.radius_miles = currentRadius;
    if (params.days && currentDays !== prefs?.days_ahead) patch.days_ahead = currentDays;
    // `format` param can be explicitly empty (user cleared the filter) — still persist that.
    if (params.format !== undefined && currentFormat !== (prefs?.formats[0] ?? "")) {
      patch.formats = currentFormat ? [currentFormat] : [];
    }
    // Location: persist when URL params are present (user just changed it).
    // We mirror the `if param !== undefined` pattern from `format` so an
    // explicit "reset" (URL param missing → null) propagates to prefs too.
    if (params.lat !== undefined || params.lng !== undefined || params.loc !== undefined) {
      if (hasUrlLocation) {
        if (currentLocationLat !== prefs?.location_lat) patch.location_lat = currentLocationLat;
        if (currentLocationLng !== prefs?.location_lng) patch.location_lng = currentLocationLng;
        if (currentLocationLabel !== prefs?.location_label) patch.location_label = currentLocationLabel;
      } else if (params.lat === "" || params.loc === "") {
        // Explicit clear (e.g. via the "Reset to default" link).
        patch.location_lat = null;
        patch.location_lng = null;
        patch.location_label = "";
      }
    }
    if (Object.keys(patch).length > 0) setPreferences(user.id, patch);
  } else if (params.radius) {
    // Signed-out: keep existing global-radius behavior.
    setSetting("search_radius_miles", params.radius);
  }

  const today = new Date();
  let fromDate: Date;
  let toDate: Date;
  if (currentView === "calendar") {
    // Start-of-week (Sunday) so today's week renders fully; wide look-ahead for week nav.
    fromDate = new Date(today);
    fromDate.setHours(0, 0, 0, 0);
    fromDate.setDate(fromDate.getDate() - fromDate.getDay());
    toDate = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000);
  } else if (currentView === "map") {
    // Map view honors the `days` window so users can zoom in (1 day) or out
    // (a week+) without leaving the view.
    fromDate = new Date(today);
    fromDate.setHours(0, 0, 0, 0);
    toDate = new Date(today.getTime() + currentDays * 24 * 60 * 60 * 1000);
  } else {
    fromDate = new Date(today.getTime() + currentOffset * 24 * 60 * 60 * 1000);
    toDate = new Date(today.getTime() + (currentOffset + currentDays) * 24 * 60 * 60 * 1000);
  }
  // Anchor "today" / range bounds to America/New_York. Railway runs Node in
  // UTC, so naively slicing toISOString() returns UTC dates — which after
  // 8pm ET resolves to "tomorrow", excluding today's events from the
  // `date >= ?` filter and breaking the past-but-still-today rendering on
  // both list and calendar views.
  const todayStr = dateStrInTz(today);
  const tomorrowStr = dateStrInTz(new Date(today.getTime() + 24 * 60 * 60 * 1000));
  const fromStr = dateStrInTz(fromDate);
  const toStr = dateStrInTz(toDate);
  const isAdmin = signedIn && user?.role === "admin";
  const savedEventIds = signedIn && user ? getSavedEventIds(user.id) : new Set<string>();

  const formats = getFormats();
  const events = getActiveEvents({
    format: currentFormat || undefined,
    from: fromStr,
    to: toStr,
    radiusMiles: currentRadius,
    centerLat: currentLocationLat,
    centerLng: currentLocationLng,
  });

  const enriched = events.map((ev) => {
    const img = resolveEventImage(ev);
    return { ...ev, imageUrl: img.url, imageFit: img.fit };
  });

  const grouped: Record<string, typeof enriched> = {};
  for (const ev of enriched) {
    if (!grouped[ev.date]) grouped[ev.date] = [];
    grouped[ev.date].push(ev);
  }

  return (
    <main className="w-full max-w-3xl mx-auto px-4 py-8">
      <AccountChip />
      <FloatingToolbar currentView={currentView} />

      {/* Hero header */}
      <header className="mb-6 flex flex-col items-center text-center gap-1 w-full">
        <h1 className="text-neutral-900 dark:text-white">
          <PlayIrlLogo className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl" />
          <span className="sr-only">PlayIRL.GG</span>
        </h1>
        <p className="text-base leading-tight text-neutral-500 dark:text-neutral-400 mt-2">
          An independent, alternative way to find and schedule MTG events near you.
          <AboutInfoButton />
        </p>
      </header>

      {/* First-visit nudge for users still on the default location. Renders
          a dismissable banner with a "Change location" CTA so users who
          declined the silent geolocation prompt have a clear path forward. */}
      <LocationBanner isDefault={!isLocationCustom} defaultLabel={DEFAULT_LOCATION_LABEL} />

      {/* Sticky filter bar */}
      <StickyBar>
        <RadiusSelector
          currentRadius={currentRadius}
          currentDays={currentDays}
          currentFormat={currentFormat}
          currentView={currentView}
          formats={formats}
          eventCount={events.length}
          currentLocationLabel={currentLocationLabel}
          defaultLocationLabel={DEFAULT_LOCATION_LABEL}
          isLocationCustom={isLocationCustom}
        />
      </StickyBar>

      {currentView === "calendar" ? (
        <div
          style={{
            marginLeft: "calc(-50vw + 50%)",
            marginRight: "calc(-50vw + 50%)",
            paddingLeft: "1rem",
            paddingRight: "1rem",
          }}
        >
          <CalendarView events={events} />
        </div>
      ) : currentView === "map" ? (
        <div
          style={{
            marginLeft: "calc(-50vw + 50%)",
            marginRight: "calc(-50vw + 50%)",
            paddingLeft: "1rem",
            paddingRight: "1rem",
          }}
        >
          <MapView
            events={events}
            centerLat={currentLocationLat}
            centerLng={currentLocationLng}
            radiusMiles={currentRadius}
          />
        </div>
      ) : (
        <>
          {Object.keys(grouped).length === 0 && (
            <div className="text-center py-16">
              <p className="text-neutral-400 text-lg">No events found</p>
            </div>
          )}

          <div className="space-y-8">
            {Object.entries(grouped).map(([date, dayEvents], i) => {
              const d = new Date(date + "T12:00:00");
              return (
                <DayCard
                  key={date}
                  date={date}
                  weekday={d.toLocaleDateString("en-US", { weekday: "long" })}
                  isToday={date === todayStr}
                  isPast={date < todayStr}
                  events={dayEvents}
                  headingLabel={dayHeadingLabel(date, todayStr, tomorrowStr)}
                  staggerBase={Math.min(i * 60, 120)}
                  signedIn={signedIn}
                  isAdmin={isAdmin}
                  savedEventIds={savedEventIds}
                />
              );
            })}
          </div>

          {/* Footer navigation — list view extends forward with "Load
              more events" (bumps `days` by 7), styled as a continuation
              of the day-card stack so it reads as "another day below".
              DateJumper sits below for jumping anywhere. Calendar view
              has its own prev/next in the calendar header. */}
          <div className="flex flex-col gap-8 mt-8">
            <Link
              href={`?${new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter(([k, v]) => k !== "days" && v !== undefined) as [string, string][]), days: String(currentDays + 7) }).toString()}`}
              scroll={false}
              className="block w-full text-center py-4 rounded-lg border border-neutral-300 dark:border-white/15 bg-white dark:bg-neutral-900 text-base font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:border-neutral-400 dark:hover:border-white/25 hover:text-neutral-900 dark:hover:text-white transition-colors duration-150"
            >
              Load more events
            </Link>
            <div className="flex justify-center">
              <DateJumper currentOffset={currentOffset} />
            </div>
          </div>
        </>
      )}

      <footer className="mt-16 pt-6 text-sm text-neutral-500 dark:text-neutral-400 text-center">
        <div className="text-neutral-900 dark:text-white mb-4 flex justify-center">
          <PlayIrlLogo className="text-4xl" />
        </div>
        <p className="text-xs leading-relaxed mb-4 max-w-md mx-auto">
          An open-source, community-run alternative to the official Wizards of the Coast event locator. Not affiliated with WotC.
        </p>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs">
          <a href="/about" className="hover:text-neutral-900 dark:hover:text-white">About</a>
          <a href="/bot" className="hover:text-neutral-900 dark:hover:text-white">Discord bot</a>
          <a href="https://github.com/i1986o/mtg-cal" target="_blank" rel="noopener noreferrer" className="hover:text-neutral-900 dark:hover:text-white">GitHub</a>
          <a href="https://discord.gg/axDSujPTfj" target="_blank" rel="noopener noreferrer" className="hover:text-neutral-900 dark:hover:text-white">Discord</a>
          <a href="/account/events/new" className="hover:text-neutral-900 dark:hover:text-white">Create event</a>
          <a href="/account" className="hover:text-neutral-900 dark:hover:text-white">Sign in</a>
        </div>
      </footer>
    </main>
  );
}
