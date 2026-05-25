// Smoke test for the Discord dispatcher's catch-up semantics.
// Exercises the pure scheduling helpers (no DB, no Discord calls) so we
// can verify behavior across delayed-tick scenarios in milliseconds.
//
// What we're protecting against: the old "utcMinute < 5" gate would miss
// a scheduled fire whenever the GitHub-Actions cron tick was delayed past
// the configured hour's first 5 minutes. The new logic uses
// `last_dispatched_at` to dedupe and tolerates ticks up to
// DIGEST_MAX_LATE_HOURS (=6h) late.

import {
  mostRecentWeeklyOccurrenceUtc,
  mostRecentDailyOccurrenceUtc,
} from "@/lib/discord-dispatcher";
import type { DiscordSubscription } from "@/lib/discord-subscriptions";

let failures = 0;
function pass(name: string) { console.log(`  ✓ ${name}`); }
function fail(name: string, msg: string) {
  console.error(`  ✗ ${name}: ${msg}`);
  failures++;
}
function assertEq<T>(name: string, actual: T, expected: T) {
  if (actual === expected) return pass(name);
  fail(name, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function assertEqDate(name: string, actual: Date, expectedIso: string) {
  if (actual.toISOString() === expectedIso) return pass(name);
  fail(name, `expected ${expectedIso}, got ${actual.toISOString()}`);
}

// --- mostRecentWeeklyOccurrenceUtc ---
console.log("\n=== mostRecentWeeklyOccurrenceUtc ===");

// Mon = dow 1. "Now" is Mon 2026-05-25 13:51 UTC (after the 12:00 slot).
assertEqDate(
  "Mon 13:51 UTC → same-day 12:00 slot",
  mostRecentWeeklyOccurrenceUtc(new Date("2026-05-25T13:51:00Z"), 1, 12),
  "2026-05-25T12:00:00.000Z",
);

// "Now" is Mon 11:00 UTC (before the 12:00 slot) → last week's Mon 12:00.
assertEqDate(
  "Mon 11:00 UTC, target Mon 12 → prior Mon",
  mostRecentWeeklyOccurrenceUtc(new Date("2026-05-25T11:00:00Z"), 1, 12),
  "2026-05-18T12:00:00.000Z",
);

// Same-instant boundary: exactly at slot → slot itself.
assertEqDate(
  "Mon exactly 12:00 UTC → that instant",
  mostRecentWeeklyOccurrenceUtc(new Date("2026-05-25T12:00:00Z"), 1, 12),
  "2026-05-25T12:00:00.000Z",
);

// "Now" is Wed (dow 3) and target is Mon (dow 1).
assertEqDate(
  "Wed → most recent Mon 12:00",
  mostRecentWeeklyOccurrenceUtc(new Date("2026-05-27T09:00:00Z"), 1, 12),
  "2026-05-25T12:00:00.000Z",
);

// "Now" is Sun (dow 0) and target is Mon (dow 1) → last Mon, 6 days back.
assertEqDate(
  "Sun → most recent Mon 12:00 (6 days back)",
  mostRecentWeeklyOccurrenceUtc(new Date("2026-05-24T20:00:00Z"), 1, 12),
  "2026-05-18T12:00:00.000Z",
);

// --- mostRecentDailyOccurrenceUtc ---
console.log("\n=== mostRecentDailyOccurrenceUtc ===");

assertEqDate(
  "13:51 UTC, target 12 → today 12:00",
  mostRecentDailyOccurrenceUtc(new Date("2026-05-25T13:51:00Z"), 12),
  "2026-05-25T12:00:00.000Z",
);
assertEqDate(
  "08:00 UTC, target 12 → yesterday 12:00",
  mostRecentDailyOccurrenceUtc(new Date("2026-05-25T08:00:00Z"), 12),
  "2026-05-24T12:00:00.000Z",
);
assertEqDate(
  "exactly 12:00 → today 12:00",
  mostRecentDailyOccurrenceUtc(new Date("2026-05-25T12:00:00Z"), 12),
  "2026-05-25T12:00:00.000Z",
);
// Cross-month / cross-year boundary
assertEqDate(
  "midnight Jan 1, target 23 → Dec 31 23:00",
  mostRecentDailyOccurrenceUtc(new Date("2026-01-01T00:30:00Z"), 23),
  "2025-12-31T23:00:00.000Z",
);

// --- Catch-up dispatch decision ---
// isDigestSlotDue is private; we test the same predicate inline against the
// helper output. This mirrors the exact check dispatchAllSubs runs.
console.log("\n=== Catch-up decision (slot + last_dispatched_at + lateness) ===");

const DIGEST_MAX_LATE_MS = 6 * 60 * 60 * 1000;

function parseLastDispatchedAtMs(value: string | null): number {
  if (!value) return 0;
  const isoish = value.includes("T") ? value : value.replace(" ", "T");
  const hasTz = /[Zz]|[+-]\d{2}:?\d{2}$/.test(isoish);
  const parsed = Date.parse(hasTz ? isoish : isoish + "Z");
  return Number.isFinite(parsed) ? parsed : 0;
}

function isDigestSlotDue(
  sub: Pick<DiscordSubscription, "last_dispatched_at">,
  now: Date,
  slot: Date,
): boolean {
  const slotMs = slot.getTime();
  const nowMs = now.getTime();
  if (slotMs > nowMs) return false;
  if (nowMs - slotMs > DIGEST_MAX_LATE_MS) return false;
  return parseLastDispatchedAtMs(sub.last_dispatched_at) < slotMs;
}

function sub(last_dispatched_at: string | null) {
  return { last_dispatched_at };
}

// Scenario: 8 AM EDT (12 UTC) Mon weekly digest, never fired.
const monSlot = mostRecentWeeklyOccurrenceUtc(new Date("2026-05-25T13:51:00Z"), 1, 12);

assertEq(
  "on-time tick (12:00) fires",
  isDigestSlotDue(sub(null), new Date("2026-05-25T12:00:00Z"), monSlot),
  true,
);
assertEq(
  "tick 1h51m late still fires (within 6h cap)",
  isDigestSlotDue(sub(null), new Date("2026-05-25T13:51:00Z"), monSlot),
  true,
);
assertEq(
  "tick 5h59m late still fires",
  isDigestSlotDue(sub(null), new Date("2026-05-25T17:59:00Z"), monSlot),
  true,
);
assertEq(
  "tick 6h01m late drops the slot",
  isDigestSlotDue(sub(null), new Date("2026-05-25T18:01:00Z"), monSlot),
  false,
);

// Dedupe: after a tick fires the slot and writes last_dispatched_at,
// subsequent ticks within the same slot must NOT re-fire.
assertEq(
  "second tick 30m after fire is a no-op (dedupe)",
  isDigestSlotDue(
    sub("2026-05-25 13:51:00"), // last fired at 13:51 UTC
    new Date("2026-05-25T14:21:00Z"),
    monSlot,
  ),
  false,
);

// Subsequent week: same slot helper, next Mon -> not deduped by last week's fire.
const nextMonSlot = mostRecentWeeklyOccurrenceUtc(new Date("2026-06-01T13:00:00Z"), 1, 12);
assertEqDate(
  "next-week helper rolls to 2026-06-01",
  nextMonSlot,
  "2026-06-01T12:00:00.000Z",
);
assertEq(
  "next week's slot is due even if last fired last week",
  isDigestSlotDue(
    sub("2026-05-25 13:51:00"),
    new Date("2026-06-01T13:00:00Z"),
    nextMonSlot,
  ),
  true,
);

// Pre-slot tick: GHA fires at 11:55 UTC, target is 12:00. Slot helper
// returns LAST week's Mon (because 11:55 < 12:00 today). Last fired was
// last week's Mon 12:01 → NOT < slot → not due. Correct: we don't fire
// this week's digest 5 minutes early.
const preSlot = mostRecentWeeklyOccurrenceUtc(new Date("2026-05-25T11:55:00Z"), 1, 12);
assertEqDate("11:55 UTC → last week's Mon", preSlot, "2026-05-18T12:00:00.000Z");
assertEq(
  "tick before the scheduled hour doesn't fire early",
  isDigestSlotDue(
    sub("2026-05-18 12:01:00"),
    new Date("2026-05-25T11:55:00Z"),
    preSlot,
  ),
  false,
);

// Daily catch-up across midnight
console.log("\n=== Daily catch-up across midnight ===");
// Slot: 23:00 UTC daily. "Now" is 00:30 UTC the next day. Slot helper returns
// yesterday 23:00. Lateness = 1h30m. Last fired was day-before → due.
const dailySlot = mostRecentDailyOccurrenceUtc(new Date("2026-05-26T00:30:00Z"), 23);
assertEqDate("00:30 next-day helper", dailySlot, "2026-05-25T23:00:00.000Z");
assertEq(
  "00:30 fires the 23:00 slot from previous day",
  isDigestSlotDue(
    sub("2026-05-24 23:01:00"),
    new Date("2026-05-26T00:30:00Z"),
    dailySlot,
  ),
  true,
);

console.log(
  failures === 0
    ? "\n✓ All catch-up dispatch checks passed.\n"
    : `\n✗ ${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
