import { NextResponse } from "next/server";
import { randomBytes, randomUUID } from "crypto";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Dev-only helper that creates (or fetches) a user by email, mints an Auth.js
 * database session, and sets the session cookie on the response. Disabled in
 * production and also requires DEV_IMPERSONATE=1 in the env for defense in depth.
 *
 * Usage:
 *   /api/dev/impersonate?email=you@test.com         (role=user by default)
 *   /api/dev/impersonate?email=a@test.com&role=admin
 */

function guardDisabled(): NextResponse | null {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "disabled in production" }, { status: 404 });
  }
  if (process.env.DEV_IMPERSONATE !== "1") {
    return NextResponse.json(
      { error: "set DEV_IMPERSONATE=1 in .env to enable this endpoint" },
      { status: 403 },
    );
  }
  return null;
}

export async function GET(request: Request) {
  const denied = guardDisabled();
  if (denied) return denied;

  const url = new URL(request.url);
  const email = (url.searchParams.get("email") ?? "").trim().toLowerCase();
  const roleParam = url.searchParams.get("role") ?? "user";
  const role = ["user", "organizer", "admin"].includes(roleParam) ? roleParam : "user";
  const redirectTo = url.searchParams.get("redirect") ?? "/account";

  if (!email || !/@/.test(email)) {
    return NextResponse.json({ error: "email query param required, e.g. ?email=you@test.com" }, { status: 400 });
  }

  const db = getDb();

  // Upsert the user.
  let user = db.prepare("SELECT id, role FROM users WHERE email = ?").get(email) as
    | { id: string; role: string }
    | undefined;
  if (!user) {
    const id = randomUUID();
    const nameGuess = email.split("@")[0];
    db.prepare(
      "INSERT INTO users (id, email, name, role, email_verified) VALUES (?, ?, ?, ?, ?)",
    ).run(id, email, nameGuess, role, Date.now());
    user = { id, role };
    // Fire the same admin notification a real signup would, so dev testing
    // exercises the full notification path (DB insert + Discord push).
    void import("@/lib/admin-notifications").then((m) =>
      m.recordAdminNotification({
        type: "signup",
        title: `New user signed up`,
        subtitle: `${email}${nameGuess ? ` · ${nameGuess}` : ""} · dev impersonate`,
        href: `/admin/users/${id}`,
        userId: id,
      }),
    );
  } else if (user.role !== role) {
    db.prepare("UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?").run(role, user.id);
    user.role = role;
  }

  // Mint an Auth.js database session. The adapter stores `expires` in MILLISECONDS
  // (it does `new Date(row.expires)` on read), matching what Auth.js itself writes.
  const sessionToken = randomBytes(32).toString("hex");
  const expiresMs = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
  db.prepare(
    "INSERT INTO sessions (id, session_token, user_id, expires) VALUES (?, ?, ?, ?)",
  ).run(randomUUID(), sessionToken, user.id, expiresMs);

  // Redirect back into the app with the Auth.js session cookie set.
  const res = NextResponse.redirect(new URL(redirectTo, url));
  res.cookies.set({
    name: "authjs.session-token",
    value: sessionToken,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // 30 days
    maxAge: 60 * 60 * 24 * 30,
    secure: false,
  });
  return res;
}
