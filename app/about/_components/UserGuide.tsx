// Long-form user guide for the About page. Each section follows the same
// shape: short framing copy → an inline UI mockup (rendered with Tailwind
// rather than screenshots so it never goes stale and adapts to dark mode)
// → a concrete step list → a "Try it" deep-link to the actual feature.
//
// The mockups intentionally simplify the real UI (dropping the surrounding
// chrome, leaving just the relevant control). They're documentation, not a
// faithful render — but they stay close enough to the live UI that users
// can recognize the control on the page.

import Link from "next/link";
import { DiscordIcon } from "@/app/discord-icon";

interface SectionDef {
  id: string;
  title: string;
  audience: string;
}

const SECTIONS: SectionDef[] = [
  { id: "browse", title: "Browse events", audience: "Everyone" },
  { id: "venue", title: "Venue pages", audience: "Everyone" },
  { id: "save-rsvp", title: "Save events &amp; RSVP", audience: "Players" },
  { id: "subscribe", title: "Subscribe to your calendar", audience: "Players" },
  { id: "host", title: "Host an event", audience: "Organizers" },
  { id: "bot", title: "Install the Discord bot", audience: "Server admins" },
  { id: "channel-subs", title: "Post events to a Discord channel", audience: "Server admins" },
  { id: "events-tab-subs", title: "Add events to a server's Events tab", audience: "Server admins" },
  { id: "sync", title: "Sync events FROM a Discord server", audience: "Server admins" },
];

