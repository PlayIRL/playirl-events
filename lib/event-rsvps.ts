import { getDb } from "./db";

/**
 * RSVP layer for the homepage event detail page. Designed to mirror
 * `lib/event-saves.ts` shape — same (user_id, event_id) PK — but with a
 * status enum so we can later layer on waitlist auto-promotion (Tier 1).
 *
 * Capacity races: setRsvp uses a single SQLite transaction (BEGIN IMMEDIATE
 * via better-sqlite3's `db.transaction()` helper, which acquires a reserved
 * lock for writes under WAL). With WAL + reserved-lock semantics there is at
 * most one writer at any moment, so the count-then-insert sequence inside
 * the transaction is atomic from any other writer's perspective.
 */

export type RsvpStatus = "going" | "maybe" | "waitlist" | "cancelled";

export interface RsvpRow {
  user_id: string;
  event_id: string;
  status: RsvpStatus;
  created_at: string;
  updated_at: string;
}

export interface AttendeeRow extends RsvpRow {
  email: string;
  name: string | null;
}

export interface RsvpCounts {
  going: number;
  maybe: number;
  waitlist: number;
}

export interface SetRsvpResult {
  ok: true;
  status: RsvpStatus;
  counts: RsvpCounts;
  /** When the new status is 'waitlist', the user's 1-indexed position in line. */
  waitlistPosition?: number;
  /** True when this RSVP transition freed a slot that an oldest waitlister
   *  was atomically promoted into. UI can use this to congratulate (Tier 2
   *  email; v1 just does an in-app refresh). */
  promoted?: { user_id: string };
}

export interface SetRsvpFull {
  ok: false;
  reason: "full" | "cancelled" | "rsvp_disabled" | "past";
  counts: RsvpCounts;
}

/**
 * Insert/update a user's RSVP for an event, enforcing event-level capacity
 * within the same write transaction so two simultaneous "going" requests
 * can't oversell the event.
 *
 * Returns `{ ok: false, reason: 'full' }` when the requested status would
 * push the going-count past the event's capacity. The caller decides how
 * to surface that — UI shows the user a toast + falls back to "save" or
 * (post-Tier 1) "join waitlist".
 *
 * Special cases:
 *   - status='cancelled' always succeeds (frees a slot).
 *   - status='maybe' is uncapped (capacity only constrains 'going').
 *   - existing RSVP at status='going' switching to a different status
 *     decrements the count; switching back is also bounded by the cap.
 */
export function setRsvp(
  userId: string,
  eventId: string,
  next: RsvpStatus,
): SetRsvpResult | SetRsvpFull {
  const db = getDb();
  const tx = db.transaction((): SetRsvpResult | SetRsvpFull => {
    const event = db
      .prepare("SELECT capacity, rsvp_enabled, cancelled_at FROM events WHERE id = ?")
      .get(eventId) as
      | { capacity: number | null; rsvp_enabled: number; cancelled_at: string | null }
      | undefined;
    if (!event) throw new Error("event not found");

    if (event.cancelled_at) {
      return { ok: false, reason: "cancelled", counts: countAll(eventId) };
    }

    const existing = db
      .prepare("SELECT status FROM event_rsvps WHERE user_id = ? AND event_id = ?")
      .get(userId, eventId) as { status: RsvpStatus } | undefined;

    // Capacity check only applies when promoting to 'going'.
    if (next === "going" && event.capacity != null) {
      const goingCount = (db
        .prepare("SELECT COUNT(*) AS n FROM event_rsvps WHERE event_id = ? AND status = 'going'")
        .get(eventId) as { n: number }).n;

      // If the user is already 'going' they don't consume an extra slot;
      // otherwise the new RSVP takes one.
      const wouldAdd = existing?.status === "going" ? 0 : 1;
      if (goingCount + wouldAdd > event.capacity) {
        return { ok: false, reason: "full", counts: countAll(eventId) };
      }
    }

    if (existing) {
      db.prepare(
        "UPDATE event_rsvps SET status = ?, updated_at = datetime('now') WHERE user_id = ? AND event_id = ?",
      ).run(next, userId, eventId);
    } else {
      db.prepare(
        "INSERT INTO event_rsvps (user_id, event_id, status) VALUES (?, ?, ?)",
      ).run(userId, eventId, next);
    }

    // Auto-promote: if the user was 'going' and is no longer, the oldest
    // waitlister gets bumped into 'going' in the SAME transaction so two
    // concurrent cancels can't both promote the same waitlister.
    let promoted: { user_id: string } | undefined;
    if (existing?.status === "going" && next !== "going") {
      const oldest = db
        .prepare(
          "SELECT user_id FROM event_rsvps WHERE event_id = ? AND status = 'waitlist' ORDER BY created_at ASC LIMIT 1",
        )
        .get(eventId) as { user_id: string } | undefined;
      if (oldest) {
        // Stamp `promoted_at` alongside the status flip so the event detail
        // page can show the promoted user a "🎉 You came off the waitlist"
        // banner the next time they land. Without this, the user has no way
        // to discover the promotion until they happen to RSVP-check the
        // event again, defeating the point of waitlist auto-promotion.
        db.prepare(
          "UPDATE event_rsvps SET status = 'going', promoted_at = datetime('now'), updated_at = datetime('now') WHERE event_id = ? AND user_id = ?",
        ).run(eventId, oldest.user_id);
        promoted = { user_id: oldest.user_id };
      }
    }

    const result: SetRsvpResult = { ok: true, status: next, counts: countAll(eventId) };
    if (next === "waitlist") {
      result.waitlistPosition = positionOnWaitlist(eventId, userId) ?? undefined;
    }
    if (promoted) result.promoted = promoted;
    return result;
  });
  return tx();
}

