"use client";
import { useEffect, useRef, useState } from "react";
import { geocodeAddress } from "@/lib/geocode";
import { FormSkeleton } from "@/app/skeleton";

type ScrapeScope = "local" | "national";
type RegionKey = "CONUS" | "CA" | "UK_IE" | "EU" | "AU_NZ" | "JP";

const REGION_OPTIONS: { key: RegionKey; label: string; help: string; anchors: number }[] = [
  { key: "CONUS", label: "United States (CONUS)", help: "75 anchors covering the lower 48. The historical default.", anchors: 75 },
  { key: "CA", label: "Canada", help: "18 anchors from Vancouver to St. John's.", anchors: 18 },
  { key: "UK_IE", label: "United Kingdom + Ireland", help: "18 anchors across England, Scotland, Wales, NI, and Ireland.", anchors: 18 },
  { key: "EU", label: "Continental Europe", help: "53 anchors covering WPN-active countries (France, DACH, Iberia, Italy, Nordics, BeNeLux, Poland, Czechia, Greece).", anchors: 53 },
  { key: "AU_NZ", label: "Australia + New Zealand", help: "14 perimeter anchors. Wide radii where cities are far apart.", anchors: 14 },
  { key: "JP", label: "Japan", help: "16 anchors hugging the Tokaido corridor + Hokkaido / Kyushu / Okinawa.", anchors: 16 },
];

interface ConfigShape {
  location: { zip: string; city: string; state: string; lat: number; lng: number };
  searchRadiusMiles: number;
  daysAhead: number;
  scrapeScope: ScrapeScope;
  /** Active named region grids. Empty array = legacy/CONUS default. */
  scrapeRegionKeys: RegionKey[];
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
        scrapeScope: config.scrapeScope,
        scrapeRegionKeys: config.scrapeRegionKeys,
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

