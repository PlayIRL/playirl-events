import { prepareCached } from "./db";

export interface UserPreferences {
  user_id: string;
  formats: string[];
  radius_miles: number;
  days_ahead: number;
  /** Per-user location override. null = use the app's default (config.location). */
  location_lat: number | null;
  location_lng: number | null;
  location_label: string;
  updated_at: string;
}

interface Row {
  user_id: string;
  formats: string;
  radius_miles: number;
  days_ahead: number;
  location_lat: number | null;
  location_lng: number | null;
  location_label: string | null;
  updated_at: string;
}

function rowToPrefs(row: Row): UserPreferences {
  let formats: string[] = [];
  try {
    formats = JSON.parse(row.formats) as string[];
  } catch {
    formats = [];
  }
  return {
    user_id: row.user_id,
    formats,
    radius_miles: row.radius_miles,
    days_ahead: row.days_ahead,
    location_lat: row.location_lat,
    location_lng: row.location_lng,
    location_label: row.location_label ?? "",
    updated_at: row.updated_at,
  };
}

export const DEFAULT_PREFS: Omit<UserPreferences, "user_id" | "updated_at"> = {
  formats: [],
  radius_miles: 10,
  days_ahead: 7,
  location_lat: null,
  location_lng: null,
  location_label: "",
};

export function getPreferences(userId: string): UserPreferences {
  const row = prepareCached(`
    SELECT user_id, formats, radius_miles, days_ahead,
           location_lat, location_lng, location_label, updated_at
    FROM user_preferences WHERE user_id = ?
  `).get(userId) as Row | undefined;
  if (!row) {
    return { user_id: userId, ...DEFAULT_PREFS, updated_at: "" };
  }
  return rowToPrefs(row);
}

export function setPreferences(
  userId: string,
  patch: Partial<Omit<UserPreferences, "user_id" | "updated_at">>,
  /** Optional pre-fetched row. Callers that already loaded the user's prefs
   *  this request (e.g. app/page.tsx during its initial render) can pass
   *  them through to skip the duplicate SELECT. */
  existingPrefs?: UserPreferences,
): UserPreferences {
  const existing = existingPrefs ?? getPreferences(userId);
  const next = {
    formats: patch.formats ?? existing.formats,
    radius_miles: patch.radius_miles ?? existing.radius_miles,
    days_ahead: patch.days_ahead ?? existing.days_ahead,
    // For nullable fields use `in` check so an explicit null can clear them.
    location_lat: "location_lat" in patch ? (patch.location_lat ?? null) : existing.location_lat,
    location_lng: "location_lng" in patch ? (patch.location_lng ?? null) : existing.location_lng,
    location_label: patch.location_label ?? existing.location_label,
  };
  prepareCached(`
    INSERT INTO user_preferences (
      user_id, formats, radius_miles, days_ahead,
      location_lat, location_lng, location_label, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      formats = excluded.formats,
      radius_miles = excluded.radius_miles,
      days_ahead = excluded.days_ahead,
      location_lat = excluded.location_lat,
      location_lng = excluded.location_lng,
      location_label = excluded.location_label,
      updated_at = excluded.updated_at
  `).run(
      userId,
      JSON.stringify(next.formats),
      next.radius_miles,
      next.days_ahead,
      next.location_lat,
      next.location_lng,
      next.location_label,
    );
  return getPreferences(userId);
}
