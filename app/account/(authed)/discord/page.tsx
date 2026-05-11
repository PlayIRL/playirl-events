import { requireRole } from "@/lib/session";
import { listSubscriptionsManageableByUser } from "@/lib/discord-subscriptions";
import { botInviteUrl } from "@/lib/discord-bot";
import { getPreferences } from "@/lib/user-preferences";
import { getConfig } from "@/lib/runtime-config";
import SubpageShell from "../_components/SubpageShell";
import SubscriptionsList from "./SubscriptionsList";
import AddSubscriptionForm from "./AddSubscriptionForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Discord auto-posts — PlayIRL.GG",
  description: "Schedule recurring event posts to your Discord channels.",
};

export default async function DiscordAccountPage() {
  const user = await requireRole(["user", "organizer", "admin"]);
  const subs = listSubscriptionsManageableByUser(user.id);
  const inviteUrl = botInviteUrl();
  const prefs = getPreferences(user.id);
  const config = getConfig();
  const fallbackLocationLabel = `${config.location.city}, ${config.location.state}`;
  const formDefaults = {
    near: prefs.location_label?.trim() || fallbackLocationLabel,
    radius_miles: prefs.radius_miles || 25,
  };

  return (
    <SubpageShell
      title="Discord auto-posts"
      description="Schedule recurring event posts to your Discord channels. Pick a channel, set a cadence, choose what to include — the bot does the rest."
      maxWidth="max-w-3xl"
      actions={<AddSubscriptionForm inviteUrl={inviteUrl} defaults={formDefaults} />}
    >
      {subs.length === 0 ? (
        <EmptyState inviteUrl={inviteUrl} />
      ) : (
        <SubscriptionsList subscriptions={subs} />
      )}
    </SubpageShell>
  );
}

function EmptyState({ inviteUrl }: { inviteUrl: string | null }) {
  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 rounded-md p-6 space-y-3">
      <p className="text-base font-semibold text-neutral-900 dark:text-white">No auto-posts yet</p>
      <p className="text-sm text-neutral-600 dark:text-neutral-300">
        Click <strong>+ New auto-post</strong> above to set one up. We&apos;ll show you which of your servers already have the bot, then you pick a channel and a schedule.
      </p>
      <div className="pt-1 flex flex-wrap gap-2">
        {inviteUrl && (
          <a
            href={inviteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-200 font-medium text-sm transition"
          >
            Add bot to a new server
          </a>
        )}
        <a
          href="/bot"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-200 font-medium text-sm transition"
        >
          Bot overview
        </a>
      </div>
    </div>
  );
}
