// Venue merge tool — collapses N duplicate-ish venue names into one canonical
// name across every place the name is stored:
//
//   - events.location
//   - user_sources.venue_name
//   - discord_subscriptions.venue_name
//   - discord_scheduled_event_subs.venue_name
//   - venue_defaults (re-keyed by venueKey of the canonical name)
//
// No rows are deleted. Every change is a text-field UPDATE, and the full
// before-state is snapshotted into venue_merges so undoVenueMerge() can
// restore it exactly.
//
// Safety properties:
//   - Single SQLite transaction per merge → atomic, no partial state
//   - venue_defaults rows for source venues are left intact (orphaned but
//     intact) so the snapshot can put them back on undo
//   - Canonical name can be any of the source names OR a brand-new string
//   - Sub tables get their venue_name updated to the canonical so existing
//     subscriptions keep matching events after the merge

import { getDb } from "@/lib/db";
import {
  type VenueDefault,
  type VenueImageSource,
  venueKey,
} from "@/lib/venues";

const VENUE_DEFAULT_COLUMNS =
  "venue_key, image_url, updated_at, image_source, last_fetched_at, attempt_count";

// Manual > og:image > Google Places > Street View. Used to pick which source
// venue's image gets copied to the canonical key when canonical has no image.
const SOURCE_PRIORITY: Record<VenueImageSource, number> = {
  manual: 4,
  og_scrape: 3,
  places: 2,
  street_view: 1,
};

interface AffectedEventSnapshot {
  id: string;
  original_location: string;
}

interface AffectedFieldSnapshot {
  id: string;
  original_venue_name: string;
}

interface DefaultsChange {
  /** Canonical key — where the image landed. */
  to_key: string;
  /** Whether canonical's row pre-existed (rules out our INSERT). */
  canonical_pre_existed: boolean;
  /** Snapshot of canonical's row before merge (null if no row). */
  prior_canonical_row: VenueDefault | null;
  /** The source-key row we read the image from, if any. */
  copied_from_key: string | null;
}

export interface VenueMergeRecord {
  id: number;
  canonicalName: string;
  sourceNames: string[];
  affectedEvents: AffectedEventSnapshot[];
  affectedSources: AffectedFieldSnapshot[];
  affectedChannelSubs: AffectedFieldSnapshot[];
  affectedEventsTabSubs: AffectedFieldSnapshot[];
  defaultsChange: DefaultsChange | null;
  mergedBy: string | null;
  mergedAt: string;
  reversedAt: string | null;
  reversedBy: string | null;
}

export interface MergeResult {
  mergeId: number;
  canonicalName: string;
  eventsUpdated: number;
  sourcesUpdated: number;
  channelSubsUpdated: number;
  eventsTabSubsUpdated: number;
  defaultsCopied: boolean;
}

export interface MergeInput {
  canonicalName: string;
  sourceNames: string[];
  userId?: string | null;
}

/**
 * Atomically rewrite every reference to any of `sourceNames` so it points at
 * `canonicalName`. Sources matching the canonical itself are no-op (we only
 * update fields where the value differs). The full before-state is captured
 * in venue_merges for `undoVenueMerge`.
 *
 * Throws on:
 *   - Empty canonical or sources
 *   - Canonical not in sources AND sources only contain a single value
 *     (nothing to merge — would just be a rename, not currently a use case)
 */
