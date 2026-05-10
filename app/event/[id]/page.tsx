import type { Metadata } from "next";
import { getEvent } from "@/lib/events";
import { getRsvpSummary, isPastEvent } from "@/lib/event-rsvps";
import { findInviteByToken, redeemInvite } from "@/lib/event-invites";
import { getCurrentUser } from "@/lib/session";
import { notFound } from "next/navigation";
import Link from "next/link";
import { formatEventTimeRange } from "@/lib/format-time";
import { resolveEventImage, hasRealEventImage } from "@/lib/event-image";
import { venueSlug } from "@/lib/venues";
import { SITE_URL } from "@/lib/config";
import {
  FORMAT_BADGE,
  FORMAT_BADGE_DEFAULT,
  SOURCE_LABELS,
} from "@/lib/format-style";
import ShareButton from "./share-button";
import RsvpButton from "./rsvp-button";
import HostActions from "./host-actions";
import WaitlistPromotedBanner from "./waitlist-promoted-banner";
import Reveal from "@/app/reveal";

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}


function DetailRow({ label, value, href }: { label: string; value: string; href?: string }) {
  if (!value) return null;
  return (
    <div className="py-3 border-b border-neutral-100 dark:border-white/8 last:border-0">
      <dt className="text-xs text-neutral-500 dark:text-neutral-400 mb-0.5">{label}</dt>
      <dd className="text-sm font-medium text-neutral-900 dark:text-neutral-200 break-words">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-neutral-900 dark:text-white hover:underline break-all">
            {value}
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
          </a>
        ) : value}
      </dd>
    </div>
  );
}

function clampDescription(text: string, max = 160): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1).trimEnd() + "…";
}

