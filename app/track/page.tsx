import Link from "next/link";
import Reveal from "@/app/reveal";
import { PlayIrlLogo } from "@/app/playirl-logo";

export const metadata = {
  title: "PlayIRL.gg/Track — life tracker for MTG",
  description:
    "A simple, no-fuss, high-quality life tracker for Magic: The Gathering — 1 to 8 players, Commander, Standard, Two-Headed Giant, and custom formats. Currently in beta.",
};

const WAITLIST_MAILTO =
  "mailto:CardSlingerTCG@gmail.com?subject=PlayIRL%20Track%20waitlist&body=Add%20me%20to%20the%20PlayIRL%20Track%20beta%20waitlist.";

function Feature({ title, body }: { title: string; body: React.ReactNode }) {
  return (
    <div className="rounded-md border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.04] p-4">
      <div className="text-sm font-semibold text-neutral-900 dark:text-white">{title}</div>
      <div className="text-sm text-neutral-700 dark:text-neutral-300 mt-1 leading-relaxed">{body}</div>
    </div>
  );
}

export default function LifePage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-10 text-left">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition mb-6 anim-fade-in"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to events
      </Link>

      <Reveal delay={100}>
        <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-ultra)] text-neutral-900 dark:text-white mb-3 flex items-start gap-2 flex-wrap">
          <span className="leading-none whitespace-nowrap">
            <PlayIrlLogo className="text-4xl md:text-5xl" />
            <span className="tracking-tight"><span className="font-light">/</span><span className="font-black">Track</span></span>
          </span>
          <span className="inline-block bg-[hsl(120,100%,50%)] text-black font-mono font-bold uppercase text-[10px] tracking-[0.15em] px-2 py-1 rounded leading-none mt-1 -ml-2">Beta</span>
          <span className="sr-only">PlayIRL.gg/Track (beta)</span>
        </h1>
      </Reveal>

      <Reveal delay={140}>
        <p className="text-lg text-neutral-700 dark:text-neutral-300 mb-3 leading-relaxed">
          A simple, no-fuss, high-quality life tracker for Magic: The Gathering — built for the table, not the menu. Drop it on the table, start a game in two taps, focus on the cards.
        </p>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6 leading-relaxed">
          Not downloadable yet — we&apos;re polishing a closed beta on iOS and Android. Join the waitlist below and we&apos;ll email when TestFlight and Play Store invites open up.
        </p>
      </Reveal>

      <Reveal delay={300}>
        <div className="bg-neutral-50 dark:bg-white/[0.04] border border-neutral-200 dark:border-white/10 rounded-md p-5 space-y-3 mb-10">
          <p className="text-base font-[family-name:var(--font-ultra)] font-bold text-neutral-900 dark:text-white">Want in?</p>
          <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
            We&apos;re inviting testers in batches as TestFlight and Play Store slots open. Drop us a note and we&apos;ll add you to the next round.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <a
              href={WAITLIST_MAILTO}
              className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-medium rounded-md hover:bg-neutral-800 dark:hover:bg-neutral-100 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 active:translate-y-0 transition-all duration-200"
            >
              {"✉️"} Email to join waitlist
            </a>
          </div>
        </div>
      </Reveal>

      <Reveal delay={340}>
        <section className="text-xs text-neutral-500 dark:text-neutral-400 border-t border-neutral-100 dark:border-neutral-800 pt-4">
          The app is a sibling project to <Link href="/" className="underline hover:text-neutral-900 dark:hover:text-white">PlayIRL.GG</Link> — same team, same focus on tabletop Magic, built so the two work nicely together. Not affiliated with Wizards of the Coast.
        </section>
      </Reveal>
    </main>
  );
}
