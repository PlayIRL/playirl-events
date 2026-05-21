// Admin-triggered single-guild Discord pull. Same primitives as the cron
// scraper (fetchDiscordEvents → validateEvents → classifyEvent → upsertEvents),
// scoped to one guild for fast feedback and per-guild error surfacing.
//
// Intentionally does NOT acquire tryAcquireScrapeLock: a per-guild pull
// touches 1-2 Discord API requests and writes <50 rows. upsertEvents wraps
// the writes in a SQLite transaction, so even if the full nightly scrape
// is running concurrently, the two paths serialize cleanly at the DB level
// and produce equivalent rows. Skipping the lock means an admin can
// debug a single misbehaving guild without waiting 10+ minutes for the
// full scrape to finish.
//
// Skips reconcileEventCoords and venue image enqueue (handled by the nightly
// full scrape). User-connected sources arrive with `coords_source='source'`
// already, and admin-only sources fall back to GUILD_COORDS — both are
// acceptable for a quick refresh.

import { NextResponse } from "next/server";
import { hasAdminAccess } from "@/lib/session";
import { buildGuildSpec } from "@/lib/discord-servers-admin";
import { markSynced } from "@/lib/user-sources";
import { validateEvents } from "@/scrapers/schema";
import { applyDiscordAutoApprove, classifyEvent } from "@/lib/curation-rules";
import { upsertEvents } from "@/lib/events";
import fetchDiscordEvents from "@/scrapers/discord";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ guildId: string }> },
) {
  if (!(await hasAdminAccess())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { guildId } = await params;

  const resolved = buildGuildSpec(guildId);
  if (!resolved) {
    return NextResponse.json({ error: "Guild not configured" }, { status: 404 });
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
    // Honor the per-guild auto-approve flag: trusted guilds skip the
    // pending review queue and land as 'active' immediately.
    const autoApproved = applyDiscordAutoApprove(validated);
    const result = upsertEvents(validated);

    for (const us of resolved.userSources) {
      markSynced(us.id);
    }

    return NextResponse.json({
      ok: true,
      guildId,
      fetched: validated.length,
      added: result.added,
      updated: result.updated,
      skipped: result.skipped,
      autoApproved,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[admin-discord-servers] pull guild=${guildId} failed:`, msg);
    return NextResponse.json({ error: msg, guildId }, { status: 502 });
  }
}
