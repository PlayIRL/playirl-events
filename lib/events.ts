import { getDb } from "./db";

export interface EventRow {
  id: string;
  title: string;
  format: string;
  date: string;
  time: string;
  timezone: string;
  location: string;
  address: string;
  cost: string;
  /** ISO 4217 currency code for the entry fee ("USD", "EUR", "GBP", "JPY").
   *  Empty when the source didn't carry one or the event is free. */
  currency: string;
  /** Entry fee in minor units (cents/pence/yen). NULL = unknown, 0 = free.
   *  Use this in tandem with `currency` for any new price rendering — the
   *  `cost` string keeps the historical, source-baked label for back-compat. */
  entry_fee_minor: number | null;
  /** ISO 3166 alpha-2 country code ("US", "GB", "JP"). Empty for legacy
   *  rows scraped before the column existed and for events with no resolved
   *  venue coords. Used by display layers to decide currency formatting,
   *  distance units, and date locale. */
  country: string;
  store_url: string;
  detail_url: string;
  latitude: number | null;
  longitude: number | null;
  source: string;
  status: string;
  notes: string;
  /** Source-provided description (e.g. WotC GraphQL `description`). Scrapers
   *  refresh this on every run. The detail page renders `notes` if set,
   *  otherwise falls back to this field. Empty string for user-created events
   *  (those use `notes` directly). */
  description: string;
  added_date: string;
  updated_date: string;
  owner_id: string | null;
  source_type: string;
  image_url: string;
  /** Optional player-count cap. NULL means uncapped. */
  capacity: number | null;
  /** 1 when the event accepts RSVPs (default off for scraped events). */
  rsvp_enabled: number;
  /** 'public' | 'unlisted' | 'private' — see lib/events.ts visibilityFilter. */
  visibility: string;
  /** ISO timestamp when the host cancelled. NULL = active. */
  cancelled_at: string | null;
  /** When an admin rejects a host-submitted event, this stamps the
   *  rejection time (status flips to 'skip' simultaneously). NULL means
   *  "never rejected" — the row's status alone tells you whether it's
   *  active / pending / skip / pinned for non-rejection reasons. */
  rejected_at: string | null;
  /** Free-text reason the admin gave when rejecting. Surfaced to the host
   *  on /account/events so they know why their submission didn't go live. */
  rejection_reason: string;
}

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
  latitude?: number | null;
  longitude?: number | null;
  source: string;
  /** ISO 4217 currency for the entry fee. Empty when free/unknown. */
  currency?: string;
  /** Entry fee in minor units (cents/pence/yen). NULL = unknown, 0 = free. */
  entry_fee_minor?: number | null;
  /** ISO 3166 alpha-2 country code. Empty when the venue's country couldn't
   *  be resolved at scrape time. */
  country?: string;
  /** User-connected sources (e.g. private Discord) set owner_id + source_type + status. */
  owner_id?: string | null;
  source_type?: string;
  status?: "active" | "skip" | "pending";
  /** Cover image URL (e.g. Discord CDN or hosted upload). Empty string if none. */
  image_url?: string;
  /** Source-provided description. Refreshed on every scrape — admin/host
   *  overrides live in `notes` instead, which the scraper leaves alone. */
  description?: string;
}

