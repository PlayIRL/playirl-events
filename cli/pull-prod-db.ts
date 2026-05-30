// Pull a fresh production SQLite snapshot to local disk for debugging.
//
// Uses the existing /api/internal/backup endpoint — same one the daily
// .github/workflows/backup.yml workflow consumes — so there's no new
// auth surface area to maintain. The server runs db.serialize() under
// the hood, which captures the live WAL state into a single consistent
// Buffer (no torn snapshot under concurrent writes).
//
// By default the snapshot lands at `data/mtg-cal.db.prod-<timestamp>` so
// the live local DB is untouched. Pass `--replace` to atomically swap it
// in: the current `data/mtg-cal.db` is moved aside to a backup name,
// then the freshly-downloaded snapshot is renamed into place.
//
// Usage:
//   BACKUP_SECRET=<value> npm run db:pull              # download only
//   BACKUP_SECRET=<value> npm run db:pull -- --replace # download + swap
//   BACKUP_SECRET=<value> SITE_URL=https://staging.playirl.gg npm run db:pull
//
// The secret matches the value in Railway → Variables → BACKUP_SECRET
// (also present in GitHub Actions secrets for the daily backup). Keep
// it out of shell history with `export BACKUP_SECRET=...` rather than
// inline on the command.

// `export {}` keeps this file an isolated TS module so top-level names
// don't collide with sibling cli/*.ts scripts on a project-wide tsc.
export {};

import { gunzipSync } from "node:zlib";
import { mkdirSync, writeFileSync, existsSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_SITE = "https://playirl.gg";
const ENDPOINT = "/api/internal/backup";

function envRequired(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`✗ ${name} is required.`);
    console.error(`  Find it in Railway → Variables → BACKUP_SECRET (or the GitHub Actions secret of the same name).`);
    console.error(`  Then: export ${name}=<value> && npm run db:pull`);
    process.exit(1);
  }
  return v;
}

function tsStamp(): string {
  // YYYYMMDD-HHMMSS in local time — easier to eyeball than ISO when you
  // have a directory full of snapshots.
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

async function main() {
  const secret = envRequired("BACKUP_SECRET");
  const siteUrl = process.env.SITE_URL ?? DEFAULT_SITE;
  const wantsReplace = process.argv.includes("--replace");

  console.log(`\n🃏 Pulling DB snapshot from ${siteUrl}${ENDPOINT}\n`);

  const startedAt = Date.now();
  const res = await fetch(`${siteUrl}${ENDPOINT}`, {
    headers: { "x-backup-secret": secret },
  });

  if (res.status === 401) {
    console.error(`✗ HTTP 401 Unauthorized.`);
    console.error(`  Your BACKUP_SECRET doesn't match the value set on Railway.`);
    console.error(`  Verify with: railway variables | grep BACKUP_SECRET   (if you have railway CLI)`);
    process.exit(1);
  }
  if (res.status === 500) {
    const body = await res.text().catch(() => "");
    console.error(`✗ HTTP 500 — server error.`);
    console.error(`  Response: ${body.slice(0, 300)}`);
    console.error(`  This usually means BACKUP_SECRET isn't set on Railway. Check Railway → Variables.`);
    process.exit(1);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`✗ HTTP ${res.status} — ${body.slice(0, 300)}`);
    process.exit(1);
  }

  // The endpoint streams a gzipped SQLite file. Buffer the whole thing —
  // even a multi-hundred-MB prod DB fits comfortably in memory for a
  // dev workstation. Streaming + piping through createGunzip would save
  // peak RSS but complicate error handling for negligible benefit here.
  const arrayBuf = await res.arrayBuffer();
  const gz = Buffer.from(arrayBuf);
  const downloadMs = Date.now() - startedAt;
  console.log(`✓ downloaded ${fmtBytes(gz.byteLength)} gzipped in ${(downloadMs / 1000).toFixed(1)}s`);

  // Decompress in-process. gunzipSync is synchronous + blocks the event
  // loop briefly; that's fine for a one-shot CLI.
  const raw = gunzipSync(gz);
  console.log(`✓ decompressed to ${fmtBytes(raw.byteLength)} raw`);

  const dataDir = join(process.cwd(), "data");
  mkdirSync(dataDir, { recursive: true });

  const snapshotPath = join(dataDir, `mtg-cal.db.prod-${tsStamp()}`);
  writeFileSync(snapshotPath, raw);
  console.log(`✓ wrote ${snapshotPath}`);

  if (!wantsReplace) {
    console.log(`\nDone. To use it as your local DB, either:`);
    console.log(`  - npm run db:pull -- --replace    # rerun with auto-swap`);
    console.log(`  - mv ${snapshotPath} ${join(dataDir, "mtg-cal.db")}   # manual swap`);
    console.log(`Tip: stop \`next dev\` first so the better-sqlite3 connection releases the file.\n`);
    return;
  }

  // --- Replace flow -------------------------------------------------
  // Move the current live DB aside before swapping. Don't delete it —
  // a stale-but-existing backup beats a missing one if the swap fails
  // partway. The shm/wal sidecars are tied to the original file's
  // inode and become meaningless after the swap, but we leave them
  // alone too (next better-sqlite3 open will rebuild WAL from the new
  // file).
  const liveDb = join(dataDir, "mtg-cal.db");
  if (existsSync(liveDb)) {
    const liveSize = statSync(liveDb).size;
    const backupPath = join(dataDir, `mtg-cal.db.local-backup-${tsStamp()}`);
    renameSync(liveDb, backupPath);
    console.log(`✓ moved existing ${liveDb} (${fmtBytes(liveSize)}) → ${backupPath}`);

    // The -wal / -shm sidecars belong to the old inode. Leaving them
    // would confuse next better-sqlite3 open (it might try to replay
    // a WAL into the new file). Rename them too so they travel with
    // the backup.
    for (const ext of ["-wal", "-shm"]) {
      const side = liveDb + ext;
      if (existsSync(side)) {
        renameSync(side, backupPath + ext);
        console.log(`  · also moved ${side} → ${backupPath + ext}`);
      }
    }
  }

  renameSync(snapshotPath, liveDb);
  console.log(`✓ swapped fresh snapshot into ${liveDb}`);
  console.log(`\nDone. Your local DB now mirrors production as of the snapshot moment.`);
  console.log(`Restart \`next dev\` to pick up the new file.\n`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