export function mergeVenues({
  canonicalName,
  sourceNames,
  userId,
}: MergeInput): MergeResult {
  const canonical = canonicalName.trim();
  if (!canonical) throw new Error("Canonical name is required");
  const sources = Array.from(
    new Set(sourceNames.map((s) => s.trim()).filter((s) => s.length > 0)),
  );
  if (sources.length === 0) throw new Error("At least one source venue is required");

  // Filter out anything that already equals the canonical — those rows don't
  // need updating. But keep them in the audit log for transparency.
  const sourcesToUpdate = sources.filter((s) => s !== canonical);
  if (sourcesToUpdate.length === 0) {
    throw new Error("All source venues already equal the canonical name");
  }

  const db = getDb();
  const placeholders = sourcesToUpdate.map(() => "?").join(",");

  // Snapshots — read before mutate so the audit log captures exact prior state.
  const eventsBefore = db
    .prepare(
      `SELECT id, location FROM events WHERE location IN (${placeholders})`,
    )
    .all(...sourcesToUpdate) as { id: string; location: string }[];

  const sourcesBefore = db
    .prepare(
      `SELECT id, venue_name FROM user_sources WHERE venue_name IN (${placeholders})`,
    )
    .all(...sourcesToUpdate) as { id: string; venue_name: string }[];

  const channelSubsBefore = db
    .prepare(
      `SELECT id, venue_name FROM discord_subscriptions WHERE venue_name IN (${placeholders})`,
    )
    .all(...sourcesToUpdate) as { id: string; venue_name: string }[];

  const eventsTabSubsBefore = db
    .prepare(
      `SELECT id, venue_name FROM discord_scheduled_event_subs WHERE venue_name IN (${placeholders})`,
    )
    .all(...sourcesToUpdate) as { id: string; venue_name: string }[];

  // venue_defaults: figure out what (if anything) we need to copy into the
  // canonical key. Rule: only copy if canonical has no row of its own. We
  // never delete source rows — keeping them intact makes undo a pure rollback.
  const canonicalKey = venueKey(canonical);
  const canonicalRow = canonicalKey
    ? (db
        .prepare(
          `SELECT ${VENUE_DEFAULT_COLUMNS} FROM venue_defaults WHERE venue_key = ?`,
        )
        .get(canonicalKey) as VenueDefault | undefined)
    : undefined;

  const sourceKeys = sourcesToUpdate
    .map((n) => venueKey(n))
    .filter((k) => k && k !== canonicalKey);
  const sourceRows: VenueDefault[] = sourceKeys.length
    ? (db
        .prepare(
          `SELECT ${VENUE_DEFAULT_COLUMNS} FROM venue_defaults WHERE venue_key IN (${sourceKeys
            .map(() => "?")
            .join(",")})`,
        )
        .all(...sourceKeys) as VenueDefault[])
    : [];

  let bestSource: VenueDefault | null = null;
  if (!canonicalRow && sourceRows.length > 0) {
    // Pick the highest-priority source that has a real image URL. An attempt-
    // only row (image_url='') is skipped — copying that would just orphan an
    // empty placeholder under canonical.
    const candidates = sourceRows.filter((r) => r.image_url);
    if (candidates.length > 0) {
      bestSource = candidates.reduce((best, r) => {
        const bestP = best.image_source ? SOURCE_PRIORITY[best.image_source] : 0;
        const rP = r.image_source ? SOURCE_PRIORITY[r.image_source] : 0;
        return rP > bestP ? r : best;
      });
    }
  }

  const defaultsChange: DefaultsChange | null = canonicalKey
    ? {
        to_key: canonicalKey,
        canonical_pre_existed: !!canonicalRow,
        prior_canonical_row: canonicalRow ?? null,
        copied_from_key: bestSource ? bestSource.venue_key : null,
      }
    : null;

  // Snapshots into JSON for the audit row.
  const affectedEvents: AffectedEventSnapshot[] = eventsBefore.map((r) => ({
    id: r.id,
    original_location: r.location,
  }));
  const affectedSources: AffectedFieldSnapshot[] = sourcesBefore.map((r) => ({
    id: r.id,
    original_venue_name: r.venue_name,
  }));
  const affectedChannelSubs: AffectedFieldSnapshot[] = channelSubsBefore.map((r) => ({
    id: r.id,
    original_venue_name: r.venue_name,
  }));
  const affectedEventsTabSubs: AffectedFieldSnapshot[] = eventsTabSubsBefore.map((r) => ({
    id: r.id,
    original_venue_name: r.venue_name,
  }));

  // The whole merge runs in a single SQLite transaction — if anything throws,
  // every UPDATE is rolled back and the audit row is never written. No torn
  // state possible.
  const tx = db.transaction(() => {
    if (eventsBefore.length > 0) {
      db.prepare(
        `UPDATE events SET location = ?, updated_date = date('now') WHERE location IN (${placeholders})`,
      ).run(canonical, ...sourcesToUpdate);
    }
    if (sourcesBefore.length > 0) {
      db.prepare(
        `UPDATE user_sources SET venue_name = ? WHERE venue_name IN (${placeholders})`,
      ).run(canonical, ...sourcesToUpdate);
    }
    if (channelSubsBefore.length > 0) {
      db.prepare(
        `UPDATE discord_subscriptions SET venue_name = ?, updated_at = datetime('now') WHERE venue_name IN (${placeholders})`,
      ).run(canonical, ...sourcesToUpdate);
    }
    if (eventsTabSubsBefore.length > 0) {
      db.prepare(
        `UPDATE discord_scheduled_event_subs SET venue_name = ?, updated_at = datetime('now') WHERE venue_name IN (${placeholders})`,
      ).run(canonical, ...sourcesToUpdate);
    }
    if (bestSource && canonicalKey) {
      // INSERT (not UPSERT) — we already verified canonical has no row.
      db.prepare(
        `INSERT INTO venue_defaults (venue_key, image_url, updated_at, image_source, last_fetched_at, attempt_count)
         VALUES (?, ?, datetime('now'), ?, ?, ?)`,
      ).run(
        canonicalKey,
        bestSource.image_url,
        bestSource.image_source,
        bestSource.last_fetched_at,
        bestSource.attempt_count,
      );
    }

    const result = db
      .prepare(
        `INSERT INTO venue_merges (
           canonical_name, source_names, affected_events, affected_sources,
           affected_channel_subs, affected_events_tab_subs, defaults_change, merged_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        canonical,
        JSON.stringify(sources),
        JSON.stringify(affectedEvents),
        JSON.stringify(affectedSources),
        JSON.stringify(affectedChannelSubs),
        JSON.stringify(affectedEventsTabSubs),
        defaultsChange ? JSON.stringify(defaultsChange) : null,
        userId ?? null,
      );
    return Number(result.lastInsertRowid);
  });
  const mergeId = tx();

  return {
    mergeId,
    canonicalName: canonical,
    eventsUpdated: eventsBefore.length,
    sourcesUpdated: sourcesBefore.length,
    channelSubsUpdated: channelSubsBefore.length,
    eventsTabSubsUpdated: eventsTabSubsBefore.length,
    defaultsCopied: !!bestSource,
  };
}

interface MergeRow {
  id: number;
  canonical_name: string;
  source_names: string;
  affected_events: string;
  affected_sources: string;
  affected_channel_subs: string;
  affected_events_tab_subs: string;
  defaults_change: string | null;
  merged_by: string | null;
  merged_at: string;
  reversed_at: string | null;
  reversed_by: string | null;
}

function rowToRecord(row: MergeRow): VenueMergeRecord {
  return {
    id: row.id,
    canonicalName: row.canonical_name,
    sourceNames: JSON.parse(row.source_names) as string[],
    affectedEvents: JSON.parse(row.affected_events) as AffectedEventSnapshot[],
    affectedSources: JSON.parse(row.affected_sources) as AffectedFieldSnapshot[],
    affectedChannelSubs: JSON.parse(row.affected_channel_subs) as AffectedFieldSnapshot[],
    affectedEventsTabSubs: JSON.parse(row.affected_events_tab_subs) as AffectedFieldSnapshot[],
    defaultsChange: row.defaults_change ? (JSON.parse(row.defaults_change) as DefaultsChange) : null,
    mergedBy: row.merged_by,
    mergedAt: row.merged_at,
    reversedAt: row.reversed_at,
    reversedBy: row.reversed_by,
  };
}

const MERGE_COLUMNS = `id, canonical_name, source_names, affected_events,
  affected_sources, affected_channel_subs, affected_events_tab_subs,
  defaults_change, merged_by, merged_at, reversed_at, reversed_by`;

export function getVenueMerge(id: number): VenueMergeRecord | null {
  const row = getDb()
    .prepare(`SELECT ${MERGE_COLUMNS} FROM venue_merges WHERE id = ?`)
    .get(id) as MergeRow | undefined;
  return row ? rowToRecord(row) : null;
}

export function listVenueMerges(limit = 100): VenueMergeRecord[] {
  const rows = getDb()
    .prepare(`SELECT ${MERGE_COLUMNS} FROM venue_merges ORDER BY id DESC LIMIT ?`)
    .all(limit) as MergeRow[];
  return rows.map(rowToRecord);
}

export interface UndoResult {
  mergeId: number;
  eventsRestored: number;
  sourcesRestored: number;
  channelSubsRestored: number;
  eventsTabSubsRestored: number;
  defaultsRestored: boolean;
}

/**
 * Replay the snapshot stored on a merge row to put every UPDATE back to its
 * pre-merge value. Safe to call only once — sets reversed_at so a second
 * call throws.
 *
 * If new rows were inserted into events / subs / sources between the merge
 * and the undo with location=canonical (e.g. a new event arrived from a
 * scraper), they're left as-is — we only restore rows that existed in the
 * snapshot.
 */
export function undoVenueMerge(id: number, userId?: string | null): UndoResult {
  const db = getDb();
  const record = getVenueMerge(id);
  if (!record) throw new Error(`Merge ${id} not found`);
  if (record.reversedAt) throw new Error(`Merge ${id} was already reversed`);

  const tx = db.transaction(() => {
    let eventsRestored = 0;
    let sourcesRestored = 0;
    let channelSubsRestored = 0;
    let eventsTabSubsRestored = 0;
    let defaultsRestored = false;

    const updateEvent = db.prepare(
      "UPDATE events SET location = ?, updated_date = date('now') WHERE id = ?",
    );
    for (const e of record.affectedEvents) {
      const r = updateEvent.run(e.original_location, e.id);
      eventsRestored += r.changes;
    }

    const updateSource = db.prepare(
      "UPDATE user_sources SET venue_name = ? WHERE id = ?",
    );
    for (const s of record.affectedSources) {
      const r = updateSource.run(s.original_venue_name, s.id);
      sourcesRestored += r.changes;
    }

    const updateChannelSub = db.prepare(
      "UPDATE discord_subscriptions SET venue_name = ?, updated_at = datetime('now') WHERE id = ?",
    );
    for (const s of record.affectedChannelSubs) {
      const r = updateChannelSub.run(s.original_venue_name, s.id);
      channelSubsRestored += r.changes;
    }

    const updateEventsTabSub = db.prepare(
      "UPDATE discord_scheduled_event_subs SET venue_name = ?, updated_at = datetime('now') WHERE id = ?",
    );
    for (const s of record.affectedEventsTabSubs) {
      const r = updateEventsTabSub.run(s.original_venue_name, s.id);
      eventsTabSubsRestored += r.changes;
    }

    if (record.defaultsChange) {
      const change = record.defaultsChange;
      // If we INSERTed a canonical row during merge, delete it now. If a
      // canonical row pre-existed and we left it alone, no-op.
      if (!change.canonical_pre_existed && change.copied_from_key) {
        db.prepare("DELETE FROM venue_defaults WHERE venue_key = ?").run(change.to_key);
        defaultsRestored = true;
      }
      // (Source rows were never touched, so nothing to put back.)
    }

    db.prepare(
      "UPDATE venue_merges SET reversed_at = datetime('now'), reversed_by = ? WHERE id = ?",
    ).run(userId ?? null, id);

    return {
      mergeId: id,
      eventsRestored,
      sourcesRestored,
      channelSubsRestored,
      eventsTabSubsRestored,
      defaultsRestored,
    };
  });
  return tx();
}