  const isNational = config.scrapeScope === "national";

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
        <h1 className="text-2xl font-[family-name:var(--font-ultra)] font-bold text-neutral-900 dark:text-neutral-100">
          Site config
        </h1>
        <span
          className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-md ${
            isNational
              ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
              : "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
          }`}
          title="Current scrape mode (editable in the Scrape mode section below)"
        >
          Scrape mode: {config.scrapeScope}
        </span>
      </div>
      <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">
        Site-wide defaults that affect the scraper and the user-facing app. Each
        section below describes what its values actually do; some are only used
        in specific scrape modes.
      </p>

      <form onSubmit={save} className="space-y-6">
        <Section
          title="Scrape mode"
          help="Local mode scrapes one region around the Location below using the Search radius / days-ahead. National mode sweeps all anchors from the Regions section below — Location and Search settings are unused in that mode. Most production setups run national."
        >
          <div className="space-y-2">
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                checked={config.scrapeScope === "national"}
                onChange={() => update("scrapeScope", "national")}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">National</span>
                <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                  Sweep every grid you&apos;ve checked in the Regions section below. Heaviest scrape; broadest coverage.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                checked={config.scrapeScope === "local"}
                onChange={() => update("scrapeScope", "local")}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">Local</span>
                <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                  Single region centered on the Location below, within the Search radius. Regions are ignored. Faster but limited to that area.
                </span>
              </span>
            </label>
          </div>
        </Section>

        <Section
          title="Location"
          help={`Default lat/lng for the user-facing app — what signed-in users see as "near me" before they set their own location, plus the default center for ICS calendar feeds. ${
            isNational
              ? "Does NOT control where the scraper looks in national mode."
              : "Also the search center for the scraper in local mode."
          }`}
        >
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="ZIP / Postcode">
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
            <Field label="State / Region">
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
            {geoStatus === "found" && "✓ Coordinates updated."}
            {geoStatus === "missing" && "Couldn't place that. Double-check the city / region / postcode."}
            {geoStatus === "idle" && "Coordinates are resolved automatically — no manual entry needed."}
          </p>
        </Section>

        <Section
          title="Search"
          help={
            isNational
              ? "Only used in local scrape mode. You're in national mode, so these values are currently dormant."
              : "Used in local scrape mode to bound the scraper: how far from Location to search for stores, and how many days of future events to fetch."
          }
          dimmed={isNational}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Radius (miles)">
              <input
                className={FIELD}
                type="number"
                min={1}
                value={config.searchRadiusMiles}
                onChange={(e) => update("searchRadiusMiles", Number(e.target.value))}
              />
            </Field>
            <Field label="Days ahead">
              <input
                className={FIELD}
                type="number"
                min={1}
                max={365}
                value={config.daysAhead}
                onChange={(e) => update("daysAhead", Number(e.target.value))}
              />
            </Field>
          </div>
        </Section>

        <Section
          title="Regions"
          help={
            isNational
              ? "Which country grids the national-mode scraper sweeps. Each anchor costs ~2 API calls per scrape (one for stores, one for events). Leaving everything unchecked falls back to the historical CONUS-only default. International events get country/currency stamped automatically."
              : "Only used in national scrape mode. You're in local mode, so these toggles are currently dormant — switch the Scrape mode above to National to use them."
          }
          dimmed={!isNational}
        >
          <div className="grid sm:grid-cols-2 gap-2">
            {REGION_OPTIONS.map((opt) => {
              const checked = config.scrapeRegionKeys.includes(opt.key);
              return (
                <label key={opt.key} className="flex items-start gap-2 text-sm cursor-pointer p-2 rounded-md hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...config.scrapeRegionKeys, opt.key]
                        : config.scrapeRegionKeys.filter((k) => k !== opt.key);
                      update("scrapeRegionKeys", next);
                    }}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium block leading-tight">{opt.label}</span>
                    <span className="block text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{opt.help}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {/* Live anchor count + cost hint. Compute from the checked region
              options; falls back to CONUS's 75 when nothing's checked so the
              "historical default" copy matches what would actually run. */}
          {(() => {
            const totalAnchors = config.scrapeRegionKeys.length === 0
              ? 75 // CONUS fallback
              : REGION_OPTIONS
                  .filter((o) => config.scrapeRegionKeys.includes(o.key))
                  .reduce((sum, o) => sum + o.anchors, 0);
            const apiCalls = totalAnchors * 2; // store + events per anchor
            if (config.scrapeRegionKeys.length === 0) {
              return (
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
                  No regions selected — falling back to CONUS-only ({totalAnchors} anchors, ~{apiCalls} API calls per scrape).
                </p>
              );
            }
            return (
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
                {totalAnchors} anchors active · ~{apiCalls} API calls per scrape
                {isNational ? "" : " (dormant — National mode not selected)"}
              </p>
            );
          })()}
        </Section>

        <Section
          title="Sources"
          help="Which event feeds the scraper pulls from. Disabling a source skips it on the next run; the events it previously contributed stay in the DB and can be archived through /admin/events."
        >
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
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Discord guilds added here are scraped on every run. Users can also
            connect their own guilds from /account — manage all connected
            guilds (admin + user) from{" "}
            <a href="/admin/discord-servers" className="underline">/admin/discord-servers</a>.
          </p>
        </Section>

        <Section
          title="Admin notifications"
          help="Pushes user-initiated activity (signups, Discord connects, sub creates, auto-disables, event submissions) to a Discord channel. Leave empty to disable the push — the dashboard feed at /admin still works."
        >
          <Field label="Discord channel ID">
            <input
              className={FIELD}
              value={config.adminNotificationsChannelId}
              onChange={(e) => update("adminNotificationsChannelId", e.target.value)}
              placeholder="123456789012345678"
            />
          </Field>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Right-click a channel in Discord with developer mode enabled to copy
            its ID. The PlayIRL bot must already be a member of the guild with
            permission to post.
          </p>
        </Section>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50 transition"
          >
            {saving ? "Saving…" : "Save config"}
          </button>
          {message && <span className="text-xs text-neutral-600 dark:text-neutral-400">{message}</span>}
        </div>
      </form>
    </div>
  );
}

function Section({
  title,
  help,
  dimmed = false,
  children,
}: {
  title: string;
  help?: string;
  dimmed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md p-5 transition ${
        dimmed ? "opacity-60" : ""
      }`}
    >
      <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">{title}</h2>
      {help && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 mb-3 max-w-2xl">
          {help}
        </p>
      )}
      <div className={`space-y-3 ${help ? "" : "mt-3"}`}>{children}</div>
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
