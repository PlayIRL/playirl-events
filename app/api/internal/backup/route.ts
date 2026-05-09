// Machine-to-machine DB backup endpoint. Streams a consistent gzipped
// SQLite snapshot for off-Railway storage (currently consumed by
// .github/workflows/backup.yml as a daily artifact).
//
//   curl -sS -fL https://playirl.gg/api/internal/backup \
//        -H "x-backup-secret: $BACKUP_SECRET" \
//        -o mtg-cal.db.gz
//
// Lives at /api/internal/ rather than /api/admin/ because the auth model is
// header-based shared secret (called by CI, not a logged-in admin user) —
// same pattern as /api/discord/dispatch. The /api/admin/* middleware in
// middleware.ts requires a session cookie, which CI requests don't carry.
// Uses a dedicated BACKUP_SECRET env var so rotating either secret doesn't
// break the other surface.
//
// Why we serialize() rather than read the .db file off disk: better-sqlite3
// runs in WAL mode, so the on-disk file is missing all writes still in
// `mtg-cal.db-wal`. `db.serialize()` walks the live database connection and
// returns a Buffer that captures both the main file *and* the WAL state in
// one consistent snapshot — no chance of restoring a torn DB.

import { NextResponse } from "next/server";
import { gzipSync } from "node:zlib";
import { getDb } from "@/lib/db";
import { safeEqualSecret } from "@/lib/security";

export const dynamic = "force-dynamic";
// The serialize+gzip is in-process and CPU-bound. At ~30 MB raw / ~5 MB
// gzipped (projected nationwide DB size) it finishes well under 30s on
// Railway's standard tier; this cap is a defensive ceiling.
export const maxDuration = 60;

function isoDateStamp(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

export async function GET(request: Request) {
  const secret = process.env.BACKUP_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "BACKUP_SECRET not configured" }, { status: 500 });
  }
  const provided = request.headers.get("x-backup-secret");
  if (!safeEqualSecret(provided, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getDb();
    // serialize() returns the entire DB as a single Buffer — main file +
    // WAL replayed in. SQLite's own backup machinery; safe under writes.
    const raw = db.serialize();
    const gz = gzipSync(raw, { level: 9 });
    const filename = `mtg-cal-${isoDateStamp()}.db.gz`;

    console.log(`[backup] serialized DB: raw=${raw.byteLength}B gz=${gz.byteLength}B → ${filename}`);

    return new NextResponse(new Uint8Array(gz), {
      status: 200,
      headers: {
        "Content-Type": "application/gzip",
        "Content-Length": String(gz.byteLength),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    console.error("[backup] failed:", err);
    const message =
      err instanceof Error ? err.message || err.name || "Error" : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