export default function UserGuide() {
  return (
    <section id="guide" className="mt-16 scroll-mt-8">
      <header className="mb-8 space-y-2">
        <h2 className="text-3xl md:text-4xl font-[family-name:var(--font-ultra)] font-black text-neutral-900 dark:text-white tracking-tight">
          User guide
        </h2>
        <p className="text-base text-neutral-700 dark:text-neutral-300">
          Everything PlayIRL.GG can do, with the steps to use each. Jump to a section, or scroll
          through end-to-end.
        </p>
      </header>

      <TableOfContents />

      <div className="space-y-12">
        <Section
          n={1}
          id="browse"
          title="Browse events"
          audience="Everyone &middot; no sign-in needed"
          intro="The homepage is a single madlib sentence — change any underlined word to refilter the feed. Three view toggles let you switch between list, calendar, and map without losing your filter."
        >
          <FilterBarMockup />
          <Steps>
            <Step>
              Click <Word>All MTG</Word> to filter to a single format
              (Commander, Modern, Pioneer, &hellip;). The same dropdown has an
              <Pill>RCQs only</Pill> toggle at the bottom that narrows the feed
              to Regional Championship Qualifiers &mdash; it stacks with any
              format you pick (e.g. &ldquo;Modern RCQs only&rdquo;).
            </Step>
            <Step>
              Click the radius number to set the search distance &mdash; presets
              go from 1&nbsp;mile up to 100&nbsp;miles, plus a free-form custom
              value (up to 500) for the rest of the country.
            </Step>
            <Step>
              Click the location chip to change your center &mdash; type a city, postcode, or
              address. Geocoding happens server-side.
            </Step>
            <Step>
              Use the view-toggle on the right to swap between
              <ViewIcon kind="list" /> list,
              <ViewIcon kind="calendar" /> calendar, and
              <ViewIcon kind="map" /> map. Your filter persists across views.
            </Step>
            <Step>
              Events that are happening right now glow with an emerald
              &ldquo;live&rdquo; chip and a soft shimmer across the row &mdash;
              easy to scan for &ldquo;what&rsquo;s going on right now&rdquo;
              when you walk into a store.
            </Step>
            <Step>
              Use the date input at the bottom of the feed to jump to a specific day.
            </Step>
          </Steps>
          <TryLink href="/" label="Open the feed" />
        </Section>

        <Section
          n={2}
          id="venue"
          title="Venue pages"
          audience="Everyone"
          intro="Every venue we know about has a public page at /venue/[slug] listing all of its upcoming events. Useful for sharing one URL with a group, or bookmarking your local store."
        >
          <EventCardMockup />
          <Steps>
            <Step>
              Click any event&rsquo;s venue line in the feed to jump to the venue&rsquo;s
              page.
            </Step>
            <Step>
              On the venue page, use the <Pill>Subscribe</Pill> button to get
              just that venue&rsquo;s events as a calendar feed.
            </Step>
            <Step>
              Share the URL &mdash; no sign-in is needed to view a venue page.
            </Step>
          </Steps>
        </Section>

        <Section
          n={3}
          id="save-rsvp"
          title="Save events &amp; RSVP"
          audience="Players (sign-in required)"
          intro="Tap the star on any event card to save it to your account. RSVP-enabled events also show going / maybe / waitlist controls on the detail page."
        >
          <SaveRsvpMockup />
          <Steps>
            <Step>
              <Link href="/account/login" className={LINK}>Sign in</Link> with
              email + password, Google, Discord, or a magic link.
            </Step>
            <Step>
              Tap the <Star /> on any event card to save it &mdash; saved events
              show up under <Pill>Saved events</Pill> on your account dashboard.
            </Step>
            <Step>
              On RSVP-enabled events, click <Pill>Going</Pill> or
              <Pill>Maybe</Pill>. If the event is at capacity you&rsquo;ll be added to the
              waitlist; you&rsquo;re auto-promoted when a spot opens up.
            </Step>
            <Step>
              You&rsquo;ll get a banner on the event page when you&rsquo;re promoted off
              the waitlist &mdash; no email required.
            </Step>
          </Steps>
          <TryLink href="/account/login" label="Sign in" />
        </Section>

        <Section
          n={4}
          id="subscribe"
          title="Subscribe to your calendar"
          audience="Players"
          intro="The Subscribe button under the filter bar turns any view into a live calendar feed. Filters carry through — subscribe to &ldquo;Commander, within 25 mi of Philadelphia, PA&rdquo; and your calendar app updates automatically as new matching events get added."
        >
          <SubscribeDropdownMockup />
          <Steps>
            <Step>
              Set the filter you want (format / radius / location / time
              window). The RCQ-only toggle inside the format dropdown carries
              through too.
            </Step>
            <Step>
              Click <Pill>Subscribe</Pill> under the filter bar.
            </Step>
            <Step>
              Under <strong>Add to calendar</strong>, pick your provider:
              <ul className="mt-1.5 ml-5 space-y-1 list-disc text-sm">
                <li><strong>Add to Google Calendar</strong> &mdash; opens Google&rsquo;s &ldquo;subscribe to this calendar&rdquo; dialog in a new tab.</li>
                <li><strong>Add to Apple Calendar</strong> &mdash; triggers Calendar.app&rsquo;s subscription sheet on macOS/iOS. Won&rsquo;t do anything on other devices &mdash; use Google or Outlook instead.</li>
                <li><strong>Add to Outlook</strong> &mdash; opens Outlook Web&rsquo;s add-by-URL flow. Works for outlook.com and Microsoft 365 accounts.</li>
              </ul>
            </Step>
            <Step>
              Under <strong>iCal feed</strong>, the raw feed is also available:
              <ul className="mt-1.5 ml-5 space-y-1 list-disc text-sm">
                <li><strong>Copy URL</strong> &mdash; the <code>https://</code> ICS feed URL, paste into any calendar that supports remote feeds.</li>
                <li><strong>Download .ics</strong> &mdash; one-time snapshot, won&rsquo;t auto-update.</li>
              </ul>
            </Step>
            <Step>
              Subscribed feeds refresh automatically &mdash; new matching events
              show up in your calendar without you doing anything.
            </Step>
          </Steps>
        </Section>

        <Section
          n={5}
          id="host"
          title="Host an event"
          audience="Organizers"
          intro="Run a store or host a pod? Create events directly from your account. Store-listed organizers go live immediately; everyone else queues for a quick admin review."
        >
          <CreateEventMockup />
          <Steps>
            <Step>
              <Link href="/account/events/new" className={LINK}>Create an event</Link>
              &mdash; fill in title, format, date, time, and venue. Address geocodes
              automatically so it lands on the map.
            </Step>
            <Step>
              Optional: set a capacity to enable RSVP with auto-waitlist; add an event image; mark
              the event private with an invite-only link.
            </Step>
            <Step>
              From your <Link href="/account?tab=events" className={LINK}>My events</Link> tab, you can
              edit, cancel, or hard-delete the event. Edits and cancels propagate
              to any Discord scheduled event you&rsquo;ve linked.
            </Step>
            <Step>
              On the event&rsquo;s edit page, use the <Pill>Discord events</Pill> panel
              at the bottom to push the event into a Discord server&rsquo;s native
              Events tab (per-event, host-only).
            </Step>
          </Steps>
          <TryLink href="/account/events/new" label="Create an event" />
        </Section>

        <Section
          n={6}
          id="bot"
          title="Install the Discord bot"
          audience="Server admins"
          intro="The PlayIRL bot is the foundation for every Discord integration: digest posts, scheduled events, and slash commands all need it installed first. Inviting only takes 30 seconds — no recurring permissions to renew."
        >
          <BotPermissionsMockup />
          <Steps>
            <Step>
              Visit <Link href="/bot" className={LINK}>/bot</Link> and click <Pill>Add to Discord</Pill>.
            </Step>
            <Step>
              Pick a server from the dropdown (you must have <strong>Manage Server</strong> in the target server).
            </Step>
            <Step>
              Approve the requested permissions: <Pill mono>VIEW_CHANNEL</Pill>,
              <Pill mono>SEND_MESSAGES</Pill>, <Pill mono>EMBED_LINKS</Pill>,
              <Pill mono>READ_MESSAGE_HISTORY</Pill>, and <Pill mono>MANAGE_EVENTS</Pill>.
              The last one is what lets the bot create scheduled events; if you
              installed before May 2026, re-invite to grant it.
            </Step>
            <Step>
              Try <Pill mono>/playirl help</Pill> in any channel to confirm
              the bot is reachable. The full slash-command reference is on the{" "}
              <Link href="/bot" className={LINK}>bot page</Link>.
            </Step>
          </Steps>
          <TryLink href="/bot" label="Open the bot page" />
        </Section>

        <Section
          n={7}
          id="channel-subs"
          title="Post events to a Discord channel"
          audience="Server admins"
          intro="Set up a recurring digest (weekly or daily) or per-event reminders that post into one of your server's channels. Filters control what lands — by venue, format, source, or radius."
        >
          <ChannelMessageMockup />
          <Steps>
            <Step>
              Go to <Link href="/account?tab=discord" className={LINK}>Account &rarr; Discord</Link>{" "}
              and click <Pill>+ New auto-post</Pill>.
            </Step>
            <Step>
              Pick the server &amp; channel. Only servers where you have{" "}
              <strong>Manage Server</strong> AND the bot is present show up.
            </Step>
            <Step>
              Choose a cadence: <Pill>Weekly</Pill> digest,{" "}
              <Pill>Daily</Pill> digest, or <Pill>Per-event</Pill> reminder
              (fires at a configurable lead time before each event).
            </Step>
            <Step>
              Set the filter (venue, format, location, radius) and time-of-day.
              The preview panel shows exactly what will land.
            </Step>
            <Step>
              Use the per-card <Pill>Send now</Pill> button to fire one post
              right now without waiting for the next scheduled tick.
            </Step>
            <Step>
              Prefer to stay in Discord? Run <Pill mono>/playirl today</Pill> or{" "}
              <Pill mono>/playirl week</Pill>, then click <Pill>🔁 Subscribe</Pill>{" "}
              under the results to spin up a weekly or daily digest without the
              web form. Manage any post later with the <Pill>⚙️ Manage</Pill>{" "}
              button on it or <Pill mono>/playirl manage</Pill> (pause, re-enable,
              or jump to the web editor).
            </Step>
          </Steps>
          <TryLink href="/account?tab=discord" label="Open the Discord tab" />
        </Section>

        <Section
          n={8}
          id="events-tab-subs"
          title="Add events to a server's Events tab"
          audience="Server admins"
          intro="Push events into a Discord server's native Events tab as guild scheduled events — distinct from channel messages. Two flavors: subscribe (auto-add new matching events forever) or one-shot (push the current matches once)."
          isNew
        >
          <SubscribeOneShotMockup />
          <Steps>
            <Step>
              Click <Pill>Subscribe</Pill> under the filter bar on the homepage
              (or any venue page) and pick{" "}
              <strong>Add to a server&rsquo;s Events tab</strong>.
            </Step>
            <Step>
              Pick the server. The bot must already be installed there with the{" "}
              <Pill mono>MANAGE_EVENTS</Pill> permission &mdash; if not, you&rsquo;ll
              get a clear &ldquo;ask an admin to re-invite&rdquo; error.
            </Step>
            <Step>
              Set the filter (venue, format, near, radius) and how many days
              ahead to look.
            </Step>
            <Step>
              Choose between:
              <ul className="mt-1.5 ml-5 space-y-1 list-disc text-sm">
                <li><strong>Subscribe</strong> &mdash; the cron keeps pushing new matching events as they land. Edits and cancels auto-sync to Discord.</li>
                <li><strong>One-shot</strong> &mdash; push the currently-matching events into the Events tab once, then stop. No ongoing sync.</li>
              </ul>
            </Step>
            <Step>
              Manage existing subs from the{" "}
              <Link href="/account?tab=discord" className={LINK}>Discord tab</Link>{" "}
              &mdash; toggle on/off or delete (already-posted events stay in
              Discord; only new ones stop).
            </Step>
          </Steps>
          <TryLink href="/account?tab=discord&events_tab_open=1" label="Set one up" />
        </Section>

        <Section
          n={9}
          id="sync"
          title="Sync events FROM a Discord server"
          audience="Server admins"
          intro="Connect a Discord server as an event source and the bot will pull matching messages out of designated channels into PlayIRL. Useful for trading events with sister communities."
        >
          <SyncSourcesMockup />
          <Steps>
            <Step>
              Go to <Link href="/account?tab=discord" className={LINK}>Account &rarr; Discord</Link>{" "}
              under <strong>Sync events from Discord</strong>.
            </Step>
            <Step>
              Add the bot to your server (same install as above) and configure
              which channel(s) it should watch.
            </Step>
            <Step>
              Events posted in those channels flow into your PlayIRL feed
              automatically. Source attribution stays visible on the event card
              so people know where it came from.
            </Step>
          </Steps>
          <TryLink href="/account?tab=discord" label="Connect a server" />
        </Section>
      </div>

      <footer className="mt-16 pt-8 border-t border-neutral-200 dark:border-white/10 text-sm text-neutral-600 dark:text-neutral-400 space-y-2">
        <p>
          Something missing or unclear?{" "}
          <a href="https://discord.gg/nM2Ea4NSSh" target="_blank" rel="noopener noreferrer" className={LINK}>
            Ask in our Discord
          </a>{" "}
          or use the <strong className="text-neutral-700 dark:text-neutral-300">Feedback</strong> button at the bottom-right of any page.
        </p>
      </footer>
    </section>
  );
}

