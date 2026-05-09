// Shared-secret comparison helpers. Centralized so every internal endpoint
// (`/api/internal/backup`, `/api/internal/integrity`, `/api/discord/dispatch`,
// `/api/scrape`) uses the same constant-time path. Avoids the trap where one
// endpoint uses `provided !== expected` (timing leak) and another uses
// `timingSafeEqual` correctly — under load, an attacker can measure HTTP
// latency on the weak endpoint to recover the secret byte-by-byte.
//
// Strategy: hash both inputs to a fixed-width 32-byte digest, then compare
// the digests with `timingSafeEqual`. Hashing first means the comparison
// always operates on equal-length buffers, so the function leaks neither
// match-length nor input-length via timing. SHA-256 is overkill for length
// equalization but keeps the helper trivially auditable.

import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time comparison of a header-supplied secret against the expected
 * value from `process.env`. Returns false when the header is missing or
 * empty. Both inputs are hashed first so the comparison time is independent
 * of input length and match prefix.
 *
 * Use this — never `provided === expected` — for any header-based shared
 * secret check.
 */
export function safeEqualSecret(provided: string | null | undefined, expected: string): boolean {
  if (!provided) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// In-process token bucket. Per-process, so on a multi-replica deploy a
// determined attacker can hit each replica independently — the goal is
// "stop accidental loops + slow casual abuse," not "withstand a botnet."
// For a real bot defense we'd front this with Cloudflare or a Redis bucket.
// Bucket persists for the lifetime of the Node process; restarted on deploy.

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Allow `max` requests per `windowMs` for a given key. Returns
 * `{ ok: true }` when within budget, or `{ ok: false, retryAfterMs }` when
 * the bucket is full. Use a stable key per actor (e.g. `upload:${userId}`).
 *
 * Bucket entries auto-expire when the window rolls over — no separate
 * cleanup loop needed.
 */
export function rateLimit(key: string, max: number, windowMs: number):
  | { ok: true }
  | { ok: false; retryAfterMs: number } {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || now - existing.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { ok: true };
  }
  if (existing.count < max) {
    existing.count += 1;
    return { ok: true };
  }
  return { ok: false, retryAfterMs: windowMs - (now - existing.windowStart) };
}
