"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface PullAllResponse {
  ok?: boolean;
  totals?: {
    guilds: number;
    failed: number;
    fetched: number;
    added: number;
    updated: number;
    skipped: number;
  };
  error?: string;
}

interface DispatchAllResponse {
  ok?: boolean;
  subscriptions_checked?: number;
  digests_posted?: number;
  reminders_posted?: number;
  retries_posted?: number;
  events_tab_subs_checked?: number;
  events_tab_events_posted?: number;
  errors?: number;
  error?: string;
}

export default function BulkActionsBar({ hasGuilds }: { hasGuilds: boolean }) {
  const router = useRouter();
  const [busyPull, setBusyPull] = useState(false);
  const [busyDispatch, setBusyDispatch] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function onPullAll() {
    setBusyPull(true);
    setMsg(null);
    const res = await fetch("/api/admin/discord-servers/pull-all", { method: "POST" });
    setBusyPull(false);
    const data = (await res.json().catch(() => ({}))) as PullAllResponse;
    if (!res.ok || !data.ok) {
      setMsg({ kind: "err", text: data.error ?? "Pull-all failed" });
      return;
    }
    const t = data.totals;
    if (!t) {
      setMsg({ kind: "ok", text: "Pull-all complete" });
    } else {
      setMsg({
        kind: t.failed > 0 ? "err" : "ok",
        text: `${t.guilds} guilds ok${t.failed > 0 ? `, ${t.failed} failed` : ""} · ${t.fetched} fetched · ${t.added} added · ${t.updated} updated`,
      });
    }
    router.refresh();
  }

  async function onDispatchAll() {
    setBusyDispatch(true);
    setMsg(null);
    const res = await fetch("/api/admin/discord-servers/dispatch-all", { method: "POST" });
    setBusyDispatch(false);
    const data = (await res.json().catch(() => ({}))) as DispatchAllResponse;
    if (!res.ok || !data.ok) {
      setMsg({ kind: "err", text: data.error ?? "Dispatch-all failed" });
      return;
    }
    setMsg({
      kind: (data.errors ?? 0) > 0 ? "err" : "ok",
      text: `${data.subscriptions_checked ?? 0} channel subs · ${data.digests_posted ?? 0} digests + ${data.reminders_posted ?? 0} reminders + ${data.retries_posted ?? 0} retries · ${data.events_tab_events_posted ?? 0} events posted (${data.events_tab_subs_checked ?? 0} events-tab subs)${(data.errors ?? 0) > 0 ? ` · ${data.errors} error(s)` : ""}`,
    });
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onPullAll}
        disabled={busyPull || !hasGuilds}
        title="Pulls scheduled events from every connected Discord guild. Bounded concurrency keeps within Discord's rate limit."
        className="text-xs px-3 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
      >
        {busyPull ? "Pulling all…" : "Pull all"}
      </button>
      <button
        type="button"
        onClick={onDispatchAll}
        disabled={busyDispatch || !hasGuilds}
        title="Equivalent to one cron tick. Force-fires digest time gates but honors the idempotency ledger."
        className="text-xs px-3 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
      >
        {busyDispatch ? "Dispatching all…" : "Dispatch all"}
      </button>
      {msg && (
        <span
          className={`text-xs ${
            msg.kind === "ok"
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {msg.text}
        </span>
      )}
    </div>
  );
}
