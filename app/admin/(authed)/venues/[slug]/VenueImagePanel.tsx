"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { VenueImageSource } from "@/lib/venues";

// Full image-management panel for a single venue. Pulled out of the old
// per-row card on /admin/venues so the list can be a compact table and the
// detail page can host the heavier controls (upload, replace, remove,
// retry auto-fetch).

const SOURCE_LABELS: Record<VenueImageSource, { label: string; className: string }> = {
  manual: {
    label: "manual upload",
    className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  },
  og_scrape: {
    label: "og:image",
    className: "bg-neutral-100 text-neutral-700 dark:bg-white/[0.06] dark:text-neutral-300",
  },
  places: {
    label: "Google Places",
    className: "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  },
  street_view: {
    label: "Street View",
    className: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  },
};

export default function VenueImagePanel({
  venueName,
  initialImageUrl,
  initialImageSource,
}: {
  venueName: string;
  initialImageUrl: string;
  initialImageSource: VenueImageSource | null;
}) {
  const router = useRouter();
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
    router.refresh();
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
    router.refresh();
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
      router.refresh();
    } else {
      setInfo(data.message || "No tier produced an image.");
    }
  }

  return (
    <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md p-5">
      <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          Default image
        </h2>
        {imageSource && imageUrl && (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-md ${SOURCE_LABELS[imageSource].className}`}
            title={
              imageSource === "manual"
                ? "Uploaded by an admin — auto-fetcher will never overwrite this."
                : `Auto-fetched (${SOURCE_LABELS[imageSource].label}). Upload a manual image to override.`
            }
          >
            {SOURCE_LABELS[imageSource].label}
          </span>
        )}
      </div>

      <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4 max-w-2xl">
        This image is the fallback on event cards when an event from this
        venue doesn't have its own photo. Manual uploads always win — the
        auto-fetcher (og:image → Google Places → Street View) is only used
        when no manual image is set.
      </p>

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

      <div className="flex items-start gap-4 flex-wrap">
        <div className="w-40 h-28 rounded-md overflow-hidden bg-neutral-100 dark:bg-neutral-800 shrink-0 flex items-center justify-center">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt=""
              width={160}
              height={112}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
              No default
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
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
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          {info && !error && (
            <p className="text-xs text-emerald-700 dark:text-emerald-300">{info}</p>
          )}
        </div>
      </div>
    </section>
  );
}
