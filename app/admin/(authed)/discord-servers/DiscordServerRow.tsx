"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DiscordServerSummary } from "@/lib/discord-servers-admin";

interface PullResponse {
  ok?: boolean;
  fetched?: number;
  added?: number;
  updated?: number;
  skipped?: number;
  autoApproved?: number;
  error?: string;
}

interface SettingsResponse {
  ok?: boolean;
  settings?: { guildId: string; autoApprove: boolean; updatedAt: string };
  promotedFromPending?: number;
  error?: string;
}

interface DispatchResponse {
  ok?: boolean;
  channels?: { subsChecked: number; digestsPosted: number; remindersPosted: number; errors: number };
  eventsTab?: { subsChecked: number; eventsPosted: number; errors: number };
  error?: string;
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return "never";
  const d = new Date(ts.includes("T") ? ts : ts + " UTC");
  if (Number.isNaN(d.getTime())) return ts;
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toISOString().slice(0, 10);
}

export default function DiscordServerRow({ row }: { row: DiscordServerSummary }) {
  const router = useRouter();
  const [busyPull, setBusyPull] = useState(false);
  const [busyDispatch, setBusyDispatch] = useState(false);
  const [busySettings, setBusySettings] = useState(false);
  const [autoApprove, setAutoApprove] = useState(row.autoApprove);
  const [pullMsg, setPullMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [dispatchMsg, setDispatchMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [settingsMsg, setSettingsMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const totalSubs = row.channelSubs.total + row.eventsTabSubs.total;
  const enabledSubs = row.channelSubs.enabled + row.eventsTabSubs.enabled;
  const hasEnabledSubs = enabledSubs > 0;
  const hasFailures =
    row.channelSubs.maxConsecutiveFailures > 0 ||
    row.eventsTabSubs.maxConsecutiveFailures > 0 ||
    !!row.channelSubs.firstDisabledReason ||
    !!row.eventsTabSubs.firstDisabledReason;

  async function onPull() {
    setBusyPull(true);
    setPullMsg(null);
    const res = await fetch(
      `/api/admin/discord-servers/${encodeURIComponent(row.guildId)}/pull`,
      { method: "POST" },
    );
    setBusyPull(false);
    const data = (await res.json().catch(() => ({}))) as PullResponse;
    if (!res.ok || !data.ok) {
      setPullMsg({ kind: "err", text: data.error ?? "Pull failed" });
      return;
    }
    setPullMsg({
      kind: "ok",
      text: `Fetched ${data.fetched ?? 0} · added ${data.added ?? 0} · updated ${data.updated ?? 0} · skipped ${data.skipped ?? 0}${(data.autoApproved ?? 0) > 0 ? ` · ${data.autoApproved} auto-approved` : ""}`,
    });
    router.refresh();
  }

  async function onToggleAutoApprove(next: boolean) {
    setBusySettings(true);
    setSettingsMsg(null);
    const res = await fetch(
      `/api/admin/discord-servers/${encodeURIComponent(row.guildId)}/settings`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ autoApprove: next }),
      },
    );
    setBusySettings(false);
    const data = (await res.json().catch(() => ({}))) as SettingsResponse;
    if (!res.ok || !data.ok) {
      setSettingsMsg({ kind: "err", text: data.error ?? "Toggle failed" });
      return;
    }
    setAutoApprove(next);
    const promoted = data.promotedFromPending ?? 0;
    setSettingsMsg({
      kind: "ok",
      text: next
        ? `Auto-approve ON${promoted > 0 ? ` · promoted ${promoted} pending event(s)` : ""}`
        : "Auto-approve OFF — future events go to /admin/events/pending",
    });
    router.refresh();
  }

  async function onDispatch() {
    setBusyDispatch(true);
    setDispatchMsg(null);
    const res = await fetch(
      `/api/admin/discord-servers/${encodeURIComponent(row.guildId)}/dispatch`,
      { method: "POST" },
    );
    setBusyDispatch(false);
    const data = (await res.json().catch(() => ({}))) as DispatchResponse;
    if (!res.ok || !data.ok) {
      setDispatchMsg({ kind: "err", text: data.error ?? "Dispatch failed" });
      return;
    }
    const channels = data.channels ?? { subsChecked: 0, digestsPosted: 0, remindersPosted: 0, errors: 0 };
    const eventsTab = data.eventsTab ?? { subsChecked: 0, eventsPosted: 0, errors: 0 };
    const errs = channels.errors + eventsTab.errors;
    setDispatchMsg({
      kind: errs > 0 ? "err" : "ok",
      text: `Channels: ${channels.digestsPosted} digests + ${channels.remindersPosted} reminders (${channels.subsChecked} subs) · Events tab: ${eventsTab.eventsPosted} posted (${eventsTab.subsChecked} subs)${errs > 0 ? ` · ${errs} error(s)` : ""}`,
    });
  }

  const primaryLabel =
    row.userSources.find((s) => s.label)?.label || row.guildId;

  return (
    <li className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md overflow-hidden">
      {/* Header band ------------------------------------------------ */}
      <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 space-y-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-medium text-neutral-900 dark:text-neutral-100 truncate">
            {primaryLabel}
          </span>
          <code className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400 px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800">
            {row.guildId}
          </code>
          {row.isAdminConfigured && (
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              admin
            </span>
          )}
          {row.userSources.map((us) => (
            <span
              key={us.id}
              className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md ${
                us.enabled
                  ? "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                  : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
              }`}
              title={us.userEmail ?? us.userId}
            >
              user{us.enabled ? "" : " (off)"} · {us.userEmail ?? us.userId.slice(0, 8)}
            </span>
          ))}
          {hasFailures && (
            <span
              className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
              title={
                row.channelSubs.firstDisabledReason ??
                row.eventsTabSubs.firstDisabledReason ??
                "Recent dispatch failures"
              }
            >
              failing
            </span>
          )}
        </div>

        {/* Auto-approve toggle ------------------------------------- */}
        <div className="flex flex-wrap items-center gap-2">
          <label
            className="inline-flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300 cursor-pointer select-none"
            title="When ON, events scraped from this guild bypass /admin/events/pending and go straight to the public site. When OFF, events stay in pending until you manually approve them."
          >
            <span
              className={`inline-flex items-center h-5 w-9 rounded-full transition ${
                autoApprove
                  ? "bg-emerald-600 dark:bg-emerald-500"
                  : "bg-neutral-300 dark:bg-neutral-700"
              } ${busySettings ? "opacity-50" : ""}`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  autoApprove ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </span>
            <input
              type="checkbox"
              className="sr-only"
              checked={autoApprove}
              disabled={busySettings}
              onChange={(e) => onToggleAutoApprove(e.target.checked)}
            />
            <span className="font-medium">
              {autoApprove ? "Auto-approve events" : "Manual review (default)"}
            </span>
          </label>
          {settingsMsg && (
            <span
              className={`text-xs ${
                settingsMsg.kind === "ok"
                  ? "text-emerald-700 dark:text-emerald-300"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {settingsMsg.text}
            </span>
          )}
        </div>
      </div>

      {/* Two-column body: Pull (left) · Push (right) ---------------- */}
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-neutral-200 dark:divide-neutral-800">
        {/* PULL ----------------------------------------------------- */}
        <div className="p-4 space-y-2">
          <div className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Pull · events ingested from this guild
          </div>
          <div className="text-sm text-neutral-700 dark:text-neutral-300">
            <span className="font-mono">{row.eventCounts.total}</span> events
            {row.eventCounts.total > 0 && (
              <span className="text-neutral-500 dark:text-neutral-400">
                {" "}
                · {row.eventCounts.active} active · {row.eventCounts.pending}{" "}
                pending · {row.eventCounts.skip} skip
              </span>
            )}
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            Last event updated: {formatTimestamp(row.lastEventAt)}
            {row.userSources.length > 0 && (
              <>
                {" "}
                · Last user sync:{" "}
                {formatTimestamp(
                  row.userSources
                    .map((s) => s.lastSyncedAt)
                    .filter((t): t is string => !!t)
                    .sort()
                    .pop() ?? null,
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onPull}
              disabled={busyPull}
              className="text-xs px-3 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
            >
              {busyPull ? "Pulling…" : "Pull now"}
            </button>
            {pullMsg && (
              <span
                className={`text-xs ${
                  pullMsg.kind === "ok"
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {pullMsg.text}
              </span>
            )}
          </div>
        </div>

        {/* PUSH ----------------------------------------------------- */}
        <div className="p-4 space-y-2">
          <div className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Push · events posted to this guild
          </div>
          <div className="text-sm text-neutral-700 dark:text-neutral-300">
            <span className="font-mono">{row.channelSubs.enabled}</span>/
            {row.channelSubs.total} channel subs ·{" "}
            <span className="font-mono">{row.eventsTabSubs.enabled}</span>/
            {row.eventsTabSubs.total} events-tab subs
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            {row.eventsPostedCount > 0 && (
              <>
                <span className="font-mono">{row.eventsPostedCount}</span>{" "}
                events posted to Events tab ·{" "}
              </>
            )}
            Last dispatch:{" "}
            {formatTimestamp(
              [
                row.channelSubs.lastDispatchedAt,
                row.eventsTabSubs.lastDispatchedAt,
              ]
                .filter((t): t is string => !!t)
                .sort()
                .pop() ?? null,
            )}
          </div>
          {row.lastActivity && (
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              Latest: {row.lastActivity.kind}/{row.lastActivity.trigger} ·{" "}
              <span
                className={
                  row.lastActivity.status === "ok"
                    ? "text-emerald-700 dark:text-emerald-300"
                    : row.lastActivity.status === "error"
                      ? "text-red-600 dark:text-red-400"
                      : "text-amber-700 dark:text-amber-300"
                }
              >
                {row.lastActivity.status}
              </span>{" "}
              ({row.lastActivity.messagesPosted} msgs ·{" "}
              {row.lastActivity.eventCount} events)
              {row.lastActivity.error && (
                <div
                  className="text-[11px] text-red-600 dark:text-red-400 truncate mt-0.5"
                  title={row.lastActivity.error}
                >
                  {row.lastActivity.error}
                </div>
              )}
            </div>
          )}
          {(row.channelSubs.firstDisabledReason ||
            row.eventsTabSubs.firstDisabledReason) && (
            <div
              className="text-[11px] text-red-600 dark:text-red-400 truncate"
              title={
                row.channelSubs.firstDisabledReason ??
                row.eventsTabSubs.firstDisabledReason ??
                ""
              }
            >
              Disabled:{" "}
              {row.channelSubs.firstDisabledReason ??
                row.eventsTabSubs.firstDisabledReason}
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onDispatch}
              disabled={busyDispatch || !hasEnabledSubs}
              title={
                hasEnabledSubs
                  ? "Fires every enabled sub for this guild. Already-posted buckets won't double-post."
                  : "No enabled subscriptions for this guild."
              }
              className="text-xs px-3 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
            >
              {busyDispatch
                ? "Dispatching…"
                : hasEnabledSubs
                  ? "Dispatch now"
                  : "No subs"}
            </button>
            {dispatchMsg && (
              <span
                className={`text-xs ${
                  dispatchMsg.kind === "ok"
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {dispatchMsg.text}
              </span>
            )}
          </div>
        </div>
      </div>

      {totalSubs === 0 && row.eventCounts.total === 0 && (
        <div className="px-4 py-2 text-[11px] text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-900/50 border-t border-neutral-200 dark:border-neutral-800">
          Configured but no events ingested and no subscriptions yet. The bot
          may not be a member of this guild, or no event titles match the MTG
          keyword filter.
        </div>
      )}
    </li>
  );
}
