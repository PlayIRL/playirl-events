import Link from "next/link";
import { requireRole } from "@/lib/session";
import { getSavedEvents } from "@/lib/event-saves";
import { getEventsByOwner } from "@/lib/events";
import { listSourcesForUser } from "@/lib/user-sources";
import { listSubscriptionsManageableByUser } from "@/lib/discord-subscriptions";
import { botInviteUrl } from "@/lib/discord-bot";
import SubpageShell from "./_components/SubpageShell";
import LogoutButton from "./_components/LogoutButton";
import SourcesList from "./sources/SourcesList";
import GetStartedCard from "./sources/GetStartedCard";
import SubscriptionsList from "./discord/SubscriptionsList";
import AddSubscriptionForm from "./discord/AddSubscriptionForm";

function CreateEventAction() {
  return (
    <Link
      href="/account/events/new"
      className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition cursor-pointer"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
      </svg>
      Create event
    </Link>
  );
}

export const dynamic = "force-dynamic";

type TabKey = "events" | "discord" | "admin";

interface NavCard {
  href: string;
  title: string;
  description: string;
}

const ADMIN_CARDS: NavCard[] = [
  { href: "/admin", title: "Admin portal", description: "Moderation, scrape stats, user management." },
];

export default async function AccountDashboard({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireRole(["user", "organizer", "admin"]);
  const params = await searchParams;
  const isAdmin = user.role === "admin";

  // Resolve the requested tab. Non-admins requesting ?tab=admin fall back to
  // events so a stale link doesn't render an empty page.
  const requested = params.tab as TabKey | undefined;
  const activeTab: TabKey =
    requested === "discord" ? "discord"
    : requested === "admin" && isAdmin ? "admin"
    : "events";

  return (
    <SubpageShell
      title="Account"
      description={
        <>
          Signed in as <span className="text-neutral-700 dark:text-neutral-200">{user.email}</span>
          {user.role !== "user" && (
            <> · <span className="text-neutral-700 dark:text-neutral-200">{user.role}</span></>
          )}
        </>
      }
      actions={<CreateEventAction />}
      hideChip
    >
      <TabNav active={activeTab} isAdmin={isAdmin} />

      {activeTab === "events" && (
        <EventsTab userId={user.id} />
      )}

      {activeTab === "discord" && (
        <DiscordTab userId={user.id} />
      )}

      {activeTab === "admin" && isAdmin && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ADMIN_CARDS.map((c) => <NavTile key={c.href} {...c} />)}
        </div>
      )}

      <section className="pt-6">
        <LogoutButton />
      </section>
    </SubpageShell>
  );
}

