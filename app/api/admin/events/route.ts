import { hasAdminAccess } from "@/lib/session";
import {
  getAllEvents,
  getFilteredEvents,
  getEventStats,
  createEvent,
  type EventFilters,
} from "@/lib/events";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Hard cap on what one admin GET can return. Used both for the
// unfiltered "flat dump" mode and for the per-page limit on the
// filtered mode — defends against a malformed limit param burning
// memory.
const MAX_LIMIT = 5000;
const DEFAULT_PAGE_SIZE = 50;

/**
 * GET /api/admin/events
 *
 * Two modes:
 *
 *   1. **Filtered + paginated** (default for the new admin events page):
 *      pass any of `status`, `source`, `format`, `country`, `currency`,
 *      `q` as query params, plus `page` (1-indexed) and `limit` for
 *      pagination. Returns `{ events, total, page, limit, stats? }`.
 *      Include `include_stats=1` to get the DB-wide aggregates for the
 *      overview cards (skip on subsequent pages — they don't change).
 *
 *   2. **Flat dump** (legacy): pass `limit` + `offset` only. Returns a
 *      bare array of EventRow. Kept for CSV exports and callers that
 *      haven't migrated yet.
 */
export async function GET(request: Request) {
  if (!(await hasAdminAccess())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const sp = url.searchParams;

  // Filter / pagination params for the new mode. Any of these being
  // present (including page > 1) flips us into structured-response
  // mode. Plain `limit`+`offset` without filters or `page` keeps the
  // legacy flat-array response.
  const filterKeys = ["status", "source", "format", "country", "currency", "q", "page", "include_stats"];
  const filteredMode = filterKeys.some((k) => sp.has(k));

  const rawLimit = Number(sp.get("limit") ?? "");
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), MAX_LIMIT)
      : (filteredMode ? DEFAULT_PAGE_SIZE : MAX_LIMIT);

  if (filteredMode) {
    const filters: EventFilters = {
      status: sp.get("status") ?? undefined,
      source: sp.get("source") ?? undefined,
      format: sp.get("format") ?? undefined,
      country: sp.get("country") ?? undefined,
      currency: sp.get("currency") ?? undefined,
      search: sp.get("q") ?? undefined,
    };
    const rawPage = Number(sp.get("page") ?? "1");
    const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
    const offset = (page - 1) * limit;
    const { events, total } = getFilteredEvents(filters, limit, offset);
    const includeStats = sp.get("include_stats") === "1";
    return NextResponse.json({
      events,
      total,
      page,
      limit,
      stats: includeStats ? getEventStats() : undefined,
    });
  }

  // Legacy flat-array mode.
  const rawOffset = Number(sp.get("offset") ?? "");
  const offset =
    Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;
  return NextResponse.json(getAllEvents(limit, offset));
}

export async function POST(request: Request) {
  if (!(await hasAdminAccess())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const title = body.title;
  const date = body.date;
  if (typeof title !== "string" || !title || typeof date !== "string" || !date) {
    return NextResponse.json({ error: "title and date are required" }, { status: 400 });
  }
  const id = (typeof body.id === "string" && body.id) || `manual_${randomUUID()}`;
  const source = (typeof body.source === "string" && body.source) || "manual";
  const event = createEvent({
    ...body,
    title,
    date,
    id,
    source,
    source_type: "manual",
  });
  return NextResponse.json({ ok: true, event });
}
