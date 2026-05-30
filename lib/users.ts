import { getDb } from "./db";

export interface UserRecord {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: "admin" | "organizer" | "user";
  suspended: 0 | 1;
  suspended_reason: string;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface UserWithCounts extends UserRecord {
  event_count: number;
}

const VALID_ROLES = new Set(["admin", "organizer", "user"]);

export function listUsers(filters?: { role?: string; q?: string }): UserWithCounts[] {
  const db = getDb();
  let sql = `
    SELECT u.*, (SELECT COUNT(*) FROM events WHERE owner_id = u.id) AS event_count
    FROM users u
  `;
  const wheres: string[] = [];
  const params: string[] = [];
  if (filters?.role && VALID_ROLES.has(filters.role)) {
    wheres.push("u.role = ?");
    params.push(filters.role);
  }
  if (filters?.q) {
    wheres.push("(u.email LIKE ? OR u.name LIKE ?)");
    const q = `%${filters.q}%`;
    params.push(q, q);
  }
  if (wheres.length) sql += " WHERE " + wheres.join(" AND ");
  sql += " ORDER BY u.created_at DESC";
  return db.prepare(sql).all(...params) as UserWithCounts[];
}

export interface PaginatedUsers {
  users: UserWithCounts[];
  total: number;
}

/** Paginated variant of listUsers for the admin /admin/users page. Same
 *  filter surface; adds limit+offset and returns total for the
 *  pagination footer. At current scale (~hundreds of users) the COUNT
 *  is cheap; matters more as the user table grows. */
export function listUsersPaginated(
  filters: { role?: string; q?: string },
  limit: number = 50,
  offset: number = 0,
): PaginatedUsers {
  const db = getDb();
  const wheres: string[] = [];
  const params: string[] = [];
  if (filters.role && VALID_ROLES.has(filters.role)) {
    wheres.push("u.role = ?");
    params.push(filters.role);
  }
  if (filters.q) {
    wheres.push("(u.email LIKE ? OR u.name LIKE ?)");
    const q = `%${filters.q}%`;
    params.push(q, q);
  }
  const whereClause = wheres.length ? "WHERE " + wheres.join(" AND ") : "";

  const totalRow = db.prepare(`SELECT COUNT(*) AS n FROM users u ${whereClause}`).get(...params) as { n: number };

  const users = db
    .prepare(`
      SELECT u.*, (SELECT COUNT(*) FROM events WHERE owner_id = u.id) AS event_count
      FROM users u
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `)
    .all(...params, limit, offset) as UserWithCounts[];

  return { users, total: totalRow.n };
}

export interface UserStats {
  total: number;
  byRole: Record<string, number>;
  suspended: number;
  signups_7d: number;
  signups_30d: number;
  /** Users who have signed in at least once. Distinguishes
   *  "completed-onboarding" from "magic-link-clicked-once-and-forgot". */
  loggedInEver: number;
}

/** DB-wide aggregates for the /admin/users overview cards. Single
 *  query per dimension; users table is small (~hundreds) so the cost
 *  is negligible. */
export function getUserStats(): UserStats {
  const db = getDb();
  const total = (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;

  const roleRows = db
    .prepare("SELECT role, COUNT(*) AS n FROM users GROUP BY role")
    .all() as { role: string; n: number }[];
  const byRole: Record<string, number> = { admin: 0, organizer: 0, user: 0 };
  for (const r of roleRows) byRole[r.role] = r.n;

  const suspended = (db
    .prepare("SELECT COUNT(*) AS n FROM users WHERE suspended = 1")
    .get() as { n: number }).n;

  const signups_7d = (db
    .prepare("SELECT COUNT(*) AS n FROM users WHERE created_at >= datetime('now', '-7 day')")
    .get() as { n: number }).n;

  const signups_30d = (db
    .prepare("SELECT COUNT(*) AS n FROM users WHERE created_at >= datetime('now', '-30 day')")
    .get() as { n: number }).n;

  const loggedInEver = (db
    .prepare("SELECT COUNT(*) AS n FROM users WHERE last_login_at IS NOT NULL")
    .get() as { n: number }).n;

  return { total, byRole, suspended, signups_7d, signups_30d, loggedInEver };
}

export function getUser(id: string): UserRecord | undefined {
  return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRecord | undefined;
}

export function updateUser(
  id: string,
  patch: { role?: string; suspended?: boolean; name?: string; suspended_reason?: string },
): UserRecord | undefined {
  const db = getDb();
  const existing = getUser(id);
  if (!existing) return undefined;
  const role = patch.role && VALID_ROLES.has(patch.role) ? patch.role : existing.role;
  const suspended = patch.suspended === undefined ? existing.suspended : (patch.suspended ? 1 : 0);
  const name = patch.name ?? existing.name;
  const suspendedReason =
    suspended === 0 ? "" : patch.suspended_reason ?? existing.suspended_reason ?? "";
  db.prepare(
    "UPDATE users SET role=?, suspended=?, suspended_reason=?, name=?, updated_at=datetime('now') WHERE id=?",
  ).run(role, suspended, suspendedReason, name, id);
  if (suspended === 1 && existing.suspended === 0) {
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
  }
  return getUser(id);
}

export function revokeSessions(userId: string): number {
  const r = getDb().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  return r.changes;
}

export function getUserSessions(userId: string): { session_token: string; expires: number }[] {
  return getDb()
    .prepare("SELECT session_token, expires FROM sessions WHERE user_id = ? ORDER BY expires DESC")
    .all(userId) as { session_token: string; expires: number }[];
}
