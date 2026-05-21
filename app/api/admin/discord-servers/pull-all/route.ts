// Admin-triggered "pull all" for Discord. Runs the per-guild pull for every
// known guild (admin-configured + user-connected) with bounded concurrency
// so we don't hammer Discord's per-bot rate limit. Each pull is just two
// requests (guild metadata + scheduled events), so even concurrency=3 stays
// well below the 50 req/s global limit.

import { NextResponse } from "next/server";
import { hasAdminAccess } from "@/lib/session";
import { buildGuildSpec, listDiscordServerRows } from "@/lib/discord-servers-admin";
import { markSynced } from "@/lib/user-sources";
import { validateEvents } from "@/scrapers/schema";
import { applyDiscordAutoApprove, classifyEvent } from "@/lib/curation-rules";
import { upsertEvents } from "@/lib/events";
import fetchDiscordEvents from "@/scrapers/discord";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const CONCURRENCY = 3;

interface PerGuildResult {
  guildId: string;
  ok: boolean;
  fetched?: number;
  added?: number;
  updated?: number;
  skipped?: number;
  autoApproved?: number;
  error?: string;
}

async function pullOne(guildId: string): Promise<PerGuildResult> {
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
    console.error(`[admin-discord-servers] pull-all guild=${guildId} failed:`, msg);
    return { guildId, ok: false, error: msg };
  }
}

export async function POST() {
  if (!(await hasAdminAccess())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = listDiscordServerRows();
  const guildIds = rows.map((r) => r.guildId);

  // Promise-pool: each worker pulls the next id off the queue. Avoids the
  // chunked-Promise.all latency tail where a slow guild stalls a whole batch.
  const results: PerGuildResult[] = [];
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= guildIds.length) return;
      results.push(await pullOne(guildIds[i]));
    }
  }
  const workers = Array.from(
    { length: Math.min(CONCURRENCY, guildIds.length) },
    () => worker(),
  );
  await Promise.all(workers);

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

  // Sort results back into the page's display order for the UI to render.
  results.sort(
    (a, b) => guildIds.indexOf(a.guildId) - guildIds.indexOf(b.guildId),
  );

  return NextResponse.json({ ok: true, totals, results });
}
