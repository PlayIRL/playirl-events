// config.ts — MTG Calendar settings

import { CONUS_GRID } from "./scrape-grid";

export const SITE_URL = "https://playirl.gg";

export type ScrapeScope = "local" | "national";

// Hoisted so the ICS branding below can derive from it rather than
// re-hardcoding the city name (a config object literal can't reference
// its own fields mid-definition).
const location = {
  zip: "19125",
  city: "Philadelphia",
  state: "PA",
  lat: 39.9688,
  lng: -75.1246,
};

export const config = {
  location,

  searchRadiusMiles: 10,
  daysAhead: 60,

  // "national" sweeps `scrapeRegions` and skips ingest-time radius filters;
  // "local" uses single `location` + `searchRadiusMiles`. UI filtering is
  // independent and always applies the user's chosen lat/lng + radius.
  scrapeScope: "national" as ScrapeScope,
  scrapeRegions: CONUS_GRID,

  sources: {
    wizardsLocator: true,
    topdeck: true,
    discord: {
      guildIds: ["1451305700322967794"], // Hamilton's Hand
    },
  },

  output: {
    icsFile: "./output/mtg-events.ics",
    calendarName: `PlayIRL.GG — ${location.city}`,
    calendarDescription: `MTG events near ${location.city} via PlayIRL.GG`,
  },
};
