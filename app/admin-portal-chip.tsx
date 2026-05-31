import Link from "next/link";
import { getCurrentUser } from "@/lib/session";

// Floating "Admin" pill stacked just below AccountChip, visible only to
// admins. The link used to live inside the AccountMenu dropdown, which
// meant admins had to click → wait for the menu → click again every
// time they wanted to hop into the portal. Surfacing it as a sibling
// chip drops that to a single tap. Mobile: 40px shield-only circle.
// Desktop (sm:↑): shield + "Admin" label, matching the account chip's
// expand-on-desktop rhythm.
//
// Top offset = chip-top + 42px (AccountChip pill height = w-10 + 1px
// border top/bottom) + 8px gap = chip-top + 50px (3.125rem).
// transition-[top] matches AccountChip so they slide together as the
// sticky filter bar publishes --chip-top.
const PILL = "fixed top-[calc(var(--chip-top,1rem)+3.125rem)] right-4 transition-[top] duration-300 z-[60] flex bg-white dark:bg-neutral-950 rounded-full border border-neutral-200 dark:border-white/15 shadow-[0_0_28px_-4px_rgb(0_0_0_/_0.12)] dark:shadow-[0_0_28px_-4px_rgb(0_0_0_/_0.5)]";

export default async function AdminPortalChip() {
  const user = await getCurrentUser();
  if (!user || user.suspended || user.role !== "admin") return null;

  return (
    <div className={PILL}>
      <Link
        href="/admin"
        title="Admin portal"
        aria-label="Admin portal"
        className="inline-flex items-center justify-center gap-2 w-10 h-10 p-1 sm:w-auto sm:pr-4 sm:pl-2 rounded-full cursor-pointer transition-colors text-neutral-700 dark:text-neutral-200 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/40 dark:focus-visible:ring-white/20"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-5 h-5 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L4 5v6.5C4 16.5 7.5 20.5 12 22c4.5-1.5 8-5.5 8-10.5V5l-8-3z" />
        </svg>
        <span className="hidden sm:inline text-sm font-medium">Admin</span>
      </Link>
    </div>
  );
}
