// Stored event times are UTC (HH:MM sliced from ISO strings with Z suffix).
// Each event carries a `timezone` (IANA, e.g. "America/New_York") representing
// the venue's local zone. Render events in venue-local time so users don't see
// midnight-looking UTC values for a 6pm weeknight in Philly.

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

export function formatEventTime(
  date: string,
  time: string,
  timezone?: string | null,
): string {
  if (!date || !time) return "";
  const utc = new Date(`${date}T${time}:00Z`);
  if (isNaN(utc.getTime())) return "";
  return utc.toLocaleTimeString("en-US", {
    timeZone: timezone || DEFAULT_TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatEventTimeRange(
  date: string,
  time: string,
  timezone: string | null | undefined,
  durationHours = 3,
): string {
  if (!date || !time) return "";
  const start = new Date(`${date}T${time}:00Z`);
  if (isNaN(start.getTime())) return "";
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
  const tz = timezone || DEFAULT_TZ;
  const fmt = (d: Date) =>
    d.toLocaleTimeString("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  const zoneAbbr = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "short",
  })
    .formatToParts(start)
    .find((p) => p.type === "timeZoneName")?.value;
  return `${fmt(start)} \u2013 ${fmt(end)}${zoneAbbr ? ` ${zoneAbbr}` : ""}`;
}
