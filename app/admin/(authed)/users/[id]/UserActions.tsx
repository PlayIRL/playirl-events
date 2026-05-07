"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function UserActions({
  user,
  sessionCount,
}: {
  user: { id: string; role: string; suspended: boolean; suspended_reason: string };
  sessionCount: number;
}) {
  const router = useRouter();
  const [role, setRole] = useState(user.role);
  const [busy, setBusy] = useState(false);
  const [showSuspend, setShowSuspend] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function saveRole() {
    setBusy(true);
    await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    setBusy(false);
    router.refresh();
  }

  async function submitSuspend() {
    if (!reason.trim()) {
      setError("Reason is required.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suspended: true, suspended_reason: reason.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Couldn't suspend. Try again.");
      return;
    }
    setShowSuspend(false);
    setReason("");
    router.refresh();
  }

  async function unsuspend() {
    if (!confirm("Restore this user's access?")) return;
    setBusy(true);
    await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suspended: false }),
    });
    setBusy(false);
    router.refresh();
  }

  async function revokeSessions() {
    if (!confirm(`Revoke all ${sessionCount} session(s)?`)) return;
    setBusy(true);
    await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/sessions`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 items-center text-sm">
        <label className="flex items-center gap-2">
          <span className="text-xs text-neutral-500 dark:text-neutral-400">Change role:</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="text-sm px-2 py-1 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
          >
            <option value="user">user</option>
            <option value="organizer">organizer</option>
            <option value="admin">admin</option>
          </select>
          <button
            onClick={saveRole}
            disabled={busy || role === user.role}
            className="text-xs px-3 py-1 rounded-md border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
          >
            Save
          </button>
        </label>

        <button
          onClick={revokeSessions}
          disabled={busy || sessionCount === 0}
          className="text-xs px-3 py-1 rounded-md border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
        >
          Revoke sessions ({sessionCount})
        </button>

        {user.suspended ? (
          <button
            onClick={unsuspend}
            disabled={busy}
            className="text-xs px-3 py-1 rounded-md border border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950 disabled:opacity-50"
          >
            Restore access
          </button>
        ) : (
          <button
            onClick={() => setShowSuspend((v) => !v)}
            disabled={busy}
            className="text-xs px-3 py-1 rounded-md border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950 disabled:opacity-50"
          >
            {showSuspend ? "Cancel" : "Suspend user…"}
          </button>
        )}
      </div>

      {user.suspended && user.suspended_reason && (
        <div className="text-xs bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md px-3 py-2">
          <div className="text-red-700 dark:text-red-400 font-semibold text-[10px]">
            Suspend reason
          </div>
          <div className="text-red-900 dark:text-red-200 mt-0.5">{user.suspended_reason}</div>
        </div>
      )}

      {showSuspend && !user.suspended && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md p-3 space-y-2">
          <label className="block">
            <span className="block text-xs text-red-700 dark:text-red-400 font-semibold mb-1">
              Reason (required — shown in the audit log)
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. spam submissions, abusive messaging, bot-like behavior"
              rows={2}
              className="w-full text-sm px-2 py-1.5 border border-red-300 dark:border-red-800 rounded-md bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400"
            />
          </label>
          {error && <p className="text-xs text-red-700 dark:text-red-400">{error}</p>}
          <p className="text-xs text-red-800 dark:text-red-300">
            Suspending revokes active sessions immediately.
          </p>
          <button
            onClick={submitSuspend}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
          >
            Confirm suspend
          </button>
        </div>
      )}
    </div>
  );
}