function buildEventDescription(ev: {
  format: string;
  location: string;
  date: string;
  time: string;
  timezone: string;
  cost: string;
  notes: string;
}): string {
  // Prefer the first sentence of host-written notes when present and useful;
  // otherwise compose from the structured fields so every event still gets
  // a meaningful preview snippet.
  if (ev.notes && ev.notes.trim().length > 0) {
    const firstSentence = ev.notes.split(/(?<=[.!?])\s+/)[0] ?? ev.notes;
    return clampDescription(firstSentence);
  }
  const timeRange = formatEventTimeRange(ev.date, ev.time, ev.timezone);
  const parts = [
    ev.format && `${ev.format} MTG`,
    ev.location && `at ${ev.location}`,
    formatDate(ev.date),
    timeRange,
    ev.cost,
  ].filter(Boolean);
  return clampDescription(parts.join(" · "));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const ev = getEvent(decodeURIComponent(id));
  if (!ev) return {};

  // Unlisted and private events must not leak title/notes/image into chat
  // previews. Return only a noindex hint and the bare site title.
  if (ev.visibility !== "public") {
    return {
      title: "PlayIRL.GG",
      robots: { index: false, follow: false },
    };
  }

  const titlePrefix = ev.cancelled_at ? "[Cancelled] " : "";
  const title = `${titlePrefix}${ev.title}${ev.format ? ` — ${ev.format}` : ""}`;
  const description = buildEventDescription(ev);
  const hero = resolveEventImage(ev);
  const url = `${SITE_URL}/event/${encodeURIComponent(ev.id)}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "article",
      images: [{ url: hero.url, alt: ev.title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [hero.url],
    },
  };
}

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ev = getEvent(decodeURIComponent(id));

  if (!ev) return notFound();

  // Visibility gate. Public events are always viewable. Unlisted events are
  // viewable by anyone with the URL (no auth, no token). Private events
  // require the viewer to be either the host, an admin, an RSVP'd user, or
  // someone presenting a valid invite token.
  const viewer = await getCurrentUser();
  const signedIn = !!viewer && !viewer.suspended;

  if (ev.visibility === "private") {
    const validToken = sp.token ? findInviteByToken(sp.token) : undefined;
    const tokenGrantsThisEvent = validToken && validToken.event_id === ev.id;
    const isOwnerOrAdmin =
      signedIn && (viewer!.role === "admin" || ev.owner_id === viewer!.id);
    const hasRsvp =
      signedIn && getRsvpSummary(ev.id, viewer!.id).myStatus !== null;
    if (!isOwnerOrAdmin && !hasRsvp && !tokenGrantsThisEvent) {
      return notFound();
    }
    // Audit: record the first redeemer of a token. Doesn't invalidate the
    // token — multi-use is intentional for "post the link in Discord" cases.
    if (tokenGrantsThisEvent && signedIn) redeemInvite(sp.token!, viewer!.id);
  }

  const hero = resolveEventImage(ev);
  const heroIsRealImage = hasRealEventImage(ev);
  const heroIsPhoto = hero.fit === "cover";
  // For non-cover images, give logos less padding than generic SVG icons.
  const heroPadding = heroIsPhoto ? "" : heroIsRealImage ? "p-6" : "p-12";

  // Show an inline map on the Address row whenever the hero isn't already
  // a map — otherwise we'd render the same view twice.
  //
  // Google Maps Embed only. Requires NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY in the
  // environment (free for the standard `place` mode; lock by HTTP referrer
  // in the Google Cloud Console). When the key isn't set we render no inline
  // map at all — non-Google providers (OSM/Mapbox/Leaflet) are intentionally
  // not used anywhere in this codebase. Google's old `?output=embed` URL is
  // blocked by X-Frame-Options on all origins now and can't be used as a
  // keyless fallback either.
  //
  // Important: prefer the address text when present. Some scraped events
  // (notably Discord-scraped ones) carry a guild-wide fallback lat/lng that
  // doesn't actually point at the venue, so Google geocoding the address is
  // far more reliable than blindly using the stored coordinates.
  const heroIsMap = hero.kind === "map";
  const hasCoords = ev.latitude != null && ev.longitude != null;
  const placeQuery = ev.address
    ? ev.location ? `${ev.location}, ${ev.address}` : ev.address
    : null;
  const googleEmbedKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;

  let mapEmbedSrc: string | null = null;
  if (googleEmbedKey && (placeQuery || hasCoords)) {
    const q = placeQuery ?? `${ev.latitude},${ev.longitude}`;
    mapEmbedSrc = `https://www.google.com/maps/embed/v1/place?key=${googleEmbedKey}&q=${encodeURIComponent(q)}&zoom=15`;
  }
  const showInlineMap = !heroIsMap && Boolean(mapEmbedSrc);

  // RSVP + host state. Cancellation locks RSVP changes (banner takes over
  // the action zone). Hosts get extra controls — cancel, manage invites.
  const rsvp = getRsvpSummary(ev.id, viewer?.id ?? null);
  const past = isPastEvent(ev.date);
  const cancelled = !!ev.cancelled_at;
  const rsvpEnabled = ev.rsvp_enabled === 1 && !cancelled;
  const isHost = signedIn && (viewer!.role === "admin" || ev.owner_id === viewer!.id);
  const myStatus =
    rsvp.myStatus === "going" ||
    rsvp.myStatus === "maybe" ||
    rsvp.myStatus === "waitlist"
      ? rsvp.myStatus
      : null;

  return (
    <main className="w-full max-w-2xl min-w-0 mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6 anim-fade-in">
        <Link href="/" className="text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:underline">
          &larr; Back
        </Link>
        <div className="flex items-center gap-2">
          {rsvpEnabled && (
            <RsvpButton
              eventId={ev.id}
              signedIn={signedIn}
              pastEvent={past}
              capacity={ev.capacity}
              initialStatus={myStatus}
              initialCounts={rsvp.counts}
              initialWaitlistPosition={rsvp.waitlistPosition}
            />
          )}
          <a
            href={`/calendar/event/${encodeURIComponent(ev.id)}`}
            download
            // Same chip style as ShareButton for visual parity. `download`
            // forces the browser to save rather than navigate, which is what
            // .ics files want — Calendar apps register as the default
            // handler on most desktops, so the file imports cleanly.
            className="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md bg-neutral-100 dark:bg-white/5 border border-neutral-100 dark:border-white/8 shadow-sm text-neutral-700 dark:text-neutral-300 text-sm font-medium hover:bg-neutral-200 dark:hover:bg-white/10 hover:text-neutral-900 dark:hover:text-white transition"
            title="Download a single-event .ics for your calendar app"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Add to calendar
          </a>
          <ShareButton title={ev.title} url={`${SITE_URL}/event/${encodeURIComponent(ev.id)}`} />
        </div>
      </div>

      {cancelled && (
        <div className="mb-6 rounded-md border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-4 py-3 anim-fade-in">
          <p className="text-sm font-medium text-red-800 dark:text-red-200">
            This event was cancelled by the host
            {ev.cancelled_at ? ` on ${ev.cancelled_at.slice(0, 10)}` : ""}.
          </p>
          <p className="text-xs text-red-700/80 dark:text-red-300/80 mt-1">
            All RSVPs have been marked cancelled. The event remains visible so
            attendees can confirm what happened.
          </p>
        </div>
      )}

      {/* Waitlist auto-promotion banner. Renders when the user's RSVP was
          flipped from waitlist→going by another user's cancellation and
          they haven't acknowledged it yet. The cancellation banner above
          takes precedence — if the event itself was cancelled, the
          promotion is moot. */}
      {!cancelled && rsvp.promotedAt && rsvp.myStatus === "going" && (
        <WaitlistPromotedBanner eventId={ev.id} />
      )}

      {ev.visibility !== "public" && !cancelled && (
        <div className="mb-6 rounded-md border border-neutral-200 dark:border-white/15 bg-neutral-50 dark:bg-white/5 px-4 py-2 text-xs text-neutral-600 dark:text-neutral-400 anim-fade-in">
          {ev.visibility === "unlisted"
            ? "Unlisted event — anyone with this link can view, but it won't appear in the public calendar."
            : "Private event — only invited guests can view."}
        </div>
      )}

      <div className="bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-white/8 rounded-md anim-fade-in-up" style={{ "--delay": "60ms" } as React.CSSProperties}>
        {/* Hero image — uploaded photo, scraped cover, venue default, or placeholder. */}
        {/* When the hero is a real photo or map (`object-cover`), no padding
            and no visible bg — the image fills edge-to-edge. When it's a
            letterboxed logo or icon, frame it with a light-gray "card" bg in
            both themes so logos with baked-in white backgrounds blend in;
            keeping a dark bg here in dark mode would frame them with a stark
            white-on-near-black halo. */}
        {/* Header — title + format pill above the hero photo so the
            event identity reads first and the visual is a supporting
            element. Border-b separates the header from the photo;
            rounded-t-md sits on the header now (used to be on the
            hero) since the header is the top-most child of the card. */}
        <div className="p-6 pb-4 space-y-3 rounded-t-md border-b border-neutral-100 dark:border-white/8">
          <span className={`inline-block px-3 py-1 rounded-sm text-xs font-bold ${FORMAT_BADGE[ev.format] || FORMAT_BADGE_DEFAULT}`}>
            {ev.format || "MTG"}
          </span>
          <h1 className="text-2xl font-[family-name:var(--font-ultra)] font-bold text-neutral-900 dark:text-white break-words">{ev.title}</h1>
        </div>

        {(() => {
          // The hero is the venue's visual identity — clicking it should take
          // the visitor to the venue page (all upcoming events at that store).
          // Only wrap in a link when there's a location to link to; otherwise
          // render the bare div.
          //
          // No `rounded-t-md` here anymore — the header above carries the
          // top-corner rounding of the card now. The image sits flush
          // edge-to-edge between the header and the details table.
          const heroInner = (
            <div className={`relative aspect-video overflow-hidden ${heroIsPhoto ? "" : "bg-neutral-50"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={hero.url}
                alt={ev.title}
                width={1200}
                height={675}
                className={`w-full h-full ${heroIsPhoto ? "object-cover" : "object-contain"} ${heroPadding}`}
                fetchPriority="high"
                decoding="async"
              />
              {heroIsPhoto && (
                <div className="absolute inset-0 bg-gradient-to-t from-white dark:from-[#0c1220] via-transparent to-transparent pointer-events-none" />
              )}
            </div>
          );
          return ev.location ? (
            <Link
              href={`/venue/${encodeURIComponent(venueSlug(ev.location))}`}
              className="block hover:opacity-95 transition-opacity"
              title={`View all events at ${ev.location}`}
            >
              {heroInner}
            </Link>
          ) : heroInner;
        })()}

        {/* Details table */}
        <Reveal delay={120}>
          <div className="px-6 pb-2 border-t border-neutral-100 dark:border-white/8">
            <dl>
              {/* Host row — primary link is the internal venue page (lists
                  all upcoming events here). The external store website
                  appears as a secondary link icon when present. Falls
                  back to the plain DetailRow when there's no location. */}
              {ev.location ? (
                <div className="py-3 border-b border-neutral-100 dark:border-white/8 last:border-0">
                  <dt className="text-xs text-neutral-500 dark:text-neutral-400 mb-0.5">Host</dt>
                  <dd className="text-sm font-medium text-neutral-900 dark:text-neutral-200 break-words flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/venue/${encodeURIComponent(venueSlug(ev.location))}`}
                      className="text-neutral-900 dark:text-white hover:underline"
                    >
                      {ev.location}
                    </Link>
                    {ev.store_url && (
                      <a
                        href={ev.store_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 hover:underline"
                        title="Visit store website"
                      >
                        website
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                      </a>
                    )}
                  </dd>
                </div>
              ) : null}
              <DetailRow label="Date" value={formatDate(ev.date)} />
              <DetailRow label="Time" value={formatEventTimeRange(ev.date, ev.time, ev.timezone)} />
              <DetailRow label="Cost" value={ev.cost || "Not listed"} />
              {ev.address && (
                <div className="py-3 border-b border-neutral-100 dark:border-white/8 last:border-0">
                  <dt className="text-xs text-neutral-500 dark:text-neutral-400 mb-0.5">Address</dt>
                  <dd className="text-sm font-medium text-neutral-900 dark:text-neutral-200 break-words">
                    <a
                      href={`https://www.google.com/maps/search/${encodeURIComponent(ev.location + " " + ev.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-neutral-900 dark:text-white hover:underline break-words"
                    >
                      {ev.address}
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    </a>
                  </dd>
                  {showInlineMap && mapEmbedSrc && (
                    <iframe
                      src={mapEmbedSrc}
                      title={`Map of ${ev.location || ev.address}`}
                      className="w-full aspect-[3/2] rounded-md border border-neutral-100 dark:border-white/8 mt-3"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  )}
                </div>
              )}
              <DetailRow label="Source" value={SOURCE_LABELS[ev.source] || ev.source} href={ev.detail_url || undefined} />
            </dl>
          </div>
        </Reveal>

        {/* Notes */}
        {ev.notes && (
          <Reveal>
            <div className="mx-6 mb-4 bg-neutral-50 dark:bg-neutral-800 rounded-md p-4">
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">Description</p>
              <p className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap break-words">{ev.notes}</p>
            </div>
          </Reveal>
        )}

        {/* Meta footer */}
        <Reveal>
          <div className="bg-neutral-50 dark:bg-neutral-950 rounded-b-md px-6 py-3 text-xs text-neutral-400 dark:text-neutral-600 flex justify-between">
            <span>ID: {ev.id}</span>
            <span>Added {ev.added_date} · Updated {ev.updated_date}</span>
          </div>
        </Reveal>
      </div>

      {/* Host actions — moved to the bottom of the page since they're
          owner-/admin-only and shouldn't compete with the event detail
          for the casual viewer's attention. Edit / Attendees / Cancel
          live here so a host scrolls past their own event content
          before getting to management controls. */}
      {isHost && (
        <div className="mt-6">
          <HostActions
            eventId={ev.id}
            cancelled={cancelled}
            visibility={ev.visibility}
          />
        </div>
      )}
    </main>
  );
}
