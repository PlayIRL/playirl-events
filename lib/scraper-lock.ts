// Single-flight guard for runScraper(). A cold nationwide scrape is a
// 10–15 minute operation; without this, two concurrent triggers (Railway
// cron firing while an admin clicks "Refresh now") would race the
// geocode cache and double up Nominatim calls.
//
// In-process only. That's fine because production is a single Railway
// container — there's no second process to coordinate with. If we ever
// scale horizontally, this needs to migrate to a DB-backed lock with a
// TTL fallback.
//
// Lock state is intentionally NOT persisted. A container crash mid-scrape
// leaves no stale lock to clean up; the next boot starts fresh. The cost
// is that an in-flight scrape across a deploy is lost, but that was true
// before this lock existed.

interface LockState {
  startedAt: number;
  /** Free-form label so the 409 response can name what's running
   *  ("admin-refresh", "cron"). */
  source: string;
}

let current: LockState | null = null;

/**
 * Try to acquire the lock. Returns the prior holder's timestamp/source
 * when busy, or null when the caller now holds the lock.
 *
 * Caller MUST eventually call `releaseScrapeLock()` — typically inside
 * a `finally` so a thrown scrape doesn't leave the lock pinned.
 */
export function tryAcquireScrapeLock(source: string): { busy: false } | { busy: true; runningSince: string; runningSource: string } {
  if (current) {
    return {
      busy: true,
      runningSince: new Date(current.startedAt).toISOString(),
      runningSource: current.source,
    };
  }
  current = { startedAt: Date.now(), source };
  return { busy: false };
}

export function releaseScrapeLock(): void {
  current = null;
}

/** Read-only peek for status endpoints. Does not mutate. */
export function getRunningScrape(): { runningSince: string; runningSource: string } | null {
  if (!current) return null;
  return {
    runningSince: new Date(current.startedAt).toISOString(),
    runningSource: current.source,
  };
}

// --- Discord-only pull lock ------------------------------------------------
//
// Separate lock for the frequent Discord-only pull cron (/api/scrape-discord).
// The full scrape lock above is meant to gate the heavy 10-15min nationwide
// run; using the same lock for Discord pulls would mean the 15-min Discord
// cron could 409 itself out whenever it overlapped with the daily heavy
// scrape. The two paths don't conflict at the DB level (upsertEvents wraps
// every write in a SQLite transaction), so they can run in parallel.
//
// Still want a Discord-pull-specific lock so two Discord pulls don't race —
// e.g. a Discord API hiccup that pushes one pull past 15 min would let the
// next tick fire on top of it.

let currentDiscordPull: LockState | null = null;

export function tryAcquireDiscordPullLock(
  source: string,
): { busy: false } | { busy: true; runningSince: string; runningSource: string } {
  if (currentDiscordPull) {
    return {
      busy: true,
      runningSince: new Date(currentDiscordPull.startedAt).toISOString(),
      runningSource: currentDiscordPull.source,
    };
  }
  currentDiscordPull = { startedAt: Date.now(), source };
  return { busy: false };
}

export function releaseDiscordPullLock(): void {
  currentDiscordPull = null;
}
