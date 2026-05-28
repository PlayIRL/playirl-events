export const dynamic = "force-dynamic";

import { headers } from "next/headers";
import { getActiveEvents, getFormats, getSetting, setSetting } from "@/lib/events";
import { getSavedEventIds } from "@/lib/event-saves";
import { getPreferences, setPreferences } from "@/lib/user-preferences";
import { getCurrentUser } from "@/lib/session";
import { resolveEventImage } from "@/lib/event-image";
import { dateStrInTz } from "@/lib/format-time";
import { DEFAULT_LOCATION_LABEL, resolveUserLocation } from "@/lib/user-location";
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

function dayHeadingLabel(
  dateStr: string,
  todayStr: string,
  tomorrowStr: string,
  yesterdayStr: string,
): string {
  const d = new Date(dateStr + "T12:00:00");
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
  const monthDay = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (dateStr === todayStr) return `Today · ${weekday}, ${monthDay}`;
  if (dateStr === tomorrowStr) return `Tomorrow · ${weekday}, ${monthDay}`;
  if (dateStr === yesterdayStr) return `Yesterday · ${weekday}, ${monthDay}`;
  return `${weekday}, ${monthDay}`;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{
    format?: string; radius?: string; days?: string; view?: string; offset?: string;
    /** Location override (URL primary). Triple of label + lat + lng. */
    loc?: string; lat?: string; lng?: string;
    /** "1" to restrict the listing to RCQ events. Orthogonal to format. */
    rcq?: string;
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
  const currentRcq = params.rcq === "1";
  const currentOffset = params.offset ? Math.max(0, parseInt(params.offset, 10)) : 0;

  // Location resolution: URL > prefs > IP geolocation > Philly default.
  // See lib/user-location.ts for the full hierarchy + flag semantics.
  // `isFromUser` covers URL/prefs/IP (drives distance display); `isCustom`
  // is URL/prefs only (drives the LocationBanner nudge).
  const resolvedLocation = await resolveUserLocation({
    urlLat: params.lat,
    urlLng: params.lng,
    urlLabel: params.loc,
    prefs,
    requestHeaders: await headers(),
  });
  const currentLocationLat = resolvedLocation.lat;
  const currentLocationLng = resolvedLocation.lng;
  const currentLocationLabel = resolvedLocation.label;
  const isLocationCustom = resolvedLocation.isCustom;
  const hasUserLocation = resolvedLocation.isFromUser;
  // Persistence below keys on whether the *URL* carried valid coords (vs.
  // resolved location, which may have fallen through to prefs/IP/default).
  // Same range checks the resolver applies — keep these in sync.
  const _urlLat = params.lat ? parseFloat(params.lat) : NaN;
  const _urlLng = params.lng ? parseFloat(params.lng) : NaN;
  const hasUrlLocation =
    Number.isFinite(_urlLat) && Number.isFinite(_urlLng) &&
    _urlLat >= -90 && _urlLat <= 90 && _urlLng >= -180 && _urlLng <= 180;

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
  // List view is strictly today-forward — past events would just take up
  // space without helping users plan. Calendar view still fetches a
  // wider window backward so its prev-week nav has data without a page
  // round-trip.
  const CALENDAR_PAST_DAYS = 28;
  if (currentView === "calendar") {
    fromDate = new Date(today);
    fromDate.setHours(0, 0, 0, 0);
    fromDate.setDate(fromDate.getDate() - fromDate.getDay() - CALENDAR_PAST_DAYS);
    toDate = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000);
  } else if (currentView === "map") {
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
  const yesterdayStr = dateStrInTz(new Date(today.getTime() - 24 * 60 * 60 * 1000));
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
    rcq: currentRcq || undefined,
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
    <main className="w-full max-w-3xl mx-auto px-4 pt-8 pb-32">
      <AccountChip />
      <FloatingToolbar currentView={currentView} />

      {/* Hero header */}
      <header className="mb-6 flex flex-col items-center text-center gap-6 w-full">
        <h1 className="text-neutral-900 dark:text-white flex items-start">
          <PlayIrlLogo className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl" />
          <span className="inline-block bg-[hsl(120,100%,50%)] text-black font-mono font-bold uppercase text-[10px] tracking-[0.15em] px-2 py-1 rounded leading-none -mt-1 -ml-2">Beta</span>
          <span className="sr-only">PlayIRL.GG (beta)</span>
        </h1>
        <p className="text-sm leading-tight text-neutral-500 dark:text-neutral-400">
          An independent, alternative way to find and schedule MTG events near you.
          <AboutInfoButton />
        </p>
      </header>

      {/* Sticky filter bar */}
      <StickyBar>
        <RadiusSelector
          currentRadius={currentRadius}
          currentDays={currentDays}
          currentFormat={currentFormat}
          currentRcq={currentRcq}
          currentView={currentView}
          formats={formats}
          eventCount={events.length}
          currentLocationLabel={currentLocationLabel}
          defaultLocationLabel={DEFAULT_LOCATION_LABEL}
          isLocationCustom={isLocationCustom}
        />
      </StickyBar>

      {/* First-visit nudge for users still on the default location. Renders
          a dismissable banner with a "Change location" CTA so users who
          declined the silent geolocation prompt have a clear path forward. */}
      <LocationBanner isDefault={!isLocationCustom} defaultLabel={DEFAULT_LOCATION_LABEL} />

      {currentView === "calendar" ? (
        <div
          style={{
            marginLeft: "calc(-50vw + 50%)",
            marginRight: "calc(-50vw + 50%)",
            paddingLeft: "1rem",
            paddingRight: "1rem",
          }}
        >
          <CalendarView
            events={events}
            userLat={hasUserLocation ? currentLocationLat : null}
            userLng={hasUserLocation ? currentLocationLng : null}
          />
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

          {/* Today + future only. The list view is strictly forward-
              looking; any past-event display lives elsewhere (calendar
              view's prev-week nav, the venue page's history). */}
          <div className="space-y-8">
            {Object.entries(grouped)
              .filter(([d]) => d >= todayStr)
              .map(([date, dayEvents], i) => {
                const d = new Date(date + "T12:00:00");
                return (
                  <DayCard
                    key={date}
                    date={date}
                    weekday={d.toLocaleDateString("en-US", { weekday: "long" })}
                    isToday={date === todayStr}
                    isPast={false}
                    events={dayEvents}
                    headingLabel={dayHeadingLabel(date, todayStr, tomorrowStr, yesterdayStr)}
                    staggerBase={Math.min(i * 60, 120)}
                    signedIn={signedIn}
                    isAdmin={isAdmin}
                    savedEventIds={savedEventIds}
                    userLat={hasUserLocation ? currentLocationLat : null}
                    userLng={hasUserLocation ? currentLocationLng : null}
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
        <div className="text-neutral-900 dark:text-white mb-4 flex justify-center items-start">
          <PlayIrlLogo className="text-4xl" />
          <span className="inline-block bg-[hsl(120,100%,50%)] text-black font-mono font-bold uppercase text-[10px] tracking-[0.15em] px-2 py-1 rounded leading-none -mt-1.5 -ml-2">Beta</span>
        </div>
        <p className="text-xs leading-relaxed mb-4 max-w-md mx-auto">
          An open-source, community-run alternative to the official Wizards of the Coast event locator. Not affiliated with WotC.
        </p>
        <p className="text-xs leading-relaxed mb-4 max-w-md mx-auto">
          Companion app:{" "}
          <Link href="/track" className="text-neutral-900 dark:text-white underline underline-offset-2 hover:no-underline">
            PlayIRL.gg<span className="font-light">/</span><span className="font-bold">Track</span>
          </Link>
          {" "}— a simple, no-fuss MTG life tracker, currently in open beta.
        </p>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs">
          <a href="/about" className="hover:text-neutral-900 dark:hover:text-white">About</a>
          <a href="/track" className="hover:text-neutral-900 dark:hover:text-white">Life Tracking App</a>
          <a href="/bot" className="hover:text-neutral-900 dark:hover:text-white">Discord bot</a>
          <a href="https://github.com/i1986o/mtg-cal" target="_blank" rel="noopener noreferrer" className="hover:text-neutral-900 dark:hover:text-white">GitHub</a>
          <a href="https://discord.gg/nM2Ea4NSSh" target="_blank" rel="noopener noreferrer" className="hover:text-neutral-900 dark:hover:text-white">Discord</a>
          <a href="/account/events/new" className="hover:text-neutral-900 dark:hover:text-white">Create event</a>
          <a href="/account" className="hover:text-neutral-900 dark:hover:text-white">Sign in</a>
        </div>
        <div className="mt-8 pt-6 border-t border-neutral-100 dark:border-neutral-800">
          <p className="text-[10px] uppercase tracking-widest text-neutral-400 dark:text-neutral-600 mb-1">Made by</p>
          <a href="https://cardslinger.shop" target="_blank" rel="noopener noreferrer" className="inline-block text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition-colors">
            <span style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontWeight: 700, letterSpacing: "-0.05em", fontSize: "1.5rem", lineHeight: 1 }}>
              CardSlinger
            </span>
            <span className="text-xs align-super ml-0.5">™</span>
          </a>
          <p className="text-[10px] text-neutral-400 dark:text-neutral-600 mt-1">© 2026</p>
        </div>
      </footer>
    </main>
  );
}
