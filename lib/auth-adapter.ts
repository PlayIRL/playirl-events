import { randomUUID } from "crypto";
import type { Adapter, AdapterAccount, AdapterSession, AdapterUser, VerificationToken } from "@auth/core/adapters";
import { getDb } from "./db";

// SQLite stores timestamps as ms-epoch INTEGER. Convert to/from JS Date at the boundary.
const toMs = (d: Date | null | undefined) => (d ? d.getTime() : null);
const fromMs = (n: number | null | undefined) => (n != null ? new Date(n) : null);

interface UserRow {
  id: string;
  email: string;
  email_verified: number | null;
  name: string | null;
  image: string | null;
  role: string;
  suspended: number;
}

const rowToUser = (r: UserRow): AdapterUser => ({
  id: r.id,
  email: r.email,
  emailVerified: fromMs(r.email_verified),
  name: r.name,
  image: r.image,
  // Custom field — exposed via the session callback.
  role: r.role as "admin" | "organizer" | "user",
  suspended: r.suspended === 1,
} as AdapterUser);

export function SqliteAdapter(): Adapter {
  return {
    async createUser(user) {
      const db = getDb();
      const id = (user as AdapterUser).id || randomUUID();
      db.prepare(`
        INSERT INTO users (id, email, email_verified, name, image, role)
        VALUES (?, ?, ?, ?, ?, 'user')
      `).run(id, user.email, toMs(user.emailVerified), user.name ?? null, user.image ?? null);
      // Admin notification: new user signup via OAuth. Fire-and-forget;
      // never blocks the auth flow. Dynamic import so this adapter doesn't
      // drag the notification → Discord-push tree into the auth cold path.
      void import("@/lib/admin-notifications").then((m) =>
        m.recordAdminNotification({
          type: "signup",
          title: `New user signed up`,
          subtitle: `${user.email ?? "(no email)"}${user.name ? ` · ${user.name}` : ""}`,
          href: `/admin/users/${id}`,
          userId: id,
        }),
      );
      return rowToUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow);
    },

    async getUser(id) {
      const row = getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
      return row ? rowToUser(row) : null;
    },

    async getUserByEmail(email) {
      const row = getDb().prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;
      return row ? rowToUser(row) : null;
    },

    async getUserByAccount({ provider, providerAccountId }) {
      const row = getDb().prepare(`
        SELECT u.* FROM users u
        JOIN accounts a ON a.user_id = u.id
        WHERE a.provider = ? AND a.provider_account_id = ?
      `).get(provider, providerAccountId) as UserRow | undefined;
      return row ? rowToUser(row) : null;
    },

    async updateUser(user) {
      const db = getDb();
      const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id) as UserRow | undefined;
      if (!existing) throw new Error(`User ${user.id} not found`);
      db.prepare(`
        UPDATE users SET
          email          = COALESCE(?, email),
          email_verified = COALESCE(?, email_verified),
          name           = COALESCE(?, name),
          image          = COALESCE(?, image),
          updated_at     = datetime('now')
        WHERE id = ?
      `).run(
        user.email ?? null,
        user.emailVerified !== undefined ? toMs(user.emailVerified) : null,
        user.name ?? null,
        user.image ?? null,
        user.id,
      );
      return rowToUser(db.prepare("SELECT * FROM users WHERE id = ?").get(user.id) as UserRow);
    },

    async deleteUser(userId) {
      getDb().prepare("DELETE FROM users WHERE id = ?").run(userId);
    },

    async linkAccount(account) {
      const db = getDb();
      db.prepare(`
        INSERT INTO accounts (id, user_id, type, provider, provider_account_id, refresh_token, access_token, expires_at, token_type, scope, id_token, session_state)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        account.userId,
        account.type,
        account.provider,
        account.providerAccountId,
        account.refresh_token ?? null,
        account.access_token ?? null,
        account.expires_at ?? null,
        account.token_type ?? null,
        account.scope ?? null,
        account.id_token ?? null,
        (account.session_state as string | undefined) ?? null,
      );
      // Admin notification: existing user linked an additional OAuth account.
      // Auth.js fires linkAccount on both first signin (right after createUser)
      // and subsequent links. We filter out the first-signin case below so
      // we don't double-notify (signup + account_linked) for the same event.
      try {
        const row = db
          .prepare("SELECT email, name, created_at FROM users WHERE id = ?")
          .get(account.userId) as { email: string; name: string | null; created_at: string } | undefined;
        if (row) {
          const createdMs = new Date(
            row.created_at.includes("T") ? row.created_at : row.created_at + " UTC",
          ).getTime();
          const ageSec = (Date.now() - createdMs) / 1000;
          // First-signin link arrives within seconds of createUser. Anything
          // older than 60s is genuinely an additional link.
          if (ageSec > 60) {
            void import("@/lib/admin-notifications").then((m) =>
              m.recordAdminNotification({
                type: "account_linked",
                title: `${row.email} linked ${account.provider}`,
                subtitle: row.name ? `${row.name}` : null,
                href: `/admin/users/${account.userId}`,
                userId: account.userId,
              }),
            );
          }
        }
      } catch (err) {
        console.error("[admin-notif] linkAccount notification failed:", err);
      }
      return account as AdapterAccount;
    },

    async unlinkAccount({ provider, providerAccountId }) {
      getDb().prepare("DELETE FROM accounts WHERE provider = ? AND provider_account_id = ?").run(provider, providerAccountId);
    },

    async createSession({ sessionToken, userId, expires }) {
      getDb().prepare(`
        INSERT INTO sessions (id, session_token, user_id, expires)
        VALUES (?, ?, ?, ?)
      `).run(randomUUID(), sessionToken, userId, expires.getTime());
      return { sessionToken, userId, expires };
    },

    async getSessionAndUser(sessionToken) {
      const row = getDb().prepare(`
        SELECT s.session_token, s.user_id, s.expires,
               u.id as u_id, u.email, u.email_verified, u.name, u.image, u.role, u.suspended
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.session_token = ?
      `).get(sessionToken) as
        | { session_token: string; user_id: string; expires: number; u_id: string; email: string; email_verified: number | null; name: string | null; image: string | null; role: string; suspended: number }
        | undefined;
      if (!row) return null;
      const session: AdapterSession = {
        sessionToken: row.session_token,
        userId: row.user_id,
        expires: new Date(row.expires),
      };
      const user = rowToUser({
        id: row.u_id,
        email: row.email,
        email_verified: row.email_verified,
        name: row.name,
        image: row.image,
        role: row.role,
        suspended: row.suspended,
      });
      return { session, user };
    },

    async updateSession({ sessionToken, expires, userId }) {
      const db = getDb();
      if (expires) {
        db.prepare("UPDATE sessions SET expires = ? WHERE session_token = ?").run(expires.getTime(), sessionToken);
      }
      const row = db.prepare("SELECT session_token, user_id, expires FROM sessions WHERE session_token = ?").get(sessionToken) as
        | { session_token: string; user_id: string; expires: number }
        | undefined;
      if (!row) return null;
      return {
        sessionToken: row.session_token,
        userId: userId ?? row.user_id,
        expires: new Date(row.expires),
      };
    },

    async deleteSession(sessionToken) {
      getDb().prepare("DELETE FROM sessions WHERE session_token = ?").run(sessionToken);
    },

    async createVerificationToken({ identifier, token, expires }) {
      getDb().prepare(`
        INSERT INTO verification_tokens (identifier, token, expires)
        VALUES (?, ?, ?)
      `).run(identifier, token, expires.getTime());
      return { identifier, token, expires } as VerificationToken;
    },

    async useVerificationToken({ identifier, token }) {
      const db = getDb();
      const row = db.prepare("SELECT identifier, token, expires FROM verification_tokens WHERE identifier = ? AND token = ?").get(identifier, token) as
        | { identifier: string; token: string; expires: number }
        | undefined;
      if (!row) return null;
      db.prepare("DELETE FROM verification_tokens WHERE token = ?").run(token);
      return { identifier: row.identifier, token: row.token, expires: new Date(row.expires) };
    },
  };
}
