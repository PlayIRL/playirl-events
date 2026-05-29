// Stored event times are UTC (HH:MM sliced from ISO strings with Z suffix).
// Each event carries a `timezone` (IANA, e.g. "America/New_York") representing
// the venue's local zone. Render events in venue-local time so users don't see
// midnight-looking UTC values for a 6pm weeknight in Philly.

import { DEFAULT_LOCALE } from "./locale";

const DEFAULT_TZ = "America/New_York";

/**
 * The app's anchor timezone for "today" / "tomorrow" comparisons. Railway
 * runs Node in UTC, so naive `new Date().toISOString().slice(0, 10)` returns
 * the UTC date — which silently shifts to tomorrow after 8pm ET (when UTC
 * has already rolled over). That broke list/calendar views in the evening:
 * the `date >= today` filter excluded same-day events whose stored date
 * matched the UTC day. Anchoring to ET keeps the user-visible "today" stable
 * for the project's primary audience.
 */
export const APP_TIMEZONE = DEFAULT_TZ;

/**
 * YYYY-MM-DD for `date` rendered in `timeZone` (IANA). Use this — not
 * `date.toISOString().split('T')[0]` — anywhere we compare against the
 * `events.date` column or surface a "today/tomorrow" label, since the
 * toISOString variant is UTC-anchored and silently shifts the day across
 * the UTC midnight boundary on negative-offset zones.
 *
 * en-CA's date format happens to be YYYY-MM-DD, which is why we lean on
 * Intl.DateTimeFormat instead of manual string assembly — the locale does
 * the zero-padding and ordering for us.
 */