// --- Layout primitives ----------------------------------------------------

function TableOfContents() {
  return (
    <nav
      aria-label="Guide sections"
      className="mb-12 rounded-md border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-white/[0.04] p-5"
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-3">
        On this page
      </p>
      <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {SECTIONS.map((s, i) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className="group flex items-baseline gap-2 text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition"
            >
              <span className="text-xs tabular-nums text-neutral-400 dark:text-neutral-500 group-hover:text-neutral-700 dark:group-hover:text-neutral-300 transition">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="flex-1 underline decoration-dotted underline-offset-2 group-hover:decoration-solid" dangerouslySetInnerHTML={{ __html: s.title }} />
              <span className="text-[10px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500 shrink-0">
                {s.audience}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Section({
  n,
  id,
  title,
  audience,
  intro,
  isNew,
  children,
}: {
  n: number;
  id: string;
  title: string;
  audience: string;
  intro: string;
  isNew?: boolean;
  children: React.ReactNode;
}) {
  return (
    <article id={id} className="scroll-mt-8 grid md:grid-cols-[3rem_1fr] gap-x-4 gap-y-3">
      <div className="md:row-span-3 hidden md:flex md:flex-col md:items-center md:gap-2 pt-1">
        <div className="font-mono font-bold text-3xl text-neutral-300 dark:text-neutral-700 tabular-nums leading-none">
          {String(n).padStart(2, "0")}
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3
            className="text-2xl font-[family-name:var(--font-ultra)] font-black text-neutral-900 dark:text-white tracking-tight"
            dangerouslySetInnerHTML={{ __html: title }}
          />
          {isNew && (
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/40 font-semibold">
              New
            </span>
          )}
        </div>
        <p
          className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400"
          dangerouslySetInnerHTML={{ __html: audience }}
        />
      </div>
      <div className="md:col-start-2 space-y-5">
        <p className="text-base text-neutral-700 dark:text-neutral-300 leading-relaxed">
          {intro}
        </p>
        {children}
      </div>
    </article>
  );
}

function Steps({ children }: { children: React.ReactNode }) {
  return (
    <ol className="space-y-3 list-none counter-reset-step pl-0">
      {children}
    </ol>
  );
}

function Step({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3 items-start text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
      <StepDot />
      <span className="flex-1 min-w-0 pt-0.5">{children}</span>
    </li>
  );
}

function StepDot() {
  return (
    <span
      aria-hidden="true"
      className="step-dot mt-0.5 shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white text-[11px] font-bold tabular-nums"
    >
      &bull;
    </span>
  );
}

function TryLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-900 dark:text-white underline decoration-dotted underline-offset-4 hover:decoration-solid transition"
    >
      {label}
      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

// --- Inline UI mockups ----------------------------------------------------
//
// Each mockup is a static, scaled-down recreation of the actual control. We
// avoid real screenshots so the guide stays correct as the UI evolves and
// adapts to dark mode without binary asset overhead.

function MockupFrame({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <figure className="rounded-md border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-900 overflow-hidden">
      <div className="px-3 py-1.5 border-b border-neutral-100 dark:border-white/10 bg-neutral-50 dark:bg-white/[0.04] flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-neutral-300 dark:bg-neutral-700" />
        <span className="w-2 h-2 rounded-full bg-neutral-300 dark:bg-neutral-700" />
        <span className="w-2 h-2 rounded-full bg-neutral-300 dark:bg-neutral-700" />
        <span className="ml-2 text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          {label}
        </span>
      </div>
      <div className="p-5">{children}</div>
    </figure>
  );
}

function FilterBarMockup() {
  return (
    <MockupFrame label="Homepage filter bar">
      <div className="space-y-4">
        {/* Madlib sentence — chip-style underlines mark the clickable words.
            Calendar icon sits inline at the end as the chip-style Subscribe
            trigger; on the real page it opens the per-provider dropdown. */}
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-base">
          <UnderlinedWord>All MTG</UnderlinedWord>
          <span className="text-neutral-500 dark:text-neutral-400">events within</span>
          <UnderlinedWord>10</UnderlinedWord>
          <span className="text-neutral-500 dark:text-neutral-400">miles of</span>
          <UnderlinedWord>Philadelphia, PA</UnderlinedWord>
          <span
            aria-label="Subscribe to calendar"
            className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-white ml-0.5"
          >
            <CalendarSvg />
          </span>
        </div>

        {/* Hint at the orthogonal RCQ-only toggle inside the format
            dropdown — easy to miss without calling it out. */}
        <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
          Inside the <strong className="text-neutral-700 dark:text-neutral-300">All MTG</strong> dropdown, a <Pill>RCQs only</Pill> checkbox stacks on top of any format to narrow to Regional Championship Qualifiers.
        </p>

        {/* View toggle = a horizontal floating pill that lives at the
            bottom of the page on the real site. List is the default. */}
        <div className="pt-1 flex justify-center">
          <div className="inline-flex items-center gap-1 px-1 py-1 rounded-md border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-950 shadow-sm">
            <ViewToggle kind="list" active />
            <ViewToggle kind="calendar" />
            <ViewToggle kind="map" />
          </div>
        </div>
      </div>
    </MockupFrame>
  );
}

function EventCardMockup() {
  return (
    <MockupFrame label="Event card">
      <div className="flex items-center gap-3">
        <div className="text-center w-14 shrink-0">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Sat</div>
          <div className="text-2xl font-[family-name:var(--font-ultra)] font-extrabold text-neutral-900 dark:text-white leading-none">
            12
          </div>
          <div className="text-[10px] text-neutral-500 dark:text-neutral-400">May</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
            <span className="uppercase tracking-wider font-semibold text-neutral-500 dark:text-neutral-400">Commander</span>
          </div>
          <div className="text-sm font-semibold text-neutral-900 dark:text-white truncate">
            Friday Night Magic &mdash; Commander pods
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate underline decoration-dotted underline-offset-2">
            Top Deck Games &mdash; Cherry Hill
          </div>
        </div>
        <Star />
      </div>
    </MockupFrame>
  );
}

function SaveRsvpMockup() {
  return (
    <MockupFrame label="Save &amp; RSVP">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Star filled />
          <span className="text-sm text-neutral-700 dark:text-neutral-300">
            Tap to save &mdash; appears under <strong>Saved events</strong>.
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <RsvpButton label="Going" active />
          <RsvpButton label="Maybe" />
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            14 / 16 going
          </span>
        </div>
      </div>
    </MockupFrame>
  );
}

function SubscribeDropdownMockup() {
  return (
    <MockupFrame label="Subscribe dropdown">
      <div className="rounded-md border border-neutral-100 dark:border-white/10 overflow-hidden bg-white dark:bg-neutral-900">
        <DropdownHeading>Add to calendar</DropdownHeading>
        <DropdownItem icon={<CalendarSvg />} label="Add to Google Calendar" trailing={<ExternalLinkSvg />} />
        <DropdownItem icon={<CalendarSvg />} label="Add to Apple Calendar" trailing={<span className="text-[10px] text-neutral-400">Mac / iOS</span>} />
        <DropdownItem icon={<CalendarSvg />} label="Add to Outlook" trailing={<ExternalLinkSvg />} />
        <div className="border-t border-neutral-100 dark:border-white/10">
          <DropdownHeading>iCal feed</DropdownHeading>
          <DropdownItem icon={<LinkSvg />} label="Copy URL" />
          <DropdownItem icon={<DownloadSvg />} label="Download .ics" />
        </div>
        <div className="border-t border-neutral-100 dark:border-white/10">
          <DropdownHeading>Discord</DropdownHeading>
          <DropdownItem icon={<DiscordIcon className="w-4 h-4 text-neutral-400" />} label="Post events to Discord" trailing={<ChevronSvg />} />
          <DropdownItem icon={<DiscordIcon className="w-4 h-4 text-neutral-400" />} label="Add to a server's Events tab" trailing={<ChevronSvg />} />
        </div>
      </div>
    </MockupFrame>
  );
}

function DropdownHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
      {children}
    </p>
  );
}

function ExternalLinkSvg() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 5h5v5M19 5l-9 9M5 7v12h12" />
    </svg>
  );
}

