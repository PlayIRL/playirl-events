import fs from "fs";
import path from "path";
import { runScraper } from "@/lib/scraper";
import { getActiveEvents } from "@/lib/events";
import { generateIcsString } from "@/lib/ical";
import { config } from "@/lib/config";
import { formatSlug } from "@/lib/formats";

async function main() {
  await runScraper("cli");

  const events = getActiveEvents();
  console.log(`\n[ical] Generating calendars for ${events.length} active events`);

  const mainPath = path.resolve(config.output.icsFile);
  const outDir = path.dirname(mainPath);
  fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(mainPath, generateIcsString(events));
  console.log(`[ical] wrote ${mainPath} (${events.length} events)`);

  // Per-format calendars, grouping by slug so "Booster Draft" + "Draft" share one file
  const bySlug = new Map<string, { events: typeof events; formats: Set<string> }>();
  for (const ev of events) {
    const fmt = ev.format || "Other";
    const slug = formatSlug(fmt);
    if (!bySlug.has(slug)) bySlug.set(slug, { events: [], formats: new Set() });
    const entry = bySlug.get(slug)!;
    entry.events.push(ev);
    entry.formats.add(fmt);
  }

  const sorted = [...bySlug.entries()].sort((a, b) => b[1].events.length - a[1].events.length);
  for (const [slug, { events: fmtEvents, formats }] of sorted) {
    const label = [...formats].sort().join(" / ");
    const filePath = path.join(outDir, `mtg-${slug}.ics`);
    const name = `MTG ${label} \u2014 ${config.location.city}`;
    const description = `${label} events in ${config.location.city} area`;
    fs.writeFileSync(filePath, generateIcsString(fmtEvents, name, description));
    console.log(`[ical] wrote ${filePath} (${fmtEvents.length} events, ${label})`);
  }

  console.log(`\n\u2705 Calendars written to: ${outDir}/`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
