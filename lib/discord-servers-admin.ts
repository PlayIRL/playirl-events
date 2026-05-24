// Per-guild aggregation across both Discord flows for /admin/discord-servers.
//
// Pull side (events flowing FROM Discord INTO our DB):
//   - admin-configured guildIds  (runtime config: config_source_discord_guilds)
//   - user_sources (kind='discord')
//
// Push side (events flowing FROM our DB TO Discord):
//   - discord_subscriptions          (channel-message digests + reminders)
//   - discord_scheduled_event_subs   (Events-tab posts)
//
// A guild appears in the list if it shows up in ANY of the above. The four
// origins are reconciled in TypeScript (admin-configured guildIds are a JSON
// blob in `settings`, not a SQL-queryable table, so a four-way SQL union
// isn't worth the contortion — the row counts are small).
//
// IMPORTANT: admin-source Discord events use `source='discord'` (a single
// shared tag across all admin-configured guilds), so we can't attribute them
// per-guild from `events.source` alone. The guild ID is recoverable from
// `detail_url`, which the scraper always builds as
// `https://discord.com/events/<guildId>/<eventId>` (see scrapers/discord.ts
// at the bottom of fetchDiscordEvents). If that URL shape ever changes,
// this aggregation needs to change with it.

import { getDb } from "@/lib/db";
import { getConfig } from "@/lib/runtime-config";
import { listGuildSettings } from "@/lib/discord-guild-settings";
import type { DiscordGuildSpec } from "@/scrapers/discord";
import type { UserSource } from "@/lib/user-sources";

export interface DiscordServerUserSource {
  id: string;
  userId: string;
  userEmail: string | null;
  label: string;
  venueName: string;
  enabled: boolean;
  lastSyncedAt: string | null;
}

export interface DiscordServerSubAgg {
  total: number;
  enabled: number;
  maxConsecutiveFailures: number;
  firstDisabledReason: string | null;
  lastDispatchedAt: string | null;
}

export interface DiscordServerActivity {
  firedAt: string;
  kind: string;
  trigger: string;
  status: string;
  eventCount: number;
  messagesPosted: number;
  error: string | null;
}

export interface DiscordServerSummary {
  guildId: string;
  isAdminConfigured: boolean;
  userSources: DiscordServerUserSource[];
  eventCounts: {
    total: number;
    active: number;
    pending: number;
    skip: number;
  };
  lastEventAt: string | null;
  channelSubs: DiscordServerSubAgg;
  eventsTabSubs: DiscordServerSubAgg;
  eventsPostedCount: number;
  lastActivity: DiscordServerActivity | null;
  /** Per-guild admin setting: when true, Discord events from this guild
   *  skip the pending review queue on ingest and land as 'active'. */
  autoApprove: boolean;
}

interface EventCountsRow {
  guild_id: string;
  total: number;
  active: number;
  pending: number;
  skip: number;
  last_event_at: string | null;
}

interface UserSourceRow {
  id: string;
  user_id: string;
  user_email: string | null;
  external_id: string;
  label: string;
  venue_name: string;
  enabled: number;
  last_synced_at: string | null;
}

interface SubAggRow {
  guild_id: string;
  total: number;
  enabled_count: number;
  max_consecutive_failures: number;
  last_dispatched_at: string | null;
}

interface DisabledReasonRow {
  guild_id: string;
  disabled_reason: string;
}

interface EventsPostedRow {
  guild_id: string;
  posted_count: number;
}

interface ActivityRow {
  guild_id: string;
  fired_at: string;
  kind: string;
  trigger: string;
  status: string;
  event_count: number;
  messages_posted: number;
  error: string | null;
}

function emptySubAgg(): DiscordServerSubAgg {
  return {
    total: 0,
    enabled: 0,
    maxConsecutiveFailures: 0,
    firstDisabledReason: null,
    lastDispatchedAt: null,
  };
}

function blankSummary(guildId: string): DiscordServerSummary {
  return {
    guildId,
    isAdminConfigured: false,
    userSources: [],
    eventCounts: { total: 0, active: 0, pending: 0, skip: 0 },
    lastEventAt: null,
    channelSubs: emptySubAgg(),
    eventsTabSubs: emptySubAgg(),
    eventsPostedCount: 0,
    lastActivity: null,
    autoApprove: false,
  };
}

