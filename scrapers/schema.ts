// Canonical event schema — every source must return arrays of this shape.
//
// {
//   id:         string  — unique, prefixed by source (e.g. "wotc-123")
//   title:      string  — event name
//   format:     string  — "Commander", "Draft", "Sealed", "Modern", etc.
//   date:       string  — "YYYY-MM-DD"
//   time:       string  — "HH:MM" (UTC 24-hour)
//   timezone:   string  — IANA timezone, e.g. "America/New_York"
//   location:   string  — store/venue name
//   address:    string  — street address
//   cost:       string  — "Free" or "$X"
//   store_url:  string  — store website URL
//   detail_url: string  — event detail page URL
//   source:     string  — source identifier (e.g. "wizards-locator")
// }

const REQUIRED = ["id", "title", "date", "source"];
const ALL_FIELDS = [
  "id", "title", "format", "date", "time", "timezone",
  "location", "address", "cost", "store_url", "detail_url", "source", "image_url",
  "description",
];

export function validateEvents(events: any, sourceName: string) {
  if (!Array.isArray(events)) {
    console.warn(`[validate] ${sourceName}: expected array, got ${typeof events}`);
    return [];
  }

  let warnings = 0;
  for (const e of events) {
    for (const field of REQUIRED) {
      if (!e[field]) {
        console.warn(`[validate] ${sourceName}: event missing required field "${field}"`, e.id || "(no id)");
        warnings++;
      }
    }
    // Ensure all fields exist as strings (fill missing optional fields with "")
    for (const field of ALL_FIELDS) {
      if (e[field] == null) e[field] = "";
    }
  }

  if (warnings > 0) {
    console.warn(`[validate] ${sourceName}: ${warnings} validation warnings`);
  }

  return events;
}
