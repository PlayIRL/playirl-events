"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DiscordSubscription } from "@/lib/discord-subscriptions";
import DiscordPreview, { type PreviewMessage } from "./DiscordPreview";
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

  // Preview state — fetched lazily on first click. Not refreshed automatically;
  // edits invalidate by closing the panel so the next open re-fetches.
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<{ message: PreviewMessage; eventCount: number; empty: boolean; sample?: boolean } | null>(null);

  async function loadPreview() {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await fetch(`/api/account/discord/${sub.id}/preview`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setPreviewData(body);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : String(e));
    } finally {
      setPreviewLoading(false);
    }
  }

  function togglePreview() {
    if (!previewOpen && !previewData) loadPreview();
    setPreviewOpen(v => !v);
  }

  // Mirror the create form's local state shape so we can reuse
  // ScheduleAndFilterSections directly.
  const [name, setName] = useState(sub.name ?? "");
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
    // Edits change what the preview would render — invalidate cached payload.
    setPreviewData(null);
    try {
      const leadArg = sub.mode === "reminder"
        ? (lead === "custom" ? String(customLeadMinutes) : lead)
        : null;
      const res = await fetch(`/api/account/discord/${sub.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || null,
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
      // Re-fetch the preview against the new persisted state so the panel
      // refills immediately instead of staying empty after invalidation.
      if (previewOpen) await loadPreview();
      // Sanity-check the new filter set against the matching event count.
      // Fetched separately from the preview load so we always get the
      // number even when the preview accordion is closed.
      try {
        const sanity = await fetch(`/api/account/discord/${sub.id}/preview`).then(r => r.json());
        setVolumeWarning(sanity.eventCount > HIGH_VOLUME_THRESHOLD ? sanity.eventCount : null);
      } catch {
        setVolumeWarning(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // Inline status banner shown after a Send test attempt — distinct from
  // `error` (which is for save/edit/delete failures) so successful sends
  // don't get stuck in the same red-text channel.
  const [testStatus, setTestStatus] = useState<{ kind: "ok" | "err"; message: string } | null>(null);

  // Surfaces a "this auto-post will include a lot of events" warning after
  // save when the new filter set matches more than this many events. Helps
  // catch the common foot-gun of saving an unfiltered (no-location) sub.
  const HIGH_VOLUME_THRESHOLD = 50;
  const [volumeWarning, setVolumeWarning] = useState<number | null>(null);

  async function sendTest() {
    setBusy(true);
    setTestStatus(null);
    try {
      const res = await fetch(`/api/account/discord/${sub.id}/send-test`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setTestStatus({
        kind: "ok",
        message: `Sent · ${body.eventCount} matching event${body.eventCount === 1 ? "" : "s"} included.`,
      });
    } catch (e) {
      setTestStatus({ kind: "err", message: e instanceof Error ? e.message : String(e) });
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
    if (!confirm("Delete this auto-post? This cannot be undone.")) return;
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

  // Display title. Prefer the user-set name; otherwise fall back to a
  // generated label (`[Cadence] [Format] [digest|reminder]`) so cards always
  // have something prominent regardless of how the user filled out the form.
  const formatPart = sub.format ? ` ${sub.format}` : "";
  const generatedTitle =
    sub.mode === "weekly" ? `Weekly${formatPart} digest`
    : sub.mode === "daily" ? `Daily${formatPart} digest`
    : `${sub.lead_minutes}-min${formatPart} reminder`;
  const subscriptionTitle = sub.name?.trim() || generatedTitle;

  const modeLabel =
    sub.mode === "weekly" ? "Weekly digest"
    : sub.mode === "daily" ? "Daily digest"
    : "Per-event reminder";
  const modeHelp =
    sub.mode === "weekly" ? "One summary message every week."
    : sub.mode === "daily" ? "One summary message every day."
    : "A heads-up message in the lead-time window before each matching event.";

  const whenLine =
    sub.mode === "weekly"
      ? `Every ${DOW_LABELS[sub.dow ?? 1]} at ${utcHourToLocalLabel(sub.hour_utc)} (${tzLabel})`
      : sub.mode === "daily"
        ? `Every day at ${utcHourToLocalLabel(sub.hour_utc)} (${tzLabel})`
        : `${sub.lead_minutes} minutes before each event${sub.lead_preset && sub.lead_preset !== "custom" ? ` (${sub.lead_preset.replace("_", " ")})` : ""}`;

  const windowLine = sub.mode === "reminder"
    ? `Watches the next ${sub.days_ahead} days for matching events.`
    : `Includes events in the next ${sub.days_ahead} day${sub.days_ahead === 1 ? "" : "s"}.`;

  const formatLine = sub.format ? sub.format : "Any format";
  const sourceLine = sub.source ? sub.source : "All sources";
  const locationLine = sub.near_label
    ? `Within ${sub.radius_miles ?? "?"} mi of ${sub.near_label}`
    : "Anywhere";

  return (
    <div className={`bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 rounded-md p-5 ${!sub.enabled ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              {editing ? `Edit · ${subscriptionTitle}` : subscriptionTitle}
            </h3>
            {!editing && (
              <EnabledToggle enabled={!!sub.enabled} busy={busy} onToggle={toggleEnabled} />
            )}
          </div>

          {!editing && (
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2.5 text-sm">
              <Field label="Mode" value={modeLabel} help={modeHelp} />
              <Field label="When" value={whenLine} />
              <Field label="Window" value={windowLine} />
              <Field label="Format" value={formatLine} muted={!sub.format} />
              <Field label="Source" value={sourceLine} muted={!sub.source} />
              <Field label="Location" value={locationLine} muted={!sub.near_label} />
              <Field
                label="Channel"
                value={<code className="text-xs">#{sub.channel_id}</code>}
                help={<>in server <code className="text-xs">{sub.guild_id}</code></>}
              />
            </dl>
          )}
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <button
            onClick={() => setEditing(v => !v)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition cursor-pointer"
          >
            {editing ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Cancel
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </>
            )}
          </button>
          {!editing && (
            <>
              <button
                onClick={sendTest}
                disabled={busy}
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition cursor-pointer disabled:opacity-60"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                Send test
              </button>
              <button
                onClick={remove}
                disabled={busy}
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 transition cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                </svg>
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      {testStatus && (
        <p
          className={`mt-3 text-xs ${
            testStatus.kind === "ok"
              ? "text-neutral-700 dark:text-neutral-300"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {testStatus.message}
        </p>
      )}

      {volumeWarning !== null && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0 mt-0.5 text-amber-700 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
          </svg>
          <div className="flex-1 text-amber-900 dark:text-amber-200">
            <strong className="font-semibold">Heads up:</strong> this auto-post will include {volumeWarning.toLocaleString()} events. Add a location filter or tighten the radius to scope it.
          </div>
          <button
            onClick={() => setVolumeWarning(null)}
            aria-label="Dismiss"
            className="shrink-0 -mr-1 -mt-1 p-1 text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {!editing && (
        <div className="mt-4 pt-4 border-t border-neutral-100 dark:border-neutral-800">
          <button
            onClick={togglePreview}
            disabled={busy}
            aria-expanded={previewOpen}
            aria-controls={`discord-preview-${sub.id}`}
            className="w-full flex items-center gap-2 text-left text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition"
          >
            <span>Discord preview</span>
            {previewOpen && previewData?.sample && (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                Sample event
              </span>
            )}
            {previewOpen && previewData && !previewData.empty && (
              <span className="text-[10px] text-neutral-500 dark:text-neutral-400 font-normal">
                {previewData.eventCount} matching event{previewData.eventCount === 1 ? "" : "s"} right now
              </span>
            )}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`ml-auto w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400 transition-transform duration-200 ${previewOpen ? "rotate-180" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {previewOpen && (
            <div id={`discord-preview-${sub.id}`} className="mt-3 space-y-2">
              {previewLoading && (
                <p className="text-xs text-neutral-500 dark:text-neutral-400">Loading…</p>
              )}
              {previewError && (
                <p className="text-xs text-red-600 dark:text-red-400">{previewError}</p>
              )}
              {previewData && (
                <DiscordPreview
                  message={previewData.message}
                  channelName={`channel-${sub.channel_id.slice(-4)}`}
                />
              )}
            </div>
          )}
        </div>
      )}

      {editing && (
        <div className="mt-4 pt-4 border-t border-neutral-100 dark:border-neutral-800 space-y-5">
          <div className="rounded-md bg-neutral-50 dark:bg-neutral-800/50 px-3 py-2 text-xs text-neutral-600 dark:text-neutral-300">
            Server, channel, and mode can&apos;t be changed — to switch any of those, delete this auto-post and create a new one.
          </div>

          <label className="block">
            <span className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">Title</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={generatedTitle}
              maxLength={80}
              className="w-full px-2.5 py-2 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400/40 focus:border-neutral-400 dark:focus:ring-white/20 dark:focus:border-white/30"
            />
            <span className="block text-[11px] text-neutral-500 dark:text-neutral-400 mt-1.5 leading-snug">
              Leave blank to use the auto-generated title.
            </span>
          </label>

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

function EnabledToggle({
  enabled,
  busy,
  onToggle,
}: {
  enabled: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={busy}
      onClick={onToggle}
      className="inline-flex items-center gap-2 group cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
          enabled
            ? "bg-neutral-900 dark:bg-neutral-100"
            : "bg-neutral-300 dark:bg-neutral-700"
        }`}
      >
        <span
          className={`absolute top-0.5 inline-block h-4 w-4 rounded-full shadow-sm transition-transform ${
            enabled ? "translate-x-4 bg-white dark:bg-neutral-900" : "translate-x-0.5 bg-white"
          }`}
        />
      </span>
      <span
        className={`text-xs font-medium ${
          enabled
            ? "text-neutral-900 dark:text-neutral-100"
            : "text-neutral-500 dark:text-neutral-400"
        }`}
      >
        {enabled ? "Enabled" : "Disabled — won't post"}
      </span>
    </button>
  );
}

function Field({
  label,
  value,
  help,
  muted = false,
}: {
  label: string;
  value: React.ReactNode;
  help?: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <>
      <dt className="text-xs font-medium text-neutral-500 dark:text-neutral-400 pt-0.5">
        {label}
      </dt>
      <dd className="min-w-0">
        <div className={`text-sm ${muted ? "text-neutral-500 dark:text-neutral-400" : "text-neutral-900 dark:text-neutral-100"}`}>
          {value}
        </div>
        {help && (
          <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1 leading-snug">{help}</div>
        )}
      </dd>
    </>
  );
}