function CreateEventMockup() {
  return (
    <MockupFrame label="Create event form">
      <div className="space-y-2.5">
        <FormRow label="Title" value="Friday Night Magic" />
        <FormRow label="Format" value="Commander" />
        <div className="grid grid-cols-2 gap-2.5">
          <FormRow label="Date" value="2026-05-15" />
          <FormRow label="Time" value="19:00" />
        </div>
        <FormRow label="Venue" value="Top Deck Games &mdash; Cherry Hill" />
        <FormRow label="Capacity (optional)" value="16" muted />
      </div>
    </MockupFrame>
  );
}

function BotPermissionsMockup() {
  return (
    <MockupFrame label="Required bot permissions">
      <ul className="space-y-2">
        <PermissionRow code="SEND_MESSAGES" desc="Post digests &amp; reminders" />
        <PermissionRow code="EMBED_LINKS" desc="Render event cards as embeds" />
        <PermissionRow code="MANAGE_EVENTS" desc="Create scheduled events in the Events tab" />
      </ul>
    </MockupFrame>
  );
}

function ChannelMessageMockup() {
  return (
    <MockupFrame label="What lands in your channel">
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-full bg-indigo-500 shrink-0 flex items-center justify-center text-[10px] font-bold text-white">
          P
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-300">PlayIRL</span>
            <span className="text-[10px] px-1 py-0.5 rounded bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-semibold">BOT</span>
            <span className="text-[10px] text-neutral-500 dark:text-neutral-400">Today at 9:00 AM</span>
          </div>
          <div className="mt-1 rounded-r-sm border-l-4 border-violet-500 bg-neutral-50 dark:bg-white/[0.04] p-3 space-y-1">
            <p className="text-sm font-semibold text-neutral-900 dark:text-white">This week in Commander</p>
            <p className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed">
              <strong>Fri 5/15</strong> &middot; FNM @ Top Deck Games<br />
              <strong>Sat 5/16</strong> &middot; cEDH pods @ Redcap&rsquo;s Corner<br />
              <strong>Sun 5/17</strong> &middot; Casual Commander @ Game Vault
            </p>
            <a className="text-xs text-indigo-600 dark:text-indigo-300 underline" href="#">View on PlayIRL.gg &rarr;</a>
          </div>
        </div>
      </div>
    </MockupFrame>
  );
}

