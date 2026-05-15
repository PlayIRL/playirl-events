// Branded 404 page. Triggers when:
//   - the URL doesn't match any `app/**/page.tsx` route, OR
//   - a server component calls `notFound()` (e.g. unknown event ID,
//     unknown venue slug). Lives at the root so it covers every route
//     beneath `app/` that doesn't ship its own not-found.tsx.

import Link from "next/link";
import { PlayIrlLogo } from "./playirl-logo";

export default function NotFound() {
  return (
    <main className="min-h-[60vh] w-full max-w-2xl mx-auto px-4 py-16 flex flex-col items-center text-center gap-4">
      <Link href="/" aria-label="Back to PlayIRL.GG home">
        <PlayIrlLogo className="text-3xl sm:text-4xl" />
      </Link>
      <p className="text-[10px] font-semibold tracking-wider uppercase text-neutral-500 dark:text-neutral-400 mt-6">
        404 — page not found
      </p>
      <h1 className="text-2xl sm:text-3xl font-[family-name:var(--font-ultra)] font-bold text-neutral-900 dark:text-white">
        We couldn't find that page
      </h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400 max-w-md">
        The link may be stale, or the event/venue might have been removed
        from the calendar. Head back to the homepage and try the format or
        location filters.
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 h-10 rounded-md bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-100 transition"
        >
          ← Back
        </Link>
        <a
          href="https://discord.gg/nM2Ea4NSSh"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 h-10 rounded-md border border-neutral-200 dark:border-white/15 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-white/5 transition"
        >
          Report a broken link
        </a>
      </div>
    </main>
  );
}
