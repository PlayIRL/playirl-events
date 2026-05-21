import Link from "next/link";
import {
  listRecentNotifications,
  type AdminNotification,
  type AdminNotificationType,
} from "@/lib/admin-notifications";
import MarkAllReadButton from "./MarkAllReadButton";

// Server component: queries the most-recent notifications + renders them.
// The "Mark all as read" button is a thin client component that PATCHes the
// API and refreshes the route — keeps this component RSC-friendly.

const TYPE_LABEL: Record<AdminNotificationType, string> = {
  signup: "signup",
  account_linked: "linked",
  discord_guild_connected: "guild",
  discord_sub_created: "channel sub",
  events_tab_sub_created: "events-tab",
  sub_disabled: "disabled",
  event_submitted: "event",
};

const TYPE_PILL_CLASS: Record<AdminNotificationType, string> = {
  signup: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  account_linked: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  discord_guild_connected: "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  discord_sub_created: "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  events_tab_sub_created: "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  sub_disabled: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  event_submitted: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
};

function relativeTime(ts: string): string {
  const d = new Date(ts.includes("T") ? ts : ts + " UTC");
  if (Number.isNaN(d.getTime())) return ts;
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return d.toISOString().slice(0, 10);
}

function NotificationItem({ n }: { n: AdminNotification }) {
  const unread = !n.seenInAdminAt;
  const pill = TYPE_PILL_CLASS[n.type] ?? "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300";
  const body = (
    <div className="flex items-start gap-3 py-2.5">
      <div className="flex-shrink-0 w-1.5 self-stretch flex items-center justify-center" aria-hidden>
        {unread && (
          <span className="block w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span
            className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md ${pill}`}
          >
            {TYPE_LABEL[n.type] ?? n.type}
          </span>
          {n.severity === "warn" && (
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              warn
            </span>
          )}
          <span
            className={`text-sm truncate ${
              unread
                ? "font-medium text-neutral-900 dark:text-neutral-100"
                : "text-neutral-700 dark:text-neutral-300"
            }`}
          >
            {n.title}
          </span>
          <span className="text-[11px] text-neutral-400 dark:text-neutral-500 ml-auto whitespace-nowrap">
            {relativeTime(n.createdAt)}
          </span>
        </div>
        {n.subtitle && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">
            {n.subtitle}
          </p>
        )}
      </div>
    </div>
  );

  if (n.href) {
    return (
      <Link
        href={n.href}
        className="block px-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition rounded-md -mx-1"
      >
        {body}
      </Link>
    );
  }
  return <div className="px-3">{body}</div>;
}

export default function RecentActivity() {
  const items = listRecentNotifications(25);
  const unreadCount = items.filter((n) => !n.seenInAdminAt).length;

  return (
    <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md p-5 mb-6">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
            Recent activity
          </h2>
          {unreadCount > 0 && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-600 text-white dark:bg-emerald-500">
              {unreadCount} new
            </span>
          )}
        </div>
        {unreadCount > 0 && <MarkAllReadButton />}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No activity yet. As users sign up and connect features, events will show up here.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800 -mx-2">
          {items.map((n) => (
            <li key={n.id}>
              <NotificationItem n={n} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
