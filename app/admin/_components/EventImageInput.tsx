"use client";
import { useRef, useState } from "react";

/**
 * File picker + live preview for an event's photo. POSTs the selected file
 * to /api/uploads/event-image and reports the resulting URL via onChange so
 * the parent form stores it in `image_url`.
 */
export default function EventImageInput({
  value,
  onChange,
  onUploadingChange,
}: {
  value: string;
  onChange: (next: string) => void;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setUploading(state: boolean) {
    setBusy(state);
    onUploadingChange?.(state);
  }

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/uploads/event-image", { method: "POST", body: fd });
    setUploading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data?.error === "string" ? data.error : "Upload failed");
      return;
    }
    const { url } = (await res.json()) as { url: string };
    onChange(url);
  }

  function pick() {
    inputRef.current?.click();
  }

  function clear() {
    onChange("");
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />

      {value ? (
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="Event preview"
            width={128}
            height={80}
            className="w-32 h-20 object-cover rounded-md border border-neutral-200 dark:border-neutral-700"
            loading="lazy"
            decoding="async"
          />
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={pick}
              disabled={busy}
              className="text-xs px-3 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
            >
              {busy ? "Uploading…" : "Replace"}
            </button>
            <button
              type="button"
              onClick={clear}
              disabled={busy}
              className="text-xs px-3 py-1.5 rounded-md border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950 disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={pick}
          disabled={busy}
          className="w-full sm:w-auto inline-flex items-center gap-2 px-4 py-2 rounded-md border border-dashed border-neutral-300 dark:border-neutral-600 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          {busy ? "Uploading…" : "Upload a photo"}
        </button>
      )}

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Optional. JPEG, PNG, WebP, or GIF — up to 4 MB.
      </p>
    </div>
  );
}