function SubscribeOneShotMockup() {
  return (
    <MockupFrame label="Subscribe vs one-shot">
      <div className="grid sm:grid-cols-2 gap-2.5">
        <ChoiceCard
          label="Subscribe"
          sub="Auto-add new matching events to the Events tab as they land. Edits sync."
          recommended
        />
        <ChoiceCard
          label="One-shot"
          sub="Push the currently matching events once, then stop. No ongoing sync."
        />
      </div>
    </MockupFrame>
  );
}

function SyncSourcesMockup() {
  return (
    <MockupFrame label="Connected Discord sources">
      <div className="space-y-2">
        <SourceRow name="Philly EDH" channel="#fnm-events" status="active" />
        <SourceRow name="South Jersey Modern" channel="#tournament-updates" status="active" />
        <SourceRow name="Local Game Store Network" channel="#weekly-events" status="paused" />
      </div>
    </MockupFrame>
  );
}

// --- Mockup atoms ----------------------------------------------------------

function UnderlinedWord({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-[family-name:var(--font-ultra)] font-extrabold text-neutral-900 dark:text-white underline decoration-dotted underline-offset-4 decoration-neutral-400">
      {children}
    </span>
  );
}

function Word({ children }: { children: React.ReactNode }) {
  return (
    <strong className="text-neutral-900 dark:text-white underline decoration-dotted underline-offset-2">
      {children}
    </strong>
  );
}

