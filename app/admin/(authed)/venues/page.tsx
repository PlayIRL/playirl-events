import Link from "next/link";
import { requireRole } from "@/lib/session";
import {
  getAdminVenuesPaginated,
  getAdminVenueStats,
  listVenueDefaults,
  venueKey,
  type AdminVenueRow,
} from "@/lib/venues";
import RetryAllButton from "./RetryAllButton";
import VenuesTable, { type VenueRowData } from "./VenuesTable";
import StatCard from "../../_components/StatCard";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

/**
 * /admin/venues — paginated + filtered venues listing.
 *
 * Previous version called listKnownVenues() which built the full
 * dedup-map in memory and shipped 4k+ rows of JSON to the browser per
 * page load. At intl scale (more international stores landing in the
 * DB) that footprint keeps growing.
 *
 * New version: server-side SQL aggregate paginated to one page worth of
 * rows. DB-wide stat cards at the top so the admin still sees the
 * big-picture totals; the page slice keeps the table responsive.
 *
 * URL-driven state — every filter combo is bookmarkable.
 */
interface SearchParams {
  page?: string;
  q?: string;
  country?: string;
}

export default async function AdminVenuesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole("admin");
  const sp = await searchParams;

  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const q = (sp.q ?? "").trim();
  const country = (sp.country ?? "all").trim();

  const [stats, { venues: pageRows, total }] = await Promise.all([
    Promise.resolve(getAdminVenueStats()),
    Promise.resolve(getAdminVenuesPaginated({ search: q, country }, PAGE_SIZE, (page - 1) * PAGE_SIZE)),
  ]);

  // Hydrate the page slice with per-venue image-default state. We only
  // look up defaults for the current page of venues — not the whole DB.
  const defaults = new Map(
    listVenueDefaults().map((d) => [d.venue_key, { image_url: d.image_url, source: d.image_source }] as const),
  );
  const rows: VenueRowData[] = pageRows.map((v: AdminVenueRow) => {
    const key = venueKey(v.name);
    const def = defaults.get(key);
    return {
      name: v.name,
      slug: v.slug,
      address: v.address,
      usageCount: v.usage_count,
      imageUrl: def?.image_url ?? "",
      imageSource: def?.source ?? null,
    };
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showingFrom = total > 0 ? (page - 1) * PAGE_SIZE + 1 : 0;
  const showingTo = Math.min(page * PAGE_SIZE, total);

  // Build query-string helper that preserves the current filters when
  // generating links (page nav + filter pills).
  function withParams(overrides: Partial<SearchParams>): string {
    const params = new URLSearchParams();
    const merged = { page: String(page), q, country, ...overrides };
    if (Number(merged.page) > 1) params.set("page", String(merged.page));
    if (merged.q) params.set("q", merged.q);
    if (merged.country && merged.country !== "all") params.set("country", merged.country);
    const qs = params.toString();
    return qs ? `?${qs}` : "/admin/venues";
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-[family-name:var(--font-ultra)] font-bold text-neutral-900 dark:text-neutral-100">
            Venues
            <span className="ml-3 text-base text-neutral-500 dark:text-neutral-400 font-normal">
              {stats.totalVenues.toLocaleString()} total
            </span>
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 max-w-2xl">
            Every venue we have events for. Click a row to manage the default image and review events at that
            venue. Check 2+ rows to merge duplicates (reversible from{" "}
            <Link href="/admin/venues/merges" className="underline hover:text-neutral-700 dark:hover:text-neutral-300">
              the merge log
            </Link>).
          </p>
        </div>
      </header>

      {/* DB-wide overview cards. Total + missing-country + top venue
          tier — read independently of the current filter. */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total venues" value={stats.totalVenues.toLocaleString()} />
        <StatCard
          label="Without country"
          value={stats.venuesWithoutCountry.toLocaleString()}
          hint={
            stats.totalVenues > 0
              ? `${((stats.venuesWithoutCountry / stats.totalVenues) * 100).toFixed(0)}% of all venues`
              : undefined
          }
        />
        <StatCard
          label="Countries represented"
          value={stats.byCountry.filter((c) => c.country !== "—").length.toLocaleString()}
        />
        <StatCard
          label="Top venue"
          value={stats.topVenues[0]?.usage_count.toLocaleString() ?? "—"}
          hint={stats.topVenues[0]?.name}
        />
      </section>

      {/* Country breakdown pills. Click to filter. The "—" pill picks
          venues we couldn't stamp a country on — useful for diagnosing
          gaps in the grid pre-stamp + Nominatim path. */}
      {stats.byCountry.length > 1 && (
        <section className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400 min-w-[60px]">
            Country
          </span>
          {stats.byCountry.slice(0, 14).map((c) => {
            const active = country === c.country;
            return (
              <Link
                key={c.country}
                href={withParams({ country: active ? "all" : c.country, page: "1" })}
                className={`text-xs px-2 py-0.5 rounded-md border transition font-mono ${
                  active
                    ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                    : "border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                }`}
              >
                {c.country}
                <span className={`ml-1.5 tabular-nums ${active ? "" : "text-neutral-500 dark:text-neutral-500"}`}>
                  {c.count.toLocaleString()}
                </span>
              </Link>
            );
          })}
          {stats.byCountry.length > 14 && (
            <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
              +{stats.byCountry.length - 14} more
            </span>
          )}
        </section>
      )}

      {/* Filter bar — server-side via form GET so the page round-trips
          (simplest model; no JS required). Search submits on Enter or
          by clicking apply. */}
      <form action="/admin/venues" method="get" className="flex flex-wrap items-center gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search venue name or address…"
          className="px-3 py-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 min-w-[260px]"
        />
        {/* Preserve country when searching */}
        {country !== "all" && <input type="hidden" name="country" value={country} />}
        <button
          type="submit"
          className="text-xs px-3 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          Search
        </button>
        {(q || country !== "all") && (
          <Link
            href="/admin/venues"
            className="text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 px-2 py-1"
          >
            Reset filters
          </Link>
        )}
        <span className="ml-auto text-xs text-neutral-500 dark:text-neutral-400">
          {total > 0
            ? `Showing ${showingFrom.toLocaleString()}–${showingTo.toLocaleString()} of ${total.toLocaleString()}`
            : "No matches"}
        </span>
      </form>

      {rows.length > 0 && <RetryAllButton />}

      {rows.length === 0 ? (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md p-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
          {q || country !== "all"
            ? "No venues match this filter."
            : "No venues yet. Once events have locations, they'll show up here."}
        </div>
      ) : (
        <VenuesTable venues={rows} />
      )}

      {/* Pagination — uses Links so back/forward works naturally. */}
      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-1 flex-wrap" aria-label="Pagination">
          {paginationWindow(page, totalPages).map((p, i) =>
            p === "…" ? (
              <span key={`gap-${i}`} className="px-2 text-neutral-400">…</span>
            ) : (
              <Link
                key={p}
                href={withParams({ page: String(p) })}
                className={`text-xs px-2.5 py-1 rounded-md border ${
                  p === page
                    ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                    : "border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                }`}
              >
                {p}
              </Link>
            ),
          )}
        </nav>
      )}
    </div>
  );
}

function paginationWindow(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const window: (number | "…")[] = [1];
  const start = Math.max(2, current - 2);
  const end = Math.min(total - 1, current + 2);
  if (start > 2) window.push("…");
  for (let i = start; i <= end; i++) window.push(i);
  if (end < total - 1) window.push("…");
  window.push(total);
  return window;
}
