// Email + password authentication that lives ALONGSIDE Auth.js OAuth /
// magic-link providers. Auth.js v5's Credentials provider mandates JWT
// sessions, but our app uses database sessions (better security, easier
// invalidation, supports the existing accounts table). So we write our own
// signup / signin / session-cookie logic that integrates with the same
// `sessions` table the Auth.js adapter populates.
//
// Net effect: a user signed in via password gets exactly the same cookie +
// session row shape as one signed in via Discord, and `auth()` from
// `@/auth` reads them both transparently.

import { randomUUID, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { getDb } from "./db";

const SESSION_TTL_DAYS = 30;
const BCRYPT_ROUNDS = 12;
// Auth.js cookie naming convention. Mirroring it means our session cookies
// and Auth.js's are interchangeable — the same `auth()` lookup picks up
// either side.
const COOKIE_NAME_INSECURE = "authjs.session-token";
const COOKIE_NAME_SECURE = "__Secure-authjs.session-token";

function cookieName(secure: boolean): string {
  return secure ? COOKIE_NAME_SECURE : COOKIE_NAME_INSECURE;
}

/** Random opaque session token, 32 bytes hex (64 chars). */
function newSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export interface CredentialsResult {
  ok: true;
  userId: string;
  sessionToken: string;
  expires: Date;
}

export interface CredentialsError {
  ok: false;
  /** Generic error for all signin failures so we don't leak account existence. */
  reason: "invalid_credentials" | "rate_limited" | "weak_password" | "email_taken" | "invalid_email";
  message: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

/**
 * Modest password policy — 8+ chars, at least one letter and one digit.
 * Strict enough to block trivial attacks, loose enough not to frustrate
 * legitimate users who are using a manager (which most should be).
 */
export function validatePasswordStrength(password: string): { ok: true } | { ok: false; reason: string } {
  if (password.length < 8) return { ok: false, reason: "Password must be at least 8 characters." };
  if (!/[A-Za-z]/.test(password)) return { ok: false, reason: "Password must contain a letter." };
  if (!/[0-9]/.test(password)) return { ok: false, reason: "Password must contain a number." };
  if (password.length > 200) return { ok: false, reason: "Password is too long." };
  return { ok: true };
}

// --- Rate limiting ----------------------------------------------------------

interface RateLimitState {
  attempts: number;
  resetAt: number;
}
const rateLimit = new Map<string, RateLimitState>();
const RL_WINDOW_MS = 60_000; // 1 minute
const RL_MAX_ATTEMPTS = 8;   // per IP+email per minute

/**
 * Check + record an auth attempt. Returns true if allowed, false if the IP+
 * email pair has exceeded the threshold. In-memory; resets on server restart.
 * Good enough for casual brute-force; production-grade would use Redis or
 * the SQLite DB itself, but this stops the obvious automated scrapers.
 */
export function rateLimitAttempt(key: string): boolean {
  const now = Date.now();
  const state = rateLimit.get(key);
  if (!state || state.resetAt < now) {
    rateLimit.set(key, { attempts: 1, resetAt: now + RL_WINDOW_MS });
    return true;
  }
  state.attempts++;
  if (state.attempts > RL_MAX_ATTEMPTS) return false;
  return true;
}

// --- Signup -----------------------------------------------------------------

/**
 * Create a new email+password user. The user row goes through the same
 * Auth.js admin-promotion flow on next sign-in (events.signIn callback)
 * so ADMIN_EMAILS still works.
 */
export async function signupWithPassword(
  email: string,
  password: string,
  name: string | null,
): Promise<CredentialsResult | CredentialsError> {
  const lower = email.trim().toLowerCase();
  if (!isValidEmail(lower)) {
    return { ok: false, reason: "invalid_email", message: "Please enter a valid email address." };
  }
  const strength = validatePasswordStrength(password);
  if (!strength.ok) {
    return { ok: false, reason: "weak_password", message: strength.reason };
  }

  const db = getDb();
  const existing = db.prepare("SELECT id, password_hash FROM users WHERE email = ?").get(lower) as
    | { id: string; password_hash: string | null }
    | undefined;

  if (existing && existing.password_hash) {
    // We don't reveal "this email is taken" to anyone — but at signup we
    // have to tell the legitimate user that. Generic enough that it
    // doesn't help an attacker much (they could verify via signin anyway).
    return {
      ok: false,
      reason: "email_taken",
      message: "An account with that email already exists. Try signing in instead.",
    };
  }

  const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  let userId: string;
  if (existing) {
    // Existing OAuth/magic-link user adding a password to their account.
    userId = existing.id;
    db.prepare("UPDATE users SET password_hash = ?, name = COALESCE(NULLIF(name, ''), ?), updated_at = datetime('now') WHERE id = ?")
      .run(password_hash, name?.trim() || null, userId);
  } else {
    // Brand-new user.
    userId = randomUUID();
    db.prepare(`
      INSERT INTO users (id, email, email_verified, name, password_hash)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, lower, Date.now(), name?.trim() || null, password_hash);
    // Admin notification: brand-new credentials-based signup. Existing-user
    // password-add is intentionally silent (not interesting to admin).
    void import("@/lib/admin-notifications").then((m) =>
      m.recordAdminNotification({
        type: "signup",
        title: `New user signed up`,
        subtitle: `${lower}${name?.trim() ? ` · ${name.trim()}` : ""} · email/password`,
        href: `/admin/users/${userId}`,
        userId,
      }),
    );
  }

  const session = await createSessionForUser(userId);
  return { ok: true, userId, sessionToken: session.sessionToken, expires: session.expires };
}

// --- Signin -----------------------------------------------------------------

export async function signinWithPassword(
  email: string,
  password: string,
): Promise<CredentialsResult | CredentialsError> {
  const lower = email.trim().toLowerCase();
  if (!isValidEmail(lower)) {
    return { ok: false, reason: "invalid_credentials", message: "Email or password is incorrect." };
  }
  const db = getDb();
  const row = db.prepare("SELECT id, password_hash, suspended FROM users WHERE email = ?").get(lower) as
    | { id: string; password_hash: string | null; suspended: number }
    | undefined;

  // We do a constant-time-ish bcrypt compare against a dummy hash on
  // miss to avoid leaking "user exists" via response timing. Bcrypt rounds
  // dominate the response time either way.
  const dummyHash = "$2a$12$abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz123456";
  const targetHash = row?.password_hash ?? dummyHash;
  const valid = await bcrypt.compare(password, targetHash);

  if (!row || !row.password_hash || !valid || row.suspended === 1) {
    return { ok: false, reason: "invalid_credentials", message: "Email or password is incorrect." };
  }

  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(row.id);

  const session = await createSessionForUser(row.id);
  return { ok: true, userId: row.id, sessionToken: session.sessionToken, expires: session.expires };
}

// --- Session creation + cookie writing -------------------------------------

async function createSessionForUser(userId: string): Promise<{ sessionToken: string; expires: Date }> {
  const sessionToken = newSessionToken();
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  getDb().prepare(`
    INSERT INTO sessions (id, session_token, user_id, expires)
    VALUES (?, ?, ?, ?)
  `).run(randomUUID(), sessionToken, userId, expires.getTime());
  return { sessionToken, expires };
}

/**
 * Write the Auth.js-compatible session cookie. Caller picks `secure` based
 * on whether the request came in over HTTPS (process.env.AUTH_URL or the
 * incoming Request URL).
 */
export async function setSessionCookie(sessionToken: string, expires: Date, secure: boolean): Promise<void> {
  const jar = await cookies();
  jar.set(cookieName(secure), sessionToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    expires,
  });
}

/** Detect whether the current request is over HTTPS (for cookie's `secure` flag). */
export function isSecureRequest(req: Request): boolean {
  if (req.url.startsWith("https://")) return true;
  // Behind a proxy / Railway, the original protocol is in x-forwarded-proto.
  const fwd = req.headers.get("x-forwarded-proto");
  if (fwd?.toLowerCase() === "https") return true;
  return false;
}
