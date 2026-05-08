"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/events/pending", label: "Pending review" },
  { href: "/admin/venues", label: "Venues" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/flags", label: "Feature flags" },
  { href: "/admin/config", label: "Site config" },
  { href: "/admin/scrapers", label: "Scrapers" },
];

export default function Sidebar({ pendingCount = 0 }: { pendingCount?: number }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 p-3" aria-label="Admin">
      {NAV.map((item) => {
        const active =
          item.href === "/admin"
            ? pathname === "/admin"
            : item.href === "/admin/events"
              ? pathname === "/admin/events" || (pathname.startsWith("/admin/events/") && !pathname.startsWith("/admin/events/pending"))
              : pathname.startsWith(item.href);
        const showBadge = item.href === "/admin/events/pending" && pendingCount > 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 py-2 rounded-md text-sm transition flex items-center justify-between gap-2 ${
              active
                ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
            }`}
          >
            <span>{item.label}</span>
            {showBadge && (
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                  active
                    ? "bg-white/20 text-current"
                    : "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                }`}
              >
                {pendingCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
