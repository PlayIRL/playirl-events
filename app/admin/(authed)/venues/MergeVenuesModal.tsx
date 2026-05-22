"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

// Modal for confirming a venue merge. The admin has already selected ≥ 2
// venues; this dialog shows the list, lets them pick the canonical name (one
// of the source names by default, but the input is editable for "create a
// brand-new clean name"), and submits the merge. The actual UPDATEs happen
// server-side in a single SQLite transaction with a snapshot for undo.

interface SelectedVenue {
  name: string;
  usageCount: number;
}

interface Props {
  open: boolean;
  selected: SelectedVenue[];
  onClose: () => void;
}

export default function MergeVenuesModal({ open, selected, onClose }: Props) {
  const router = useRouter();
  // Default canonical: the selected venue with the most events. Admin can
  // edit freely or pick a different selected name via the radio set below.
  const defaultCanonical = useMemo(() => {
    if (selected.length === 0) return "";
    return [...selected].sort((a, b) => b.usageCount - a.usageCount)[0].name;
  }, [selected]);

  const [canonical, setCanonical] = useState(defaultCanonical);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset canonical whenever the modal opens with a new selection. Otherwise
  // a previous merge's typed canonical would leak into the next one.
  useEffect(() => {
    if (open) {
      setCanonical(defaultCanonical);
      setError(null);
    }
  }, [open, defaultCanonical]);

  if (!open) return null;

  const totalEvents = selected.reduce((sum, v) => sum + v.usageCount, 0);
  const canonicalIsClean = canonical.trim().length > 0;

  async function onSubmit() {
    if (!canonicalIsClean) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/venues/merge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        canonicalName: canonical.trim(),
        sourceNames: selected.map((v) => v.name),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Merge failed");
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="merge-modal-title"
    >
      <div
        className="bg-white dark:bg-neutral-900 rounded-md shadow-xl max-w-lg w-full p-6 space-y-4 border border-neutral-200 dark:border-neutral-700"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2
            id="merge-modal-title"
            className="text-lg font-[family-name:var(--font-ultra)] font-bold text-neutral-900 dark:text-neutral-100"
          >
            Merge {selected.length} venues
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            {totalEvents.toLocaleString()} events will be re-pointed to the
            canonical name. No rows are deleted — the merge can be undone from
            the audit log.
          </p>
        </header>

        <div className="space-y-2">
          <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 block">
            Sources
          </span>
          <ul className="text-sm space-y-1 max-h-40 overflow-y-auto rounded-md border border-neutral-200 dark:border-neutral-700 p-2 bg-neutral-50 dark:bg-neutral-950/30">
            {selected.map((v) => (
              <li key={v.name} className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setCanonical(v.name)}
                  className="text-left text-neutral-700 dark:text-neutral-300 hover:underline truncate flex-1 min-w-0"
                  title="Use this as the canonical name"
                >
                  {v.name}
                </button>
                <span className="text-xs text-neutral-500 dark:text-neutral-400 font-mono shrink-0">
                  {v.usageCount}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            Click a source name to use it as the canonical, or type a new one
            below.
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
            Canonical name
          </span>
          <input
            type="text"
            value={canonical}
            onChange={(e) => setCanonical(e.target.value)}
            placeholder="e.g. Hamilton's Hand"
            autoFocus
            className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-400/40 dark:focus:ring-white/20"
          />
        </label>

        {error && (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-sm px-3 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={busy || !canonicalIsClean}
            className="text-sm px-4 py-1.5 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50"
          >
            {busy ? "Merging…" : `Merge into "${canonical.trim() || "…"}"`}
          </button>
        </div>
      </div>
    </div>
  );
}
