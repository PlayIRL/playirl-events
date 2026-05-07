"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DiscordSubscription } from "@/lib/discord-subscriptions";
import {
  type Mode,
  DOW_LABELS,
  ScheduleAndFilterSections,
  utcHourToLocalLabel,
  shortTimezoneLabel,
} from "./_form-controls";

export default function SubscriptionsList({ subscriptions }: { subscriptions: DiscordSubscription[] }) {
  return (
    <div className="space-y-4">
      {subscriptions.map(sub => (
        <SubscriptionCard key={sub.id} sub={sub} />
      ))}
    </div>
  );
}

function SubscriptionCard({ sub }: { sub: DiscordSubscription }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tzLabel = shortTimezoneLabel();

  // Mirror the create form's local state shape so we can reuse
  // ScheduleAndFilterSections directly.
  const [hourUtc, setHourUtc] = useState(sub.hour_utc);
  const [dow, setDow] = useState(sub.dow ?? 1);
  const [daysAhead, setDaysAhead] = useState(sub.days_ahead);
  const [lead, setLead] = useState<string>(sub.lead_preset ?? "1h");
  const [customLeadMinutes, setCustomLeadMinutes] = useState<number | "">(sub.lead_minutes);
  const [format, setFormat] = useState(sub.format ?? "");
  const [near, setNear] = useState(sub.near_label);
  const [radiusMiles, setRadiusMiles] = useState<number | "">(sub.radius_miles ?? "");

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const leadArg = sub.mode === "reminder"
        ? (lead === "custom" ? String(customLeadMinutes) : lead)
        : null;
      const res = await fetch(`/api/account/discord/${sub.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: format || null,
          // Send `near` (not just near_label) so the API re-geocodes when
          // the user changes the location. Empty string = clear the geo
          // filter entirely.
          near: near.trim(),
          radius_miles: radiusMiles === "" ? null : Number(radiusMiles),
          hour_utc: Number(hourUtc),
          dow: sub.mode === "weekly" ? Number(dow) : null,
          days_ahead: Number(daysAhead),
          lead: leadArg,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/account/discord/${sub.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !sub.enabled }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this subscription? This cannot be undone.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/account/discord/${sub.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const tagPills: { label: string; tone?: "muted" | "warn" }[] = [
    { label: sub.mode },
  ];
  if (sub.format) tagPills.push({ label: sub.format });
  if (sub.source) tagPills.push({ label: sub.source });
  if (sub.near_label) tagPills.push({ label: `near ${sub.near_label}${sub.radius_miles ? ` · ${sub.radius_miles}mi` : ""}` });
  if (!sub.enabled) tagPills.push({ label: "disabled", tone: "warn" });

  return (
    <div className={`bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 rounded-md p-5 ${!sub.enabled ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2 flex-1 min-w-0">
          <div className="flex flex-wrap gap-1.5">
            {tagPills.map((p, i) => (
              <span
                key={i}
                className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
                  p.tone === "warn"
                    ? "bg-neutral-100 text-neutral-500 dark:bg-white/[0.06] dark:text-neutral-500"
                    : "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                }`}
              >
                {p.label}
              </span>
            ))}
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400 break-all">
            channel <code>#{sub.channel_id}</code>
            {" · "}guild <code>{sub.guild_id}</code>
          </div>
          {sub.mode === "weekly" && (
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              Fires {DOW_LABELS[sub.dow ?? 1]} at {utcHourToLocalLabel(sub.hour_utc)} ({tzLabel}) · {sub.days_ahead}d window
            </div>
          )}
          {sub.mode === "daily" && (
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              Fires daily at {utcHourToLocalLabel(sub.hour_utc)} ({tzLabel}) · {sub.days_ahead}d window
            </div>
          )}
          {sub.mode === "reminder" && (
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              Fires {sub.lead_minutes} minutes before each matching event ({sub.lead_preset ?? "custom"})
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <button
            onClick={() => setEditing(v => !v)}
            disabled={busy}
            className="text-xs px-2.5 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition"
          >
            {editing ? "Cancel" : "Edit"}
          </button>
          <button
            onClick={toggleEnabled}
            disabled={busy}
            className="text-xs px-2.5 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition"
          >
            {sub.enabled ? "Disable" : "Enable"}
          </button>
          <button
            onClick={remove}
            disabled={busy}
            className="text-xs px-2.5 py-1 rounded-md border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 transition"
          >
            Delete
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      {editing && (
        <div className="mt-4 pt-4 border-t border-neutral-100 dark:border-neutral-800 space-y-5">
          <div className="rounded-md bg-neutral-50 dark:bg-neutral-800/50 px-3 py-2 text-xs text-neutral-600 dark:text-neutral-300">
            Server, channel, and mode can&apos;t be changed — to switch any of those, delete this subscription and create a new one.
          </div>

          <ScheduleAndFilterSections
            value={{
              mode: sub.mode as Mode,
              hourUtc, dow, daysAhead, lead, customLeadMinutes,
              format, near, radiusMiles,
            }}
            on={{
              setHourUtc, setDow, setDaysAhead, setLead, setCustomLeadMinutes,
              setFormat, setNear, setRadiusMiles,
            }}
          />

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setEditing(false)}
              disabled={busy}
              className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 transition"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={busy}
              className="px-3 py-1.5 rounded-md bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-white dark:hover:bg-neutral-100 dark:text-neutral-900 text-sm font-medium transition disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