function Pill({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <span
      className={`inline-block align-middle px-1.5 py-0.5 mx-0.5 rounded border text-[11px] ${
        mono ? "font-mono" : "font-medium"
      } bg-neutral-100 text-neutral-800 border-neutral-200 dark:bg-white/[0.06] dark:text-neutral-200 dark:border-white/15`}
    >
      {children}
    </span>
  );
}

function ViewIcon({ kind }: { kind: "list" | "calendar" | "map" }) {
  const className = "inline-block w-4 h-4 align-middle mx-0.5 text-neutral-700 dark:text-neutral-300";
  if (kind === "list") {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-label="list view">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    );
  }
  if (kind === "calendar") {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-label="calendar view">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 3v3m8-3v3M4 9h16M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
      </svg>
    );
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-label="map view">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-1.447-.894L15 9m0 8V9m0 0L9 7" />
    </svg>
  );
}

function ViewToggle({ kind, active }: { kind: "list" | "calendar" | "map"; active?: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-7 h-7 rounded-md border ${
        active
          ? "bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
          : "bg-neutral-50 dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800"
      }`}
    >
      <ViewIcon kind={kind} />
    </span>
  );
}

function CalendarSvg() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 3v3m8-3v3M4 9h16M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
    </svg>
  );
}

function LinkSvg() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 shrink-0 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  );
}

function DownloadSvg() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 shrink-0 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}

function ChevronSvg() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 shrink-0 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function DropdownItem({
  icon,
  label,
  trailing,
}: {
  icon: React.ReactNode;
  label: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300">
      {icon}
      <span className="flex-1">{label}</span>
      {trailing}
    </div>
  );
}

function Star({ filled }: { filled?: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={`w-4 h-4 inline-block align-middle mx-0.5 ${filled ? "text-amber-400" : "text-neutral-400 dark:text-neutral-500"}`}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2}
      aria-label={filled ? "saved" : "save"}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.539 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.539-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.518-4.674z" />
    </svg>
  );
}

function RsvpButton({ label, active }: { label: string; active?: boolean }) {
  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${
        active
          ? "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/40"
          : "bg-neutral-100 text-neutral-700 border-neutral-200 dark:bg-white/[0.06] dark:text-neutral-300 dark:border-white/15"
      }`}
    >
      {label}
    </span>
  );
}

