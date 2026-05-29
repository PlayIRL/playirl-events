"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Two-group sidebar: content management (events / venues / users — what
// admins touch day-to-day) then operational settings (scrapers / config /
// integrations — touched rarely). The visual divider between groups makes
// the daily-driver section feel like the "home" of the admin app and the
// settings feel like the back-room they actually are.
const NAV: ({ href: string; label: string } | { divider: true })[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/events/pending", label: "Pending review" },
  { href: "/admin/venues", label: "Venues" },
  { href: "/admin/users", label: "Users" },
  { divider: true },
  { href: "/admin/scrapers", label: "Scrapers" },
  { href: "/admin/config", label: "Site config" },
  { href: "/admin/discord-servers", label: "Discord servers" },
  { href: "/admin/flags", label: "Feature flags" },
];

export default function Sidebar({
  pendingCount = 0,
  unseenActivity = 0,
}: {
  pendingCount?: number;
  unseenActivity?: number;
}) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 p-3" aria-label="Admin">
      {NAV.map((item, idx) => {
        if ("divider" in item) {
          return (
            <div
              key={`divider-${idx}`}
              className="my-2 border-t border-neutral-200 dark:border-white/10"
              aria-hidden="true"
            />
          );
        }
        const active =
          item.href === "/admin"
            ? pathname === "/admin"
            : item.href === "/admin/events"
              ? pathname === "/admin/events" || (pathname.startsWith("/admin/events/") && !pathname.startsWith("/admin/events/pending"))
              : pathname.startsWith(item.href);
        // Two badge slots:
        //   - Pending review: count of pending events (admin-action queue)
        //   - Dashboard: count of unseen admin activity (signups, connects, ...)
        // Each link can show at most one badge; the active/inactive coloring
        // matches whichever slot fires.
        const badgeCount =
          item.href === "/admin/events/pending" && pendingCount > 0
            ? pendingCount
            : item.href === "/admin" && unseenActivity > 0
              ? unseenActivity
              : 0;
        const badgeIsActivity = item.href === "/admin" && unseenActivity > 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 py-2 rounded-md text-sm transition flex items-center justify-between gap-2 ${
              active
                ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white"
                : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
            }`}
          >
            <span>{item.label}</span>
            {badgeCount > 0 && (
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                  active
                    ? "bg-white/20 text-current"
                    : badgeIsActivity
                      ? "bg-emerald-600 text-white dark:bg-emerald-500"
                      : "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white"
                }`}
              >
                {badgeCount > 9 ? "9+" : badgeCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
