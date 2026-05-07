export const dynamic = "force-dynamic";

import { getActiveEvents, getFormats, getSetting, setSetting } from "@/lib/events";
import { getSavedEventIds } from "@/lib/event-saves";
import { getPreferences, setPreferences } from "@/lib/user-preferences";
import { getCurrentUser } from "@/lib/session";
import { resolveEventImage } from "@/lib/event-image";
import { getLabelForCoords } from "@/lib/geocode";
import { config } from "@/lib/config";
import DateJumper from "./date-jumper";
import RadiusSelector from "./radius-selector";
import CalendarView from "./calendar-view";
import StickyBar from "./sticky-bar";
import FloatingToolbar from "./floating-toolbar";
import AboutInfoButton from "./about-info-button";
import LocationBanner from "./location-banner";
import DayCard from "./day-card";
import Reveal from "./reveal";
import { LinkButton } from "./button";
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
  const currentDays = params.days ? parseInt(params.days, 10) : defaultDays;
  const currentFormat = params.format ?? defaultFormat;
  const currentView = params.view || "list";
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
  } else {
    fromDate = new Date(today.getTime() + currentOffset * 24 * 60 * 60 * 1000);
    toDate = new Date(today.getTime() + (currentOffset + currentDays) * 24 * 60 * 60 * 1000);
  }
  const isAdmin = signedIn && user?.role === "admin";
  const savedEventIds = signedIn && user ? getSavedEventIds(user.id) : new Set<string>();

  const formats = getFormats();
  const events = getActiveEvents({
    format: currentFormat || undefined,
    from: fromDate.toISOString().split("T")[0],
    to: toDate.toISOString().split("T")[0],
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
      <header className="mb-6 flex flex-col items-center text-center gap-1 w-full anim-fade-in-up">
        <h1 className="text-neutral-900 dark:text-white">
          <PlayIrlLogo className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl" />
          <span className="sr-only">PlayIRL.GG</span>
        </h1>
        <p className="text-sm leading-tight text-neutral-400 dark:text-neutral-500 mt-2">
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
      ) : (
        <>
          {Object.keys(grouped).length === 0 && (
            <Reveal className="text-center py-16" delay={100}>
              <p className="text-neutral-400 text-lg">No events found</p>
            </Reveal>
          )}

          <div className="space-y-2">
            {Object.entries(grouped).map(([date, dayEvents], i) => {
              const d = new Date(date + "T12:00:00");
              const todayStr = today.toISOString().split("T")[0];
              const tomorrowStr = new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString().split("T")[0];
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

          {/* Week navigation */}
          <Reveal className="flex items-center justify-between gap-3 mt-6 flex-wrap">
            {currentOffset > 0 ? (
              <LinkButton
                href={`?${new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter(([k]) => k !== "offset")), ...(currentOffset - 7 > 0 ? { offset: String(currentOffset - 7) } : {}) }).toString()}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                Previous week
              </LinkButton>
            ) : <div />}

            {/* Mid: jump-to-date + back-to-this-week (rendered between
                Previous and Next week so the controls share one footer row) */}
            <DateJumper currentOffset={currentOffset} />

            <LinkButton
              href={`?${new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter(([,v]) => v !== undefined) as [string,string][]), offset: String(currentOffset + 7) }).toString()}`}
            >
              Next week
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </LinkButton>
          </Reveal>
        </>
      )}

      <Reveal>
      <footer className="mt-16 pt-8 border-t border-neutral-100 dark:border-white/5 text-sm text-neutral-400 dark:text-neutral-500">
        {/* Brand sits above; description and links share an aligned top edge below */}
        <p className="mb-3">
          <PlayIrlLogo className="text-base text-neutral-900 dark:text-white" />
          <span className="sr-only">PlayIRL.GG</span>
        </p>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
          {/* Tagline */}
          <div>
            <p className="text-xs leading-relaxed max-w-xs">
              An open-source, community-run alternative to the official Wizards of the Coast event locator — built by players, for players.
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="text-[11px] text-neutral-400 dark:text-neutral-500">✨ Open source</span>
              <span className="text-[11px] text-neutral-400 dark:text-neutral-500">· Community-run</span>
              <span className="text-[11px] text-neutral-400 dark:text-neutral-500">· Not affiliated with WotC</span>
            </div>
          </div>

          {/* Links */}
          <div className="flex flex-col gap-2 text-xs shrink-0">
            <a href="/about" className="hover:text-neutral-900 dark:hover:text-white transition">About PlayIRL.GG</a>
            <a href="/bot" className="hover:text-neutral-900 dark:hover:text-white transition">Discord bot</a>
            <a href="https://github.com/i1986o/mtg-cal" target="_blank" rel="noopener noreferrer" className="hover:text-neutral-900 dark:hover:text-white transition">GitHub</a>
            <a href="https://discord.gg/axDSujPTfj" target="_blank" rel="noopener noreferrer" className="hover:text-neutral-900 dark:hover:text-white transition">Join the Discord</a>
            <a href="/account/events/new" className="hover:text-neutral-900 dark:hover:text-white transition">Submit your events</a>
            <a href="/account" className="hover:text-neutral-900 dark:hover:text-white transition">Sign in / My account</a>
            <a href="/admin/login" className="hover:text-neutral-900 dark:hover:text-white transition text-neutral-400 dark:text-neutral-500">Admin login</a>
          </div>
        </div>
      </footer>
      </Reveal>
    </main>
  );
}
