"use client";
import { useEffect, useRef, useState } from "react";
import { geocodeAddress } from "@/lib/geocode";
import { FormSkeleton } from "@/app/skeleton";

interface ConfigShape {
  location: { zip: string; city: string; state: string; lat: number; lng: number };
  searchRadiusMiles: number;
  daysAhead: number;
  sources: {
    wizardsLocator: boolean;
    topdeck: boolean;
    discord: { guildIds: string[] };
  };
  adminNotificationsChannelId: string;
}

const FIELD = "w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-400/40 dark:focus:ring-white/20";

export default function ConfigPage() {
  const [config, setConfig] = useState<ConfigShape | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [guildsText, setGuildsText] = useState("");
  const [geoStatus, setGeoStatus] = useState<"idle" | "checking" | "found" | "missing">("idle");
  const geoToken = useRef(0);

  async function lookupLocation(partial: ConfigShape["location"]) {
    const parts = [partial.zip, partial.city, partial.state].filter(Boolean).join(", ");
    if (!parts) return;
    const myToken = ++geoToken.current;
    setGeoStatus("checking");
    const result = await geocodeAddress(parts);
    if (myToken !== geoToken.current) return;
    if (result) {
      setConfig((c) => (c ? { ...c, location: { ...c.location, lat: result.latitude, lng: result.longitude } } : c));
      setGeoStatus("found");
    } else {
      setGeoStatus("missing");
    }
  }

  useEffect(() => {
    fetch("/api/admin/config").then((r) => r.json()).then((c: ConfigShape) => {
      setConfig(c);
      setGuildsText(c.sources.discord.guildIds.join("\n"));
    });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!config) return;
    setSaving(true);
    setMessage("");
    const guildIds = guildsText.split("\n").map((s) => s.trim()).filter(Boolean);
    const res = await fetch("/api/admin/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: config.location,
        searchRadiusMiles: Number(config.searchRadiusMiles),
        daysAhead: Number(config.daysAhead),
        sourceWizardsLocator: config.sources.wizardsLocator,
        sourceTopdeck: config.sources.topdeck,
        sourceDiscordGuilds: guildIds,
        adminNotificationsChannelId: config.adminNotificationsChannelId,
      }),
    });
    setSaving(false);
    setMessage(res.ok ? "Saved." : "Save failed.");
    setTimeout(() => setMessage(""), 3000);
  }

  if (!config) return (
    <div className="p-6 lg:p-8 max-w-3xl">
      <FormSkeleton fields={6} />
    </div>
  );

  function update<K extends keyof ConfigShape>(key: K, value: ConfigShape[K]) {
    setConfig((c) => c ? { ...c, [key]: value } : c);
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      <h1 className="text-2xl font-[family-name:var(--font-ultra)] font-bold text-neutral-900 dark:text-neutral-100 mb-2">
        Site config
      </h1>
      <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">
        These values drive the scraper. Changes take effect on the next scrape run.
      </p>

      <form onSubmit={save} className="space-y-6">
        <Section title="Location">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="ZIP">
              <input
                className={FIELD}
                value={config.location.zip}
                onChange={(e) => update("location", { ...config.location, zip: e.target.value })}
                onBlur={() => lookupLocation(config.location)}
              />
            </Field>
            <Field label="City">
              <input
                className={FIELD}
                value={config.location.city}
                onChange={(e) => update("location", { ...config.location, city: e.target.value })}
                onBlur={() => lookupLocation(config.location)}
              />
            </Field>
            <Field label="State">
              <input
                className={FIELD}
                value={config.location.state}
                onChange={(e) => update("location", { ...config.location, state: e.target.value })}
                onBlur={() => lookupLocation(config.location)}
              />
            </Field>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2 min-h-[1rem]">
            {geoStatus === "checking" && "Looking up coordinates…"}
            {geoStatus === "found" && "✓ Coordinates updated for distance filtering."}
            {geoStatus === "missing" && "Couldn't place that. Double-check the city/state/ZIP."}
            {geoStatus === "idle" && "Coordinates are resolved automatically — no manual entry needed."}
          </p>
        </Section>

        <Section title="Search">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Radius (miles)">
              <input className={FIELD} type="number" min={1} value={config.searchRadiusMiles} onChange={(e) => update("searchRadiusMiles", Number(e.target.value))} />
            </Field>
            <Field label="Days ahead">
              <input className={FIELD} type="number" min={1} max={365} value={config.daysAhead} onChange={(e) => update("daysAhead", Number(e.target.value))} />
            </Field>
          </div>
        </Section>

        <Section title="Sources">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.sources.wizardsLocator}
                onChange={(e) => update("sources", { ...config.sources, wizardsLocator: e.target.checked })}
              />
              <span>Wizards Locator (WotC GraphQL)</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.sources.topdeck}
                onChange={(e) => update("sources", { ...config.sources, topdeck: e.target.checked })}
              />
              <span>TopDeck.gg (requires TOPDECK_API_KEY)</span>
            </label>
          </div>
          <Field label="Discord guild IDs (one per line)">
            <textarea
              className={FIELD}
              rows={3}
              value={guildsText}
              onChange={(e) => setGuildsText(e.target.value)}
              placeholder="1451305700322967794"
            />
          </Field>
        </Section>

        <Section title="Admin notifications">
          <p className="text-xs text-neutral-500 dark:text-neutral-400 -mt-1">
            When set, admin activity (signups, Discord connects, sub creates,
            auto-disables, event submissions) gets posted to this Discord
            channel in addition to appearing on the dashboard. Leave empty to
            disable the Discord push — the dashboard feed still works.
          </p>
          <Field label="Discord channel ID">
            <input
              className={FIELD}
              value={config.adminNotificationsChannelId}
              onChange={(e) => update("adminNotificationsChannelId", e.target.value)}
              placeholder="123456789012345678"
            />
          </Field>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Find the channel ID by right-clicking a channel in Discord with
            developer mode enabled (User Settings → Advanced → Developer Mode).
            The PlayIRL bot must already be a member of the guild with permission
            to post.
          </p>
        </Section>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-4 py-2 rounded-md text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 transition"
          >
            {saving ? "Saving…" : "Save config"}
          </button>
          {message && <span className="text-xs text-neutral-600 dark:text-neutral-400">{message}</span>}
        </div>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md p-5">
      <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-3">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">{label}</span>
      {children}
    </label>
  );
}
