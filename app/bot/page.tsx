import Link from "next/link";
import Reveal from "@/app/reveal";
import { botInviteUrl } from "@/lib/discord-bot";

export const metadata = {
  title: "Discord bot — PlayIRL.GG",
  description: "Add the PlayIRL.GG bot to your Discord server for automatic MTG event digests and reminders.",
};

const inviteUrl = botInviteUrl();

function CommandCard({ name, summary, example }: { name: string; summary: string; example?: string }) {
  return (
    <div className="rounded-md border border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
      <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{name}</div>
      <div className="text-sm text-neutral-700 dark:text-neutral-300 mt-1">{summary}</div>
      {example && (
        <div className="mt-2 text-xs text-neutral-500 dark:text-neutral-400 break-all">
          {example}
        </div>
      )}
    </div>
  );
}

export default function BotPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-10 text-left">
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
        <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-ultra)] font-black text-neutral-900 dark:text-white tracking-tight mb-3">
          PlayIRL.GG Discord bot
        </h1>
      </Reveal>

      <Reveal delay={100}>
        <p className="text-lg text-neutral-700 dark:text-neutral-300 mb-6">
          Get MTG event digests and reminders posted to your server&apos;s channels — on the schedule you choose, filtered to the formats and stores you care about.
        </p>
      </Reveal>

      <Reveal delay={140}>
        <div className="mb-8">
          {inviteUrl ? (
            <a
              href={inviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 font-semibold text-base hover:bg-neutral-800 dark:hover:bg-neutral-200 transition shadow-sm cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
              Add to your Discord server
            </a>
          ) : (
            <div className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 px-4 py-3 text-sm text-neutral-700 dark:text-neutral-300">
              Invite link not configured. Set <code>DISCORD_BOT_CLIENT_ID</code> in your environment.
            </div>
          )}
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
            You&apos;ll need the <strong>Manage Server</strong> permission to add it.
          </p>
        </div>
      </Reveal>

      <Reveal delay={180}>
        <section className="mb-10">
          <h2 className="text-xl font-[family-name:var(--font-ultra)] font-bold text-neutral-900 dark:text-white mb-3">How it works</h2>
          <ol className="list-decimal list-inside space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
            <li>Click <strong>Add to your Discord server</strong> above and pick a server.</li>
            <li>Open <Link href="/account?tab=discord" className="underline hover:text-neutral-900 dark:hover:text-white">Account → Discord</Link> on PlayIRL.GG and click <strong>+ New auto-post</strong>.</li>
            <li>Pick the channel, a <strong>mode</strong> — weekly digest, daily digest, or per-event reminder — and any filters (format, venue, location, radius).</li>
            <li>That&apos;s it. The bot posts on the schedule you set. Anyone in the server can run <code className="px-1 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800">/playirl today</code> or <code className="px-1 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800">/playirl week</code> to look up events on demand.</li>
          </ol>
        </section>
      </Reveal>

      <Reveal delay={220}>
        <section className="mb-10">
          <h2 className="text-xl font-[family-name:var(--font-ultra)] font-bold text-neutral-900 dark:text-white mb-3">Commands</h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
            <code>/playirl today</code>, <code>/playirl week</code>, and <code>/playirl help</code> work for anyone in the channel. <code>/playirl unsubscribe</code> requires the <strong>Manage Server</strong> permission. To create or edit recurring posts, use the <Link href="/account?tab=discord" className="underline hover:text-neutral-900 dark:hover:text-white">website</Link>.
          </p>
          <div className="space-y-3">
            <CommandCard
              name="/playirl today"
              summary="Show MTG events happening today near you. Requires location + radius; format is optional."
              example="/playirl today location:19103 radius_miles:25 format:Commander"
            />
            <CommandCard
              name="/playirl week"
              summary="Show MTG events in the next 7 days near you. Same options as /playirl today."
              example="/playirl week location:Philadelphia, PA radius_miles:50"
            />
            <CommandCard
              name="/playirl unsubscribe <id>"
              summary="Disable a recurring auto-post in this server (Manage Server). Start typing in the id field — Discord autocompletes from your server's subscriptions."
            />
            <CommandCard
              name="/playirl help"
              summary="Show the in-channel quick reference for every command and its options."
            />
          </div>
        </section>
      </Reveal>

      <Reveal delay={260}>
        <section className="mb-10">
          <h2 className="text-xl font-[family-name:var(--font-ultra)] font-bold text-neutral-900 dark:text-white mb-3">Subscription modes</h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
            Configured from the <Link href="/account?tab=discord" className="underline hover:text-neutral-900 dark:hover:text-white">Discord tab</Link> of your account.
          </p>
          <dl className="space-y-3 text-sm text-neutral-700 dark:text-neutral-300">
            <div>
              <dt className="font-semibold text-neutral-900 dark:text-white">Weekly digest</dt>
              <dd>One post per week with every matching event in the next 7 days. Default fires Monday at 9am ET.</dd>
            </div>
            <div>
              <dt className="font-semibold text-neutral-900 dark:text-white">Daily digest</dt>
              <dd>One post per day with today&apos;s and tomorrow&apos;s matching events. Default fires at 9am ET.</dd>
            </div>
            <div>
              <dt className="font-semibold text-neutral-900 dark:text-white">Per-event reminder</dt>
              <dd>One post per event, fired before it starts. Pick <code>1h</code>, <code>2h</code>, <code>morning_of</code>, <code>day_before</code>, or any number of minutes.</dd>
            </div>
          </dl>
        </section>
      </Reveal>

      <Reveal delay={300}>
        <section className="text-xs text-neutral-500 dark:text-neutral-400 border-t border-neutral-100 dark:border-neutral-800 pt-4">
          Your channel data stays inside the bot&apos;s own SQLite database — we don&apos;t share subscription configs with third parties. The bot only needs <strong>View Channel</strong>, <strong>Send Messages</strong>, <strong>Embed Links</strong>, and <strong>Read Message History</strong> to function.
        </section>
      </Reveal>
    </main>
  );
}