export function upsertEvents(events: ScrapedEvent[]): {
  added: number;
  updated: number;
  skipped: number;
} {
  const db = getDb();
  const now = new Date().toISOString().split("T")[0];

  const getStmt = db.prepare("SELECT status, notes, added_date, owner_id, source_type, image_url FROM events WHERE id = ?");

  const insertStmt = db.prepare(`
    INSERT INTO events (id, title, format, date, time, timezone, location, address, cost, currency, entry_fee_minor, country, store_url, detail_url, latitude, longitude, source, status, notes, description, added_date, updated_date, owner_id, source_type, image_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?)
  `);

  // Note: owner_id and source_type are intentionally omitted from UPDATE so they survive scraper re-runs (same pattern as pinned/skip).
  // image_url is preserved when an existing row already has one — uploads should never get clobbered by a re-scrape.
  // `notes` is also omitted: host/admin-authored, scrapers must not overwrite it.
  // `description` IS refreshed on every update — it's source-authoritative.
  // currency, entry_fee_minor, country ARE refreshed on update — source-authoritative.
  const updateStmt = db.prepare(`
    UPDATE events SET title=?, format=?, date=?, time=?, timezone=?, location=?, address=?, cost=?, currency=?, entry_fee_minor=?, country=?, store_url=?, detail_url=?, latitude=?, longitude=?, source=?, status=?, updated_date=?, image_url=?, description=?
    WHERE id=?
  `);

  let added = 0, updated = 0, skipped = 0;

  const upsert = db.transaction(() => {
    for (const ev of events) {
      const existing = getStmt.get(ev.id) as
        | { status: string; notes: string; added_date: string; owner_id: string | null; source_type: string | null; image_url: string | null }
        | undefined;

      if (!existing) {
        const insertStatus = ev.status ?? "active";
        const insertSourceType = ev.source_type ?? "scraper";
        insertStmt.run(ev.id, ev.title, ev.format, ev.date, ev.time, ev.timezone, ev.location, ev.address, ev.cost, ev.currency ?? "", ev.entry_fee_minor ?? null, ev.country ?? "", ev.store_url, ev.detail_url, ev.latitude ?? null, ev.longitude ?? null, ev.source, insertStatus, ev.description ?? "", now, now, ev.owner_id ?? null, insertSourceType, ev.image_url ?? "");
        added++;
      } else if (existing.source_type === "organizer" || existing.source_type === "user" || existing.source_type === "user-discord" || existing.owner_id) {
        // User- and organizer-owned events are authoritative — never overwritten by re-scrapes.
        skipped++;
      } else if (existing.status === "pinned") {
        skipped++;
      } else {
        // Preserve manual/auto-curation statuses on update. `skip` and
        // `pending` survive re-scrapes — admins promote `pending` to `active`
        // by hand from the review queue. Anything else (typically `active`)
        // refreshes to `active`.
        const status =
          existing.status === "skip" || existing.status === "pending"
            ? existing.status
            : "active";
        // Keep an existing image_url if the re-scrape doesn't carry one.
        const nextImage = ev.image_url || existing.image_url || "";
        updateStmt.run(ev.title, ev.format, ev.date, ev.time, ev.timezone, ev.location, ev.address, ev.cost, ev.currency ?? "", ev.entry_fee_minor ?? null, ev.country ?? "", ev.store_url, ev.detail_url, ev.latitude ?? null, ev.longitude ?? null, ev.source, status, now, nextImage, ev.description ?? "", ev.id);
        updated++;
      }
    }
  });

  upsert();
  return { added, updated, skipped };
}

// Haversine distance in miles
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Bounding box around (lat, lng) ± radiusMi. Used as a cheap SQL prefilter
 * before the haversine refinement. Longitude degrees shrink with latitude;
 * we use cos(lat) to widen the lng window so the box stays a true superset
 * of the haversine circle. The 1.05 fudge factor pads for SQLite's float
 * precision and keeps borderline events from getting dropped pre-refinement.
 */
function boundingBoxMiles(lat: number, lng: number, radiusMi: number) {
  const latDelta = (radiusMi / 69.0) * 1.05;
  const cos = Math.cos((lat * Math.PI) / 180);
  // Avoid division-by-zero at the poles (not relevant for CONUS, but cheap).
  const lngDelta = cos > 0.01 ? (radiusMi / (69.0 * cos)) * 1.05 : 180;
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
}