function TabNav({ active, isAdmin }: { active: TabKey; isAdmin: boolean }) {
  const tabs: { key: TabKey; label: string }[] = [
    { key: "events", label: "Events" },
    { key: "discord", label: "Discord" },
    ...(isAdmin ? [{ key: "admin" as TabKey, label: "Admin" }] : []),
  ];
  return (
    <div className="flex gap-1 border-b border-neutral-200 dark:border-neutral-800 -mt-2">
      {tabs.map((t) => {
        const href = t.key === "events" ? "/account" : `/account?tab=${t.key}`;
        const isActive = active === t.key;
        return (
          <Link
            key={t.key}
            href={href}
            scroll={false}
            className={`px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition ${
              isActive
                ? "border-neutral-900 dark:border-white text-neutral-900 dark:text-white"
                : "border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

async function EventsTab({ userId }: { userId: string }) {
  const today = new Date().toISOString().slice(0, 10);

  const saved = getSavedEvents(userId);
  const savedUpcoming = saved.filter((e) => e.date >= today);

  const mine = getEventsByOwner(userId);
  const mineUpcoming = mine.filter((e) => e.date >= today && e.status !== "skip");

  return (
    <div className="space-y-8">
      <EventListSection
        title="Saved events"
        emptyMessage="No saved events yet. Tap the star on any event card to save it."
        emptyHref="/"
        emptyHrefLabel="Browse the feed →"
        viewAllHref="/account/saved"
        events={savedUpcoming}
        totalCount={savedUpcoming.length}
      />

      <EventListSection
        title="My submitted events"
        emptyMessage="You haven't submitted any events yet."
        emptyHref="/account/events/new"
        emptyHrefLabel="Submit your first event →"
        viewAllHref="/account/events"
        events={mineUpcoming.map((e) => ({ id: e.id, title: e.title, date: e.date, time: e.time, location: e.location, cost: e.cost, status: e.status }))}
        totalCount={mineUpcoming.length}
        showStatus
      />
    </div>
  );
}

interface ListEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  cost: string;
  status?: string;
}

function EventListSection({
  title,
  events,
  totalCount,
  emptyMessage,
  emptyHref,
  emptyHrefLabel,
  viewAllHref,
  showStatus = false,
}: {
  title: string;
  events: ListEvent[];
  totalCount: number;
  emptyMessage: string;
  emptyHref: string;
  emptyHrefLabel: string;
  viewAllHref: string;
  showStatus?: boolean;
}) {
  const PREVIEW_LIMIT = 5;
  const visible = events.slice(0, PREVIEW_LIMIT);
  const moreCount = totalCount - visible.length;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          {title} {totalCount > 0 && <span className="text-neutral-500 dark:text-neutral-400 font-normal">· {totalCount}</span>}
        </h2>
        {totalCount > 0 && (
          <Link href={viewAllHref} className="text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition">
            View all →
          </Link>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 dark:border-white/15 bg-white dark:bg-neutral-900 p-6 text-center">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{emptyMessage}</p>
          <Link href={emptyHref} className="inline-block mt-2 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:text-neutral-900 dark:hover:text-white transition">
            {emptyHrefLabel}
          </Link>
        </div>
      ) : (
        <ul className="rounded-lg border border-neutral-200 dark:border-white/15 bg-white dark:bg-neutral-900 divide-y divide-neutral-100 dark:divide-white/10 overflow-clip">
          {visible.map((ev) => (
            <li key={ev.id}>
              <Link
                href={`/event/${encodeURIComponent(ev.id)}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition"
              >
                <span className="text-xs text-neutral-500 dark:text-neutral-400 w-20 shrink-0 tabular-nums">
                  {formatShortDate(ev.date)}
                  {ev.time && <span className="block text-[11px] opacity-70">{ev.time}</span>}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">{ev.title}</span>
                  {ev.location && (
                    <span className="block text-xs text-neutral-500 dark:text-neutral-400 truncate">{ev.location}</span>
                  )}
                </span>
                {showStatus && ev.status && ev.status !== "active" && (
                  <span className="shrink-0 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                    {ev.status}
                  </span>
                )}
                {!showStatus && ev.cost && (
                  <span className="shrink-0 text-xs text-neutral-700 dark:text-neutral-300">{ev.cost}</span>
                )}
              </Link>
            </li>
          ))}
          {moreCount > 0 && (
            <li>
              <Link
                href={viewAllHref}
                className="block px-4 py-3 text-center text-xs text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition"
              >
                View {moreCount} more →
              </Link>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function formatShortDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

async function DiscordTab({ userId }: { userId: string }) {
  const sources = listSourcesForUser(userId);
  const subs = listSubscriptionsManageableByUser(userId);
  const inviteUrl = botInviteUrl();

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <header>
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Sync events from Discord</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Trade events with other MTG communities. Share yours out, pull theirs in.
          </p>
        </header>
        {!inviteUrl ? (
          <DiscordEmptyPanel
            icon="🔌"
            heading="Community connections aren't open yet"
            body="Set DISCORD_BOT_CLIENT_ID in your environment to enable the connect-your-Discord flow."
          />
        ) : sources.length > 0 ? (
          <>
            <SourcesList sources={sources} />
            <GetStartedCard inviteUrl={inviteUrl} compact />
          </>
        ) : (
          <GetStartedCard inviteUrl={inviteUrl} />
        )}
      </section>

      <section className="space-y-4">
        <header className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Post events to Discord</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
              Schedule recurring event posts to your Discord channels.
            </p>
          </div>
          <AddSubscriptionForm inviteUrl={inviteUrl} />
        </header>
        {subs.length > 0 ? (
          <SubscriptionsList subscriptions={subs} />
        ) : (
          <DiscordEmptyPanel
            icon="📅"
            heading="No auto-posts yet"
            body="Click + New auto-post to schedule a recurring event digest in one of your Discord channels."
          />
        )}
      </section>
    </div>
  );
}

function DiscordEmptyPanel({
  icon,
  heading,
  body,
  cta,
}: {
  icon: string;
  heading: string;
  body: string;
  cta?: { href: string; label: string; external?: boolean };
}) {
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-white/15 bg-white dark:bg-neutral-900 p-6 text-center space-y-2">
      <p className="text-3xl">{icon}</p>
      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{heading}</p>
      <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-md mx-auto">{body}</p>
      {cta && (
        <a
          href={cta.href}
          target={cta.external ? "_blank" : undefined}
          rel={cta.external ? "noopener noreferrer" : undefined}
          className="inline-block mt-2 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:text-neutral-900 dark:hover:text-white transition"
        >
          {cta.label} →
        </a>
      )}
    </div>
  );
}

function NavTile({ href, title, description }: NavCard) {
  return (
    <Link
      href={href}
      className="group block p-4 rounded-lg border border-neutral-200 dark:border-white/15 bg-white dark:bg-neutral-900 hover:border-neutral-400 dark:hover:border-white/25 hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{title}</span>
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-200 transition" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">{description}</p>
    </Link>
  );
}
