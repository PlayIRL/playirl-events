// /venue/{slug} — public page listing all upcoming events at one venue.
//
// Why this page exists:
//   - Discovery: a player searching "Top Deck Games Cherry Hill MTG"
//     deserves to land on PlayIRL with a venue page rather than the
//     homepage filter bar.
//   - SEO compounding: at nationwide scale ~3,000 LGSes each get an
//     indexable URL, included in the sitemap.
//   - Density: an organizer who runs an event series at one store can
//     send people one stable URL ("playirl.gg/venue/cryptid-toys-and-games")
//     instead of asking them to filter the homepage by location.
//
// Slug-resolved at request time via lib/venues.ts findVenueBySlug. Slugs
// are derived from venue names (kebab-case) — no ambiguity in practice
// for current data; collision handling picks the highest-usage venue.
//
// Visibility: this page only lists `active`/`pinned` events with
// `visibility=public` and not cancelled. Same chokepoint as the homepage.
// Skipped, pending, unlisted, and private events never appear here.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findVenueBySlug } from "@/lib/venues";
import { getEventsForVenue } from "@/lib/events";
import { getCurrentUser } from "@/lib/session";
import { getSavedEventIds } from "@/lib/event-saves";
import { resolveEventImage } from "@/lib/event-image";
import { SITE_URL } from "@/lib/config";
import DayCard from "@/app/day-card";
import Reveal from "@/app/reveal";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { slug } = await params;
  const venue = findVenueBySlug(decodeURIComponent(slug));
  if (!venue) return {};

  const events = getEventsForVenue(venue.name);
  const url = `${SITE_URL}/venue/${encodeURIComponent(slug)}`;
  const title = `${venue.name} — MTG Events`;
  const description = events.length > 0
    ? `${events.length} upcoming MTG event${events.length === 1 ? "" : "s"} at ${venue.name}${venue.address ? `, ${venue.address}` : ""}.`
    : `MTG events at ${venue.name}${venue.address ? `, ${venue.address}` : ""}.`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

function dayHeadingLabel(dateStr: string, todayStr: string, tomorrowStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
  const monthDay = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (dateStr === todayStr) return `Today · ${weekday}, ${monthDay}`;
  if (dateStr === tomorrowStr) return `Tomorrow · ${weekday}, ${monthDay}`;
  return `${weekday}, ${monthDay}`;
}

export default async function VenuePage({ params }: RouteParams) {
  const { slug } = await params;
  const venue = findVenueBySlug(decodeURIComponent(slug));
  if (!venue) notFound();

  const events = getEventsForVenue(venue.name);
  const user = await getCurrentUser();
  const signedIn = !!user && !user.suspended;
  const isAdmin = signedIn && user?.role === "admin";
  const savedEventIds = signedIn && user ? getSavedEventIds(user.id) : new Set<string>();

  // Group by date so DayCard can render the same way the homepage does —
  // visual consistency for a returning user.
  const enriched = events.map((ev) => {
    const img = resolveEventImage(ev);
    return { ...ev, imageUrl: img.url, imageFit: img.fit };
  });
  const grouped: Record<string, typeof enriched> = {};
  for (const ev of enriched) {
    if (!grouped[ev.date]) grouped[ev.date] = [];
    grouped[ev.date].push(ev);
  }

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const tomorrowStr = new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const mapsHref = venue.address
    ? `https://maps.google.com/?q=${encodeURIComponent(venue.address)}`
    : null;

  return (
    <main className="w-full max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6 anim-fade-in">
        <Link href="/" className="text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:underline">
          &larr; Back to PlayIRL.GG
        </Link>
      </div>

      <header className="mb-8 anim-fade-in-up">
        <p className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 mb-2">
          Venue
        </p>
        <h1 className="text-2xl sm:text-3xl font-[family-name:var(--font-ultra)] font-bold text-neutral-900 dark:text-white mb-2">
          {venue.name}
        </h1>
        {venue.address && (
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {mapsHref ? (
              <a
                href={mapsHref}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-neutral-900 dark:hover:text-white hover:underline"
              >
                {venue.address}
              </a>
            ) : (
              venue.address
            )}
          </p>
        )}
        {venue.store_url && (
          <p className="text-sm mt-1">
            <a
              href={venue.store_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-700 dark:text-amber-400 hover:underline"
            >
              {new URL(venue.store_url).hostname.replace(/^www\./, "")} ↗
            </a>
          </p>
        )}
      </header>

      <Reveal className="mb-4 flex items-baseline justify-between" delay={60}>
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          Upcoming events
        </h2>
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {events.length} {events.length === 1 ? "event" : "events"}
        </span>
      </Reveal>

      {events.length === 0 ? (
        <Reveal className="text-center py-12 border border-dashed border-neutral-200 dark:border-white/10 rounded-xl" delay={80}>
          <p className="text-3xl mb-2">{"🎴"}</p>
          <p className="text-neutral-500 dark:text-neutral-400 text-sm">
            No upcoming events at this venue right now.
          </p>
          <p className="text-neutral-400 dark:text-neutral-500 text-xs mt-1">
            Check back soon — new events appear after each daily scrape.
          </p>
        </Reveal>
      ) : (
        <div className="space-y-2">
          {Object.entries(grouped).map(([date, dayEvents], i) => {
            const d = new Date(date + "T12:00:00");
            return (
              <DayCard
                key={date}
                date={date}
                weekday={d.toLocaleDateString("en-US", { weekday: "long" })}
                isToday={date === todayStr}
                isPast={date < todayStr}
                events={dayEvents}
                headingLabel={dayHeadingLabel(date, todayStr, tomorrowStr)}
                staggerBase={Math.min(i * 60, 120)}
                signedIn={signedIn}
                isAdmin={isAdmin}
                savedEventIds={savedEventIds}
              />
            );
          })}
        </div>
      )}
    </main>
  );
}
