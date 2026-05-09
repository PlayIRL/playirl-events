"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PendingEventRow } from "@/lib/events";

// Quick-pick rejection reasons. Cover the common cases so admins can reject
// in one click without typing; appending fills the textarea so the admin
// can still edit before confirming. Order them by how often we expect to
// use them — duplicate is the dominant case at scale.
const QUICK_REASONS = [
  "Duplicate of an existing event.",
  "Outside the supported region / radius.",
  "Missing key details (date, venue, or format).",
  "Spam or off-topic.",
  "Inappropriate content.",
];

export default function PendingQueue({ events }: { events: PendingEventRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<PendingEventRow | null>(null);

  async function approve(id: string) {
    setBusyId(id);
    await fetch("/api/admin/events/pending", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id], action: "approve" }),
    });
    setBusyId(null);
    startTransition(() => router.refresh());
  }

  async function rejectWithReason(id: string, reason: string) {
    setBusyId(id);
    const res = await fetch("/api/admin/events/pending", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id], action: "reject", reason }),
    });
    setBusyId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? `Reject failed: ${res.status}`);
      return;
    }
    setRejecting(null);
    startTransition(() => router.refresh());
  }

  return (
    <>
      <ul className="space-y-3">
        {events.map((e) => (
          <li
            key={e.id}
            className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md p-4 flex flex-col md:flex-row gap-4 md:items-center"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-xs text-neutral-500 dark:text-neutral-400">{e.date} {e.time}</span>
                <span className="font-medium text-neutral-900 dark:text-neutral-100 truncate">{e.title || <em className="text-neutral-400">(untitled)</em>}</span>
                {e.format && (
                  <span className="text-xs bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 px-1.5 rounded-md">{e.format}</span>
                )}
                {e.source_type && (
                  <span className="text-xs bg-neutral-100 dark:bg-white/[0.06] text-neutral-700 dark:text-neutral-300 px-1.5 rounded-md">{e.source_type}</span>
                )}
              </div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 flex gap-3 flex-wrap">
                {e.location && <span>📍 {e.location}</span>}
                {e.cost && <span>💵 {e.cost}</span>}
                <span>
                  Submitted by{" "}
                  <span className="text-neutral-700 dark:text-neutral-300">
                    {e.owner_name || e.owner_email || "unknown"}
                  </span>
                </span>
              </div>
              {e.notes && (
                <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-2 whitespace-pre-wrap">{e.notes}</p>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <Link
                href={`/admin/events/${encodeURIComponent(e.id)}/edit`}
                className="text-xs px-3 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                Review
              </Link>
              <button
                onClick={() => approve(e.id)}
                disabled={busyId === e.id || pending}
                className="text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                onClick={() => setRejecting(e)}
                disabled={busyId === e.id || pending}
                className="text-xs px-3 py-1.5 rounded-md border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </li>
        ))}
      </ul>

      {rejecting && (
        <RejectModal
          event={rejecting}
          busy={busyId === rejecting.id}
          onCancel={() => setRejecting(null)}
          onConfirm={(reason) => rejectWithReason(rejecting.id, reason)}
        />
      )}
    </>
  );
}

function RejectModal({
  event,
  busy,
  onCancel,
  onConfirm,
}: {
  event: PendingEventRow;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  function pickQuick(q: string) {
    // Append so admins can stack a quick reason on top of free-text context
    // without losing what they typed.
    setReason((prev) => (prev.trim() ? `${prev.trim()}\n${q}` : q));
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reject-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-[2px] p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md shadow-xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2
            id="reject-modal-title"
            className="text-base font-semibold text-neutral-900 dark:text-neutral-100"
          >
            Reject &ldquo;{event.title || "(untitled)"}&rdquo;
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            The submitter sees this reason on their <code className="text-[10px]">/account/events</code> page.
            Be specific — they may resubmit if it&apos;s a fixable issue.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {QUICK_REASONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => pickQuick(q)}
              className="text-[11px] px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              {q}
            </button>
          ))}
        </div>

        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          maxLength={1000}
          autoFocus
          placeholder="Reason — required. Visible to the submitter."
          className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400/40 dark:focus:ring-white/20"
        />

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="text-sm px-4 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason)}
            disabled={busy || !reason.trim()}
            className="text-sm px-4 py-1.5 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? "Rejecting…" : "Reject submission"}
          </button>
        </div>
      </div>
    </div>
  );
}
