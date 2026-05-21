// Auto-curation rules — pure functions that classify a freshly-scraped event
// into a status. Applied during upsert (lib/scraper.ts) so we don't have to
// hand-review every new row at nationwide scale. Manual overrides (pinned,
// admin-set skip) are preserved by the upsert path itself, not here.

import type { ScrapedEvent } from "@/scrapers";
import { getAutoApproveGuildIds } from "@/lib/discord-guild-settings";

/** Title fragments that indicate this isn't an MTG event. WotC's locator and
 *  TopDeck both occasionally surface other-game tournaments hosted at the
 *  same store. Match is case-insensitive against the event title. */
const NON_MTG_KEYWORDS = [
  /\byu-?gi-?oh\b/i,
  /\bpok[eé]mon\b/i,
  /\bwarhammer\b/i,
  /\bflesh ?and ?blood\b/i,
  /\blorcana\b/i,
  /\bone ?piece\b/i,
  /\bdigimon\b/i,
  /\bd&d\b|\bdungeons ?& ?dragons\b/i,
  /\bstar ?wars\b.*\bunlimited\b/i,
];

/** Source identifiers we trust to publish directly (scraper output → active).
 *  Anything else (Discord, user-submitted) lands as `pending` for review. */
const TRUSTED_SOURCES = new Set(["wizards-locator", "topdeck"]);

export type AutoStatus = "active" | "skip" | "pending";

export interface CurationDecision {
  status: AutoStatus;
  reason: string;
}

export function classifyEvent(ev: ScrapedEvent): CurationDecision {
  // 1. Hard rule: non-MTG keyword in the title → skip.
  const title = ev.title || "";
  for (const re of NON_MTG_KEYWORDS) {
    if (re.test(title)) {
      return { status: "skip", reason: `non-MTG keyword (${re.source})` };
    }
  }

  // 2. Honor an explicit status from the scraper itself (e.g. discord scraper
  // already tags user-submitted events as "pending"). Don't override.
  if (ev.status === "pending") {
    return { status: "pending", reason: "scraper marked pending" };
  }

  // 3. Trusted source → active. Everything else → pending.
  if (TRUSTED_SOURCES.has(ev.source)) {
    return { status: "active", reason: "trusted source" };
  }
  return { status: "pending", reason: `untrusted source: ${ev.source}` };
}

/** Detail-URL prefix the Discord scraper always emits — see scrapers/discord.ts.
 *  Used here to recover guild_id from an event without threading it through
 *  the canonical schema, since admin-source Discord events all share
 *  source='discord' (no guild discriminator). */
const DISCORD_DETAIL_PREFIX = "https://discord.com/events/";

function discordGuildIdFromEvent(ev: Pick<ScrapedEvent, "detail_url">): string | null {
  const url = ev.detail_url ?? "";
  if (!url.startsWith(DISCORD_DETAIL_PREFIX)) return null;
  const rest = url.slice(DISCORD_DETAIL_PREFIX.length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  return rest.slice(0, slash);
}

/**
 * Post-classification override: any Discord-sourced event whose guild is
 * flagged auto-approve in discord_guild_settings gets bumped from 'pending'
 * to 'active'. Applied AFTER classifyEvent so the pure classification rules
 * stay testable; the per-guild trust flag is a separate concern wired in
 * here by the ingest path (pull route + runScraper).
 *
 * Returns the number of events promoted. No-op for non-Discord events.
 * Reads the auto-approve set once per call so callers can pass any number
 * of events without N+1 DB hits.
 */
export function applyDiscordAutoApprove(events: ScrapedEvent[]): number {
  const autoApproveGuilds = getAutoApproveGuildIds();
  if (autoApproveGuilds.size === 0) return 0;
  let promoted = 0;
  for (const ev of events) {
    if (ev.status !== "pending") continue;
    const guildId = discordGuildIdFromEvent(ev);
    if (guildId && autoApproveGuilds.has(guildId)) {
      ev.status = "active";
      promoted++;
    }
  }
  return promoted;
}
