import ical from "ical-generator";
import { config } from "./config";
import type { EventRow } from "./events";

function buildDescription(event: EventRow): string {
  const lines = [`Format: ${event.format}`];
  if (event.cost) lines.push(`Cost: ${event.cost}`);
  if (event.store_url) lines.push(`Store: ${event.store_url}`);
  if (event.detail_url) lines.push(`Details: ${event.detail_url}`);
  // Host-written `notes` overrides the scraper's `description` when both
  // exist (same priority as the detail page).
  const blurb = event.notes || event.description;
  if (blurb) lines.push(`\n${blurb}`);
  lines.push(`Source: ${event.source}`);
  return lines.join("\n");
}

function buildLocation(event: EventRow): string {
  return [event.location, event.address].filter(Boolean).join(", ");
}

export function generateIcsString(events: EventRow[], calName?: string, calDesc?: string): string {
  const cal = ical({
    name: calName || config.output.calendarName,
    description: calDesc || config.output.calendarDescription,
    prodId: { company: "mtg-cal", product: "mtg-event-aggregator", language: "EN" },
  });

  for (const event of events) {
    if (!event.date || !event.time) continue;
    const start = new Date(`${event.date}T${event.time}:00Z`);
    if (isNaN(start.getTime())) continue;
    const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);

    const summary = event.location
      ? `${event.title} @ ${event.location}`
      : event.title;

    cal.createEvent({
      id: event.id,
      summary,
      description: buildDescription(event),
      location: buildLocation(event),
      start,
      end,
      floating: false,
      url: event.detail_url || undefined,
    });
  }

  let icsString = cal.toString();
  icsString = icsString.replace(
    "BEGIN:VCALENDAR",
    "BEGIN:VCALENDAR\r\nX-PUBLISHED-TTL:PT1H\r\nREFRESH-INTERVAL;VALUE=DURATION:PT1H"
  );
  return icsString;
}
