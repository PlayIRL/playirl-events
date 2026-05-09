"use client";

// Per-route error boundary. Triggers when a server component or client
// component beneath this layout throws during render. The "use client"
// directive is required by Next.js for error.tsx — the component itself
// runs on the client to handle React error reporting.
//
// Doesn't replace `global-error.tsx` (which catches errors thrown inside
// the root `<html>` / `<body>` chain — e.g. the layout itself crashing).
// This one catches the common case: a route's data fetch threw, or a
// component beneath the route crashed.

import { useEffect } from "react";
import Link from "next/link";
import { PlayIrlLogo } from "./playirl-logo";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to the server's stderr via Next's RSC error reporting; the digest
    // shows in production logs and ties this client view to the server
    // record. Skip for now — when we add Sentry/Logtail, this is where it
    // hooks in.
    console.error("[route-error]", error.digest ?? error.message ?? error);
  }, [error]);

  return (
    <main className="min-h-[60vh] w-full max-w-2xl mx-auto px-4 py-16 flex flex-col items-center text-center gap-4">
      <Link href="/" aria-label="Back to PlayIRL.GG home">
        <PlayIrlLogo className="text-3xl sm:text-4xl" />
      </Link>
      <p className="text-[10px] font-semibold tracking-wider uppercase text-red-700 dark:text-red-400 mt-6">
        Something went wrong
      </p>
      <h1 className="text-2xl sm:text-3xl font-[family-name:var(--font-ultra)] font-bold text-neutral-900 dark:text-white">
        We hit a snag rendering this page
      </h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400 max-w-md">
        Try again — most of the time it's a transient hiccup. If it keeps
        happening, the team's been notified and we'll fix it.
        {error.digest && (
          <span className="block mt-2 text-xs text-neutral-400 dark:text-neutral-500 font-mono">
            ref: {error.digest}
          </span>
        )}
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 px-4 h-10 rounded-md bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-100 transition cursor-pointer"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 h-10 rounded-md border border-neutral-200 dark:border-white/15 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-white/5 transition"
        >
          Back to homepage
        </Link>
      </div>
    </main>
  );
}
