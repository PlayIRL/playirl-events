import Link from "next/link";
import { requireRole } from "@/lib/session";
import { listBotGuilds } from "@/lib/discord-bot";
import { listEnabledDiscordSources } from "@/lib/user-sources";
import SubpageShell from "../../_components/SubpageShell";
import PickGuildForm from "./PickGuildForm";

export const dynamic = "force-dynamic";

export default async function PickGuildPage() {
  await requireRole(["user", "organizer", "admin"]);

  const [guilds, claimed] = await Promise.all([
    listBotGuilds(),
    Promise.resolve(listEnabledDiscordSources()),
  ]);
  const claimedIds = new Set(claimed.map((s) => s.external_id));
  const unclaimed = guilds.filter((g) => !claimedIds.has(g.id));

  return (
    <SubpageShell
      title="One more step"
      description="Tell us about the community you just linked. Once we're set, events will start flowing both ways."
    >
      {guilds.length === 0 ? (
        <EmptyState
          emoji="👀"
          heading="We don't see the helper in any server yet"
          body={
            <>
              Did you click <span className="font-medium">Authorize</span> inside Discord? If it didn't stick, head{" "}
              <Link href="/account/sources" className="text-amber-700 dark:text-amber-400 hover:underline">
                back to step 1
              </Link>{" "}
              and try again. Sometimes it takes a few seconds for Discord to register the change.
            </>
          }
        />
      ) : unclaimed.length === 0 ? (
        <EmptyState
          emoji="🤝"
          heading="Already connected"
          body={
            <>
              The only Discords available are already linked to other accounts. If one of those is yours,{" "}
              <Link href="/account/sources" className="text-amber-700 dark:text-amber-400 hover:underline">
                manage it on the sources page
              </Link>.
            </>
          }
        />
      ) : (
        <PickGuildForm guilds={unclaimed} />
      )}
    </SubpageShell>
  );
}

function EmptyState({ emoji, heading, body }: { emoji: string; heading: string; body: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md p-8 text-center space-y-2">
      <p className="text-4xl">{emoji}</p>
      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{heading}</p>
      <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-md mx-auto">{body}</p>
    </div>
  );
}
