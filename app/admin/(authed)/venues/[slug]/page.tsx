import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import {
  findVenueBySlug,
  getVenueDefault,
  type VenueImageSource,
} from "@/lib/venues";
import { getEventsForVenue } from "@/lib/events";
import VenueImagePanel from "./VenueImagePanel";
import VenueEventsTable from "./VenueEventsTable";

export const dynamic = "force-dynamic";

const SOURCE_LABELS: Record<VenueImageSource, { label: string; className: string }> = {
  manual: {
    label: "manual",
    className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  },
  og_scrape: {
    label: "og:image",
    className: "bg-neutral-100 text-neutral-700 dark:bg-white/[0.06] dark:text-neutral-300",
  },
  places: {
    label: "places",
    className: "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  },
  street_view: {
    label: "streetview",
    className: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  },
};

export default async function AdminVenueDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireRole("admin");
  const { slug } = await params;
  const venue = findVenueBySlug(slug);
  if (!venue) notFound();

  const def = getVenueDefault(venue.name);
  const events = getEventsForVenue(venue.name, 500);

  // EventTable expects a narrower shape than EventRow — strip down so the
  // component is happy and we don't ship extra columns over the network.
  const tableEvents = events.map((e) => ({
    id: e.id,
    title: e.title,
    format: e.format,
    date: e.date,
    time: e.time,
    location: e.location,
    source: e.source,
    source_type: e.source_type ?? undefined,
    status: e.status,
    owner_id: e.owner_id ?? null,
    notes: e.notes ?? "",
  }));

  const sourceMeta = def?.image_source ? SOURCE_LABELS[def.image_source] : null;

  return (
    <div className="p-6 lg:p-8 max-w-6xl space-y-6">
      <div>
        <Link
          href="/admin/venues"
          className="text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          ← All venues
        </Link>
      </div>

      <header className="flex items-start gap-5">
        <div className="w-32 h-24 rounded-md overflow-hidden bg-neutral-100 dark:bg-neutral-800 shrink-0 flex items-center justify-center">
          {def?.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={def.image_url}
              alt=""
              width={128}
              height={96}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
              No default image
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-[family-name:var(--font-ultra)] font-bold text-neutral-900 dark:text-neutral-100">
            {venue.name}
          </h1>
          {venue.address && (
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
              {venue.address}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-neutral-500 dark:text-neutral-400">
            <span>
              <span className="font-mono">{events.length}</span> events
            </span>
            {venue.latitude != null && venue.longitude != null && (
              <span>
                · {venue.latitude.toFixed(4)}, {venue.longitude.toFixed(4)}
              </span>
            )}
            {venue.store_url && (
              <span>
                ·{" "}
                <a
                  href={venue.store_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline hover:no-underline"
                >
                  store site
                </a>
              </span>
            )}
            {sourceMeta && (
              <span className={`px-1.5 py-0.5 rounded-md ${sourceMeta.className}`}>
                {sourceMeta.label}
              </span>
            )}
          </div>
        </div>
      </header>

      <VenueImagePanel
        venueName={venue.name}
        initialImageUrl={def?.image_url ?? ""}
        initialImageSource={def?.image_source ?? null}
      />

      <section>
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-3">
          Events at this venue
        </h2>
        {tableEvents.length === 0 ? (
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md p-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
            No events for this venue yet.
          </div>
        ) : (
          <VenueEventsTable initial={tableEvents} />
        )}
      </section>
    </div>
  );
}
