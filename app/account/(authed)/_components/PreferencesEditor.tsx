"use client";

// Editor for the user's default browse settings — location, radius, days-ahead,
// formats. Saves through PUT /api/account/preferences. These same values seed
// the homepage filter bar when the user lands without query params.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FORMAT_SUGGESTIONS } from "@/lib/format-style";

interface Props {
  initial: {
    location_label: string;
    radius_miles: number;
    days_ahead: number;
    formats: string[];
  };
  /** Global fallback location label, surfaced as placeholder when the user
   *  hasn't set a personal override. */
  fallbackLocationLabel: string;
}

const RADIUS_OPTIONS = [5, 10, 25, 50, 100, 250];
const DAYS_OPTIONS = [1, 3, 7, 14, 30, 60];

export default function PreferencesEditor({ initial, fallbackLocationLabel }: Props) {
  const router = useRouter();
  const [location, setLocation] = useState(initial.location_label);
  const [radius, setRadius] = useState<number>(initial.radius_miles);
  const [days, setDays] = useState<number>(initial.days_ahead);
  const [formats, setFormats] = useState<Set<string>>(new Set(initial.formats));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; message: string } | null>(null);

  // Dirty-check so the Save button reads "Save" only when there's something to
  // save. Avoids the "I clicked save but nothing changed" confusion.
  const initialFormatsKey = [...initial.formats].sort().join("|");
  const currentFormatsKey = [...formats].sort().join("|");
  const dirty =
    location.trim() !== initial.location_label.trim()
    || radius !== initial.radius_miles
    || days !== initial.days_ahead
    || currentFormatsKey !== initialFormatsKey;

  function toggleFormat(name: string) {
    setFormats(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/account/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location_label: location.trim(),
          radius_miles: radius,
          days_ahead: days,
          formats: [...formats],
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setStatus({ kind: "ok", message: "Saved." });
      router.refresh();
    } catch (e) {
      setStatus({ kind: "err", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-neutral-200 dark:border-white/15 bg-white dark:bg-neutral-900 p-5 space-y-5">
      <div>
        <h2 className="text-base font-extrabold tracking-tight text-neutral-900 dark:text-neutral-100">
          Default browse settings
        </h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          What you see when you open the calendar without filters. These also
          seed new Discord auto-posts.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        <label className="block">
          <span className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
            Default location
          </span>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder={fallbackLocationLabel || "City, ZIP, or address"}
            className="w-full px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400/40 focus:border-neutral-400 dark:focus:ring-white/20 dark:focus:border-white/30"
          />
          <span className="block text-[11px] text-neutral-500 dark:text-neutral-400 mt-1.5 leading-snug">
            Leave blank to use the site default ({fallbackLocationLabel || "Philadelphia"}).
          </span>
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
            Radius
          </span>
          <select
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400/40 focus:border-neutral-400 dark:focus:ring-white/20 dark:focus:border-white/30"
          >
            {RADIUS_OPTIONS.map(r => (
              <option key={r} value={r}>{r} miles</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
            Days ahead
          </span>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400/40 focus:border-neutral-400 dark:focus:ring-white/20 dark:focus:border-white/30"
          >
            {DAYS_OPTIONS.map(d => (
              <option key={d} value={d}>{d} {d === 1 ? "day" : "days"}</option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <span className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2">
          Default formats
        </span>
        <div className="flex flex-wrap gap-1.5">
          {/* "All" represents the empty-set state: no specific format
              filter applied, so every format shows. Picking a specific
              format clears it; clicking "All" again clears all picks. */}
          <button
            type="button"
            onClick={() => setFormats(new Set())}
            aria-pressed={formats.size === 0}
            className={`text-xs px-2.5 py-1 rounded-full border transition cursor-pointer ${
              formats.size === 0
                ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white border-neutral-400 dark:border-neutral-700"
                : "bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800"
            }`}
          >
            All
          </button>
          {FORMAT_SUGGESTIONS.map((name) => {
            const active = formats.has(name);
            return (
              <button
                key={name}
                type="button"
                onClick={() => toggleFormat(name)}
                aria-pressed={active}
                className={`text-xs px-2.5 py-1 rounded-full border transition cursor-pointer ${
                  active
                    ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white border-neutral-400 dark:border-neutral-700"
                    : "bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>
        <span className="block text-[11px] text-neutral-500 dark:text-neutral-400 mt-2 leading-snug">
          &ldquo;All&rdquo; shows every format. Pick specific ones to narrow.
        </span>
      </div>

      {status && (
        <p
          role={status.kind === "err" ? "alert" : undefined}
          className={`text-xs ${
            status.kind === "ok"
              ? "text-neutral-700 dark:text-neutral-300"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {status.message}
        </p>
      )}

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={busy || !dirty}
          className="px-3 py-1.5 rounded-md bg-neutral-100 hover:bg-neutral-200 text-neutral-900 dark:bg-neutral-700 dark:hover:bg-neutral-700 dark:text-white text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {busy ? "Saving…" : dirty ? "Save changes" : "Saved"}
        </button>
      </div>
    </div>
  );
}
