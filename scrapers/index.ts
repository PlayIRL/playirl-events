import { getConfig } from "@/lib/runtime-config";
import { listEnabledDiscordSources } from "@/lib/user-sources";
import { validateEvents } from "./schema";
import type { DiscordGuildSpec } from "./discord";

// Source registry — add new sources here (one line each).
const SOURCE_MODULES: Record<string, () => Promise<any>> = {
  wizardsLocator: () => import("./wizards-locator"),
  topdeck: () => import("./topdeck"),
  discord: () => import("./discord"),
};

export interface ScrapedEvent {
  id: string;
  title: string;
  format: string;
  date: string;
  time: string;
  timezone: string;
  location: string;
  address: string;
  cost: string;
  store_url: string;
  detail_url: string;
  source: string;
  latitude?: number | null;
  longitude?: number | null;
  // Optional — used by user-connected sources (e.g. private Discord servers).
  owner_id?: string | null;
  source_type?: string;
  status?: "active" | "skip" | "pending";
  /** Cover image URL provided by the source (e.g. Discord CDN). */
  image_url?: string;
  /** Source-provided description (e.g. WotC's GraphQL `description`). The
   *  upsert path refreshes this on every scrape — admin overrides live in
   *  the separate `notes` column, which scrapers leave alone. */
  description?: string;
  /**
   * Where lat/lng came from. `"source"` means a per-event API gave them to us
   * (trust). `"guild_fallback"` means we used a hardcoded or guild-wide
   * default (don't trust — re-geocode the address at upsert). `"none"` means
   * we have no coords at all. Defaults to `"source"` when omitted.
   */
  coords_source?: "source" | "guild_fallback" | "none";
}

export interface SourceStats {
  /** Per-source event counts after validation (the raw scrape, pre-dedupe). */
  bySource: Record<string, number>;
  /** Sources that threw — admins can see which feeds are broken without
   *  digging through CI logs. Empty when everything succeeded. */
  failed: Record<string, string>;
}

export async function fetchAllSources(): Promise<{ events: ScrapedEvent[]; stats: SourceStats }> {
  const all: ScrapedEvent[] = [];
  const stats: SourceStats = { bySource: {}, failed: {} };
  const cfg = getConfig();

  // Build the work list: one entry per enabled source, with its merged
  // options. Done synchronously so opts construction (which can hit the DB
  // for Discord user-sources) doesn't race the actual fetches.
  interface Job { name: string; loader: () => Promise<any>; opts: any }
  const jobs: Job[] = [];
  for (const [name, loader] of Object.entries(SOURCE_MODULES)) {
    const sourceConfig = (cfg.sources as any)[name];

    // Skip disabled sources
    if (!sourceConfig) continue;
    if (sourceConfig === false) continue;
    if (typeof sourceConfig === "object" && sourceConfig.enabled === false) continue;

    const opts: any = typeof sourceConfig === "object" ? { ...sourceConfig } : {};

    // Merge user-connected Discord sources into the discord scraper's input.
    if (name === "discord") {
      let userGuilds: DiscordGuildSpec[] = [];
      try {
        userGuilds = listEnabledDiscordSources().map((s) => ({
          guildId: s.external_id,
          ownerId: s.user_id,
          venueName: s.venue_name,
          venueAddress: s.venue_address,
          latitude: s.latitude,
          longitude: s.longitude,
        }));
      } catch (err: any) {
        console.error("[sources] discord user_sources lookup FAILED:", err.message);
      }
      if (userGuilds.length > 0) {
        opts.guilds = userGuilds;
        console.log(`[sources] discord: +${userGuilds.length} user-connected guild(s)`);
      }
    }

    jobs.push({ name, loader, opts });
  }

  // Run sources in parallel. Each scraper hits a different upstream API
  // (WotC GraphQL, TopDeck REST, Discord REST), so there's no contention.
  // Promise.allSettled keeps a single source's failure from torpedoing the
  // others — we tally failures per source and continue.
  const startedAt = Date.now();
  const results = await Promise.allSettled(
    jobs.map(async (job) => {
      const sourceStartedAt = Date.now();
      const mod = await job.loader();
      const fetchFn = mod.default || mod[Object.keys(mod)[0]];
      const events = await fetchFn(job.opts);
      const validated = validateEvents(events, job.name);
      console.log(`[sources] ${job.name}: ${validated.length} events (${((Date.now() - sourceStartedAt) / 1000).toFixed(1)}s)`);
      return { name: job.name, events: validated };
    }),
  );

  for (let i = 0; i < results.length; i++) {
    const job = jobs[i];
    const res = results[i];
    if (res.status === "fulfilled") {
      all.push(...res.value.events);
      stats.bySource[job.name] = res.value.events.length;
    } else {
      const message = res.reason instanceof Error
        ? res.reason.message ?? res.reason.name
        : String(res.reason);
      console.error(`[sources] ${job.name} FAILED:`, message);
      stats.failed[job.name] = message;
      stats.bySource[job.name] = 0;
    }
  }

  console.log(`[sources] all sources finished in ${((Date.now() - startedAt) / 1000).toFixed(1)}s (parallel)`);

  return { events: all, stats };
}
