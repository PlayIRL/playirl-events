import Link from "next/link";

export default function AboutInfoButton() {
  return (
    <Link
      href="/about"
      title="About PlayIRL.GG"
      aria-label="About PlayIRL.GG"
      className="ml-1 underline underline-offset-2 hover:text-neutral-900 dark:hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/40 dark:focus-visible:ring-white/20 rounded-sm"
    >
      About
    </Link>
  );
}
