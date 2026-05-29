"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Floating "Send feedback" button. Plain mailto: link to the project's
 * shared inbox — no modal, no server endpoint, no transactional-email
 * provider in the loop. The user's email client opens with the subject
 * pre-filled and the page URL appended to the body so we can see where
 * they were when they hit send.
 *
 * Lives at the bottom-right stacked above CreateEventButton so the two
 * pill-shaped CTAs read as a cluster instead of competing for the same
 * prime real-estate.
 */

const FEEDBACK_EMAIL = "PlayIRLgg@gmail.com";
const BASE_HREF = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent("PlayIRL.GG feedback")}`;

export default function FeedbackButton() {
  // SSR can't see window.location, and rendering a client-only string
  // during the first render would cause a hydration mismatch. Start with
  // the bare mailto (matches SSR), then enrich with the current URL in
  // an effect after mount. usePathname + useSearchParams ensure the URL
  // refreshes on client-side route transitions too.
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [href, setHref] = useState(BASE_HREF);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const body = encodeURIComponent(
      ["", "", "—", `Sent from: ${window.location.href}`].join("\n"),
    );
    setHref(`${BASE_HREF}&body=${body}`);
    // pathname + searchParams in deps so the body URL stays current when
    // users navigate around with the filter chips before clicking.
  }, [pathname, searchParams]);

  // Sized down + lifted further off CreateEventButton so it reads as a
  // secondary utility rather than competing with the primary CTA below it.
  // Total vertical offset from Create event's bottom calc: +5rem (vs
  // +3.5rem at parity) which leaves ~24px clear air between the two
  // pills, and the button itself drops from h-10/h-11 to h-8/h-9 with a
  // lighter shadow.
  return (
    <div
      className="fixed right-4 z-40 bg-white dark:bg-neutral-950 rounded-md p-0.5 border border-neutral-200 dark:border-white/15 shadow-md shadow-black/15 dark:shadow-black/40 bottom-[calc(1.5rem+env(safe-area-inset-bottom)+8px+5rem)] sm:bottom-[calc(1.5rem+env(safe-area-inset-bottom)+10px+5rem)]"
    >
      <a
        href={href}
        title="Send feedback"
        aria-label="Send feedback"
        className="flex items-center justify-center gap-1 w-8 h-8 sm:w-auto sm:h-9 sm:px-2.5 rounded-md text-neutral-600 dark:text-neutral-300 text-xs font-medium hover:text-neutral-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/40 dark:focus-visible:ring-white/40"
      >
        {/* Speech-bubble icon */}
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-5l-5 5v-5z" />
        </svg>
        <span className="hidden sm:inline">Feedback</span>
      </a>
    </div>
  );
}

