// Layout reads cookies() and headers(), which already opts the entire app
// route tree into per-request rendering — no need to declare force-dynamic
// here. Keeping the comment so future-us doesn't reach for it reflexively.

import { headers } from "next/headers";
import { getActiveEvents, getFormats } from "@/lib/events";
import { getSavedEventIds } from "@/lib/event-saves";
import { getPreferences, setPreferences } from "@/lib/user-preferences";
import { getCurrentUser } from "@/lib/session";
import { resolveEventImage } from "@/lib/event-image";
import { dateStrInTz, eventVenueDate } from "@/lib/format-time";
import { getServerCountry, getServerLocale } from "@/lib/locale";
import { preferredDistanceUnit } from "@/lib/distance";
import { DEFAULT_LOCATION_LABEL, resolveUserLocation } from "@/lib/user-location";
import { t } from "@/lib/i18n";
import DateJumper from "./date-jumper";
import RadiusSelector from "./radius-selector";
import CalendarView from "./calendar-view";
import MapView from "./map-view-loader";
import StickyBar from "./sticky-bar";
import FloatingToolbar from "./floating-toolbar";
import AboutInfoButton from "./about-info-button";
import LocationBanner from "./location-banner";
import DayCard from "./day-card";
import Link from "next/link";
import AccountChip from "./account-chip";
import { PlayIrlLogo } from "./playirl-logo";

