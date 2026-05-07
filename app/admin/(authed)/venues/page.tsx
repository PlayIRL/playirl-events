import { requireRole } from "@/lib/session";
import { listKnownVenues, listVenueDefaults, venueKey } from "@/lib/venues";
import VenueRow from "./VenueRow";
import RetryAllButton from "./RetryAllButton";

export const dynamic = "force-dynamic";

export default async function AdminVenuesPage() {
  await requireRole("admin");

  const venues = listKnownVenues();
  const defaults = new Map(
    listVenueDefaults().map((d) => [d.venue_key, { image_url: d.image_url, source: d.image_source }] as const),
  );

  return (
    <div className="p-6 lg:p-8 max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-[family-name:var(--font-ultra)] font-bold text-neutral-900 dark:text-neutral-100">
          Venues
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 max-w-xl">
          Pick a default image for each venue. It's used as the fallback on event cards
          when an event from that venue doesn't have its own photo. Aggregated from every
          known event location plus connected Discord sources.
        </p>
      </header>

      {venues.length > 0 && <RetryAllButton />}

      {venues.length === 0 ? (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md p-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
          No venues yet. Once events have locations, they'll show up here.
        </div>
      ) : (
        <ul className="space-y-2">
          {venues.map((v) => {
            const key = venueKey(v.name);
            const def = defaults.get(key);
            return (
              <VenueRow
                key={key}
                venueName={v.name}
                usageCount={v.usage_count}
                address={v.address}
                initialImageUrl={def?.image_url ?? ""}
                initialImageSource={def?.source ?? null}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}
