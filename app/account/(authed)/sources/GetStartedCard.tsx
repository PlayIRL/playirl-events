import Link from "next/link";
import { DiscordIcon } from "@/app/discord-icon";

/**
 * Two-step "connect your Discord" walkthrough used both on /account/sources
 * and in the dashboard's Discord tab. Tries to add the bot to one of the
 * user's servers, then directs them back here to finish setup.
 *
 * `compact` collapses the intro text — used when this card sits below an
 * existing sources list as a "want to connect another server?" footer.
 */
export default function GetStartedCard({
  inviteUrl,
  compact = false,
}: {
  inviteUrl: string;
  compact?: boolean;
}) {
  return (
    <div className={`bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md ${compact ? "p-4" : "p-6"} space-y-5`}>
      {!compact && (
        <div>
          <h2 className="text-base font-extrabold tracking-tight text-neutral-900 dark:text-neutral-100">Connect in two steps</h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            A curated set of events is exchanged — nothing gets shared without matching your community&apos;s style. You&apos;ll need to be an admin on your Discord to add the helper.
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
                <DiscordIcon className="w-4 h-4" />
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
                Confirm your venue and you&apos;re linked. Events flow both ways — you&apos;ll share out a selection of yours, and see events from other communities in your area.
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

