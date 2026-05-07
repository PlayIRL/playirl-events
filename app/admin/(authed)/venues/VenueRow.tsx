"use client";
import { useRef, useState } from "react";
import type { VenueImageSource } from "@/lib/venues";

const SOURCE_LABELS: Record<VenueImageSource, { label: string; className: string }> = {
  manual: {
    label: "manual",
    className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  },
  og_scrape: {
    label: "og:image",
    className: "bg-neutral-100 text-neutral-700 dark:bg-white/[0.06] dark:text-neutral-300",
  },
  places: {
    label: "places",
    className: "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  },
  street_view: {
    label: "streetview",
    className: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  },
};

export default function VenueRow({
  venueName,
  usageCount,
  address,
  initialImageUrl,
  initialImageSource,
}: {
  venueName: string;
  usageCount: number;
  address: string;
  initialImageUrl: string;
  initialImageSource: VenueImageSource | null;
}) {
  const [imageUrl, setImageUrl] = useState(initialImageUrl);
  const [imageSource, setImageSource] = useState<VenueImageSource | null>(initialImageSource);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const endpoint = `/api/admin/venues/${encodeURIComponent(venueName)}/image`;
  const refetchEndpoint = `/api/admin/venues/${encodeURIComponent(venueName)}/refetch`;

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    setInfo(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(endpoint, { method: "POST", body: fd });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data?.error === "string" ? data.error : "Upload failed");
      return;
    }
    const data = (await res.json()) as {
      default: { image_url: string; image_source: VenueImageSource | null };
    };
    setImageUrl(data.default.image_url);
    setImageSource(data.default.image_source);
  }

  async function remove() {
    if (!confirm(`Remove the default image for ${venueName}?`)) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    const res = await fetch(endpoint, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      setError("Couldn't remove. Try again?");
      return;
    }
    setImageUrl("");
    setImageSource(null);
  }

  async function refetch() {
    setBusy(true);
    setError(null);
    setInfo(null);
    const res = await fetch(refetchEndpoint, { method: "POST" });
    setBusy(false);
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      source?: string;
      message?: string;
      error?: string;
      default?: { image_url: string; image_source: VenueImageSource | null };
    };
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Refetch failed");
      return;
    }
    if (data.ok && data.default) {
      setImageUrl(data.default.image_url);
      setImageSource(data.default.image_source);
      setInfo(`Got an image via ${data.source}.`);
    } else {
      setInfo(data.message || "No tier produced an image.");
    }
  }

  return (
    <li className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg p-3 flex items-center gap-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
        }}
      />

      <div className="w-20 h-14 rounded-md overflow-hidden bg-neutral-100 dark:bg-neutral-800 shrink-0 flex items-center justify-center">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-[10px] text-neutral-400 dark:text-neutral-500">No default</span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-medium text-neutral-900 dark:text-neutral-100 truncate">{venueName}</span>
          <span className="text-[11px] text-neutral-400 dark:text-neutral-500">{usageCount} events</span>
          {imageUrl && imageSource && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded ${SOURCE_LABELS[imageSource].className}`}
              title={
                imageSource === "manual"
                  ? "Uploaded by an admin — auto-fetcher won't overwrite this."
                  : `Auto-fetched (${SOURCE_LABELS[imageSource].label}). Upload a manual image to override.`
              }
            >
              {SOURCE_LABELS[imageSource].label}
            </span>
          )}
        </div>
        {address && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate mt-0.5">{address}</p>
        )}
        {error && <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{error}</p>}
        {info && !error && <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">{info}</p>}
      </div>

      <div className="flex gap-2 shrink-0 flex-wrap justify-end">
        <button
          type="button"
          onClick={refetch}
          disabled={busy}
          title="Re-run the auto-fetcher (og:image → Places photo → Street View). Bypasses the 30-day skip window."
          className="text-xs px-3 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
        >
          {busy ? "Working…" : "Retry auto-fetch"}
        </button>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
        >
          {busy ? "Uploading…" : imageUrl ? "Replace" : "Upload"}
        </button>
        {imageUrl && (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded-md border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950 disabled:opacity-50"
          >
            Remove
          </button>
        )}
      </div>
    </li>
  );
}