export function getActiveEvents(filters?: {
  format?: string;
  from?: string;
  to?: string;
  radiusMiles?: number;
  centerLat?: number;
  centerLng?: number;
  /** When true, restrict to Regional Championship Qualifier events. RCQs are
   *  identified by title pattern — scrapers (esp. wizards-locator) don't
   *  expose a dedicated tag, but RCQ titles consistently include the
   *  "RCQ" abbreviation or "Regional Championship Qualifier" spelled out.
   *  Orthogonal to format (an RCQ can be Modern, Sealed, Standard, etc.) so
   *  this combines with `format` rather than replacing it. */
  rcq?: boolean;
}): EventRow[] {
  const db = getDb();
  // visibility/cancelled chokepoint: every public read path goes through
  // here, so unlisted/private/cancelled events stay out of the homepage,
  // ICS feeds, format dropdown, and search by default.
  let sql = "SELECT * FROM events WHERE status IN ('active', 'pinned') AND visibility = 'public' AND cancelled_at IS NULL";
  const params: (string | number)[] = [];

  if (filters?.format) {
    sql += " AND format = ?";
    params.push(filters.format);
  }
  if (filters?.rcq) {
    // No index helps here — LIKE with a leading % can't use a btree. Cost is
    // acceptable because the chokepoint already filters by date and (often)
    // bbox, so the candidate set is small by the time we LIKE-scan titles.
    sql += " AND (title LIKE '%RCQ%' OR title LIKE '%Regional Championship Qualifier%')";
  }
  if (filters?.from) {
    sql += " AND date >= ?";
    params.push(filters.from);
  }
  if (filters?.to) {
    sql += " AND date <= ?";
    params.push(filters.to);
  }

  // Bounding-box prefilter: pushes the easy spatial reject down to SQLite so
  // we only haversine the candidate set instead of every active event. Events
  // without coords still come through (their distance is unknown — we keep
  // them rather than hide them).
  if (filters?.radiusMiles && filters?.centerLat != null && filters?.centerLng != null) {
    const bbox = boundingBoxMiles(filters.centerLat, filters.centerLng, filters.radiusMiles);
    sql += " AND (latitude IS NULL OR (latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?))";
    params.push(bbox.minLat, bbox.maxLat, bbox.minLng, bbox.maxLng);
  }

  sql += " ORDER BY date ASC, time ASC";
  let rows = db.prepare(sql).all(...params) as EventRow[];

  // Haversine refinement — only on rows that survived the bbox prefilter.
  if (filters?.radiusMiles && filters?.centerLat != null && filters?.centerLng != null) {
    const maxMiles = filters.radiusMiles;
    const cLat = filters.centerLat;
    const cLng = filters.centerLng;
    rows = rows.filter(ev => {
      if (ev.latitude == null || ev.longitude == null) return true; // include events without coords
      return haversineDistance(cLat, cLng, ev.latitude, ev.longitude) <= maxMiles;
    });
  }

  return rows;
}

/**
 * Admin-only: every event in the DB. Default-limited to 5000 rows because
 * nationwide scrape can produce 50k+ rows and shipping the whole table to a
 * browser tanks both server memory and the admin event-table page render.
 * Callers that need more should either page (pass `offset`) or query the DB
 * directly with a focused WHERE clause.
 *
 * Prefer `getFilteredEvents` for admin paginated/filtered listings —
 * this fallback exists for callers that want a flat dump (CSV exports,
 * tests).
 */
export function getAllEvents(limit = 5000, offset = 0): EventRow[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM events ORDER BY date ASC, time ASC LIMIT ? OFFSET ?")
    .all(limit, offset) as EventRow[];
}

export interface EventFilters {
  status?: string;       // "active" | "skip" | "pinned" | "pending" | "all"
  source?: string;       // exact match, "all" = no filter
  format?: string;
  country?: string;      // ISO alpha-2; "—" filters for empty/null
  currency?: string;     // ISO 4217; "—" filters for empty/null
  search?: string;       // matched against title + location, case-insensitive
}

export interface PaginatedEvents {
  events: EventRow[];
  /** Total matching the filters (before LIMIT/OFFSET). Used to render
   *  "Showing 1-50 of 1,234" + pagination math. */
  total: number;
}

/**
 * Admin paginated/filtered events lookup. All filters are server-side so
 * the browser only sees ONE page of rows at a time — at 120k+ events,
 * loading the full table is what was making /admin/events sluggish.
 *
 * Empty / "all" / undefined filter values are no-ops. The "—" sentinel
 * for country/currency filters to "rows missing this field" — mirrors
 * how the EventTable filter dropdowns surface empty values.
 *
 * Returns the total separately so callers can render pagination
 * controls without a second round trip.
 */
