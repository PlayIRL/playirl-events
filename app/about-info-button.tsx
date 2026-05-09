import Link from "next/link";

// Inline "About" CTA that follows the homepage hero subhead. Styling
// mirrors the Subscribe + Create-event chips in radius-selector.tsx
// exactly (gap, padding, border weight, text color, font weight, hover)
// so all three CTAs in the hero area read as one family.
//
// Doesn't reuse `LinkButton` from app/button.tsx because none of those
// variants match the Subscribe/Create-event lockup — they use a fully
// neutral-900 text color + font-medium that the `chip` variant
// deliberately doesn't (chip is meant to feel quieter for things like
// load-more). Inlining keeps the three buttons stylistically locked
// without leaking that into other chip callsites.
export default function AboutInfoButton() {
  return (
    <Link
      href="/about"
      title="About PlayIRL.GG"
      aria-label="About PlayIRL.GG"
      className="ml-2 align-middle inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white text-xs font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800 transition cursor-pointer focus:outline-none"
    >
      About
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="w-3 h-3"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}
