// Machine-to-machine DB integrity check. Runs SQLite's built-in
// `PRAGMA integrity_check` and returns "ok" or the list of corruption
// findings.
//
//   curl -sS -fL https://playirl.gg/api/internal/integrity \
//        -H "x-backup-secret: $BACKUP_SECRET" \
//        | jq
//
// Catches the failure modes that silent corruption produces on Railway:
//   - WAL replay collided with a dirty volume snapshot
//   - Disk pressure caused a partial write
//   - A schema migration bug left an orphaned/dangling row
//
// Reuses BACKUP_SECRET because operators who have backup-restore powers
// already have full DB read access. Adding a second secret would be
// security theater. Same /api/internal/ pattern as backup so middleware
// doesn't gate it.

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { safeEqualSecret } from "@/lib/security";

export const dynamic = "force-dynamic";
// integrity_check is O(rows × indexes); at 50k events with our index set
// it's seconds. 60s is a generous ceiling.
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.BACKUP_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "BACKUP_SECRET not configured" }, { status: 500 });
  }
  const provided = request.headers.get("x-backup-secret");
  if (!safeEqualSecret(provided, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const db = getDb();
    // PRAGMA returns rows of {integrity_check: string}. A healthy DB
    // returns exactly one row containing "ok"; a corrupt DB returns one
    // row per finding (see https://sqlite.org/pragma.html#pragma_integrity_check).
    const rows = db.prepare("PRAGMA integrity_check").all() as { integrity_check: string }[];
    const findings = rows.map((r) => r.integrity_check);
    const ok = findings.length === 1 && findings[0] === "ok";
    const durationMs = Date.now() - startedAt;
    console.log(`[integrity] ok=${ok} findings=${findings.length} ${durationMs}ms`);

    return NextResponse.json(
      {
        ok,
        findings,
        durationMs,
        ts: new Date().toISOString(),
      },
      {
        // 200 even on failure so the workflow can parse the body and
        // surface specific findings; the JSON `ok: false` is the signal.
        status: 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message || err.name : String(err);
    console.error("[integrity] failed:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