export function getFilteredEvents(
  filters: EventFilters,
  limit: number = 50,
  offset: number = 0,
): PaginatedEvents {
  const db = getDb();
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  if (filters.status && filters.status !== "all") {
    clauses.push("status = ?");
    params.push(filters.status);
  }
  if (filters.source && filters.source !== "all") {
    clauses.push("source = ?");
    params.push(filters.source);
  }
  if (filters.format && filters.format !== "all") {
    clauses.push("format = ?");
    params.push(filters.format);
  }
  if (filters.country && filters.country !== "all") {
    if (filters.country === "—") {
      clauses.push("(country IS NULL OR country = '')");
    } else {
      clauses.push("country = ?");
      params.push(filters.country);
    }
  }
  if (filters.currency && filters.currency !== "all") {
    if (filters.currency === "—") {
      clauses.push("(currency IS NULL OR currency = '')");
    } else {
      clauses.push("currency = ?");
      params.push(filters.currency);
    }
  }
  if (filters.search && filters.search.trim()) {
    // LIKE %x% can't use a btree index, but the candidate set is already
    // narrowed by the other clauses. For the worst case (no filters
    // applied) the search runs over the full ~120k rows in ~30-50ms,
    // which is acceptable for an admin endpoint.
    const like = `%${filters.search.trim().toLowerCase()}%`;
    clauses.push("(LOWER(title) LIKE ? OR LOWER(location) LIKE ?)");
    params.push(like, like);
  }

  const whereClause = clauses.length > 0 ? "WHERE " + clauses.join(" AND ") : "";
  const totalRow = db.prepare(`SELECT COUNT(*) AS n FROM events ${whereClause}`).get(...params) as { n: number };
  const events = db
    .prepare(`SELECT * FROM events ${whereClause} ORDER BY date ASC, time ASC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as EventRow[];
  return { events, total: totalRow.n };
}

export interface EventStats {
  total: number;
  byStatus: Record<string, number>;
  bySource: { source: string; count: number }[];
  byCountry: { country: string; count: number }[];
  byFormat: { format: string; count: number }[];
  byCurrency: { currency: string; count: number }[];
}

/**
 * DB-wide event aggregates for the /admin/events overview cards. Single
 * SQL pass per group; SQLite uses the existing source/status/format
 * indexes where the planner can. At ~120k rows the whole bundle
 * computes in ~150-300ms.
 *
 * Returned arrays are full-width (every distinct value, sorted by
 * count desc) — callers slice for top-N display. Country / currency
 * empties get bucketed under "—" so they stay visible.
 */
export function getEventStats(): EventStats {
  const db = getDb();
  const total = (db.prepare("SELECT COUNT(*) AS n FROM events").get() as { n: number }).n;
  const statusRows = db
    .prepare("SELECT status, COUNT(*) AS n FROM events GROUP BY status")
    .all() as { status: string; n: number }[];
  const byStatus: Record<string, number> = {};
  for (const r of statusRows) byStatus[r.status] = r.n;

  const sourceRows = db
    .prepare("SELECT source, COUNT(*) AS count FROM events GROUP BY source ORDER BY count DESC")
    .all() as { source: string; count: number }[];

  const countryRows = db
    .prepare(`
      SELECT COALESCE(NULLIF(country, ''), '—') AS country, COUNT(*) AS count
      FROM events
      GROUP BY COALESCE(NULLIF(country, ''), '—')
      ORDER BY count DESC
    `)
    .all() as { country: string; count: number }[];

  const formatRows = db
    .prepare(`
      SELECT COALESCE(NULLIF(format, ''), '—') AS format, COUNT(*) AS count
      FROM events
      GROUP BY COALESCE(NULLIF(format, ''), '—')
      ORDER BY count DESC
    `)
    .all() as { format: string; count: number }[];

  const currencyRows = db
    .prepare(`
      SELECT COALESCE(NULLIF(currency, ''), '—') AS currency, COUNT(*) AS count
      FROM events
      GROUP BY COALESCE(NULLIF(currency, ''), '—')
      ORDER BY count DESC
    `)
    .all() as { currency: string; count: number }[];

  return {
    total,
    byStatus,
    bySource: sourceRows,
    byCountry: countryRows,
    byFormat: formatRows,
    byCurrency: currencyRows,
  };
}

/**
 * All upcoming (today and forward) public/active/pinned events for a
 * given venue, by case-insensitive name match. Used by the /venue/[slug]
 * page. Caps at 200 rows so popular venues with hundreds of recurring
 * events don't blow up the page.
 */
export function getEventsForVenue(name: string, limit = 200): EventRow[] {
  if (!name) return [];
  const db = getDb();
  const today = new Date().toISOString().split("T")[0];
  return db
    .prepare(
      `SELECT * FROM events
       WHERE LOWER(TRIM(location)) = LOWER(TRIM(?))
         AND status IN ('active','pinned')
         AND visibility = 'public'
         AND cancelled_at IS NULL
         AND date >= ?
       ORDER BY date ASC, time ASC
       LIMIT ?`,
    )
    .all(name, today, limit) as EventRow[];
}

/**
 * Admin-only variant of getEventsForVenue: returns EVERY event whose
 * location matches the name, regardless of status, visibility, cancellation,
 * or date. Used on /admin/venues/[slug] where moderators need to see the
 * full picture (past events, pending/skipped events, cancelled events,
 * private events) — not the filtered subset that the public site renders.
 *
 * Most-recent-first ordering so the admin sees the freshest activity at the
 * top, opposite of the chronological asc order the public page uses.
 */
export function getAllEventsForVenue(name: string, limit = 500): EventRow[] {
  if (!name) return [];
  return getDb()
    .prepare(
      `SELECT * FROM events
       WHERE LOWER(TRIM(location)) = LOWER(TRIM(?))
       ORDER BY date DESC, time DESC
       LIMIT ?`,
    )
    .all(name, limit) as EventRow[];
}

export function getEvent(id: string): EventRow | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM events WHERE id = ?").get(id) as EventRow | undefined;
}

export function updateEventStatus(id: string, status: string, notes?: string): boolean {
  const db = getDb();
  const now = new Date().toISOString().split("T")[0];
  if (notes !== undefined) {
    const r = db.prepare("UPDATE events SET status=?, notes=?, updated_date=? WHERE id=?").run(status, notes, now, id);
    return r.changes > 0;
  }
  const r = db.prepare("UPDATE events SET status=?, updated_date=? WHERE id=?").run(status, now, id);
  return r.changes > 0;
}

export function getFormats(): string[] {
  const db = getDb();
  // Same visibility/cancelled chokepoint as getActiveEvents — no point
  // showing "Brawl" in the homepage filter dropdown if the only Brawl
  // event is unlisted or cancelled.
  const rows = db
    .prepare(
      "SELECT DISTINCT format FROM events WHERE status IN ('active','pinned') AND visibility = 'public' AND cancelled_at IS NULL AND format != '' ORDER BY format",
    )
    .all() as { format: string }[];
  return rows.map(r => r.format);
}

export function archiveOldEvents(daysOld: number = 90): number {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysOld);
  const cutoffStr = cutoff.toISOString().split("T")[0];
  const r = db.prepare("DELETE FROM events WHERE date < ? AND status != 'pinned'").run(cutoffStr);
  return r.changes;
}

export function getSetting(key: string): string {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value || "";
}

export function setSetting(key: string, value: string): void {
  const db = getDb();
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
}

// ----- Manual / organizer event mutations -----

export type EventInput = Partial<Omit<EventRow, "id" | "added_date" | "updated_date">> & {
  id?: string;
};

const VALID_STATUSES = new Set(["active", "skip", "pinned", "pending"]);

export function createEvent(input: EventInput & { id: string; title: string; date: string; source: string }): EventRow {
  const db = getDb();
  const now = new Date().toISOString().split("T")[0];
  db.prepare(`
    INSERT INTO events (id, title, format, date, time, timezone, location, address, cost, currency, entry_fee_minor, country, store_url, detail_url, latitude, longitude, source, status, notes, description, added_date, updated_date, owner_id, source_type, image_url, capacity, rsvp_enabled, visibility)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.id,
    input.title,
    input.format ?? "",
    input.date,
    input.time ?? "",
    input.timezone ?? "America/New_York",
    input.location ?? "",
    input.address ?? "",
    input.cost ?? "",
    input.currency ?? "",
    input.entry_fee_minor ?? null,
    input.country ?? "",
    input.store_url ?? "",
    input.detail_url ?? "",
    input.latitude ?? null,
    input.longitude ?? null,
    input.source,
    VALID_STATUSES.has(input.status ?? "") ? input.status : "active",
    input.notes ?? "",
    input.description ?? "",
    now,
    now,
    input.owner_id ?? null,
    input.source_type ?? "manual",
    input.image_url ?? "",
    normalizeCapacity(input.capacity),
    input.rsvp_enabled ? 1 : 0,
    normalizeVisibility(input.visibility),
  );
  // Admin notification: a user or organizer just submitted an event. Skip
  // scraper-created or manual-admin rows — those aren't user activity.
  const sourceType = input.source_type ?? "manual";
  if (sourceType === "user" || sourceType === "organizer") {
    try {
      const owner = input.owner_id
        ? db
            .prepare("SELECT email FROM users WHERE id = ?")
            .get(input.owner_id) as { email: string } | undefined
        : undefined;
      void import("@/lib/admin-notifications").then((m) =>
        m.recordAdminNotification({
          type: "event_submitted",
          title: `New ${sourceType} event: ${input.title}`,
          subtitle: `${input.date}${input.time ? ` ${input.time}` : ""}${input.location ? ` · ${input.location}` : ""}${owner?.email ? ` · ${owner.email}` : ""}`,
          href: `/event/${input.id}`,
          userId: input.owner_id ?? null,
        }),
      );
    } catch (err) {
      console.error("[admin-notif] createEvent notification failed:", err);
    }
  }
  return getEvent(input.id)!;
}