function dayHeadingLabel(
  dateStr: string,
  todayStr: string,
  tomorrowStr: string,
  yesterdayStr: string,
  locale: string,
): string {
  const d = new Date(dateStr + "T12:00:00");
  const weekday = d.toLocaleDateString(locale, { weekday: "long" });
  const monthDay = d.toLocaleDateString(locale, { month: "short", day: "numeric" });
  if (dateStr === todayStr) return `${t("homepage.today", undefined, locale)} · ${weekday}, ${monthDay}`;
  if (dateStr === tomorrowStr) return `${t("homepage.tomorrow", undefined, locale)} · ${weekday}, ${monthDay}`;
  if (dateStr === yesterdayStr) return `${t("homepage.yesterday", undefined, locale)} · ${weekday}, ${monthDay}`;
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
    /** "1" to restrict the listing to cEDH (competitive Commander) events.
     *  Pattern-matched on the title, same as rcq. Combines with format —
     *  e.g. cedh=1 + format=Commander narrows to cEDH explicitly. */
    cedh?: string;
    /** Dev-only preview hook — "1" forces the first N events in the first
     *  day card to render as in_progress, so the live treatment can be
     *  designed without waiting for real in-progress events. Pass a
     *  number ("3") to fake multiple simultaneous live events at once.
     *  Gated by NODE_ENV !== production downstream so production
     *  visitors hitting ?fake_live=… see no effect. */
    fake_live?: string;
  }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const signedIn = !!user && !user.suspended;

  // Filter defaults: URL param > per-user prefs (signed-in) > hardcoded default.
  // (Signed-out visitors used to seed defaults from a global `settings` row;
  // that wrote to the DB on every ?radius= visit which was wrong semantically
  // and bad for write throughput. Now signed-out viewers get the hardcoded
  // fallback — client-side localStorage handles per-device memory.)
  const prefs = signedIn ? getPreferences(user.id) : null;
  const defaultRadius = prefs?.radius_miles ?? 10;
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
  // Legacy: ?cedh=1 used to be a separate sub-format filter. cEDH is now
  // a first-class canonical format, so any incoming ?cedh=1 URL maps to
  // ?format=cEDH for subscribers / shared links that pre-date the promotion.
  const cedhLegacy = params.cedh === "1";
  // params.format !== undefined (not just `?? defaultFormat`) so that an
  // explicit empty value — written by the radius-selector when the user
  // picks "All formats" — beats the saved-pref default. Without that
  // distinction, clicking "All formats" silently re-applied whatever
  // format the user had saved in their prefs.
  const currentFormat = cedhLegacy
    ? "cEDH"
    : (params.format !== undefined ? params.format : defaultFormat);
  const currentRcq = params.rcq === "1";
  const currentOffset = params.offset ? Math.max(0, parseInt(params.offset, 10)) : 0;

  // Location resolution: URL > prefs > IP geolocation > Philly default.
  // See lib/user-location.ts for the full hierarchy + flag semantics.
  // `isFromUser` covers URL/prefs/IP (drives distance display); `isCustom`
  // is URL/prefs only (drives the LocationBanner nudge).
  const requestHeaders = await headers();
  const locale = getServerLocale(requestHeaders);
  const viewerCountry = getServerCountry(requestHeaders);
  const distanceUnit = preferredDistanceUnit(viewerCountry);
  const resolvedLocation = await resolveUserLocation({
    urlLat: params.lat,
    urlLng: params.lng,
    urlLabel: params.loc,
    prefs,
    requestHeaders,
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
    // Pass `prefs` through so setPreferences doesn't re-SELECT the row we
    // already loaded a few lines up.
    if (Object.keys(patch).length > 0 && prefs) setPreferences(user.id, patch, prefs);
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
    // List/calendar/map views never quote the event body — skip shipping
    // notes/description across the SSR boundary.
    fields: "light",
  });

  // Project to the field union the three listing views actually read
  // (DayCard, CalendarView, MapView, plus the format-time helpers that need
  // timezone/date/time). Trims another ~15 unused columns from the RSC
  // payload that crosses into the client bundle — small per-event, but
  // adds up across 200+ events.
  const enriched = events.map((ev) => {
    const img = resolveEventImage(ev);
    return {
      id: ev.id,
      title: ev.title,
      format: ev.format,
      date: ev.date,
      time: ev.time,
      timezone: ev.timezone,
      location: ev.location,
      cost: ev.cost,
      latitude: ev.latitude,
      longitude: ev.longitude,
      imageUrl: img.url,
      imageFit: img.fit,
    };
  });

  // Group by VENUE-LOCAL date, not the stored UTC date. Without this,
  // an LA Friday 7pm event (stored as UTC Saturday 02:00) would land in
  // the Saturday bucket — but display 7pm Pacific via pickEventTimezone,
  // confusingly reading as "Saturday's 7pm event" when LA people think
  // of it as Friday's. eventVenueDate re-projects through the venue's
  // timezone so the bucket and the displayed wall-clock agree.
  const grouped: Record<string, typeof enriched> = {};
  for (const ev of enriched) {
    const bucketDate = eventVenueDate(ev);
    if (!grouped[bucketDate]) grouped[bucketDate] = [];
    grouped[bucketDate].push(ev);
  }

  // Dev-only "fake live" preview. `?fake_live=1` flips the first event in
  // the first upcoming day to render as in_progress; `?fake_live=N` flips
  // the first N events. Production drops the flag.
  const futureDates = Object.keys(grouped).filter((d) => d >= todayStr).sort();
  const fakeLiveCount = (() => {
    if (process.env.NODE_ENV === "production") return 0;
    if (!params.fake_live) return 0;
    const n = parseInt(params.fake_live, 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  })();
  const fakeLiveEventIds = new Set<string>();
  if (fakeLiveCount > 0 && futureDates[0]) {
    for (const ev of grouped[futureDates[0]].slice(0, fakeLiveCount)) {
      fakeLiveEventIds.add(ev.id);
    }
  }

  return (
    <main className="w-full max-w-5xl mx-auto px-4 pt-8 pb-32">
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
          locale={locale}
          distanceUnit={distanceUnit}
        />
      </StickyBar>

      {/* First-visit nudge for users still on the default location. Renders
          a dismissable banner with a "Change location" CTA so users who
          declined the silent geolocation prompt have a clear path forward. */}
      <LocationBanner isDefault={!isLocationCustom} defaultLabel={DEFAULT_LOCATION_LABEL} locale={locale} />

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
            distanceUnit={distanceUnit}
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
                    weekday={d.toLocaleDateString(locale, { weekday: "long" })}
                    isToday={date === todayStr}
                    isPast={false}
                    events={dayEvents}
                    headingLabel={dayHeadingLabel(date, todayStr, tomorrowStr, yesterdayStr, locale)}
                    staggerBase={Math.min(i * 60, 120)}
                    signedIn={signedIn}
                    isAdmin={isAdmin}
                    savedEventIds={savedEventIds}
                    userLat={hasUserLocation ? currentLocationLat : null}
                    userLng={hasUserLocation ? currentLocationLng : null}
                    fakeLiveEventIds={fakeLiveEventIds}
                    distanceUnit={distanceUnit}
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
          An independent, community-run alternative to the official Wizards of the Coast event locator. Not affiliated with WotC.
        </p>
        {/* Data attribution. TopDeck's API ToS requires a visible credit
            and link back; surfacing both upstream event-data providers
            here keeps the footer honest about where the data comes from. */}
        <p className="text-xs leading-relaxed mb-4 max-w-md mx-auto">
          Event data from{" "}
          <a href="https://locator.wizards.com" target="_blank" rel="noopener noreferrer" className="text-neutral-900 dark:text-white underline underline-offset-2 hover:no-underline">Wizards of the Coast</a>,{" "}
          <a href="https://topdeck.gg" target="_blank" rel="noopener noreferrer" className="text-neutral-900 dark:text-white underline underline-offset-2 hover:no-underline">TopDeck.gg</a>, and connected Discord communities.
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
