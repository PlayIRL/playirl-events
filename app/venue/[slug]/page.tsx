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
import { resolveEventImage, resolveVenueImage } from "@/lib/event-image";
import { SITE_URL } from "@/lib/config";
import DayCard from "@/app/day-card";
import Reveal from "@/app/reveal";
import { VenueSubscribeButton } from "@/app/radius-selector";

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

  // Hero photo for this venue — same cascade as event pages: venue_defaults
  // photo → static map → nothing. We skip the universal placeholder here so a
  // venue with no real image just keeps the existing text-only header.
  const hero = resolveVenueImage({
    name: venue.name,
    latitude: venue.latitude,
    longitude: venue.longitude,
  });
  const heroIsPhoto = hero?.fit === "cover";
  const heroIsMap = hero?.kind === "map";

  // Inline map below the address — only when the hero isn't already a map,
  // so we don't render two maps. Google Maps Embed only; if the key isn't
  // configured we render no inline map at all.
  const hasCoords = venue.latitude != null && venue.longitude != null;
  const placeQuery = venue.address
    ? `${venue.name}, ${venue.address}`
    : venue.name || null;
  const googleEmbedKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;
  let mapEmbedSrc: string | null = null;
  if (googleEmbedKey && (placeQuery || hasCoords)) {
    const q = placeQuery ?? `${venue.latitude},${venue.longitude}`;
    mapEmbedSrc = `https://www.google.com/maps/embed/v1/place?key=${googleEmbedKey}&q=${encodeURIComponent(q)}&zoom=15`;
  }
  const showInlineMap = !heroIsMap && Boolean(mapEmbedSrc);

  return (
    <main className="w-full max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6 anim-fade-in">
        <Link href="/" className="text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:underline">
          &larr; Back to PlayIRL.GG
        </Link>
      </div>

      {hero && (
        <div
          className={`relative aspect-video overflow-hidden rounded-md mb-6 anim-fade-in-up border border-neutral-100 dark:border-white/8 ${heroIsPhoto ? "" : "bg-neutral-50"}`}
          style={{ "--delay": "30ms" } as React.CSSProperties}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hero.url}
            alt={venue.name}
            className={`w-full h-full ${heroIsPhoto ? "object-cover" : "object-contain p-6"}`}
          />
          {heroIsPhoto && (
            <div className="absolute inset-0 bg-gradient-to-t from-white dark:from-[#0c1220] via-transparent to-transparent pointer-events-none" />
          )}
        </div>
      )}

      <header className="mb-8 anim-fade-in-up">
        <p className="text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 mb-2">
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
              className="text-neutral-900 dark:text-white hover:underline"
            >
              {new URL(venue.store_url).hostname.replace(/^www\./, "")} ↗
            </a>
          </p>
        )}
        {showInlineMap && mapEmbedSrc && (
          <iframe
            src={mapEmbedSrc}
            title={`Map of ${venue.name}`}
            className="w-full aspect-[3/2] rounded-md border border-neutral-100 dark:border-white/8 mt-4"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        )}
      </header>

      <Reveal className="mb-4 flex items-center justify-between gap-3" delay={60}>
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          ({events.length}) Upcoming events
        </h2>
        <div className="shrink-0">
          <VenueSubscribeButton venueName={venue.name} />
        </div>
      </Reveal>

      {events.length === 0 ? (
        <Reveal className="text-center py-12 border border-dashed border-neutral-200 dark:border-white/10 rounded-md" delay={80}>
          <p className="text-3xl mb-2">{"🎴"}</p>
          <p className="text-neutral-500 dark:text-neutral-400 text-sm">
            No upcoming events at this venue right now.
          </p>
          <p className="text-neutral-500 dark:text-neutral-400 text-xs mt-1">
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