export function listDiscordServerRows(): DiscordServerSummary[] {
  const db = getDb();
  const cfg = getConfig();
  const adminGuildIds = cfg.sources.discord.guildIds;

  // Per-guild event aggregation. The guild ID is extracted from detail_url,
  // which always has the shape https://discord.com/events/<guildId>/<eventId>
  // for events scraped from Discord (both admin and user-source). "discord.com/events/"
  // is 27 characters; SQLite substr is 1-indexed so we start at 28.
  const eventCounts = db
    .prepare(`
      SELECT
        substr(detail_url, 28, instr(substr(detail_url, 28), '/') - 1) AS guild_id,
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'skip' THEN 1 ELSE 0 END) AS skip,
        MAX(updated_date) AS last_event_at
      FROM events
      WHERE detail_url LIKE 'https://discord.com/events/%'
      GROUP BY guild_id
    `)
    .all() as EventCountsRow[];

  // user_sources joined to users (don't filter on enabled — show disabled too
  // so admins can see all connections, including ones a user has paused).
  // Multi-user same-guild is possible: the scraper currently dedupes by
  // guildId (scrapers/index.ts) so only the first user_source actually emits
  // events. The card still shows all rows so the admin can see the conflict.
  const userSources = db
    .prepare(`
      SELECT us.id, us.user_id, u.email AS user_email,
             us.external_id, us.label, us.venue_name, us.enabled, us.last_synced_at
        FROM user_sources us
        LEFT JOIN users u ON u.id = us.user_id
       WHERE us.kind = 'discord'
       ORDER BY us.created_at DESC
    `)
    .all() as UserSourceRow[];

  const channelSubsAgg = db
    .prepare(`
      SELECT guild_id,
             COUNT(*) AS total,
             SUM(enabled) AS enabled_count,
             MAX(consecutive_failures) AS max_consecutive_failures,
             MAX(last_dispatched_at) AS last_dispatched_at
        FROM discord_subscriptions
       GROUP BY guild_id
    `)
    .all() as SubAggRow[];

  const eventsTabSubsAgg = db
    .prepare(`
      SELECT guild_id,
             COUNT(*) AS total,
             SUM(enabled) AS enabled_count,
             MAX(consecutive_failures) AS max_consecutive_failures,
             MAX(last_dispatched_at) AS last_dispatched_at
        FROM discord_scheduled_event_subs
       GROUP BY guild_id
    `)
    .all() as SubAggRow[];

  // First non-empty disabled_reason per guild, for both sub tables. Pulled in
  // separate queries so the GROUP BY shape stays simple; MIN(disabled_reason)
  // filters out empty strings naturally because '' sorts first.
  const channelReasons = db
    .prepare(`
      SELECT guild_id, disabled_reason
        FROM discord_subscriptions
       WHERE disabled_reason IS NOT NULL AND disabled_reason != ''
       GROUP BY guild_id
    `)
    .all() as DisabledReasonRow[];

  const eventsTabReasons = db
    .prepare(`
      SELECT guild_id, disabled_reason
        FROM discord_scheduled_event_subs
       WHERE disabled_reason IS NOT NULL AND disabled_reason != ''
       GROUP BY guild_id
    `)
    .all() as DisabledReasonRow[];

  const eventsPosted = db
    .prepare(`
      SELECT guild_id, COUNT(*) AS posted_count
        FROM discord_scheduled_event_posts
       GROUP BY guild_id
    `)
    .all() as EventsPostedRow[];

  // Latest activity row per guild. Activity is keyed by subscription_id, so
  // we join through discord_subscriptions to recover guild_id. The window
  // function trick: pick the MAX(id) per guild_id, then re-join to get the
  // full row. activity rows are append-only with monotonic ids so MAX(id) is
  // the latest one.
  const latestActivity = db
    .prepare(`
      SELECT s.guild_id, a.fired_at, a.kind, a.trigger, a.status,
             a.event_count, a.messages_posted, a.error
        FROM discord_subscription_activity a
        JOIN discord_subscriptions s ON s.id = a.subscription_id
       WHERE a.id IN (
         SELECT MAX(a2.id) FROM discord_subscription_activity a2
         JOIN discord_subscriptions s2 ON s2.id = a2.subscription_id
         GROUP BY s2.guild_id
       )
    `)
    .all() as ActivityRow[];

  const byGuild = new Map<string, DiscordServerSummary>();
  const ensure = (guildId: string): DiscordServerSummary => {
    let row = byGuild.get(guildId);
    if (!row) {
      row = blankSummary(guildId);
      byGuild.set(guildId, row);
    }
    return row;
  };

  for (const guildId of adminGuildIds) {
    ensure(guildId).isAdminConfigured = true;
  }

  for (const us of userSources) {
    ensure(us.external_id).userSources.push({
      id: us.id,
      userId: us.user_id,
      userEmail: us.user_email,
      label: us.label,
      venueName: us.venue_name,
      enabled: us.enabled === 1,
      lastSyncedAt: us.last_synced_at,
    });
  }

  for (const row of eventCounts) {
    if (!row.guild_id) continue;
    const r = ensure(row.guild_id);
    r.eventCounts = {
      total: row.total,
      active: row.active,
      pending: row.pending,
      skip: row.skip,
    };
    r.lastEventAt = row.last_event_at;
  }

  for (const row of channelSubsAgg) {
    const r = ensure(row.guild_id);
    r.channelSubs = {
      total: row.total,
      enabled: row.enabled_count,
      maxConsecutiveFailures: row.max_consecutive_failures ?? 0,
      firstDisabledReason: null,
      lastDispatchedAt: row.last_dispatched_at,
    };
  }
  for (const row of channelReasons) {
    const r = byGuild.get(row.guild_id);
    if (r) r.channelSubs.firstDisabledReason = row.disabled_reason;
  }

  for (const row of eventsTabSubsAgg) {
    const r = ensure(row.guild_id);
    r.eventsTabSubs = {
      total: row.total,
      enabled: row.enabled_count,
      maxConsecutiveFailures: row.max_consecutive_failures ?? 0,
      firstDisabledReason: null,
      lastDispatchedAt: row.last_dispatched_at,
    };
  }
  for (const row of eventsTabReasons) {
    const r = byGuild.get(row.guild_id);
    if (r) r.eventsTabSubs.firstDisabledReason = row.disabled_reason;
  }

  for (const row of eventsPosted) {
    ensure(row.guild_id).eventsPostedCount = row.posted_count;
  }

  for (const row of latestActivity) {
    const r = byGuild.get(row.guild_id);
    if (r) {
      r.lastActivity = {
        firedAt: row.fired_at,
        kind: row.kind,
        trigger: row.trigger,
        status: row.status,
        eventCount: row.event_count,
        messagesPosted: row.messages_posted,
        error: row.error,
      };
    }
  }

  // Per-guild admin settings (auto-approve). Only existing rows show up
  // here; guilds without a settings row default to autoApprove=false
  // (manual review), set by blankSummary above.
  for (const s of listGuildSettings()) {
    const r = byGuild.get(s.guildId);
    if (r) r.autoApprove = s.autoApprove;
  }

  return Array.from(byGuild.values()).sort((a, b) => {
    if (b.eventCounts.total !== a.eventCounts.total) {
      return b.eventCounts.total - a.eventCounts.total;
    }
    return a.guildId.localeCompare(b.guildId);
  });
}

