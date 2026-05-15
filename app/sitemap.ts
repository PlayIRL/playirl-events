// Next.js App Router sitemap generator. Renders to /sitemap.xml.
//
// At nationwide scale this becomes the primary discovery surface for
// search engines — every event detail page that's `active` or `pinned`
// (and `public` visibility) becomes a crawlable URL. Goal: maximize
// indexing of /event/{id} pages so users searching "[city] mtg
// commander tournament" find PlayIRL.GG.
//
// Sitemap protocol caps at 50,000 URLs per file. We hit that ceiling at
// roughly 50k active events; if/when we cross it, switch to a sitemap
// index with per-format or per-state sub-sitemaps. Today's volume is
// ~hundreds, projected nationwide ~25k — comfortably one file.

import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";
import { getActiveEventIdsForSitemap } from "@/lib/events";
import { listKnownVenues, venueSlug } from "@/lib/venues";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`,      lastModified: now, changeFrequency: "hourly",  priority: 1.0 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/bot`,   lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/play`,  lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];

  // Public events only. Lean projection (id + updated_date) capped at the
  // SQL layer so we don't allocate a full EventRow per row when scaling
  // past 25k. The same visibility/status/cancellation chokepoint is
  // applied inside the query — unlisted/private/skip never leak here.
  const events = getActiveEventIdsForSitemap();
  const eventPages: MetadataRoute.Sitemap = events.map((ev) => {
    const updated = ev.updated_date ? new Date(ev.updated_date) : now;
    return {
      url: `${SITE_URL}/event/${encodeURIComponent(ev.id)}`,
      lastModified: updated,
      // Events near the present are more useful to surface; old/far ones
      // get demoted. The date string sorts lexically since it's YYYY-MM-DD.
      changeFrequency: "weekly",
      priority: 0.7,
    };
  });

  // Venue pages — one per LGS that's served at least one event. SEO
  // compounder at nationwide scale: ~3,000 stores each get an indexable
  // URL where searchers can land directly. Dedup by slug since
  // listKnownVenues can theoretically yield two venues with the same
  // slug (collision-free in current data, but the dedup is cheap).
  const venues = listKnownVenues();
  const seenSlugs = new Set<string>();
  const venuePages: MetadataRoute.Sitemap = [];
  for (const v of venues) {
    const slug = venueSlug(v.name);
    if (!slug || seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);
    venuePages.push({
      url: `${SITE_URL}/venue/${encodeURIComponent(slug)}`,
      lastModified: now,
      // Venue pages change as new events are scraped and old ones age
      // out — daily is realistic.
      changeFrequency: "daily",
      // Slightly lower than events: a venue page is less specific than
      // a single event listing, but more durable.
      priority: 0.6,
    });
  }

  // 50,000 URL ceiling — stay safely below to leave room for static pages
  // and any future routes.
  const all = [...staticPages, ...eventPages, ...venuePages];
  return all.slice(0, 49_000);
}
