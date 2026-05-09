import Link from "next/link";
import { getCurrentUser } from "@/lib/session";

// Pill container + inner-button styles mirror the theme toggle in
// `app/floating-toolbar.tsx`. On mobile we sit at bottom-6 left-4 to mirror
// that toggle's bottom-6 right-4 placement; on sm and up we read --chip-top
// (published by StickyBar): 1rem at the top of the page (classic top-right
// corner), then sliding down to sit just below the sticky filter bar once
// the user scrolls and the bar pins. transition-[top] smooths the swap.
// 1rem fallback handles the moment before StickyBar's effect runs.
const PILL = "fixed bottom-6 left-4 sm:bottom-auto sm:left-auto sm:top-[var(--chip-top,1rem)] sm:right-4 sm:transition-[top] sm:duration-300 z-40 flex bg-white dark:bg-neutral-800 rounded-md p-0.5 border border-neutral-200 dark:border-white/15 shadow-xl shadow-black/15 dark:shadow-black/50";

export default async function AccountChip() {
  const user = await getCurrentUser();
  const signedIn = !!user && !user.suspended;

  if (!signedIn) {
    return (
      <div className={PILL}>
        <Link
          href="/account/login"
          title="Sign in"
          aria-label="Sign in"
          className="inline-flex items-center gap-2 h-8 pl-2 pr-3 rounded-md transition-colors cursor-pointer text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/40 dark:focus-visible:ring-white/20"
        >
          <UserIcon />
          <span className="text-sm font-medium">Sign in</span>
        </Link>
      </div>
    );
  }

  const displayName = user.name?.split(" ")[0] ?? "Account";
  const initials = getInitials(user.name, user.email);
  const showImage = !!user.image;

  return (
    <div className={PILL}>
      <Link
        href="/account"
        title={displayName}
        aria-label={`Account dashboard for ${displayName}`}
        className="inline-flex items-center gap-2 h-8 pl-1 pr-2.5 rounded-md cursor-pointer transition-colors text-neutral-700 dark:text-neutral-200 hover:text-neutral-900 dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/40 dark:focus-visible:ring-white/20"
      >
        <span className="flex items-center justify-center w-7 h-7 rounded-md overflow-hidden shrink-0">
          {showImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.image!}
              alt=""
              width={28}
              height={28}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span className="w-full h-full rounded-md bg-neutral-800 dark:bg-neutral-100 text-white dark:text-neutral-900 text-[11px] font-bold flex items-center justify-center tracking-wide">
              {initials}
            </span>
          )}
        </span>
        <span className="text-sm font-medium max-w-[8rem] truncate">{displayName}</span>
      </Link>
    </div>
  );
}

/** Initials for the avatar circle. Two letters from a full name (first +
 *  last word), one from a single name, or one from the email's first
 *  character. "?" if both are missing. */
function getInitials(name: string | null, email: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts.length === 1 && parts[0].length > 0) return parts[0][0].toUpperCase();
  }
  if (email && email.length > 0) return email[0].toUpperCase();
  return "?";
}

function UserIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}
