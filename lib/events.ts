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
  store_url: string;
  detail_url: string;
  latitude: number | null;
  longitude: number | null;
  source: string;
  status: string;
  notes: string;
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
  /** User-connected sources (e.g. private Discord) set owner_id + source_type + status. */
  owner_id?: string | null;
  source_type?: string;
  status?: "active" | "skip" | "pending";
  /** Cover image URL (e.g. Discord CDN or hosted upload). Empty string if none. */
  image_url?: string;
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
    INSERT INTO events (id, title, format, date, time, timezone, location, address, cost, store_url, detail_url, latitude, longitude, source, status, notes, added_date, updated_date, owner_id, source_type, image_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?)
  `);

  // Note: owner_id and source_type are intentionally omitted from UPDATE so they survive scraper re-runs (same pattern as pinned/skip).
  // image_url is preserved when an existing row already has one — uploads should never get clobbered by a re-scrape.
  const updateStmt = db.prepare(`
    UPDATE events SET title=?, format=?, date=?, time=?, timezone=?, location=?, address=?, cost=?, store_url=?, detail_url=?, latitude=?, longitude=?, source=?, status=?, updated_date=?, image_url=?
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
        insertStmt.run(ev.id, ev.title, ev.format, ev.date, ev.time, ev.timezone, ev.location, ev.address, ev.cost, ev.store_url, ev.detail_url, ev.latitude ?? null, ev.longitude ?? null, ev.source, insertStatus, now, now, ev.owner_id ?? null, insertSourceType, ev.image_url ?? "");
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
        updateStmt.run(ev.title, ev.format, ev.date, ev.time, ev.timezone, ev.location, ev.address, ev.cost, ev.store_url, ev.detail_url, ev.latitude ?? null, ev.longitude ?? null, ev.source, status, now, nextImage, ev.id);
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
 */
export function getAllEvents(limit = 5000, offset = 0): EventRow[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM events ORDER BY date ASC, time ASC LIMIT ? OFFSET ?")
    .all(limit, offset) as EventRow[];
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
    INSERT INTO events (id, title, format, date, time, timezone, location, address, cost, store_url, detail_url, latitude, longitude, source, status, notes, added_date, updated_date, owner_id, source_type, image_url, capacity, rsvp_enabled, visibility)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    input.store_url ?? "",
    input.detail_url ?? "",
    input.latitude ?? null,
    input.longitude ?? null,
    input.source,
    VALID_STATUSES.has(input.status ?? "") ? input.status : "active",
    input.notes ?? "",
    now,
    now,
    input.owner_id ?? null,
    input.source_type ?? "manual",
    input.image_url ?? "",
    normalizeCapacity(input.capacity),
    input.rsvp_enabled ? 1 : 0,
    normalizeVisibility(input.visibility),
  );
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
      store_url=?, detail_url=?, latitude=?, longitude=?, status=?, notes=?, image_url=?,
      capacity=?, rsvp_enabled=?, visibility=?, updated_date=?
    WHERE id=?
  `).run(
    merged.title, merged.format, merged.date, merged.time, merged.timezone, merged.location,
    merged.address, merged.cost, merged.store_url, merged.detail_url,
    merged.latitude ?? null, merged.longitude ?? null,
    merged.status, merged.notes, merged.image_url ?? "",
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
  return getDb()
    .prepare(`
      SELECT e.*, u.email AS owner_email, u.name AS owner_name
      FROM events e
      LEFT JOIN users u ON u.id = e.owner_id
      WHERE e.status = 'pending'
      ORDER BY e.added_date DESC, e.date ASC
    `)
    .all() as PendingEventRow[];
}

export function countPendingEvents(): number {
  const row = getDb().prepare("SELECT COUNT(*) AS n FROM events WHERE status = 'pending'").get() as { n: number };
  return row.n;
}
