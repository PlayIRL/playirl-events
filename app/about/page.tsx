import Image from "next/image";
import Link from "next/link";
import Reveal from "@/app/reveal";
import { PlayIrlLogo } from "@/app/playirl-logo";
import { TestFlightBadge } from "@/app/testflight-badge";
import UserGuide from "./_components/UserGuide";

export const metadata = {
  title: "About — PlayIRL.GG",
  description: "PlayIRL.GG aggregates local Magic: The Gathering events into one feed.",
};

export default function AboutPage() {
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

      <Reveal delay={40}>
        <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/40 rounded-md p-5 space-y-2 mb-8">
          <p className="text-base font-[family-name:var(--font-ultra)] font-bold text-amber-900 dark:text-amber-200">{"\uD83D\uDEA7"} Active development</p>
          <p className="text-sm text-amber-800 dark:text-amber-200/80">
            PlayIRL.gg covers MTG events nationwide and ships often. Expect features to land or change between visits — we&apos;re iterating in public, with more game support beyond MTG and deeper venue profiles still to come.
          </p>
        </div>
      </Reveal>

      <Reveal delay={100}>
        <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-ultra)] font-black text-neutral-900 dark:text-white tracking-tight mb-3 flex items-baseline gap-3 flex-wrap">
          About
          <PlayIrlLogo className="text-3xl md:text-4xl" />
          <span className="sr-only">PlayIRL.GG</span>
        </h1>
      </Reveal>

      <Reveal delay={140}>
        <div className="flex flex-wrap items-center gap-1.5 mb-3 text-xs font-medium">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30">
            {"\u2728"} Open source
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-700 border border-neutral-200 dark:bg-white/[0.06] dark:text-neutral-300 dark:border-white/15">
            {"\uD83D\uDC65"} Community-run
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-600 border border-neutral-200 dark:bg-white/5 dark:text-neutral-400 dark:border-white/10">
            Not affiliated with Wizards of the Coast
          </span>
        </div>
      </Reveal>

      <Reveal delay={160}>
        <p className="mb-6 text-xs text-neutral-500 dark:text-neutral-400">
          New here? Skip ahead to the{" "}
          <a href="#guide" className="font-medium underline decoration-dotted underline-offset-2 hover:decoration-solid text-neutral-900 dark:text-white">
            user guide
          </a>{" "}
          for step-by-step walkthroughs.
        </p>
      </Reveal>

      <div className="space-y-5 text-base text-neutral-700 dark:text-neutral-300 leading-relaxed">
        <Reveal delay={180}>
          <p>
            <strong className="text-neutral-900 dark:text-white">PlayIRL.GG</strong> is an{" "}
            <a
              href="https://github.com/i1986o/mtg-cal"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-dotted underline-offset-2 hover:text-neutral-900 dark:hover:text-white"
            >
              open-source
            </a>
            , community-run alternative to the official Wizards of the Coast event locator. We aggregate local Magic: The Gathering events from multiple sources into one easy-to-browse feed — built by players, for players.
          </p>
        </Reveal>

        <Reveal>
          <p>
            We pull events from <strong>Wizards of the Coast</strong>, <strong>TopDeck.gg</strong>, and connected <strong>Discord servers</strong> — so you never miss a Commander night, prerelease, or draft at your local game store.
          </p>
        </Reveal>

        <Reveal>
          <div className="bg-neutral-50 dark:bg-white/[0.04] border border-neutral-200 dark:border-white/10 rounded-md p-5 space-y-3">
            <p className="text-base font-[family-name:var(--font-ultra)] font-bold text-neutral-900 dark:text-white">What you can do</p>
            <ul className="text-sm text-neutral-700 dark:text-neutral-300 space-y-2 list-disc list-outside pl-5">
              <li>
                <strong>Browse</strong> MTG events nationwide, filtered by format, radius (1–100 mi or any custom value), and date range right from the homepage. Toggle <strong>RCQs only</strong> inside the format dropdown to narrow to Regional Championship Qualifiers.
              </li>
              <li>
                <strong>Switch views</strong> between list, calendar, and map without losing your filter. Events happening right now glow with a live indicator in every view.
              </li>
              <li>
                <strong>Subscribe</strong> any filter to <strong>Google Calendar</strong>, <strong>Apple Calendar</strong>, or <strong>Outlook</strong> in one tap — or grab the raw iCal feed URL to paste anywhere. Subscriptions stay in sync automatically as new matching events land.
              </li>
              <li>
                <strong>Sign in</strong> with email, Google, or Discord to save events to a personal list, RSVP with auto-waitlist, and submit your own — store events go live immediately for organizers, and pending review otherwise.
              </li>
              <li>
                <strong>Add the Discord bot</strong> to your server for daily/weekly digests, per-event reminders, and pushing matching events into the native Events tab. {" "}
                <Link href="/bot" className="text-neutral-900 dark:text-white underline underline-offset-2 hover:no-underline">See bot setup →</Link>
              </li>
              <li>
                <strong>Connect a Discord server</strong> as an event source so events posted there flow into your feed automatically.
              </li>
              <li>
                <strong>Each venue gets a public page</strong> at <code className="text-xs px-1 py-0.5 rounded-sm bg-neutral-100 dark:bg-white/10">/venue/&#123;slug&#125;</code> with its own Subscribe button — share one URL for all upcoming events at a store.
              </li>
            </ul>
          </div>
        </Reveal>

        <Reveal>
          <div className="bg-neutral-50 dark:bg-white/[0.04] border border-neutral-200 dark:border-white/10 rounded-md p-5 space-y-3">
            <p className="text-base font-[family-name:var(--font-ultra)] font-bold text-neutral-900 dark:text-white">{"\uD83D\uDCC5"} Add your events</p>
            <p className="text-sm text-neutral-700 dark:text-neutral-300">
              Run a store or host a pod? You have three options: post events directly via your account, connect a Discord server as a feed, or reach out and we&apos;ll get you set up manually.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Link
                href="/account/events/new"
                className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white text-sm font-medium rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 active:translate-y-0 transition-all duration-200"
              >
                {"\u270F\uFE0F"} Create an event
              </Link>
              <a
                href="https://discord.gg/nM2Ea4NSSh"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 text-sm font-medium rounded-md border border-neutral-200 dark:border-white/10 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:-translate-y-0.5 hover:shadow-md dark:hover:shadow-black/20 active:translate-y-0 transition-all duration-200"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
                Join the Discord
              </a>
              <a
                href="mailto:CardSlingerTCG@gmail.com?subject=PlayIRL.GG%20event%20submission"
                className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 text-sm font-medium rounded-md border border-neutral-200 dark:border-white/10 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:-translate-y-0.5 hover:shadow-md dark:hover:shadow-black/20 active:translate-y-0 transition-all duration-200"
              >
                {"\u2709\uFE0F"} Email us
              </a>
            </div>
          </div>
        </Reveal>

        <Reveal>
          <div className="bg-neutral-50 dark:bg-white/[0.04] border border-neutral-200 dark:border-white/10 rounded-md p-5 space-y-3">
            <p className="text-base font-[family-name:var(--font-ultra)] font-bold text-neutral-900 dark:text-white">{"\uD83D\uDCF1"} Companion app {"\u2014"} PlayIRL.gg/Track</p>
            <Link
              href="/track"
              aria-label="Learn more about PlayIRL.gg/Track"
              className="group mx-auto block w-fit py-2 select-none rounded-md outline-none transition-transform hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-white/40"
            >
              <div className="relative w-[290px] h-[150px] sm:w-[520px] sm:h-[269px] md:w-[620px] md:h-[320px]">
                <div className="absolute top-1/2 left-1/2 w-[150px] h-[290px] sm:w-[269px] sm:h-[520px] md:w-[320px] md:h-[620px] -translate-x-1/2 -translate-y-1/2 rotate-90 origin-center">
                  <Image
                    src="/images/track/gameplay-art.png"
                    width={1036}
                    height={2004}
                    alt="PlayIRL Track \u2014 4-player MTG life counter in landscape table mode, each player rotated to face their seat. Click to learn more."
                    className="w-full h-full drop-shadow-2xl"
                  />
                </div>
              </div>
            </Link>
            <p className="text-sm text-neutral-700 dark:text-neutral-300">
              A simple, no-fuss MTG life tracker for the table. Now in open beta on iOS via TestFlight {"\u2014"} {" "}
              <Link href="/track" className="text-neutral-900 dark:text-white underline underline-offset-2 hover:no-underline">
                learn more
              </Link>.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <TestFlightBadge />
            </div>
          </div>
        </Reveal>

        <Reveal>
          <div className="pt-2">
            <a
              href="https://github.com/i1986o/mtg-cal"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-100 dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 text-sm font-medium rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-800 hover:-translate-y-0.5 hover:shadow-md dark:hover:shadow-black/20 active:translate-y-0 transition-all duration-200 border border-neutral-100 dark:border-white/8"
            >
              {"\u2B50"} GitHub
            </a>
          </div>
        </Reveal>
      </div>

      <Reveal>
        <UserGuide />
      </Reveal>
    </main>
  );
}
