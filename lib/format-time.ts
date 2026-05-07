// Stored event times are UTC (HH:MM sliced from ISO strings with Z suffix).
// Each event carries a `timezone` (IANA, e.g. "America/New_York") representing
// the venue's local zone. Render events in venue-local time so users don't see
// midnight-looking UTC values for a 6pm weeknight in Philly.

const DEFAULT_TZ = "America/New_York";

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
