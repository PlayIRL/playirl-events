"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import RoleBadge from "../../_components/RoleBadge";
import StatCard from "../../_components/StatCard";
import { TableSkeleton } from "@/app/skeleton";

/**
 * /admin/users — paginated + filtered users listing with DB-wide stats.
 *
 * User table is small today (~hundreds) but the same pattern as
 * /admin/events scales it forward as the platform grows, and the stat
 * cards give a quick read on signup rate + role distribution that the
 * raw table doesn't surface.
 */

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

interface UserStats {
  total: number;
  byRole: Record<string, number>;
  suspended: number;
  signups_7d: number;
  signups_30d: number;
  loggedInEver: number;
}

interface UsersResponse {
  users: UserRow[];
  total: number;
  page: number;
  limit: number;
  stats?: UserStats;
}

const ROLE_FILTERS = ["all", "admin", "organizer", "user"] as const;
const PAGE_SIZE = 50;

function readUrlState() {
  if (typeof window === "undefined") {
    return { page: 1, role: "all", q: "" };
  }
  const p = new URLSearchParams(window.location.search);
  return {
    page: Math.max(1, Number(p.get("page") ?? "1") || 1),
    role: p.get("role") ?? "all",
    q: p.get("q") ?? "",
  };
}

export default function AdminUsersPage() {
  const [state, setState] = useState(readUrlState);
  const [data, setData] = useState<UsersResponse | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const p = new URLSearchParams();
    if (state.page !== 1) p.set("page", String(state.page));
    if (state.role !== "all") p.set("role", state.role);
    if (state.q) p.set("q", state.q);
    const next = p.toString() ? `?${p.toString()}` : window.location.pathname;
    window.history.replaceState(null, "", next);
  }, [state]);

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    p.set("page", String(state.page));
    p.set("limit", String(PAGE_SIZE));
    p.set("include_stats", "1");
    if (state.role !== "all") p.set("role", state.role);
    if (state.q) p.set("q", state.q);
    const res = await fetch(`/api/admin/users?${p.toString()}`);
    if (res.ok) {
      const json = (await res.json()) as UsersResponse;
      setData(json);
      if (json.stats) setStats(json.stats);
    }
    setLoading(false);
  }, [state]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  // Debounced search.
  const [searchInput, setSearchInput] = useState(state.q);
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== state.q) setState((s) => ({ ...s, q: searchInput, page: 1 }));
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  function update<K extends keyof typeof state>(key: K, value: typeof state[K]) {
    setState((s) => ({ ...s, [key]: value, page: key === "page" ? (value as number) : 1 }));
  }

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

  const users = data?.users ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const showingFrom = data && data.total > 0 ? (data.page - 1) * data.limit + 1 : 0;
  const showingTo = data ? Math.min(data.page * data.limit, data.total) : 0;

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      <div className="flex items-end justify-between mb-6 gap-3 flex-wrap">
        <h1 className="text-2xl font-[family-name:var(--font-ultra)] font-bold text-neutral-900 dark:text-neutral-100">
          Users
          {stats && (
            <span className="ml-3 text-base text-neutral-500 dark:text-neutral-400 font-normal">
              {stats.total.toLocaleString()} total
            </span>
          )}
        </h1>
      </div>

      {/* Role + activity stat cards. Clicking the role cards filters
          the table to that role; the signup cards are read-only since
          there's no time-range filter today. */}
      {stats && (
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <button onClick={() => update("role", "admin")} className="text-left">
            <StatCard label="Admins" value={(stats.byRole.admin ?? 0).toLocaleString()} />
          </button>
          <button onClick={() => update("role", "organizer")} className="text-left">
            <StatCard label="Organizers" value={(stats.byRole.organizer ?? 0).toLocaleString()} />
          </button>
          <button onClick={() => update("role", "user")} className="text-left">
            <StatCard label="Users" value={(stats.byRole.user ?? 0).toLocaleString()} />
          </button>
          <StatCard
            label="Suspended"
            value={stats.suspended.toLocaleString()}
            hint={stats.total > 0 ? `${((stats.suspended / stats.total) * 100).toFixed(1)}% of total` : undefined}
          />
        </section>
      )}

      {stats && (
        <section className="grid grid-cols-3 gap-3 mb-6">
          <StatCard label="Signups (7d)" value={stats.signups_7d.toLocaleString()} />
          <StatCard label="Signups (30d)" value={stats.signups_30d.toLocaleString()} />
          <StatCard
            label="Logged in ever"
            value={stats.loggedInEver.toLocaleString()}
            hint={stats.total > 0 ? `${((stats.loggedInEver / stats.total) * 100).toFixed(0)}% activation` : undefined}
          />
        </section>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center mb-3">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search name or email…"
          className="px-3 py-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 min-w-[220px]"
        />
        <label className="text-xs text-neutral-600 dark:text-neutral-400 flex items-center gap-1">
          <span>Role:</span>
          <select
            value={state.role}
            onChange={(e) => update("role", e.target.value)}
            className="text-sm px-2 py-1 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
          >
            {ROLE_FILTERS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        {(state.role !== "all" || state.q) && (
          <button
            onClick={() => setState({ page: 1, role: "all", q: "" })}
            className="text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 px-2 py-1"
          >
            Reset filters
          </button>
        )}
        <span className="ml-auto text-xs text-neutral-500 dark:text-neutral-400">
          {data && data.total > 0
            ? `Showing ${showingFrom.toLocaleString()}–${showingTo.toLocaleString()} of ${data.total.toLocaleString()}`
            : data ? "No matches" : ""}
        </span>
      </div>

      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md overflow-hidden">
        {loading && !data ? (
          <TableSkeleton rows={6} cols={5} />
        ) : users.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400 p-6 text-center">
            {state.q || state.role !== "all"
              ? "No users match this filter."
              : "No users yet. They'll appear here after the first OAuth or magic-link sign-in."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
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
                          className="text-xs px-2 py-1 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
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
                        className="text-xs text-neutral-900 dark:text-white hover:underline mr-3"
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
          </div>
        )}
      </div>

      {data && totalPages > 1 && (
        <nav className="flex items-center justify-center gap-1 mt-4 flex-wrap" aria-label="Pagination">
          <PageButton disabled={state.page <= 1} onClick={() => update("page", state.page - 1)}>← Prev</PageButton>
          {paginationWindow(state.page, totalPages).map((p, i) =>
            p === "…" ? (
              <span key={`gap-${i}`} className="px-2 text-neutral-400">…</span>
            ) : (
              <PageButton key={p} active={p === state.page} onClick={() => update("page", p as number)}>{p}</PageButton>
            ),
          )}
          <PageButton disabled={state.page >= totalPages} onClick={() => update("page", state.page + 1)}>Next →</PageButton>
        </nav>
      )}
    </div>
  );
}

function paginationWindow(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const window: (number | "…")[] = [1];
  const start = Math.max(2, current - 2);
  const end = Math.min(total - 1, current + 2);
  if (start > 2) window.push("…");
  for (let i = start; i <= end; i++) window.push(i);
  if (end < total - 1) window.push("…");
  window.push(total);
  return window;
}

function PageButton({ children, onClick, disabled, active }: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-xs px-2.5 py-1 rounded-md border transition ${
        active
          ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
          : "border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}
