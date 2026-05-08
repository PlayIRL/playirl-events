"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  type Mode,
  HINTS,
  INPUT_CLASS,
  Field,
  ModeButton,
  ScheduleAndFilterSections,
  Section,
} from "./_form-controls";

interface Guild {
  id: string;
  name: string;
  icon: string | null;
  bot_present: boolean;
}

interface Channel {
  id: string;
  name: string;
}

export default function AddSubscriptionForm({ inviteUrl }: { inviteUrl: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition cursor-pointer"
      >
        + New auto-post
      </button>
      {open && (
        <FormModal
          inviteUrl={inviteUrl}
          onClose={() => setOpen(false)}
          onCreated={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function FormModal({
  inviteUrl,
  onClose,
  onCreated,
}: {
  inviteUrl: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  // -- guilds + channels --
  const [guilds, setGuilds] = useState<Guild[] | null>(null);
  const [guildsLoading, setGuildsLoading] = useState(true);
  const [reauth, setReauth] = useState(false);
  const [guildId, setGuildId] = useState<string>("");

  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [channelId, setChannelId] = useState<string>("");

  // -- form state --
  const [name, setName] = useState("");
  const [mode, setMode] = useState<Mode>("weekly");
  const [format, setFormat] = useState("");
  const [near, setNear] = useState("");
  const [radiusMiles, setRadiusMiles] = useState<number | "">("");
  const [hourUtc, setHourUtc] = useState(14);
  const [dow, setDow] = useState(1);
  const [daysAhead, setDaysAhead] = useState(7);
  const [lead, setLead] = useState("1h");
  const [customLeadMinutes, setCustomLeadMinutes] = useState<number | "">("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default the time-of-day to ~9am local on first mount, by translating
  // the user's local 9am to its UTC hour. Avoids surprising people in
  // non-Eastern timezones with a default of "9am ET" baked into the schema.
  useEffect(() => {
    const today = new Date();
    today.setHours(9, 0, 0, 0);
    setHourUtc(today.getUTCHours());
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/account/discord/guilds");
        const data = await res.json();
        if (data.reauth) {
          setReauth(true);
        } else if (data.guilds) {
          setGuilds(data.guilds);
          const firstWithBot = data.guilds.find((g: Guild) => g.bot_present);
          if (firstWithBot) setGuildId(firstWithBot.id);
        } else {
          setError(data.error ?? "Couldn't load servers.");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setGuildsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!guildId) {
      setChannels(null);
      setChannelId("");
      return;
    }
    setChannelsLoading(true);
    setChannels(null);
    setChannelId("");
    void (async () => {
      try {
        const res = await fetch(`/api/account/discord/channels?guild_id=${encodeURIComponent(guildId)}`);
        const data = await res.json();
        if (data.reauth) {
          setReauth(true);
        } else if (data.channels) {
          setChannels(data.channels);
        } else {
          setError(data.error ?? "Couldn't load channels.");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setChannelsLoading(false);
      }
    })();
  }, [guildId]);

  const selectedGuild = guilds?.find(g => g.id === guildId);
  const botMissing = selectedGuild && !selectedGuild.bot_present;

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const leadArg = mode === "reminder"
        ? (lead === "custom" ? String(customLeadMinutes) : lead)
        : null;
      const res = await fetch("/api/account/discord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guild_id: guildId,
          channel_id: channelId,
          mode,
          name: name.trim() || null,
          format: format || null,
          near: near || null,
          radius_miles: radiusMiles === "" ? null : Number(radiusMiles),
          hour_utc: hourUtc,
          dow: mode === "weekly" ? dow : null,
          days_ahead: daysAhead,
          lead: leadArg,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = !!guildId && !!channelId && !submitting && !botMissing;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-xl bg-white dark:bg-neutral-900 rounded-md shadow-xl border border-neutral-200 dark:border-neutral-800 max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between sticky top-0 bg-white dark:bg-neutral-900 z-10">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-white">New Discord subscription</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700 dark:hover:text-white text-xl leading-none px-2"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-5">
          {reauth ? (
            <ReauthCard />
          ) : (
            <>
              <Section title="Where should events post?">
                <Field label="Server" hint={HINTS.server}>
                  {guildsLoading ? (
                    <Skeleton />
                  ) : guilds && guilds.length > 0 ? (
                    <select
                      className={INPUT_CLASS}
                      value={guildId}
                      onChange={e => setGuildId(e.target.value)}
                    >
                      <option value="">— pick a server —</option>
                      {guilds.map(g => (
                        <option key={g.id} value={g.id}>
                          {g.name}{!g.bot_present ? " (bot not added yet)" : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <NoGuildsCard inviteUrl={inviteUrl} />
                  )}
                </Field>

                {botMissing && inviteUrl && (
                  <div className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 px-3 py-2 text-xs text-neutral-700 dark:text-neutral-300">
                    The bot isn&apos;t in <strong>{selectedGuild?.name}</strong> yet.{" "}
                    <a href={inviteUrl} target="_blank" rel="noopener noreferrer" className="underline">
                      Add it →
                    </a>
                  </div>
                )}

                {guildId && !botMissing && (
                  <Field label="Channel" hint={HINTS.channel}>
                    {channelsLoading ? (
                      <Skeleton />
                    ) : channels && channels.length > 0 ? (
                      <select
                        className={INPUT_CLASS}
                        value={channelId}
                        onChange={e => setChannelId(e.target.value)}
                      >
                        <option value="">— pick a channel —</option>
                        {channels.map(c => (
                          <option key={c.id} value={c.id}>#{c.name}</option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">No channels found. Make sure the bot can see the channel.</p>
                    )}
                  </Field>
                )}
              </Section>

              <Section title="How often?">
                <div className="grid grid-cols-3 gap-2">
                  <ModeButton current={mode} value="weekly" label="Weekly" sub={HINTS.modeWeekly} onClick={setMode} />
                  <ModeButton current={mode} value="daily" label="Daily" sub={HINTS.modeDaily} onClick={setMode} />
                  <ModeButton current={mode} value="reminder" label="Per-event" sub={HINTS.modeReminder} onClick={setMode} />
                </div>
              </Section>

              <Section title="Name this auto-post">
                <Field label="Title" hint="Optional — defaults to a generated label like &quot;Weekly Commander digest&quot; if blank.">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Friday night Commander digest"
                    maxLength={80}
                    className={INPUT_CLASS}
                  />
                </Field>
              </Section>

              <ScheduleAndFilterSections
                value={{ mode, hourUtc, dow, daysAhead, lead, customLeadMinutes, format, near, radiusMiles }}
                on={{ setHourUtc, setDow, setDaysAhead, setLead, setCustomLeadMinutes, setFormat, setNear, setRadiusMiles }}
              />

              {error && (
                <div className="rounded-md border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {!reauth && (
          <div className="px-5 py-4 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-end gap-2 sticky bottom-0 bg-white dark:bg-neutral-900">
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 transition"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={!canSubmit}
              className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 transition cursor-pointer"
            >
              {submitting ? "Creating…" : "Create auto-post"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Skeleton() {
  return <div className="h-9 rounded-md bg-neutral-100 dark:bg-neutral-800/50 animate-pulse" />;
}

function NoGuildsCard({ inviteUrl }: { inviteUrl: string | null }) {
  return (
    <div className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 p-3 text-xs text-neutral-600 dark:text-neutral-300">
      We couldn&apos;t find any servers where you have <strong>Manage Server</strong> permission.{" "}
      {inviteUrl && (
        <>
          <a href={inviteUrl} target="_blank" rel="noopener noreferrer" className="text-neutral-900 dark:text-white underline">
            Add the bot to a server
          </a>
          {" "}you administer first.
        </>
      )}
    </div>
  );
}

function ReauthCard() {
  return (
    <div className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 p-4 space-y-3">
      <p className="text-sm font-semibold text-neutral-900 dark:text-white">
        Re-authorize Discord to continue
      </p>
      <p className="text-xs text-neutral-600 dark:text-neutral-400">
        We need permission to read which servers you&apos;re in so you can pick one. Sign in with Discord again — this only takes a click.
      </p>
      <button
        onClick={() => signIn("discord")}
        className="px-3 py-1.5 rounded-md bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-white dark:hover:bg-neutral-100 dark:text-neutral-900 text-sm font-medium transition"
      >
        Sign in with Discord
      </button>
    </div>
  );
}
