// Seed a local admin@email.com user with a bcrypt'd password for dev/preview
// testing. Idempotent — re-running updates the password hash on the existing
// row instead of failing on the UNIQUE(email) constraint.
//
// Usage:
//   npm run seed:test-admin                   # default: admin@email.com / Password
//   npm run seed:test-admin -- --password=X   # override the password
//   npm run seed:test-admin -- --email=Y      # override the email
//
// Refuses to run when DATABASE_PATH points at a remote/volume DB (Railway) —
// this is a local-only convenience and we never want a known credential
// pair sitting in production data.

import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { getDb } from "../lib/db";

function parseArg(flag: string): string | null {
  const found = process.argv.find((a) => a.startsWith(`${flag}=`));
  return found ? found.slice(flag.length + 1) : null;
}

async function main() {
  if (process.env.DATABASE_PATH) {
    console.error(
      "[seed-test-admin] DATABASE_PATH is set — refusing to seed against a non-local DB. " +
        "Run this only against the repo's in-memory dev DB (unset DATABASE_PATH).",
    );
    process.exit(1);
  }

  const email = (parseArg("--email") ?? "admin@email.com").trim().toLowerCase();
  const password = parseArg("--password") ?? "Password";

  const db = getDb();
  const passwordHash = await bcrypt.hash(password, 12);

  const existing = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(email) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      "UPDATE users SET password_hash = ?, role = 'admin', suspended = 0, updated_at = datetime('now') WHERE id = ?",
    ).run(passwordHash, existing.id);
    console.log(`[seed-test-admin] updated existing user ${email} (id=${existing.id}) with new password + admin role`);
  } else {
    const id = randomUUID();
    db.prepare(`
      INSERT INTO users (id, email, email_verified, name, password_hash, role)
      VALUES (?, ?, ?, ?, ?, 'admin')
    `).run(id, email, Date.now(), "Test Admin", passwordHash);
    console.log(`[seed-test-admin] created admin user ${email} (id=${id})`);
  }

  console.log(`[seed-test-admin] you can now sign in at /admin/login with ${email} / ${password}`);
}

main().catch((err) => {
  console.error("[seed-test-admin] failed:", err);
  process.exit(1);
});
