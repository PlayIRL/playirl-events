// Fan-out helpers that keep Discord-side scheduled events in sync with our
// own EventRow on edit / cancel / delete. Distinct from the dispatcher's
// reminder fan-out (lib/discord-post.ts patchPostsForCancelledEvent) — that
// one patches recurring channel messages; this one patches the per-event
// scheduled events that hosts pushed to guild Events tabs via PR #131.
//
// Failure model: every loop is best-effort. A Discord-side failure on one
// guild shouldn't block the other guilds; a Discord-side failure on all
// guilds shouldn't block the user's own action (edit / cancel / delete) on
// our DB. Callers should `void` these promises and the helper logs each
// failure with enough detail to debug from Railway logs.

import { getEvent } from "./events";
import {
  listScheduledEventPostsForEvent,
  markScheduledEventPostSynced,
  removeScheduledEventPost,
  type DiscordScheduledEventPost,
} from "./discord-scheduled-event-posts";
import {
  deleteDiscordScheduledEvent,
  updateDiscordScheduledEvent,
} from "./discord-scheduled-events";
import { DiscordPostError } from "./discord-post";

interface FanoutSummary {
  attempted: number;
  succeeded: number;
  failed: number;
}

/**
 * Push the current EventRow's title/date/location/description to every
 * guild scheduled event the host has linked. Called from the event PATCH
 * route after a successful update.
 *
 * Best-effort: a Discord-side failure logs and continues. A 404 from Discord
 * (the user manually deleted the scheduled event in Discord) is treated as
 * "give up on this row" — we drop the local post row so the panel doesn't
 * keep showing a phantom link.
 */
export async function syncDiscordPostsForEvent(eventId: string): Promise<FanoutSummary> {
  const summary: FanoutSummary = { attempted: 0, succeeded: 0, failed: 0 };
  const event = getEvent(eventId);
  if (!event) return summary;
  const posts = listScheduledEventPostsForEvent(eventId);
  if (posts.length === 0) return summary;

  for (const post of posts) {
    summary.attempted++;
    try {
      await updateDiscordScheduledEvent(post.guild_id, post.discord_event_id, event);
      markScheduledEventPostSynced(eventId, post.guild_id);
      summary.succeeded++;
    } catch (err) {
      summary.failed++;
      if (err instanceof DiscordPostError && err.status === 404) {
        // Discord-side event was deleted out from under us. Drop the local
        // row so the panel reflects reality; the host can re-add if they
        // want.
        console.warn(
          `[discord-event-fanout] sync ${eventId}@${post.guild_id} 404 — dropping stale row`,
        );
        removeScheduledEventPost(eventId, post.guild_id);
        continue;
      }
      logFailure("sync", post, err);
    }
  }
  return summary;
}

/**
 * Delete every linked Discord scheduled event for an EventRow. Called from
 * the cancel route (when the host stamps `cancelled_at`) and from the
 * hard-delete route (when the row is removed).
 *
 * On success the local post row is also removed. On failure the local row
 * stays so the host can retry from the panel.
 */
export async function removeDiscordPostsForEvent(eventId: string): Promise<FanoutSummary> {
  const summary: FanoutSummary = { attempted: 0, succeeded: 0, failed: 0 };
  const posts = listScheduledEventPostsForEvent(eventId);
  if (posts.length === 0) return summary;

  for (const post of posts) {
    summary.attempted++;
    try {
      await deleteDiscordScheduledEvent(post.guild_id, post.discord_event_id);
      removeScheduledEventPost(eventId, post.guild_id);
      summary.succeeded++;
    } catch (err) {
      summary.failed++;
      logFailure("delete", post, err);
    }
  }
  return summary;
}

/**
 * Snapshot helper: capture the post list BEFORE doing a hard delete on the
 * `events` row, since the FK CASCADE removes the linkage at the same moment
 * we'd otherwise want to read it. Returns the rows so the caller can fire
 * the Discord-side deletes after the local CASCADE cleanup.
 *
 * Caller flow:
 *   const snapshot = snapshotPostsBeforeDelete(eventId);
 *   deleteEvent(eventId);                 // CASCADE drops local rows
 *   void deleteRemoteFromSnapshot(snapshot);  // fire-and-forget Discord cleanup
 */
export function snapshotPostsBeforeDelete(eventId: string): DiscordScheduledEventPost[] {
  return listScheduledEventPostsForEvent(eventId);
}

export async function deleteRemoteFromSnapshot(
  snapshot: DiscordScheduledEventPost[],
): Promise<FanoutSummary> {
  const summary: FanoutSummary = { attempted: 0, succeeded: 0, failed: 0 };
  for (const post of snapshot) {
    summary.attempted++;
    try {
      await deleteDiscordScheduledEvent(post.guild_id, post.discord_event_id);
      summary.succeeded++;
    } catch (err) {
      summary.failed++;
      logFailure("post-cascade-delete", post, err);
    }
  }
  return summary;
}

function logFailure(op: string, post: DiscordScheduledEventPost, err: unknown): void {
  if (err instanceof DiscordPostError) {
    console.error(
      `[discord-event-fanout] ${op} event=${post.event_id} guild=${post.guild_id} status=${err.status}: ${err.body.slice(0, 200)}`,
    );
  } else {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[discord-event-fanout] ${op} event=${post.event_id} guild=${post.guild_id} threw: ${msg}`);
  }
}
