"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function UndoMergeButton({ mergeId }: { mergeId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (!confirm(
      "Undo this merge? Every affected event, source, and subscription will " +
      "be restored to its original venue name.",
    )) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/venues/merges/${mergeId}/undo`, {
      method: "POST",
    });
    setBusy(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Undo failed");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="text-xs px-3 py-1.5 rounded-md border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50"
      >
        {busy ? "Undoing…" : "Undo merge"}
      </button>
      {error && (
        <span className="text-[11px] text-red-600 dark:text-red-400">{error}</span>
      )}
    </div>
  );
}