export interface GuildSpecResolution {
  adminConfigured: boolean;
  userSources: UserSource[];
  /** Specs ready to pass to fetchDiscordEvents as `guilds`. One per enabled
   *  user_source for the guildId, in created_at DESC order. Empty if the
   *  guild is admin-only — the pull route appends the bare guildId to
   *  `guildIds` in that case so the scraper still picks it up. */
  userSpecs: DiscordGuildSpec[];
}

/** Resolve the spec for a single guildId from both origin lists. Returns
 *  null when neither origin recognizes the guild — the pull route uses that
 *  to 404 the request. */
export function buildGuildSpec(guildId: string): GuildSpecResolution | null {
  const cfg = getConfig();
  const adminConfigured = cfg.sources.discord.guildIds.includes(guildId);

  const db = getDb();
  const userSources = db
    .prepare(
      "SELECT * FROM user_sources WHERE kind = 'discord' AND external_id = ? AND enabled = 1 ORDER BY created_at DESC",
    )
    .all(guildId) as UserSource[];

  if (!adminConfigured && userSources.length === 0) return null;

  const userSpecs: DiscordGuildSpec[] = userSources.map((s) => ({
    guildId: s.external_id,
    ownerId: s.user_id,
    venueName: s.venue_name,
    venueAddress: s.venue_address,
    latitude: s.latitude,
    longitude: s.longitude,
  }));

  return { adminConfigured, userSources, userSpecs };
}

