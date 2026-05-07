"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { BotGuild } from "@/lib/discord-bot";
import { geocodeAddress } from "@/lib/geocode";

export default function PickGuildForm({ guilds }: { guilds: BotGuild[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string>(guilds.length === 1 ? guilds[0].id : "");
  const [venueName, setVenueName] = useState("");
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [addressStatus, setAddressStatus] = useState<"idle" | "checking" | "found" | "missing">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Token each geocode attempt so a slow response can't clobber a newer edit.
  const geoToken = useRef(0);

  const selectedGuild = guilds.find((g) => g.id === selected);

  async function lookupAddress(value: string) {
    const v = value.trim();
    if (!v) {
      setCoords(null);
      setAddressStatus("idle");
      return;
    }
    const myToken = ++geoToken.current;
    setAddressStatus("checking");
    const result = await geocodeAddress(v);
    if (myToken !== geoToken.current) return;
    if (result) {
      setCoords({ lat: result.latitude, lng: result.longitude });
      setAddressStatus("found");
    } else {
      setCoords(null);
      setAddressStatus("missing");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedGuild) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/account/sources/discord", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guild_id: selectedGuild.id,
        label: selectedGuild.name,
        venue_name: venueName,
        venue_address: address,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Something went wrong. Try again?");
      setBusy(false);
      return;
    }
    router.push("/account/sources");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-8">
      <section>
        <h2 className="text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-1">
          {guilds.length === 1 ? "Your community" : "Which community?"}
        </h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
          {guilds.length === 1
            ? "This is the Discord we'll exchange events with."
            : "Pick the Discord you want to link up."}
        </p>
        <div className="space-y-1.5 max-h-64 overflow-y-auto bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg p-2">
          {guilds.map((g) => (
            <label
              key={g.id}
              className={`flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition ${
                selected === g.id
                  ? "bg-neutral-100 dark:bg-white/[0.06] ring-1 ring-neutral-300 dark:ring-white/20"
                  : "hover:bg-neutral-50 dark:hover:bg-neutral-800"
              }`}
            >
              <input
                type="radio"
                name="guild"
                value={g.id}
                checked={selected === g.id}
                onChange={() => setSelected(g.id)}
                className="shrink-0"
              />
              <span className="text-sm text-neutral-900 dark:text-neutral-100 flex-1 truncate">{g.name}</span>
            </label>
          ))}
        </div>
      </section>

      <fieldset disabled={!selected} className="space-y-5 disabled:opacity-50">
        <div>
          <label className="block text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-1">
            What's the venue called?
          </label>
          <input
            type="text"
            value={venueName}
            onChange={(e) => setVenueName(e.target.value)}
            placeholder="e.g. Hamilton's Hand"
            className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
          />
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Shown on events so people know where to go. Leave blank if events have different locations.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-1">
            Where is it?
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              if (addressStatus !== "idle") setAddressStatus("idle");
              setCoords(null);
            }}
            onBlur={(e) => lookupAddress(e.target.value)}
            placeholder="Street, city, state"
            className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
          />
          <AddressHint status={addressStatus} />
        </div>
      </fieldset>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={!selected || busy || addressStatus === "checking"}
          className="bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-5 py-2.5 rounded-md text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition disabled:opacity-50"
        >
          {busy ? "Linking…" : "Link this community"}
        </button>
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          Events flow in both directions — a selection of yours goes out, and local communities' events flow in.
        </span>
      </div>
    </form>
  );
}

function AddressHint({ status }: { status: "idle" | "checking" | "found" | "missing" }) {
  const base = "text-xs mt-1 min-h-[1rem]";
  if (status === "checking") return <p className={`${base} text-neutral-500 dark:text-neutral-400`}>Finding it on the map…</p>;
  if (status === "found") return <p className={`${base} text-emerald-700 dark:text-emerald-400`}>✓ Found. We'll use this for distance filtering.</p>;
  if (status === "missing") return <p className={`${base} text-amber-700 dark:text-amber-400`}>Couldn't place that on the map. That's OK — your events will still show up in the full list.</p>;
  return <p className={`${base} text-neutral-500 dark:text-neutral-400`}>Helps locals find your events when they filter by distance.</p>;
}