function FormRow({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">{label}</div>
      <div
        className={`px-2.5 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/60 text-sm ${
          muted ? "text-neutral-400 dark:text-neutral-500" : "text-neutral-900 dark:text-white"
        }`}
        dangerouslySetInnerHTML={{ __html: value }}
      />
    </div>
  );
}

function PermissionRow({ code, desc }: { code: string; desc: string }) {
  return (
    <li className="flex items-baseline gap-3">
      <code className="text-xs font-mono px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-white/[0.06] text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-white/15 shrink-0">
        {code}
      </code>
      <span
        className="text-xs text-neutral-600 dark:text-neutral-400"
        dangerouslySetInnerHTML={{ __html: desc }}
      />
    </li>
  );
}

function ChoiceCard({
  label,
  sub,
  recommended,
}: {
  label: string;
  sub: string;
  recommended?: boolean;
}) {
  return (
    <div
      className={`px-3 py-2.5 rounded-md border text-left ${
        recommended
          ? "border-neutral-400 dark:border-neutral-700"
          : "border-neutral-200 dark:border-neutral-700"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-neutral-900 dark:text-white text-sm">{label}</span>
        {recommended && (
          <span className="text-[9px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400 font-semibold">
            Default
          </span>
        )}
      </div>
      <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-snug">{sub}</div>
    </div>
  );
}

function SourceRow({
  name,
  channel,
  status,
}: {
  name: string;
  channel: string;
  status: "active" | "paused";
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded border border-neutral-100 dark:border-white/10 bg-neutral-50 dark:bg-white/[0.02]">
      <DiscordIcon className="w-4 h-4 shrink-0 text-indigo-500" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-neutral-900 dark:text-white truncate">{name}</div>
        <div className="text-[11px] text-neutral-500 dark:text-neutral-400 font-mono truncate">{channel}</div>
      </div>
      <span
        className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold ${
          status === "active"
            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
            : "bg-neutral-200 text-neutral-700 dark:bg-white/10 dark:text-neutral-400"
        }`}
      >
        {status}
      </span>
    </div>
  );
}

const LINK = "underline decoration-dotted underline-offset-2 hover:decoration-solid text-neutral-900 dark:text-white";
