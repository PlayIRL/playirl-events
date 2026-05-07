import Link from "next/link";
import { requireRole } from "@/lib/session";
import { listSourcesForUser } from "@/lib/user-sources";
import { botInviteUrl } from "@/lib/discord-bot";
import SubpageShell from "../_components/SubpageShell";
import SourcesList from "./SourcesList";

export const dynamic = "force-dynamic";

export default async function AccountSourcesPage() {
  const user = await requireRole(["user", "organizer", "admin"]);
  const sources = listSourcesForUser(user.id);
  const inviteUrl = botInviteUrl();
  const hasSources = sources.length > 0;

  return (
    <SubpageShell
      title="Connect your community"
      description="Link your Discord with PlayIRL to trade events with other MTG groups nearby. You'll share a selection of your events out, and see what other local communities are running."
      maxWidth="max-w-3xl"
    >
      {!inviteUrl ? (
        <NotAvailableYet />
      ) : hasSources ? (
        <>
          <SourcesList sources={sources} />
          <div className="pt-2">
            <GetStartedCard inviteUrl={inviteUrl} compact />
          </div>
        </>
      ) : (
        <GetStartedCard inviteUrl={inviteUrl} />
      )}
    </SubpageShell>
  );
}

function NotAvailableYet() {
  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md p-6 text-center space-y-2">
      <p className="text-4xl">🔌</p>
      <p className="text-sm text-neutral-700 dark:text-neutral-200 font-medium">
        Community connections aren't open yet
      </p>
      <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-md mx-auto">
        We're still wiring this up. Check back soon — or{" "}
        <a
          href="mailto:info@cardslinger.shop?subject=PlayIRL%20community%20connections"
          className="text-amber-700 dark:text-amber-400 hover:underline"
        >
          send us a note
        </a>{" "}
        and we'll let you know when it's live.
      </p>
    </div>
  );
}

function GetStartedCard({ inviteUrl, compact = false }: { inviteUrl: string; compact?: boolean }) {
  return (
    <div className={`bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md ${compact ? "p-4" : "p-6"} space-y-5`}>
      {!compact && (
        <div>
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Connect in two steps</h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            A curated set of events is exchanged — nothing gets shared without matching your community's style. You'll need to be an admin on your Discord to add the helper.
          </p>
        </div>
      )}

      <ol className="space-y-4">
        <Step
          n={1}
          title="Add the helper to your Discord"
          body={
            <>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                Opens Discord in a new tab. Pick your server and hit Authorize. The helper only sees your scheduled events — not chat, DMs, or members.
              </p>
              <a
                href={inviteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-[#5865F2] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#4752c4] transition"
              >
                <DiscordMark />
                Open Discord
              </a>
            </>
          }
        />
        <Step
          n={2}
          title="Come back and set things up"
          body={
            <>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                Confirm your venue and you're linked. Events flow both ways — you'll share out a selection of yours, and see events from other communities in your area.
              </p>
              <Link
                href="/account/sources/pick-guild"
                className="inline-flex items-center bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-4 py-2 rounded-md text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition"
              >
                I added it — set it up
              </Link>
            </>
          }
        />
      </ol>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 w-7 h-7 rounded-full bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-semibold flex items-center justify-center">
        {n}
      </span>
      <div className="flex-1">
        <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{title}</h3>
        <div className="mt-1">{body}</div>
      </div>
    </li>
  );
}

function DiscordMark() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.369A19.791 19.791 0 0 0 16.558 3c-.177.318-.384.744-.527 1.084a18.251 18.251 0 0 0-5.064 0A12.495 12.495 0 0 0 10.441 3a19.74 19.74 0 0 0-3.76 1.369C3.097 9.42 2.12 14.338 2.606 19.173a19.93 19.93 0 0 0 6.073 3.066c.49-.671.927-1.384 1.302-2.134a12.9 12.9 0 0 1-2.053-.978c.172-.127.341-.259.504-.395 3.96 1.825 8.243 1.825 12.152 0 .165.136.334.268.504.395-.655.39-1.344.72-2.056.98.375.749.812 1.462 1.302 2.133a19.897 19.897 0 0 0 6.077-3.066c.573-5.583-.978-10.46-4.093-14.805zM8.02 16.353c-1.217 0-2.22-1.129-2.22-2.513 0-1.383.98-2.513 2.22-2.513 1.245 0 2.243 1.14 2.221 2.513 0 1.384-.98 2.513-2.22 2.513zm7.96 0c-1.217 0-2.22-1.129-2.22-2.513 0-1.383.98-2.513 2.22-2.513 1.244 0 2.243 1.14 2.221 2.513 0 1.384-.977 2.513-2.22 2.513z" />
    </svg>
  );
}