export function updateEvent(id: string, patch: EventInput): EventRow | undefined {
  const db = getDb();
  const existing = getEvent(id);
  if (!existing) return undefined;
  const now = new Date().toISOString().split("T")[0];
  const merged = { ...existing, ...patch };
  if (!VALID_STATUSES.has(merged.status)) merged.status = existing.status;
  db.prepare(`
    UPDATE events SET
      title=?, format=?, date=?, time=?, timezone=?, location=?, address=?, cost=?,
      currency=?, entry_fee_minor=?, country=?,
      store_url=?, detail_url=?, latitude=?, longitude=?, status=?, notes=?, description=?, image_url=?,
      capacity=?, rsvp_enabled=?, visibility=?, updated_date=?
    WHERE id=?
  `).run(
    merged.title, merged.format, merged.date, merged.time, merged.timezone, merged.location,
    merged.address, merged.cost,
    merged.currency ?? "", merged.entry_fee_minor ?? null, merged.country ?? "",
    merged.store_url, merged.detail_url,
    merged.latitude ?? null, merged.longitude ?? null,
    merged.status, merged.notes, merged.description ?? "", merged.image_url ?? "",
    normalizeCapacity(merged.capacity), merged.rsvp_enabled ? 1 : 0,
    normalizeVisibility(merged.visibility),
    now, id,
  );
  return getEvent(id);
}

