import { getDb } from "./db";

export interface FlagRow {
  key: string;
  enabled: number;       // 0 / 1
  description: string;
  updated_at: string;
}

export function getAllFlags(): FlagRow[] {
  return getDb().prepare("SELECT key, enabled, description, updated_at FROM feature_flags ORDER BY key").all() as FlagRow[];
}

export function getFlag(key: string): FlagRow | undefined {
  return getDb().prepare("SELECT key, enabled, description, updated_at FROM feature_flags WHERE key = ?").get(key) as FlagRow | undefined;
}

export function setFlag(key: string, enabled: boolean, description?: string): FlagRow {
  const db = getDb();
  const existing = getFlag(key);
  if (existing) {
    db.prepare("UPDATE feature_flags SET enabled=?, description=COALESCE(?, description), updated_at=datetime('now') WHERE key=?")
      .run(enabled ? 1 : 0, description ?? null, key);
  } else {
    db.prepare("INSERT INTO feature_flags (key, enabled, description) VALUES (?, ?, ?)")
      .run(key, enabled ? 1 : 0, description ?? "");
  }
  return getFlag(key)!;
}

