import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { listSourcesForUser } from "@/lib/user-sources";
import { botInviteUrl } from "@/lib/discord-bot";
import { DiscordIcon } from "@/app/discord-icon";
import EventForm from "../../../../admin/_components/EventForm";
import SubpageShell from "../../_components/SubpageShell";

export const dynamic = "force-dynamic";

export default async function NewAccountEventPage() {
  const user = await getCurrentUser();
  const publishesImmediately = user?.role === "organizer" || user?.role === "admin";
  const hasDiscordSources = user ? listSourcesForUser(user.id).length > 0 : false;
  const discordAvailable = Boolean(botInviteUrl());

  return (
    <SubpageShell
      title="Create an event"
      description={
        publishesImmediately
          ? "Your event goes live immediately and shows up on the public calendar."
          : "Your event will be reviewed by an admin before it appears on the public calendar."
      }
      maxWidth="max-w-3xl"
    >
      {discordAvailable && (
        <Link
          href="/account/sources"
          className="block bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md p-4 hover:border-neutral-300 dark:hover:border-neutral-600 transition-colors group"
        >
          <div className="flex items-center gap-4">
            <div className="shrink-0 w-10 h-10 rounded-md bg-[#5865F2]/10 flex items-center justify-center">
              <DiscordIcon className="w-5 h-5 text-[#5865F2]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                {hasDiscordSources ? "Manage your Discord sync" : "Sync events from Discord"}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                {hasDiscordSources
                  ? "Your connected servers are already mirroring events into PlayIRL."
                  : "Connect your server's scheduled events — they'll appear here automatically."}
              </p>
            </div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-4 h-4 shrink-0 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-300 transition-colors"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>
      )}

      <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
        <span className="flex-1 h-px bg-neutral-200 dark:bg-neutral-800" />
        <span>or build manually</span>
        <span className="flex-1 h-px bg-neutral-200 dark:bg-neutral-800" />
      </div>

      <EventForm endpoint="/api/account/events" method="POST" redirectTo="/account/events" showStatus={false} />
    </SubpageShell>
  );
}