const VALID_VISIBILITY = new Set(["public", "unlisted", "private"]);
function normalizeVisibility(input: unknown): string {
  if (typeof input !== "string") return "public";
  return VALID_VISIBILITY.has(input) ? input : "public";
}

/** Coerce form-supplied capacity into a positive integer or null. Empty string,
 *  0, negatives, and non-numerics all become null (= uncapped). */
function normalizeCapacity(input: unknown): number | null {
  if (input === null || input === undefined || input === "") return null;
  const n = typeof input === "number" ? input : parseInt(String(input), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

export function deleteEvent(id: string): boolean {
  const r = getDb().prepare("DELETE FROM events WHERE id = ?").run(id);
  return r.changes > 0;
}

export function bulkUpdateStatus(ids: string[], status: string): number {
  if (ids.length === 0 || !VALID_STATUSES.has(status)) return 0;
  const db = getDb();
  const now = new Date().toISOString().split("T")[0];
  const placeholders = ids.map(() => "?").join(",");
  const r = db.prepare(`UPDATE events SET status=?, updated_date=? WHERE id IN (${placeholders})`).run(status, now, ...ids);
  return r.changes;
}

export function bulkDelete(ids: string[]): number {
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => "?").join(",");
  const r = getDb().prepare(`DELETE FROM events WHERE id IN (${placeholders})`).run(...ids);
  return r.changes;
}

/**
 * Lean projection used by `app/sitemap.ts`. Returns only the columns the
 * sitemap actually consumes (id, updated_date), so we don't pull a full
 * EventRow per row × 49k rows into memory just to discard everything but
 * two strings. At nationwide scale (~25-50k active events) the difference
 * is roughly 25 MB of allocations vs ~2 MB.
 *
 * Caps at `limit` rows server-side so a runaway query against an empty
 * /sitemap.xml doesn't lock up the DB. Sitemap protocol's per-file ceiling
 * is 50,000 URLs; we default to 48,000 to leave headroom for static + venue
 * URLs above the events list.
 */
export function getActiveEventIdsForSitemap(limit = 48_000): { id: string; updated_date: string }[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, updated_date
         FROM events
        WHERE status IN ('active','pinned')
          AND visibility = 'public'
          AND cancelled_at IS NULL
        ORDER BY date ASC
        LIMIT ?`,
    )
    .all(limit) as { id: string; updated_date: string }[];
}

export function getEventsByOwner(ownerId: string): EventRow[] {
  return getDb().prepare("SELECT * FROM events WHERE owner_id = ? ORDER BY date ASC, time ASC").all(ownerId) as EventRow[];
}

export interface PendingEventRow extends EventRow {
  owner_email: string | null;
  owner_name: string | null;
}

export function getPendingEvents(): PendingEventRow[] {
  // Rejected events still live at status='skip' (re-using the existing
  // CHECK-constraint value rather than rebuilding the table for a new one),
  // but the rejected_at filter keeps them out of the admin pending queue
  // so the queue stays clean post-rejection. The host's MyEventsList still
  // shows them via owner_id.
  return getDb()
    .prepare(`
      SELECT e.*, u.email AS owner_email, u.name AS owner_name
      FROM events e
      LEFT JOIN users u ON u.id = e.owner_id
      WHERE e.status = 'pending' AND e.rejected_at IS NULL
      ORDER BY e.added_date DESC, e.date ASC
    `)
    .all() as PendingEventRow[];
}

export function countPendingEvents(): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM events WHERE status = 'pending' AND rejected_at IS NULL")
    .get() as { n: number };
  return row.n;
}

/**
 * Soft-reject a pending event. Flips status to 'skip' (so it stays out of
 * the public calendar without needing a new CHECK-constraint enum value)
 * and stamps `rejected_at` + `rejection_reason` so the host sees a clear
 * "Rejected — because: …" entry on /account/events. Replaces the previous
 * hard-delete flow that left submitters with no feedback.
 */
export function rejectEvent(id: string, reason: string): boolean {
  const trimmed = reason.trim().slice(0, 1000);
  const r = getDb()
    .prepare(
      "UPDATE events SET status = 'skip', rejected_at = datetime('now'), rejection_reason = ?, updated_date = date('now') WHERE id = ? AND status = 'pending'",
    )
    .run(trimmed, id);
  return r.changes > 0;
}

export function bulkRejectEvents(ids: string[], reason: string): number {
  if (ids.length === 0) return 0;
  const trimmed = reason.trim().slice(0, 1000);
  const placeholders = ids.map(() => "?").join(",");
  const r = getDb()
    .prepare(
      `UPDATE events SET status = 'skip', rejected_at = datetime('now'), rejection_reason = ?, updated_date = date('now')
        WHERE id IN (${placeholders}) AND status = 'pending'`,
    )
    .run(trimmed, ...ids);
  return r.changes;
}