// --- Shared single-guild + all-guilds pull helpers ------------------------
//
// Used by:
//   - /api/admin/discord-servers/pull-all  (admin "Dispatch all" button)
//   - /api/scrape-discord                  (Railway Cron, frequent Discord-only pull)
//
// Both paths want the SAME per-guild work — fetch Discord events, validate,
// classify, auto-approve trusted guilds, upsert, stamp markSynced — with a
// bounded concurrency pool so we don't hammer Discord's per-bot rate limit.
// Lives in this module (not lib/scraper.ts) because it's a thin Discord-only
// path that intentionally skips the heavy reconcile-coords / venue-image
// steps that the nightly full scrape handles.

export interface DiscordPullPerGuildResult {
  guildId: string;
  ok: boolean;
  fetched?: number;
  added?: number;
  updated?: number;
  skipped?: number;
  autoApproved?: number;
  error?: string;
}

export interface DiscordPullSummary {
  totals: {
    guilds: number;
    failed: number;
    fetched: number;
    added: number;
    updated: number;
    skipped: number;
    autoApproved: number;
  };
  results: DiscordPullPerGuildResult[];
  durationMs: number;
}

/**
 * Pull one guild end-to-end: fetch → validate → classify → auto-approve →
 * upsert → stamp markSynced. Returns a structured result row instead of
 * throwing so the worker pool can keep going past a single guild's failure.
 */
export async function pullOneDiscordGuild(
  guildId: string,
): Promise<DiscordPullPerGuildResult> {
  // Lazy-imported so the cron route doesn't pull these into its cold-start
  // bundle until the actual pull runs.
  const [
    { validateEvents },
    { applyDiscordAutoApprove, classifyEvent },
    { upsertEvents },
    { markSynced },
    fetchDiscordEvents,
  ] = await Promise.all([
    import("@/scrapers/schema"),
    import("@/lib/curation-rules"),
    import("@/lib/events"),
    import("@/lib/user-sources"),
    import("@/scrapers/discord").then((m) => m.default),
  ]);

  const resolved = buildGuildSpec(guildId);
  if (!resolved) {
    return { guildId, ok: false, error: "Guild not configured" };
  }
  try {
    const raw = await fetchDiscordEvents({
      guilds: resolved.userSpecs,
      guildIds: resolved.adminConfigured ? [guildId] : [],
    });
    const validated = validateEvents(raw, `discord:${guildId}`);
    for (const ev of validated) {
      const decision = classifyEvent(ev);
      ev.status = decision.status;
    }
    const autoApproved = applyDiscordAutoApprove(validated);
    const result = upsertEvents(validated);
    for (const us of resolved.userSources) markSynced(us.id);
    return {
      guildId,
      ok: true,
      fetched: validated.length,
      added: result.added,
      updated: result.updated,
      skipped: result.skipped,
      autoApproved,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[discord-pull] guild=${guildId} failed:`, msg);
    return { guildId, ok: false, error: msg };
  }
}

/**
 * Pull every known Discord guild (admin-configured + user-connected) with a
 * bounded concurrency pool. Each pull is 1-2 Discord API calls, so concurrency
 * 3 stays well under the 50 req/s global bot limit even with many guilds.
 */
export async function pullAllDiscordGuilds(
  concurrency = 3,
): Promise<DiscordPullSummary> {
  const startedAt = Date.now();
  const rows = listDiscordServerRows();
  const guildIds = rows.map((r) => r.guildId);

  const results: DiscordPullPerGuildResult[] = [];
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= guildIds.length) return;
      results.push(await pullOneDiscordGuild(guildIds[i]));
    }
  }
  const workers = Array.from(
    { length: Math.min(concurrency, guildIds.length) },
    () => worker(),
  );
  await Promise.all(workers);

  // Sort results back into the listing order for stable UI rendering.
  results.sort(
    (a, b) => guildIds.indexOf(a.guildId) - guildIds.indexOf(b.guildId),
  );

  const totals = results.reduce(
    (acc, r) => {
      if (r.ok) {
        acc.guilds++;
        acc.fetched += r.fetched ?? 0;
        acc.added += r.added ?? 0;
        acc.updated += r.updated ?? 0;
        acc.skipped += r.skipped ?? 0;
        acc.autoApproved += r.autoApproved ?? 0;
      } else {
        acc.failed++;
      }
      return acc;
    },
    { guilds: 0, failed: 0, fetched: 0, added: 0, updated: 0, skipped: 0, autoApproved: 0 },
  );

  return { totals, results, durationMs: Date.now() - startedAt };
}
