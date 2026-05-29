import Link from "next/link";
import { headers } from "next/headers";
import { requireRole } from "@/lib/session";
import { getSavedEvents, getSavedEventIds } from "@/lib/event-saves";
import { resolveEventImage } from "@/lib/event-image";
import { getServerCountry, getServerLocale } from "@/lib/locale";
import { preferredDistanceUnit } from "@/lib/distance";
import { t } from "@/lib/i18n";
import DayCard from "../../../day-card";
import SubpageShell from "../_components/SubpageShell";

export const dynamic = "force-dynamic";

function dayHeadingLabel(dateStr: string, todayStr: string, tomorrowStr: string, locale: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const weekday = d.toLocaleDateString(locale, { weekday: "long" });
  const monthDay = d.toLocaleDateString(locale, { month: "short", day: "numeric" });
  if (dateStr === todayStr) return `${t("homepage.today", undefined, locale)} · ${weekday}, ${monthDay}`;
  if (dateStr === tomorrowStr) return `${t("homepage.tomorrow", undefined, locale)} · ${weekday}, ${monthDay}`;
  return `${weekday}, ${monthDay}`;
}

export default async function SavedEventsPage() {
  const user = await requireRole(["user", "organizer", "admin"]);
  const requestHeaders = await headers();
  const locale = getServerLocale(requestHeaders);
  const distanceUnit = preferredDistanceUnit(getServerCountry(requestHeaders));
  const events = getSavedEvents(user.id);
  const savedIds = getSavedEventIds(user.id);

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const tomorrowStr = new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const enriched = events.map((ev) => {
    const img = resolveEventImage(ev);
    return { ...ev, imageUrl: img.url, imageFit: img.fit };
  });
  const upcoming = enriched.filter((e) => e.date >= todayStr);
  const past = enriched.filter((e) => e.date < todayStr);

  const groupedUpcoming: Record<string, typeof enriched> = {};
  for (const ev of upcoming) (groupedUpcoming[ev.date] ||= []).push(ev);

  return (
    <SubpageShell
      title="Saved events"
      description={
        <>
          Events you've starred. Tap the star on any card in{" "}
          <Link href="/account" className="text-neutral-900 dark:text-white hover:underline">
            your feed
          </Link>{" "}
          to add more.
        </>
      }
    >
      {upcoming.length === 0 && past.length === 0 ? (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md p-8 text-center">
          <p className="text-4xl mb-3">⭐️</p>
          <p className="text-neutral-500 dark:text-neutral-400 text-sm">You haven't saved any events yet.</p>
          <Link href="/account" className="inline-block mt-3 text-sm text-neutral-900 dark:text-white hover:underline">
            Browse your feed →
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {upcoming.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-base font-extrabold tracking-tight text-neutral-900 dark:text-neutral-100 mb-3">
                Upcoming ({upcoming.length})
              </h2>
              {Object.entries(groupedUpcoming).map(([date, dayEvents], i) => {
                const d = new Date(date + "T12:00:00");
                return (
                  <DayCard
                    key={date}
                    date={date}
                    weekday={d.toLocaleDateString(locale, { weekday: "long" })}
                    isToday={date === todayStr}
                    isPast={false}
                    events={dayEvents}
                    headingLabel={dayHeadingLabel(date, todayStr, tomorrowStr, locale)}
                    staggerBase={Math.min(i * 60, 120)}
                    signedIn
                    isAdmin={user.role === "admin"}
                    savedEventIds={savedIds}
                    distanceUnit={distanceUnit}
                  />
                );
              })}
            </section>
          )}

          {past.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-base font-extrabold tracking-tight text-neutral-500 dark:text-neutral-400 mb-2">
                Past ({past.length})
              </h2>
              <ul className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md divide-y divide-neutral-100 dark:divide-neutral-800">
                {past.map((ev) => (
                  <li key={ev.id} className="px-4 py-2.5 flex items-center gap-3 opacity-70">
                    <span className="text-xs text-neutral-400 w-20 shrink-0">{ev.date}</span>
                    <Link
                      href={`/event/${encodeURIComponent(ev.id)}`}
                      className="text-sm text-neutral-700 dark:text-neutral-300 hover:underline flex-1 truncate"
                    >
                      {ev.title}
                    </Link>
                    <span className="text-xs text-neutral-500 dark:text-neutral-400 truncate max-w-[200px]">
                      {ev.location}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </SubpageShell>
  );
}
