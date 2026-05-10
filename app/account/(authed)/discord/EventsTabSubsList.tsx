"use client";

// Cards listing the user's events-tab subs. Each card supports an
// enable/disable toggle and a delete button. Filter changes aren't supported
// inline (delete + recreate is the path) — same constraint the channel-
// message subs have, and keeps this surface small.

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DiscordEventsTabSub } from "@/lib/discord-events-tab-subs";

export default function EventsTabSubsList({ subs }: { subs: DiscordEventsTabSub[] }) {
  return (
    <div className="space-y-4">
      {subs.map(sub => (
        <SubCard key={sub.id} sub={sub} />
      ))}
    </div>
  );
}

function SubCard({ sub }: { sub: DiscordEventsTabSub }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = sub.name?.trim() || autoTitle(sub);
  const filterLine = describeFilter(sub);
  const windowLine = `Looks ${sub.days_ahead} day${sub.days_ahead === 1 ? "" : "s"} ahead.`;

  async function toggleEnabled() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/account/discord-event-subs/${sub.id}`, {
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
    if (!confirm("Delete this Events-tab sub? Already-posted events stay in Discord; new ones won't be added.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/account/discord-event-subs/${sub.id}`, { method: "DELETE" });
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

  return (
    <div className={`bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 rounded-md p-5 ${!sub.enabled ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">{title}</h3>
            <EnabledToggle enabled={!!sub.enabled} busy={busy} onToggle={toggleEnabled} />
          </div>

          {!sub.enabled && sub.disabled_reason && (
            <div
              role="alert"
              className="text-xs bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-900 dark:text-amber-200 rounded-md px-3 py-2"
            >
              <p className="font-semibold mb-0.5">Auto-disabled by Discord</p>
              <p className="leading-relaxed">
                {sub.disabled_reason.includes("403")
                  ? "Discord rejected our event creates. The bot likely lost the Manage Events permission, or was kicked. Re-add the bot, then flip the switch above."
                  : sub.disabled_reason.includes("404")
                    ? "Discord can't find the server anymore. The bot was kicked, or the guild was deleted."
                    : "Five Discord posts in a row failed. Once the issue is resolved, flip the switch above to retry."}
                <span className="block mt-1 font-mono text-[10px] opacity-70">
                  ref: {sub.disabled_reason.slice(0, 120)}
                </span>
              </p>
            </div>
          )}

          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2.5 text-sm">
            <Field label="Server" value={<code className="text-xs">{sub.guild_id}</code>} />
            <Field label="Filter" value={filterLine} />
            <Field label="Window" value={windowLine} />
            {sub.last_dispatched_at && (
              <Field
                label="Last post"
                value={<span className="text-neutral-500 dark:text-neutral-400">{new Date(sub.last_dispatched_at).toLocaleString()}</span>}
              />
            )}
          </dl>
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
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
        </div>
      </div>

      {error && (
        <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}

function autoTitle(sub: DiscordEventsTabSub): string {
  if (sub.venue_name) return `Events at ${sub.venue_name}`;
  if (sub.near_label) return `${sub.format ?? "All"} events near ${sub.near_label}`;
  if (sub.format) return `${sub.format} events`;
  return "All events";
}

function describeFilter(sub: DiscordEventsTabSub): string {
  const parts: string[] = [];
  if (sub.format) parts.push(sub.format);
  if (sub.venue_name) {
    parts.push(`@ ${sub.venue_name}`);
  } else if (sub.near_label && sub.radius_miles) {
    parts.push(`within ${sub.radius_miles} mi of ${sub.near_label}`);
  } else if (sub.near_label) {
    parts.push(`near ${sub.near_label}`);
  }
  if (parts.length === 0) return "All events";
  return parts.join(" · ");
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
        {enabled ? "Enabled" : "Disabled"}
      </span>
    </button>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-xs font-medium text-neutral-500 dark:text-neutral-400 pt-0.5">
        {label}
      </dt>
      <dd className="min-w-0">
        <div className="text-sm text-neutral-900 dark:text-neutral-100">{value}</div>
      </dd>
    </>
  );
}
