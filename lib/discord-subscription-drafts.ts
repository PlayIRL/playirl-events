// In-progress "subscribe panel" rows for the Discord /playirl today | week
// follow-up flow. A draft is created when the user clicks Subscribe under a
// lookup result; the panel's select interactions update it field-by-field;
// the Submit button reads it back, calls createSubscription, and deletes it.
//
// Drafts carry a 15-minute TTL — short enough that abandoned panels don't
// pile up, long enough that a user thinking about their choices won't get
// kicked out mid-flow. Every public entry point opportunistically sweeps
// expired rows so the table self-cleans without a cron.

import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import type { DiscordSubMode } from "./discord-subscriptions";

/** Only modes we let users create from inside Discord. The web flow also
 *  supports 'reminder' but we deliberately exclude it from the slash-command
 *  panel — the lead-time picker would need its own UI. */
export type DraftMode = Extract<DiscordSubMode, "weekly" | "daily">;

export interface DiscordSubscriptionDraft {
  id: string;
  guild_id: string;
  user_id: string;
  format: string | null;
  radius_miles: number;
  center_lat: number;
  center_lng: number;
  near_label: string;
  mode: DraftMode;
  channel_id: string | null;
  dow: number | null;
  hour_utc: number | null;
  created_at: string;
  expires_at: string;
}

export interface CreateDraftInput {
  guild_id: string;
  user_id: string;
  format: string | null;
  radius_miles: number;
  center_lat: number;
  center_lng: number;
  near_label: string;
  mode: DraftMode;
}

/** Default schedule defaults so a user can hit Submit immediately after
 *  picking a channel and get a sensible subscription. Weekly = Monday 8am ET
 *  (13:00 UTC during EDT, 14:00 UTC during EST — the dispatcher tolerates a
 *  6-hour late window, so a single fixed UTC is fine). Daily = 8am UTC.
 *
 *  Surfaced to the panel renderer so the initial select state matches the
 *  draft state; otherwise Submit-without-touching-the-selects would write
 *  whatever the dropdown happened to show by accident. */
export const DRAFT_DEFAULT_DOW = 1; // Monday in Date.getUTCDay() convention
export const DRAFT_DEFAULT_HOUR_UTC = 13; // 8 AM Eastern (EDT)

// Drafts live 15 minutes; sweep on every read so abandoned rows self-evict.
const DRAFT_TTL_MINUTES = 15;

export function createDraft(input: CreateDraftInput): DiscordSubscriptionDraft {
  sweepExpiredDrafts();
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + DRAFT_TTL_MINUTES * 60_000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);
  getDb().prepare(`
    INSERT INTO discord_subscription_drafts (
      id, guild_id, user_id, format, radius_miles, center_lat, center_lng,
      near_label, mode, dow, hour_utc, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.guild_id,
    input.user_id,
    input.format,
    input.radius_miles,
    input.center_lat,
    input.center_lng,
    input.near_label,
    input.mode,
    // Pre-seed dow/hour with the defaults so the panel reflects a real
    // schedule from the first render. Channel is the only field that
    // genuinely requires a user choice.
    input.mode === "weekly" ? DRAFT_DEFAULT_DOW : null,
    DRAFT_DEFAULT_HOUR_UTC,
    expiresAt,
  );
  return getDraft(id)!;
}

export function getDraft(id: string): DiscordSubscriptionDraft | undefined {
  return getDb()
    .prepare("SELECT * FROM discord_subscription_drafts WHERE id = ?")
    .get(id) as DiscordSubscriptionDraft | undefined;
}

export type DraftPatch = Partial<Pick<DiscordSubscriptionDraft, "channel_id" | "mode" | "dow" | "hour_utc">>;

/**
 * Update a draft's mutable fields. Returns the refreshed row, or undefined
 * if the draft was already deleted/expired (race between the user clicking
 * a select and the TTL sweep). Caller surfaces "panel expired" in that case.
 *
 * Switching mode='daily' nulls dow so a stale weekly-day selection doesn't
 * leak into a daily subscription on submit.
 */
export function updateDraft(id: string, patch: DraftPatch): DiscordSubscriptionDraft | undefined {
  const existing = getDraft(id);
  if (!existing) return undefined;
  const merged = { ...existing, ...patch };
  if (merged.mode === "daily") merged.dow = null;
  getDb().prepare(`
    UPDATE discord_subscription_drafts
       SET channel_id = ?, mode = ?, dow = ?, hour_utc = ?
     WHERE id = ?
  `).run(
    merged.channel_id,
    merged.mode,
    merged.dow,
    merged.hour_utc,
    id,
  );
  return getDraft(id);
}

export function deleteDraft(id: string): void {
  getDb().prepare("DELETE FROM discord_subscription_drafts WHERE id = ?").run(id);
}

/** Idempotent sweep: deletes drafts whose expires_at is in the past. Called
 *  from createDraft and is safe to call from anywhere else as a no-op when
 *  nothing has expired. */
export function sweepExpiredDrafts(): void {
  getDb()
    .prepare("DELETE FROM discord_subscription_drafts WHERE expires_at < datetime('now')")
    .run();
}