export function dateStrInTz(date: Date = new Date(), timeZone: string = APP_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find(p => p.type === "year")!.value;
  const m = parts.find(p => p.type === "month")!.value;
  const d = parts.find(p => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

/**
 * True when the event's start moment (UTC) has already passed. Used to
 * render today's already-started events (and this-week's past events in
 * the calendar view) as inactive rather than hiding them — gives users
 * context about what they missed without cluttering the upcoming list.
 *
 * Events without a `time` value are treated as start-of-day in UTC: they
 * only flip to "past" once the entire UTC day has passed. That matches
 * storage convention (date-only events = "sometime that day") without
 * pretending to know which hour they meant.
 */
export function eventHasStarted(date: string, time: string): boolean {
  if (!date) return false;
  const utc = new Date(`${date}T${time || "00:00"}:00Z`);
  if (isNaN(utc.getTime())) return false;
  return utc.getTime() < Date.now();
}

// Default duration assumption for "completed" detection. Matches the
// default duration `formatEventTimeRange` uses to compute end-of-event,
// so the visual states agree with the rendered time range.
const DEFAULT_DURATION_HOURS = 3;

export type EventDisplayStatus = "upcoming" | "in_progress" | "completed";

/**
 * Three-tier render status for event cards. Distinct from
 * `eventHasStarted` (binary) so the list/calendar can paint events that
 * are happening RIGHT NOW differently from events that are already over.
 *
 * - `upcoming`: start moment is in the future → full color.
 * - `in_progress`: started, but the estimated end (start + 3h) hasn't
 *   passed yet → a LIVE indicator on the card with no dimming.
 * - `completed`: estimated end is in the past → greyed out, same
 *   treatment as today's earlier rows.
 *
 * Date-only events (no time) are treated as upcoming until the entire
 * UTC day has elapsed, then flip to completed — matching the
 * sometime-that-day storage convention.
 */
export function eventDisplayStatus(date: string, time: string): EventDisplayStatus {
  if (!date) return "upcoming";
  const start = new Date(`${date}T${time || "00:00"}:00Z`).getTime();
  if (isNaN(start)) return "upcoming";
  const now = Date.now();
  if (start > now) return "upcoming";
  // Treat date-only entries as "completed at end of UTC day" — we can't
  // claim they're in progress for some specific hour-band.
  const durationMs = (time ? DEFAULT_DURATION_HOURS : 24) * 60 * 60 * 1000;
  if (start + durationMs > now) return "in_progress";
  return "completed";
}

/**
 * Pick the timezone we should display an event's time in.
 *
 * The scrapers stamp every event with `timezone = "America/New_York"`
 * regardless of where the venue actually is (see
 * scrapers/wizards-locator.ts:239). The stored `time` field is the
 * event's UTC wall-clock, so the per-event timezone field controls how
 * that UTC moment gets rendered.
 *
 * Defaulting that field to Eastern means a viewer anywhere — NYC, LA,
 * anywhere — sees the same Eastern-formatted time for every event,
 * which is wrong for non-Eastern venues. A 7pm Pacific event in LA
 * currently displays as 10pm because the format pass converts to Eastern.
 *
 * At display time we re-derive the timezone from the venue's lat/lng
 * so the LA event in the example renders as "7:00 PM" — the wall-clock
 * a player would actually walk into the store at.
 *
 * Longitude-band heuristic for the four CONUS zones plus rough
 * Alaska / Hawaii bounds. Events near zone boundaries (Arizona's
 * year-round MST, Indiana's split, the Florida panhandle, etc.) may be
 * an hour off — fine for an events listing. If precision matters,
 * swap this for the `geo-tz` npm package (carries a ~50MB polygon
 * dataset) without touching any callsites.
 *
 * Falls back to the stored timezone when coords are missing (date-only
 * or online events) so the existing behavior is preserved.
 */
/**
 * The event's calendar date in the venue's local timezone (YYYY-MM-DD).
 *
 * The stored `date` field is the UTC date of the event's stored UTC
 * `time`. For non-Eastern venues that produces day-grouping bugs: an LA
 * Friday 7pm event is stored as UTC Saturday 02:00, so its `date` is
 * Saturday — even though LA people think of it as a Friday event.
 *
 * Re-projecting through the venue's timezone gives the LA-Friday date
 * back, which is what the homepage day-card buckets and the "Today /
 * Tomorrow" labels should agree with.
 *
 * Falls back to the stored `date` field when no time / venue coords
 * exist to project through — for date-only / online events, the stored
 * date is the only meaningful answer.
 */
export function eventVenueDate(ev: {
  date: string;
  time: string;
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  timezone: string | null | undefined;
}): string {
  if (!ev.date || !ev.time) return ev.date;
  const utc = new Date(`${ev.date}T${ev.time}:00Z`);
  if (isNaN(utc.getTime())) return ev.date;
  return dateStrInTz(utc, pickEventTimezone(ev));
}

export function pickEventTimezone(
  ev: {
    latitude: number | null | undefined;
    longitude: number | null | undefined;
    timezone: string | null | undefined;
  },
): string {
  const fallback = ev.timezone || DEFAULT_TZ;
  const { latitude: lat, longitude: lng } = ev;
  if (lat == null || lng == null) return fallback;

  // --- North America (longitude-only bands) ---
  // Hawaii
  if (lat < 23 && lng < -154) return "Pacific/Honolulu";
  // Alaska
  if (lat > 50 && lng < -130) return "America/Anchorage";
  // CONUS / Canada — same bands work for the populated belt south of 60°N.
  if (lng >= -170 && lng < -50) {
    if (lng < -115) return "America/Los_Angeles";
    if (lng < -101) return "America/Denver";
    if (lng < -87) return "America/Chicago";
    return "America/New_York";
  }

  // --- South America ---
  // Brazil east coast / São Paulo / Rio
  if (lat < 5 && lat > -35 && lng > -55 && lng < -32) return "America/Sao_Paulo";
  // Andean West Coast (Peru/Colombia/Ecuador) — UTC-5 like Eastern, but
  // surface a region-specific tz so DST behavior is correct.
  if (lat < 12 && lat > -20 && lng < -65 && lng > -85) return "America/Lima";
  // Buenos Aires / Argentina / Chile (no DST in most)
  if (lat < -20 && lng < -50 && lng > -75) return "America/Argentina/Buenos_Aires";

  // --- Europe / Africa ---
  // UK + Ireland + Portugal (UTC / BST)
  if (lat > 35 && lat < 62 && lng > -11 && lng < 2) return "Europe/London";
  // Western/Central Europe (CET, the bulk of the EU)
  if (lat > 35 && lat < 71 && lng >= 2 && lng < 22) return "Europe/Berlin";
  // Eastern Europe (EET — Greece, Finland, Baltics, Romania, Bulgaria)
  if (lat > 33 && lat < 71 && lng >= 22 && lng < 40) return "Europe/Helsinki";
  // South Africa (SAST, UTC+2 year-round)
  if (lat < -22 && lng > 16 && lng < 33) return "Africa/Johannesburg";

  // --- Asia / Oceania ---
  // Moscow + Western Russia (UTC+3)
  if (lat > 43 && lat < 70 && lng >= 30 && lng < 60) return "Europe/Moscow";
  // India (IST, UTC+5:30)
  if (lat > 6 && lat < 35 && lng > 68 && lng < 90) return "Asia/Kolkata";
  // SE Asia / Bangkok belt (Thailand/Vietnam/Indonesia western)
  if (lat > -10 && lat < 25 && lng >= 95 && lng < 110) return "Asia/Bangkok";
  // China + Taiwan + Philippines + Singapore (CST/HKT/PHT — all UTC+8)
  if (lat > -5 && lat < 55 && lng >= 100 && lng < 125) return "Asia/Shanghai";
  // Japan + Korea (JST/KST, UTC+9)
  if (lat > 30 && lat < 50 && lng >= 125 && lng < 146) return "Asia/Tokyo";
  // Australia — east-coast metropolises (Sydney/Melbourne/Brisbane)
  if (lat < -10 && lng >= 138 && lng < 155) return "Australia/Sydney";
  // Perth (AWST, UTC+8 no DST)
  if (lat < -10 && lng >= 110 && lng < 130) return "Australia/Perth";
  // Adelaide / central Australia (ACST, UTC+9:30)
  if (lat < -10 && lng >= 130 && lng < 138) return "Australia/Adelaide";
  // New Zealand
  if (lat < -30 && lng > 165 && lng < 180) return "Pacific/Auckland";

  return fallback;
}

export function formatEventTime(
  date: string,
  time: string,
  timezone?: string | null,
  locale: string = DEFAULT_LOCALE,
): string {
  if (!date || !time) return "";
  const utc = new Date(`${date}T${time}:00Z`);
  if (isNaN(utc.getTime())) return "";
  const tz = timezone || DEFAULT_TZ;
  // hour12 follows the locale's convention by default (en-US \u2192 12h, fr-FR
  // \u2192 24h). Omitting `hour12` lets Intl pick the right one rather than
  // forcing 12h everywhere.
  const formatted = utc.toLocaleTimeString(locale, {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  });
  // When the event's display zone differs from the app's anchor zone
  // (Eastern), append a short abbreviation so an NYC viewer browsing
  // LA events doesn't read "7:00 PM" and assume it's Eastern. Eastern
  // events stay bare to avoid cluttering the dominant case.
  if (tz !== APP_TIMEZONE) {
    const abbr = new Intl.DateTimeFormat(locale, { timeZone: tz, timeZoneName: "short" })
      .formatToParts(utc)
      .find((p) => p.type === "timeZoneName")?.value;
    if (abbr) return `${formatted} ${abbr}`;
  }
  return formatted;
}

export function formatEventTimeRange(
  date: string,
  time: string,
  timezone: string | null | undefined,
  durationHours = 3,
  locale: string = DEFAULT_LOCALE,
): string {
  if (!date || !time) return "";
  const start = new Date(`${date}T${time}:00Z`);
  if (isNaN(start.getTime())) return "";
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
  const tz = timezone || DEFAULT_TZ;
  const fmt = (d: Date) =>
    d.toLocaleTimeString(locale, {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
    });
  const zoneAbbr = new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    timeZoneName: "short",
  })
    .formatToParts(start)
    .find((p) => p.type === "timeZoneName")?.value;
  return `${fmt(start)} \u2013 ${fmt(end)}${zoneAbbr ? ` ${zoneAbbr}` : ""}`;
}
