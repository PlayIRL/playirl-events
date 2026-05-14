import Link from "next/link";
import AccountChip from "../../../account-chip";

/**
 * Shared wrapper for /account/* sub-pages (everything except the main feed).
 * Matches the public homepage's centered, max-width layout and renders the
 * AccountChip/menu in the top-right corner. Gives each sub-page a small
 * "back to feed" breadcrumb so users don't need a sidebar to navigate.
 *
 * `hideChip` suppresses the corner avatar — used by the dashboard itself,
 * where clicking the chip just refreshes the same page.
 */
export default function SubpageShell({
  title,
  description,
  actions,
  children,
  maxWidth = "max-w-3xl",
  hideChip = false,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: string;
  hideChip?: boolean;
}) {
  return (
    <main className={`w-full ${maxWidth} mx-auto px-4 py-8 space-y-6`}>
      {!hideChip && <AccountChip />}

      <Link
        href="/"
        className="inline-flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to home
      </Link>

      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-[family-name:var(--font-ultra)] font-black tracking-tight text-neutral-900 dark:text-neutral-100 leading-none">
            {title}
          </h1>
          {description && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2">{description}</p>
          )}
        </div>
        {actions && <div className="flex gap-2 shrink-0">{actions}</div>}
      </header>

      {children}
    </main>
  );
}
