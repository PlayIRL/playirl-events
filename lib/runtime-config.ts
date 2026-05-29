import { config as defaults, ScrapeScope } from "./config";
import { ScrapeRegion, RegionGridKey, REGION_GRIDS, buildGrid } from "./scrape-grid";
import { getSetting, setSetting } from "./events";

export interface RuntimeConfig {
  location: { zip: string; city: string; state: string; lat: number; lng: number };
  searchRadiusMiles: number;
  daysAhead: number;
  scrapeScope: ScrapeScope;
  /** Materialized list of scrape anchors. Derived from `scrapeRegionKeys`
   *  when set; otherwise falls back to the raw `config_scrape_regions` JSON
   *  (legacy escape hatch) or the CONUS default. */
  scrapeRegions: ScrapeRegion[];
  /** Active named region grids — picked by admin from /admin/config. Empty
   *  array means "use the legacy raw scrapeRegions setting or CONUS". */
  scrapeRegionKeys: RegionGridKey[];
  sources: {
    wizardsLocator: boolean;
    topdeck: boolean;
    discord: { guildIds: string[] };
  };
  output: typeof defaults.output;
  /** Discord channel ID where admin activity notifications (signups, guild
   *  connects, sub creates, auto-disables, event submissions) get posted.
   *  Empty = push disabled (notifications still land in the dashboard feed). */
  adminNotificationsChannelId: string;
}

const ALL_REGION_KEYS = Object.keys(REGION_GRIDS) as RegionGridKey[];

function parseRegionKeys(raw: string): RegionGridKey[] {
  try {
    const arr = raw ? (JSON.parse(raw) as unknown) : null;
    if (!Array.isArray(arr)) return [];
    return arr.filter((k): k is RegionGridKey =>
      typeof k === "string" && (ALL_REGION_KEYS as string[]).includes(k),
    );
  } catch {
    return [];
  }
}

function safeParse<T>(raw: string, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function parseScope(raw: string): ScrapeScope {
  return raw === "local" || raw === "national" ? raw : defaults.scrapeScope;
}

/**
 * Resolve scrape scope, with env var taking precedence over the DB setting.
 * `MTG_SCRAPE_SCOPE` lets a CI step or one-shot CLI override the persisted
 * setting without mutating production state. Falls back to the DB value,
 * then the static default.
 */
function resolveScrapeScope(): ScrapeScope {
  const envScope = process.env.MTG_SCRAPE_SCOPE;
  if (envScope === "local" || envScope === "national") return envScope;
  return parseScope(getSetting("config_scrape_scope"));
}

export function getConfig(): RuntimeConfig {
  const regionKeys = parseRegionKeys(getSetting("config_scrape_region_keys"));
  // Region resolution order: explicit named keys win; otherwise honor the
  // legacy raw anchor array (admin escape hatch from before the keys UI);
  // otherwise CONUS.
  const scrapeRegions = regionKeys.length > 0
    ? buildGrid(...regionKeys)
    : safeParse(getSetting("config_scrape_regions"), defaults.scrapeRegions);
  return {
    location: safeParse(getSetting("config_location"), defaults.location),
    searchRadiusMiles: Number(getSetting("config_radius_miles") || defaults.searchRadiusMiles),
    daysAhead: Number(getSetting("config_days_ahead") || defaults.daysAhead),
    scrapeScope: resolveScrapeScope(),
    scrapeRegions,
    scrapeRegionKeys: regionKeys,
    sources: {
      wizardsLocator: getSetting("config_source_wizardslocator") !== "0",
      topdeck: getSetting("config_source_topdeck") !== "0",
      discord: {
        guildIds: safeParse(getSetting("config_source_discord_guilds"), defaults.sources.discord.guildIds),
      },
    },
    output: defaults.output,
    adminNotificationsChannelId: getSetting("config_admin_notifications_channel_id") || "",
  };
}

export function updateConfig(patch: Partial<{
  location: RuntimeConfig["location"];
  searchRadiusMiles: number;
  daysAhead: number;
  scrapeScope: ScrapeScope;
  scrapeRegions: ScrapeRegion[];
  scrapeRegionKeys: RegionGridKey[];
  sourceWizardsLocator: boolean;
  sourceTopdeck: boolean;
  sourceDiscordGuilds: string[];
  adminNotificationsChannelId: string;
}>): RuntimeConfig {
  if (patch.location) setSetting("config_location", JSON.stringify(patch.location));
  if (patch.searchRadiusMiles != null) setSetting("config_radius_miles", String(patch.searchRadiusMiles));
  if (patch.daysAhead != null) setSetting("config_days_ahead", String(patch.daysAhead));
  if (patch.scrapeScope) setSetting("config_scrape_scope", patch.scrapeScope);
  if (patch.scrapeRegions) setSetting("config_scrape_regions", JSON.stringify(patch.scrapeRegions));
  if (patch.scrapeRegionKeys) {
    const filtered = patch.scrapeRegionKeys.filter((k) =>
      (ALL_REGION_KEYS as string[]).includes(k),
    );
    setSetting("config_scrape_region_keys", JSON.stringify(filtered));
  }
  if (patch.sourceWizardsLocator != null) setSetting("config_source_wizardslocator", patch.sourceWizardsLocator ? "1" : "0");
  if (patch.sourceTopdeck != null) setSetting("config_source_topdeck", patch.sourceTopdeck ? "1" : "0");
  if (patch.sourceDiscordGuilds) setSetting("config_source_discord_guilds", JSON.stringify(patch.sourceDiscordGuilds));
  if (patch.adminNotificationsChannelId !== undefined) {
    setSetting("config_admin_notifications_channel_id", patch.adminNotificationsChannelId.trim());
  }
  return getConfig();
}
