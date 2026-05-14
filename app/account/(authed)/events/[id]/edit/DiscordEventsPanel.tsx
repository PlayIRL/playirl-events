"use client";

// Manage where the host's event has been pushed to native Discord
// scheduled-event slots (the "Events" tab in a server). Lives at the
// bottom of /account/events/[id]/edit so it sits next to the rest of
// the per-event surface — RSVPs, attendees, etc.
//
// Two interactions:
//   1. List the guilds the event is currently posted to, with a remove
//      button per row that DELETEs from /api/account/events/[id]/discord-events.
//   2. "Add to a server's Events tab" picker that GETs the user's
//      bot-equipped manageable guilds, lets them choose one, then POSTs
//      to the same endpoint.
//
// API errors get rendered inline (most user-actionable case is the
// "bot needs to be re-invited with Manage Events" 422; the route
// composes the friendly copy and we just surface it).

import { useCallback, useEffect, useState } from "react";
import { DiscordIcon } from "@/app/discord-icon";

interface PostRow {
  event_id: string;
  guild_id: string;
  discord_event_id: string;
  posted_at: string;
}

interface GuildOption {
  id: string;
  name: string;
  icon: string | null;
  bot_present: boolean;
}

export default function DiscordEventsPanel({ eventId }: { eventId: string }) {
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [guilds, setGuilds] = useState<GuildOption[]>([]);
  const [guildsByName, setGuildsByName] = useState<Record<string, GuildOption>>({});
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [loadingGuilds, setLoadingGuilds] = useState(false);
  const [picking, setPicking] = useState(false);
  const [busyGuildId, setBusyGuildId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reauthNeeded, setReauthNeeded] = useState(false);

  const loadPosts = useCallback(async () => {
    setLoadingPosts(true);
    try {
      const res = await fetch(
        `/api/account/events/${encodeURIComponent(eventId)}/discord-events`,
      );
      if (!res.ok) {
        // 401 / 403 here means the panel is rendered but the user can't
        // act on this event — just surface a quiet error and stop.
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Couldn't load posts (${res.status})`);
        return;
      }
      const body = (await res.json()) as { posts: PostRow[] };
      setPosts(body.posts);
    } finally {
      setLoadingPosts(false);
    }
  }, [eventId]);

  const loadGuilds = useCallback(async () => {
    setLoadingGuilds(true);
    setError(null);
    setReauthNeeded(false);
    try {
      const res = await fetch("/api/account/discord/guilds");
      const body = (await res.json()) as
        | { guilds: GuildOption[] }
        | { error: string; reauth?: boolean };
      if ("error" in body) {
        if (body.reauth) setReauthNeeded(true);
        setError(body.error);
        return;
      }
      setGuilds(body.guilds);
      setGuildsByName(Object.fromEntries(body.guilds.map((g) => [g.id, g] as const)));
    } finally {
      setLoadingGuilds(false);
    }
  }, []);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  async function add(guildId: string) {
    setBusyGuildId(guildId);
    setError(null);
    try {
      const res = await fetch(
        `/api/account/events/${encodeURIComponent(eventId)}/discord-events`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ guild_id: guildId }),
        },
      );
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        post?: PostRow;
      };
      if (!res.ok) {
        setError(body.error ?? `Failed (${res.status})`);
        return;
      }
      // Close the picker on success and refresh the list.
      setPicking(false);
      await loadPosts();
    } finally {
      setBusyGuildId(null);
    }
  }

  async function remove(guildId: string) {
    if (!confirm("Remove this event from that server's Events tab?")) return;
    setBusyGuildId(guildId);
    setError(null);
    try {
      const res = await fetch(
        `/api/account/events/${encodeURIComponent(eventId)}/discord-events`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ guild_id: guildId }),
        },
      );
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? `Failed (${res.status})`);
        return;
      }
      await loadPosts();
    } finally {
      setBusyGuildId(null);
    }
  }

  // Guilds the user can ADD to: those with bot present, minus already-posted.
  const postedGuildIds = new Set(posts.map((p) => p.guild_id));
  const addable = guilds.filter((g) => g.bot_present && !postedGuildIds.has(g.id));
  const missingBot = guilds.filter((g) => !g.bot_present);

  function openPicker() {
    setPicking(true);
    if (guilds.length === 0) void loadGuilds();
  }

  return (
    <section className="space-y-4 pt-6 border-t border-neutral-200/70 dark:border-white/8">
      <div>
        <h2 className="text-base font-extrabold tracking-tight text-neutral-900 dark:text-neutral-100">
          Discord Events tab
        </h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
          Push this event into a Discord server&apos;s Events tab so members
          can RSVP through Discord directly. Different from a digest
          subscription — this is a one-time create per server.
        </p>
      </div>

      {error && (
        <div role="alert" className="text-sm bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-500/30 text-red-900 dark:text-red-200 rounded-md p-3">
          <p>{error}</p>
          {reauthNeeded && (
            <a
              href="/api/auth/signin/discord?callbackUrl=%2Faccount%2Fevents"
              className="inline-block mt-2 text-xs font-medium underline"
            >
              Sign in with Discord again →
            </a>
          )}
        </div>
      )}

      {/* Already-posted list */}
      {loadingPosts ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading…</p>
      ) : posts.length > 0 ? (
        <ul className="space-y-2">
          {posts.map((p) => {
            const meta = guildsByName[p.guild_id];
            const name = meta?.name ?? `Server ${p.guild_id.slice(0, 6)}…`;
            return (
              <li
                key={p.guild_id}
                className="flex items-center gap-3 rounded-md border border-neutral-200 dark:border-neutral-800 px-3 py-2 bg-white dark:bg-neutral-900"
              >
                <DiscordIcon className="w-4 h-4 text-neutral-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">{name}</p>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    Posted {new Date(p.posted_at + "Z").toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(p.guild_id)}
                  disabled={busyGuildId === p.guild_id}
                  className="text-xs px-3 py-1.5 rounded-md border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950 disabled:opacity-50"
                >
                  {busyGuildId === p.guild_id ? "Removing…" : "Remove"}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Not posted to any servers yet.
        </p>
      )}

      {/* Picker */}
      {!picking ? (
        <button
          type="button"
          onClick={openPicker}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white text-xs font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800 transition cursor-pointer"
        >
          <DiscordIcon className="w-3.5 h-3.5" />
          Add to a server&apos;s Events tab
        </button>
      ) : (
        <div className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Pick a server
            </h3>
            <button
              type="button"
              onClick={() => setPicking(false)}
              className="text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
            >
              Cancel
            </button>
          </div>
          {loadingGuilds ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading your servers…</p>
          ) : guilds.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              No servers found. The bot has to be added to a server you can
              manage before you can post events to it.
            </p>
          ) : (
            <ul className="space-y-1">
              {addable.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => add(g.id)}
                    disabled={busyGuildId === g.id}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left rounded-md hover:bg-neutral-50 dark:hover:bg-white/5 disabled:opacity-50"
                  >
                    {g.icon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={g.icon} alt="" width={24} height={24} className="w-6 h-6 rounded-md shrink-0" />
                    ) : (
                      <span className="w-6 h-6 rounded-md bg-neutral-200 dark:bg-neutral-700 shrink-0" />
                    )}
                    <span className="flex-1 text-sm text-neutral-900 dark:text-neutral-100 truncate">
                      {g.name}
                    </span>
                    {busyGuildId === g.id && (
                      <span className="text-xs text-neutral-500">Adding…</span>
                    )}
                  </button>
                </li>
              ))}
              {addable.length === 0 && missingBot.length === 0 && (
                <li className="text-sm text-neutral-500 dark:text-neutral-400 px-3 py-2">
                  This event is already posted to every server you can manage.
                </li>
              )}
            </ul>
          )}
          {missingBot.length > 0 && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400 pt-2 border-t border-neutral-100 dark:border-white/8">
              {missingBot.length} server{missingBot.length === 1 ? "" : "s"} you
              manage{missingBot.length === 1 ? " doesn't" : " don't"} have the bot
              yet. Add it from <a href="/account?tab=discord" className="underline">your account</a>.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
