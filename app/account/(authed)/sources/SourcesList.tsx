"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { UserSource } from "@/lib/user-sources";

export default function SourcesList({ sources }: { sources: UserSource[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggle(id: string, enabled: boolean) {
    setBusyId(id);
    await fetch(`/api/account/sources/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    setBusyId(null);
    startTransition(() => router.refresh());
  }

  async function remove(id: string) {
    if (!confirm("Remove this source? Events already imported will remain but won't be refreshed.")) return;
    setBusyId(id);
    await fetch(`/api/account/sources/${encodeURIComponent(id)}`, { method: "DELETE" });
    setBusyId(null);
    startTransition(() => router.refresh());
  }

  if (sources.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-base font-extrabold tracking-tight text-neutral-900 dark:text-neutral-100">
        Your connected Discords
      </h2>
      <ul className="space-y-3">
        {sources.map((s) => (
          <li
            key={s.id}
            className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md p-4 flex flex-col md:flex-row gap-4 md:items-center"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-medium text-neutral-900 dark:text-neutral-100">{s.label}</span>
                {!s.enabled && (
                  <span className="text-[10px] bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 px-1.5 rounded-md">
                    paused
                  </span>
                )}
              </div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 flex gap-3 flex-wrap">
                {s.venue_name && <span>📍 {s.venue_name}</span>}
                {s.venue_address && <span className="truncate">{s.venue_address}</span>}
                <span>{formatLastSync(s.last_synced_at)}</span>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => toggle(s.id, !s.enabled)}
                disabled={busyId === s.id || pending}
                className="text-xs px-3 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
              >
                {s.enabled ? "Pause syncing" : "Resume syncing"}
              </button>
              <button
                onClick={() => remove(s.id)}
                disabled={busyId === s.id || pending}
                className="text-xs px-3 py-1.5 rounded-md border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950 disabled:opacity-50"
              >
                Disconnect
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatLastSync(lastSyncedAt: string | null): string {
  if (!lastSyncedAt) return "Not yet synced — happens a few times a day";
  const d = new Date(lastSyncedAt);
  if (isNaN(d.getTime())) return `Last synced ${lastSyncedAt}`;
  return `Last synced ${d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
}
