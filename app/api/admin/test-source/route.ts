// Per-source scrape test. Runs a single scraper module in isolation —
// fetches and validates, but does NOT upsert into the DB, does NOT touch
// the scrape_history table, does NOT fan out to venue image fetches.
// Admin uses this to debug "is the API key right" / "does the upstream
// API still return the shape we expect" without firing the 10-15min
// multi-region scrape that hits WotC's GraphQL ~197 times.
//
// Auth: admin-gated (hasAdminAccess). Body:
//   { source: "topdeck" | "wizardsLocator" | "discord", scope?: "first-region" }
//
// Response:
//   200 — { ok: true, source, count, durationMs, sampleEvents: [...] }
//   200 — { ok: false, source, error, durationMs }   (scraper threw)
//   400 — { error: "unknown source: …" }
//   401 — { error: "Unauthorized" }
//
// Why 200 even when the scraper throws: this endpoint's job is to REPORT
// what happens, not to be a health check. Returning the error string
// inside a 200 lets the admin UI render the message inline without
// having to special-case 4xx/5xx for "the upstream API rejected us."

import { NextResponse } from "next/server";
import { hasAdminAccess } from "@/lib/session";
import { getConfig } from "@/lib/runtime-config";
import { listEnabledDiscordSources } from "@/lib/user-sources";

export const dynamic = "force-dynamic";
// One source call should be near-instant; cap at 60s so a stuck upstream
// doesn't pin the connection.
export const maxDuration = 60;

// The scraper module signatures aren't homogeneous (Discord takes a
// typed config object, the others take `any` / unknown) and unifying
// them up the call chain isn't worth the change. The dynamic-import
// surface naturally erases the type difference, and the call site below
// just feeds whatever opts we built — same way scrapers/index.ts does.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SOURCE_MODULES: Record<string, () => Promise<{ default: (opts: any) => Promise<unknown[]> }>> = {
  wizardsLocator: () => import("@/scrapers/wizards-locator"),
  topdeck: () => import("@/scrapers/topdeck"),
  discord: () => import("@/scrapers/discord"),
};

export async function POST(request: Request) {
  if (!(await hasAdminAccess())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { source?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
  }

  const source = body.source;
  if (!source || typeof source !== "string") {
    return NextResponse.json({ error: "source is required" }, { status: 400 });
  }
  const loader = SOURCE_MODULES[source];
  if (!loader) {
    return NextResponse.json(
      { error: `unknown source: ${source}. Allowed: ${Object.keys(SOURCE_MODULES).join(", ")}` },
      { status: 400 },
    );
  }

  // Build opts the same way scrapers/index.ts does at scrape-time so the
  // test path exercises the real scraper config — auth tokens from env,
  // discord user-sources merged in, etc. Anything that works here will
  // also work in the next full scrape.
  const cfg = getConfig();
  const sourceConfig = (cfg.sources as Record<string, unknown>)[source];
  const opts: Record<string, unknown> =
    typeof sourceConfig === "object" && sourceConfig !== null ? { ...sourceConfig } : {};
  if (source === "discord") {
    try {
      const userGuilds = listEnabledDiscordSources().map((s) => ({
        guildId: s.external_id,
        ownerId: s.user_id,
        venueName: s.venue_name,
        venueAddress: s.venue_address,
        latitude: s.latitude,
        longitude: s.longitude,
      }));
      if (userGuilds.length > 0) opts.guilds = userGuilds;
    } catch (err) {
      console.error("[test-source] discord user_sources lookup failed:", err);
    }
  }

  const startedAt = Date.now();
  try {
    const mod = await loader();
    const fetchFn = mod.default;
    const events = await fetchFn(opts);
    const durationMs = Date.now() - startedAt;
    const count = Array.isArray(events) ? events.length : 0;
    // First three events for shape-sanity. Strip nothing — the admin UI
    // is reading this themselves; full visibility is the point.
    const sampleEvents = Array.isArray(events) ? events.slice(0, 3) : [];
    return NextResponse.json({
      ok: true,
      source,
      count,
      durationMs,
      sampleEvents,
    });
  } catch (err: unknown) {
    const durationMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      ok: false,
      source,
      error: message,
      durationMs,
    });
  }
}
