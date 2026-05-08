import { requireRole } from "@/lib/session";
import { listSourcesForUser } from "@/lib/user-sources";
import { botInviteUrl } from "@/lib/discord-bot";
import SubpageShell from "../_components/SubpageShell";
import SourcesList from "./SourcesList";
import GetStartedCard from "./GetStartedCard";

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
          className="text-neutral-900 dark:text-white hover:underline"
        >
          send us a note
        </a>{" "}
        and we'll let you know when it's live.
      </p>
    </div>
  );
}

