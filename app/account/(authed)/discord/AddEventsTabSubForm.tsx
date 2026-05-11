"use client";

// Modal form for creating an "events tab" sub. Companion to
// AddSubscriptionForm (channel-message digests) but produces Discord guild
// scheduled events instead. Lets the user pick:
//   - which guild's Events tab to target
//   - filter (venue OR radius+near, format)
//   - "subscribe" toggle: keep posting new matches forever (default) OR
//     just push currently-matching events once and stop
//
// Auto-opens when ?events_tab_open=1 is in the URL — the Subscribe-dropdown
// "Add to a server's Events tab" item navigates here with that flag.

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  FORMAT_OPTIONS,
  HINTS,
  INPUT_CLASS,
  Field,
  Section,
} from "./_form-controls";

interface Guild {
  id: string;
  name: string;
  icon: string | null;
  bot_present: boolean;
}

export interface EventsTabSubDefaults {
  /** Pre-fill the "near" location label from the user's saved preferences. */
  near: string;
  /** Pre-fill the radius from the user's saved preferences. */
  radius_miles: number;
}

export default function AddEventsTabSubForm({
  inviteUrl,
  defaults,
}: {
  inviteUrl: string | null;
  defaults: EventsTabSubDefaults;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  // Auto-open from the calendar-feed Subscribe dropdown.
  const autoOpen = searchParams.get("events_tab_open") === "1";
  const venuePrefill = searchParams.get("venue") ?? "";
  const nearPrefill = searchParams.get("near") ?? "";
  const radiusPrefill = searchParams.get("radius") ?? "";

  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  return (
    <div>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition cursor-pointer"
      >
        + Add server&rsquo;s Events tab
      </button>
      {open && (
        <FormModal
          inviteUrl={inviteUrl}
          venuePrefill={venuePrefill}
          nearPrefill={nearPrefill}
          radiusPrefill={radiusPrefill}
          defaults={defaults}
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
  venuePrefill,
  nearPrefill,
  radiusPrefill,
  defaults,
  onClose,
  onCreated,
}: {
  inviteUrl: string | null;
  venuePrefill?: string;
  nearPrefill?: string;
  radiusPrefill?: string;
  defaults: EventsTabSubDefaults;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [guilds, setGuilds] = useState<Guild[] | null>(null);
  const [guildsLoading, setGuildsLoading] = useState(true);
  const [reauth, setReauth] = useState(false);
  const [guildId, setGuildId] = useState<string>("");

  const [name, setName] = useState("");
  const [venueName, setVenueName] = useState(venuePrefill ?? "");
  // Seed from URL prefill first, then the user's Overview-tab preferences,
  // then empty. A venue scope (set above) overrides both at submit time.
  const [near, setNear] = useState(nearPrefill || (venuePrefill ? "" : defaults.near));
  const [radiusMiles, setRadiusMiles] = useState<number | "">(
    radiusPrefill
      ? Number(radiusPrefill)
      : venuePrefill ? "" : defaults.radius_miles,
  );
  const [format, setFormat] = useState("");
  const [daysAhead, setDaysAhead] = useState(30);

  // Default to subscribe — the dropdown context is "ongoing calendar feed",
  // so an ongoing sub is the natural fit. The toggle lets users opt into
  // the one-shot path explicitly.
  const [subscribe, setSubscribe] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ matched: number; posted: number; skipped: number; subscribed: boolean } | null>(null);

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

  const selectedGuild = guilds?.find(g => g.id === guildId);
  const botMissing = selectedGuild && !selectedGuild.bot_present;

  async function submit() {
    setError(null);
    setResult(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/account/discord-event-subs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guild_id: guildId,
          subscribe,
          name: name.trim() || null,
          venue_name: venueName.trim() || null,
          format: format || null,
          near: near.trim() || null,
          radius_miles: radiusMiles === "" ? null : Number(radiusMiles),
          days_ahead: daysAhead,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult({
        matched: data.matched,
        posted: data.posted,
        skipped: data.skipped,
        subscribed: data.subscribed,
      });
      // If they subscribed, refresh the page to surface the new sub card.
      // For one-shot pushes, leave the modal open with the result summary
      // so they can see what happened.
      if (subscribe) {
        setTimeout(onCreated, 1500);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  // Every sub needs a scope — either a venue OR (location + radius). Block
  // submit until one path is satisfied so users don't end up auto-syncing
  // events from across the country into their Discord Events tab.
  const scopeOk = venueName.trim() !== ""
    || (near.trim() !== "" && radiusMiles !== "" && Number(radiusMiles) > 0);

  const canSubmit = !!guildId && !submitting && !botMissing && scopeOk;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-xl bg-white dark:bg-neutral-900 rounded-md shadow-xl border border-neutral-200 dark:border-neutral-800 max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between sticky top-0 bg-white dark:bg-neutral-900 z-10">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-white">Add events to a server&rsquo;s Events tab</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700 dark:hover:text-white text-xl leading-none px-2"
          >
            &times;
          </button>
        </div>

        <div className="p-5 space-y-5">
          {reauth ? (
            <ReauthCard />
          ) : (
            <>
              <Section title="Where should events go?">
                <Field label="Server" hint={HINTS.server}>
                  {guildsLoading ? (
                    <Skeleton />
                  ) : guilds && guilds.length > 0 ? (
                    <select
                      className={INPUT_CLASS}
                      value={guildId}
                      onChange={e => setGuildId(e.target.value)}
                    >
                      <option value="">&mdash; pick a server &mdash;</option>
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
                    The bot isn&rsquo;t in <strong>{selectedGuild?.name}</strong> yet.{" "}
                    <a href={inviteUrl} target="_blank" rel="noopener noreferrer" className="underline">
                      Add it &rarr;
                    </a>
                  </div>
                )}
              </Section>

              <Section title="What should it post?">
                <Field label="Title" hint="Optional &mdash; helps you find this sub later in your dashboard.">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Philly EDH events"
                    maxLength={80}
                    className={INPUT_CLASS}
                  />
                </Field>
                <Field label="Venue scope" hint="Optional &mdash; when set, posts only events at this exact venue and ignores the radius below.">
                  <input
                    type="text"
                    value={venueName}
                    onChange={(e) => setVenueName(e.target.value)}
                    placeholder="e.g. Top Deck Games - Cherry Hill"
                    maxLength={120}
                    className={INPUT_CLASS}
                  />
                </Field>
                <Field label="Format" hint={HINTS.format}>
                  <select className={INPUT_CLASS} value={format} onChange={e => setFormat(e.target.value)}>
                    {FORMAT_OPTIONS.map(o => (
                      <option key={o} value={o}>{o || "All formats"}</option>
                    ))}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label={venueName.trim() === "" ? "Near *" : "Near"}
                    hint={HINTS.near}
                  >
                    <input
                      type="text"
                      className={INPUT_CLASS}
                      value={near}
                      onChange={e => setNear(e.target.value)}
                      placeholder="e.g. Philadelphia, PA"
                      required={venueName.trim() === ""}
                      aria-required={venueName.trim() === ""}
                    />
                  </Field>
                  <Field
                    label={venueName.trim() === "" ? "Radius (miles) *" : "Radius (miles)"}
                    hint={HINTS.radius}
                  >
                    <input
                      type="number"
                      min={1}
                      max={500}
                      className={INPUT_CLASS}
                      value={radiusMiles}
                      onChange={e => setRadiusMiles(e.target.value === "" ? "" : Number(e.target.value))}
                      placeholder={venueName.trim() === "" ? "Required" : "(no limit)"}
                      required={venueName.trim() === ""}
                      aria-required={venueName.trim() === ""}
                    />
                  </Field>
                </div>
                {!scopeOk && (
                  <div className="rounded-md border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                    Set a <strong>Venue scope</strong> above OR fill in both <strong>Near</strong> and <strong>Radius</strong>. An Events-tab subscription needs a scope so it doesn&apos;t pull events from nationwide.
                  </div>
                )}
                <Field label="Days ahead to include" hint="How far ahead to look for matching events. Default 30.">
                  <input
                    type="number"
                    min={1}
                    max={60}
                    className={INPUT_CLASS}
                    value={daysAhead}
                    onChange={e => setDaysAhead(Number(e.target.value))}
                  />
                </Field>
              </Section>

              <Section title="One-shot or subscribe?">
                <div className="grid grid-cols-2 gap-2">
                  <ChoiceCard
                    active={subscribe}
                    label="Subscribe"
                    sub="Keep posting new matching events to this server's Events tab as they land."
                    onClick={() => setSubscribe(true)}
                  />
                  <ChoiceCard
                    active={!subscribe}
                    label="One-shot"
                    sub="Push the matching events once, then stop. No ongoing sync."
                    onClick={() => setSubscribe(false)}
                  />
                </div>
              </Section>

              {result && (
                <div className="rounded-md border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 text-xs text-emerald-900 dark:text-emerald-200">
                  <p className="font-semibold">
                    {result.posted > 0
                      ? `Posted ${result.posted} event${result.posted === 1 ? "" : "s"} to the server's Events tab.`
                      : result.matched === 0
                        ? "No matching events found in your time window."
                        : "All matching events were already posted to this server."}
                  </p>
                  {result.skipped > 0 && (
                    <p className="opacity-80">{result.skipped} already posted &mdash; skipped.</p>
                  )}
                  {result.subscribed && (
                    <p className="opacity-80">Subscribed &mdash; new matches will auto-post.</p>
                  )}
                </div>
              )}

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
              {result ? "Close" : "Cancel"}
            </button>
            {!result && (
              <button
                onClick={submit}
                disabled={!canSubmit}
                className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 transition cursor-pointer"
              >
                {submitting ? (subscribe ? "Subscribing…" : "Pushing…") : (subscribe ? "Subscribe + push now" : "Push events now")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ChoiceCard({
  active,
  label,
  sub,
  onClick,
}: {
  active: boolean;
  label: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left px-3 py-2.5 rounded-md border text-sm transition ${
        active
          ? "border-neutral-900 dark:border-white ring-1 ring-neutral-900 dark:ring-white"
          : "border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800"
      }`}
    >
      <div className="font-semibold text-neutral-900 dark:text-white">{label}</div>
      <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 leading-snug">{sub}</div>
    </button>
  );
}

function Skeleton() {
  return <div className="h-9 rounded-md bg-neutral-100 dark:bg-neutral-800/50 animate-pulse" />;
}

function NoGuildsCard({ inviteUrl }: { inviteUrl: string | null }) {
  return (
    <div className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 p-3 text-xs text-neutral-600 dark:text-neutral-300">
      We couldn&rsquo;t find any servers where you have <strong>Manage Server</strong> permission.{" "}
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
        We need permission to read which servers you&rsquo;re in so you can pick one. Sign in with Discord again &mdash; this only takes a click.
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
