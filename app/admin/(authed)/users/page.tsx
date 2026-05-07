"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import RoleBadge from "../../_components/RoleBadge";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "organizer" | "user";
  suspended: 0 | 1;
  event_count: number;
  created_at: string;
  last_login_at: string | null;
}

const ROLE_FILTERS = ["all", "admin", "organizer", "user"] as const;

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState<(typeof ROLE_FILTERS)[number]>("all");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (roleFilter !== "all") params.set("role", roleFilter);
    if (q) params.set("q", q);
    const res = await fetch(`/api/admin/users?${params.toString()}`);
    setUsers(res.ok ? await res.json() : []);
    setLoading(false);
  }, [roleFilter, q]);

  useEffect(() => { load(); }, [load]);

  async function changeRole(id: string, role: string) {
    await fetch(`/api/admin/users/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    load();
  }

  async function toggleSuspend(user: UserRow) {
    await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suspended: !user.suspended }),
    });
    load();
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      <h1 className="text-2xl font-[family-name:var(--font-ultra)] font-bold text-neutral-900 dark:text-neutral-100 mb-6">
        Users
      </h1>

      <div className="flex flex-wrap gap-2 items-center mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or email…"
          className="px-3 py-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 min-w-[220px]"
        />
        <label className="text-xs text-neutral-600 dark:text-neutral-400 flex items-center gap-1">
          <span>Role:</span>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
            className="text-sm px-2 py-1 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
          >
            {ROLE_FILTERS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
      </div>

      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
        {loading ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400 p-6">Loading…</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400 p-6 text-center">
            No users yet. They'll appear here after the first OAuth or magic-link sign-in.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-800 text-xs text-neutral-500 dark:text-neutral-400">
              <tr>
                <th className="text-left px-3 py-2">User</th>
                <th className="text-left px-3 py-2">Role</th>
                <th className="text-left px-3 py-2 hidden md:table-cell">Events</th>
                <th className="text-left px-3 py-2 hidden lg:table-cell">Last login</th>
                <th className="text-right px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {users.map((u) => (
                <tr key={u.id} className={`hover:bg-neutral-50 dark:hover:bg-neutral-800/50 ${u.suspended ? "opacity-50" : ""}`}>
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium text-neutral-900 dark:text-neutral-100">{u.name ?? <em className="text-neutral-400">(no name)</em>}</div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">{u.email}</div>
                    {u.suspended === 1 && <div className="text-xs text-red-600 dark:text-red-400 mt-0.5">Suspended</div>}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex items-center gap-2">
                      <RoleBadge role={u.role} />
                      <select
                        value={u.role}
                        onChange={(e) => changeRole(u.id, e.target.value)}
                        className="text-xs px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                      >
                        <option value="user">user</option>
                        <option value="organizer">organizer</option>
                        <option value="admin">admin</option>
                      </select>
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top hidden md:table-cell text-neutral-600 dark:text-neutral-400">
                    {u.event_count}
                  </td>
                  <td className="px-3 py-2 align-top hidden lg:table-cell text-xs text-neutral-500 dark:text-neutral-400">
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 align-top text-right whitespace-nowrap">
                    <Link
                      href={`/admin/users/${encodeURIComponent(u.id)}`}
                      className="text-xs text-amber-700 dark:text-amber-400 hover:underline mr-3"
                    >
                      Details
                    </Link>
                    <button
                      onClick={() => toggleSuspend(u)}
                      className="text-xs text-red-600 dark:text-red-400 hover:underline"
                    >
                      {u.suspended ? "Restore" : "Suspend"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