/** 1-indexed waitlist position for a user, or null if not on the waitlist.
 *  Counts how many waitlisters created at or before this user's row. */
export function positionOnWaitlist(eventId: string, userId: string): number | null {
  const db = getDb();
  const row = db
    .prepare(
      `
      SELECT (
        SELECT COUNT(*) FROM event_rsvps r2
        WHERE r2.event_id = r.event_id
          AND r2.status = 'waitlist'
          AND r2.created_at <= r.created_at
      ) AS pos
      FROM event_rsvps r
      WHERE r.user_id = ? AND r.event_id = ? AND r.status = 'waitlist'
      `,
    )
    .get(userId, eventId) as { pos: number } | undefined;
  return row?.pos ?? null;
}

function countAll(eventId: string): RsvpCounts {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT status, COUNT(*) AS n FROM event_rsvps WHERE event_id = ? AND status IN ('going','maybe','waitlist') GROUP BY status",
    )
    .all(eventId) as { status: string; n: number }[];
  const counts: RsvpCounts = { going: 0, maybe: 0, waitlist: 0 };
  for (const r of rows) {
    if (r.status === "going" || r.status === "maybe" || r.status === "waitlist") {
      counts[r.status] = r.n;
    }
  }
  return counts;
}

/** Public read: returns the current user's RSVP status (if any) plus
 *  active counts. Names are NOT included — host-only via getAttendees. */
export function getRsvpSummary(eventId: string, userId: string | null): {
  myStatus: RsvpStatus | null;
  counts: RsvpCounts;
  waitlistPosition: number | null;
  /** Set when the user was auto-promoted from waitlist→going by another
   *  user's cancellation. UI surfaces a banner; clear via
   *  `acknowledgePromotion()` once the user has seen it. */
  promotedAt: string | null;
} {
  const db = getDb();
  let myStatus: RsvpStatus | null = null;
  let promotedAt: string | null = null;
  if (userId) {
    const row = db
      .prepare(
        "SELECT status, promoted_at FROM event_rsvps WHERE user_id = ? AND event_id = ?",
      )
      .get(userId, eventId) as { status: RsvpStatus; promoted_at: string | null } | undefined;
    myStatus = row?.status ?? null;
    promotedAt = row?.promoted_at ?? null;
  }
  const waitlistPosition =
    userId && myStatus === "waitlist" ? positionOnWaitlist(eventId, userId) : null;
  return { myStatus, counts: countAll(eventId), waitlistPosition, promotedAt };
}

/**
 * Clear the `promoted_at` stamp on a (user, event) RSVP. Called after the
 * UI has shown the "🎉 You came off the waitlist" banner; without this the
 * banner would render every visit forever.
 *
 * We don't delete the row or change status — just null out the stamp. The
 * user is still 'going'; we're just acknowledging they've seen the
 * notification.
 */
export function acknowledgePromotion(eventId: string, userId: string): void {
  getDb()
    .prepare(
      "UPDATE event_rsvps SET promoted_at = NULL WHERE user_id = ? AND event_id = ? AND promoted_at IS NOT NULL",
    )
    .run(userId, eventId);
}

/** Host-only: full attendee roster joined to users. */
export function getAttendees(eventId: string): AttendeeRow[] {
  return getDb()
    .prepare(`
      SELECT r.user_id, r.event_id, r.status, r.created_at, r.updated_at,
             u.email, u.name
      FROM event_rsvps r
      JOIN users u ON u.id = r.user_id
      WHERE r.event_id = ?
      ORDER BY
        CASE r.status WHEN 'going' THEN 0 WHEN 'maybe' THEN 1 WHEN 'waitlist' THEN 2 ELSE 3 END,
        r.created_at ASC
    `)
    .all(eventId) as AttendeeRow[];
}

/** Convenience: check if the event is past its date. RSVPs lock once an
 *  event has happened so the count remains a meaningful historical signal. */
export function isPastEvent(date: string): boolean {
  // events.date is YYYY-MM-DD — string compare is correct in this format.
  const today = new Date().toISOString().slice(0, 10);
  return date < today;
}
