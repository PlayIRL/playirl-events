import { randomUUID } from "crypto";
import fs from "fs/promises";
import { existsSync, readdirSync, statSync } from "fs";
import path from "path";
import { cache } from "react";

/**
 * On-disk storage for user-uploaded images. Files live alongside the SQLite
 * DB on the Railway persistent volume (`data/uploads/<bucket>/<uuid>.<ext>`)
 * and are served by `app/uploads/[...path]/route.ts`. We never store binary
 * blobs in the committed DB — only the public URL.
 */

const ALLOWED: Record<string, { ext: string; signature: number[][] }> = {
  "image/jpeg": { ext: "jpg", signature: [[0xff, 0xd8, 0xff]] },
  "image/png": { ext: "png", signature: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]] },
  "image/webp": { ext: "webp", signature: [[0x52, 0x49, 0x46, 0x46]] }, // "RIFF" — followed by "WEBP" at offset 8 (checked below)
  "image/gif": { ext: "gif", signature: [[0x47, 0x49, 0x46, 0x38, 0x37, 0x61], [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]] },
};

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // 4 MB

export type UploadBucket = "events" | "venues";

export interface SavedUpload {
  url: string; // public URL — e.g. /uploads/events/<uuid>.jpg
  path: string; // absolute filesystem path
}

export class UploadError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function uploadsRoot(): string {
  // Mirror lib/db.ts's logic so uploads sit next to mtg-cal.db on the same volume.
  const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "mtg-cal.db");
  return path.join(path.dirname(dbPath), "uploads");
}

function bytesMatch(buf: Uint8Array, sig: number[], offset = 0): boolean {
  if (buf.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (buf[offset + i] !== sig[i]) return false;
  }
  return true;
}

/** Sniffs the magic bytes; returns the canonical MIME type, or null if unrecognised. */
function detectMime(buf: Uint8Array): string | null {
  for (const [mime, { signature }] of Object.entries(ALLOWED)) {
    for (const sig of signature) {
      if (bytesMatch(buf, sig)) {
        if (mime === "image/webp") {
          // RIFF...WEBP
          if (buf.length >= 12 && bytesMatch(buf, [0x57, 0x45, 0x42, 0x50], 8)) return mime;
          continue;
        }
        return mime;
      }
    }
  }
  return null;
}

export async function saveUpload(bucket: UploadBucket, file: File): Promise<SavedUpload> {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new UploadError("No file provided");
  }
  if (file.size === 0) throw new UploadError("File is empty");
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadError(`File is too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024}MB)`, 413);
  }

  const buf = new Uint8Array(await file.arrayBuffer());
  const mime = detectMime(buf);
  if (!mime) {
    throw new UploadError("Unsupported image format. Use JPEG, PNG, WebP, or GIF.");
  }
  const ext = ALLOWED[mime].ext;

  const id = randomUUID();
  const filename = `${id}.${ext}`;
  const dir = path.join(uploadsRoot(), bucket);
  await fs.mkdir(dir, { recursive: true });
  const fullPath = path.join(dir, filename);
  await fs.writeFile(fullPath, buf);

  return {
    url: `/uploads/${bucket}/${filename}`,
    path: fullPath,
  };
}

/**
 * Best-effort delete of a previously-saved upload. Pass the URL we returned
 * from saveUpload (e.g. "/uploads/events/abc.jpg"). Silently ignores files
 * outside the uploads root, missing files, etc. — a missing-file outcome is
 * the same as a successful delete.
 */
export async function deleteUpload(url: string): Promise<void> {
  if (!url || !url.startsWith("/uploads/")) return;
  const rel = url.slice("/uploads/".length).replace(/^\/+/, "");
  if (rel.includes("..")) return;
  const fullPath = path.join(uploadsRoot(), rel);
  try {
    await fs.unlink(fullPath);
  } catch {
    /* missing file is fine */
  }
}

/**
 * Per-request snapshot of every filename under /uploads/{events,venues}/.
 * Wrapped in React.cache so a homepage render with 200+ events triggers ONE
 * readdir per bucket instead of 200+ existsSync/statSync calls. Cache lives
 * for the request only — admins uploading mid-session see fresh state on the
 * very next render. Failures (missing dir, EACCES) return empty sets so
 * lookups gracefully fail closed.
 */
const uploadsSnapshot = cache((): { events: Set<string>; venues: Set<string> } => {
  const root = uploadsRoot();
  const readBucket = (bucket: UploadBucket): Set<string> => {
    try {
      return new Set(readdirSync(path.join(root, bucket)));
    } catch {
      return new Set();
    }
  };
  return { events: readBucket("events"), venues: readBucket("venues") };
});

/**
 * Sync check that a `/uploads/<bucket>/<file>` URL still resolves to a real
 * file on disk. The DB stores public URLs, but Railway persistent volumes can
 * be reset (or files manually deleted) leaving the row pointing at nothing —
 * so callers that decide whether to *re-fetch* (e.g. the venue-image
 * auto-fetcher) need to know the difference between "we have an image" and
 * "we have a row claiming we have an image."
 *
 * Returns false for empty/non-/uploads URLs, missing files, and traversal
 * attempts. Returns true only when the resolved path is a real regular file.
 *
 * Hot path: backed by `uploadsSnapshot` (one readdir per bucket per request)
 * so callers can fire this once per event without N+1 fs syscalls.
 */
export function uploadFileExists(url: string): boolean {
  if (!url || !url.startsWith("/uploads/")) return false;
  const rel = url
    .slice("/uploads/".length)
    .split("/")
    .filter(Boolean);
  if (rel.length !== 2) return false;
  const [bucket, filename] = rel;
  if (bucket !== "events" && bucket !== "venues") return false;
  // Fast path via the per-request snapshot. Avoids existsSync + statSync.
  const snap = uploadsSnapshot();
  return bucket === "events" ? snap.events.has(filename) : snap.venues.has(filename);
}

/** Resolve a public /uploads/* URL to the on-disk path, or null if it's not safe. */
export function resolveUploadPath(rel: string[]): string | null {
  const joined = rel.join("/");
  if (!joined || joined.includes("..")) return null;
  // Only two known buckets — reject anything else outright.
  if (!joined.startsWith("events/") && !joined.startsWith("venues/")) return null;
  return path.join(uploadsRoot(), joined);
}

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export function contentTypeFromPath(filePath: string): string {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}
