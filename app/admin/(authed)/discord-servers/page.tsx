import { requireRole } from "@/lib/session";
import { listDiscordServerRows } from "@/lib/discord-servers-admin";
import DiscordServerRow from "./DiscordServerRow";
import BulkActionsBar from "./BulkActionsBar";

export const dynamic = "force-dynamic";

export default async function AdminDiscordServersPage() {
  await requireRole("admin");

  const rows = listDiscordServerRows();

  return (
    <div className="p-6 lg:p-8 max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-[family-name:var(--font-ultra)] font-bold text-neutral-900 dark:text-neutral-100">
          Discord servers
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 max-w-2xl">
          Every Discord guild we touch — both servers we pull events from
          (admin-configured + user-connected) and servers we post events to
          (channel digests + Events-tab subs). Use "Pull now" to ingest a
          single guild's scheduled events without waiting for the nightly
          scrape; use "Dispatch now" to fire that guild's subs out of band.
          Dispatch honors the idempotency ledger — buckets already posted
          for the current week won't double-post.
        </p>
      </header>

      <BulkActionsBar hasGuilds={rows.length > 0} />

      {rows.length === 0 ? (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md p-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
          No Discord servers connected. Add guild IDs in{" "}
          <a href="/admin/config" className="underline">
            Site config
          </a>{" "}
          or wait for a user to connect one via /account.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <DiscordServerRow key={row.guildId} row={row} />
          ))}
        </ul>
      )}
    </div>
  );
}
