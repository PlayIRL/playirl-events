"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Compact per-row "Retry auto-fetch" button for the table view.
// The full image-management UI (upload/replace/remove) lives on the detail
// page; this button is the one quick action that's worth keeping inline so
// admins can re-run the auto-fetcher without leaving the list.
export default function VenueQuickRetryButton({ venueName }: { venueName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    setMsg(null);
    const res = await fetch(
      `/api/admin/venues/${encodeURIComponent(venueName)}/refetch`,
      { method: "POST" },
    );
    setBusy(false);
    if (!res.ok) {
      setMsg({ kind: "err", text: "Failed" });
      return;
    }
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      source?: string;
      message?: string;
    };
    if (data.ok) {
      setMsg({ kind: "ok", text: data.source ? `via ${data.source}` : "ok" });
      router.refresh();
    } else {
      setMsg({ kind: "err", text: data.message || "no image" });
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {msg && (
        <span
          className={`text-[10px] ${
            msg.kind === "ok"
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-amber-700 dark:text-amber-300"
          }`}
        >
          {msg.text}
        </span>
      )}
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        title="Re-run og:image → Places → Street View. Skips manual uploads."
        className="text-xs px-2 py-1 rounded-md border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
      >
        {busy ? "…" : "Retry"}
      </button>
    </span>
  );
}
