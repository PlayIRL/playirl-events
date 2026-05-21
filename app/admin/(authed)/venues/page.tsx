import { requireRole } from "@/lib/session";
import {
  listKnownVenues,
  listVenueDefaults,
  venueKey,
  venueSlug,
} from "@/lib/venues";
import RetryAllButton from "./RetryAllButton";
import VenuesTable, { type VenueRowData } from "./VenuesTable";

export const dynamic = "force-dynamic";

export default async function AdminVenuesPage() {
  await requireRole("admin");

  const venues = listKnownVenues();
  const defaults = new Map(
    listVenueDefaults().map((d) => [d.venue_key, { image_url: d.image_url, source: d.image_source }] as const),
  );

  const rows: VenueRowData[] = venues.map((v) => {
    const key = venueKey(v.name);
    const def = defaults.get(key);
    return {
      name: v.name,
      slug: venueSlug(v.name),
      address: v.address,
      usageCount: v.usage_count,
      imageUrl: def?.image_url ?? "",
      imageSource: def?.source ?? null,
    };
  });

  return (
    <div className="p-6 lg:p-8 max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-[family-name:var(--font-ultra)] font-bold text-neutral-900 dark:text-neutral-100">
          Venues
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 max-w-2xl">
          Every venue we have events for, plus connected Discord sources. Click
          a row to manage the default image and review events at that venue.
          The image is used as a fallback on event cards when an event from the
          venue doesn't have its own photo.
        </p>
      </header>

      {rows.length > 0 && <RetryAllButton />}

      {rows.length === 0 ? (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md p-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
          No venues yet. Once events have locations, they'll show up here.
        </div>
      ) : (
        <VenuesTable venues={rows} />
      )}
    </div>
  );
}
