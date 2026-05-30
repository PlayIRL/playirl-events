import { prepareCached } from "./db";
import type { EventRow } from "./events";

export function isSaved(userId: string, eventId: string): boolean {
  const row = prepareCached("SELECT 1 FROM event_saves WHERE user_id = ? AND event_id = ?").get(userId, eventId);
  return !!row;
}

export function saveEvent(userId: string, eventId: string): void {
  prepareCached("INSERT OR IGNORE INTO event_saves (user_id, event_id) VALUES (?, ?)").run(userId, eventId);
}

export function unsaveEvent(userId: string, eventId: string): void {
  prepareCached("DELETE FROM event_saves WHERE user_id = ? AND event_id = ?").run(userId, eventId);
}

export function getSavedEventIds(userId: string): Set<string> {
  const rows = prepareCached("SELECT event_id FROM event_saves WHERE user_id = ?").all(userId) as { event_id: string }[];
  return new Set(rows.map((r) => r.event_id));
}

/** Returns a user's saved events joined with the events table. Hidden events
 *  (status = skip) are filtered out so saves don't surface retired events. */
export function getSavedEvents(userId: string): EventRow[] {
  return prepareCached(`
    SELECT e.*
    FROM event_saves s
    JOIN events e ON e.id = s.event_id
    WHERE s.user_id = ? AND e.status IN ('active', 'pinned')
    ORDER BY e.date ASC, e.time ASC
  `).all(userId) as EventRow[];
}

export function countSavedEvents(userId: string): number {
  const row = prepareCached("SELECT COUNT(*) AS n FROM event_saves WHERE user_id = ?").get(userId) as { n: number };
  return row.n;
}
