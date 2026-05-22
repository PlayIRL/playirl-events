import Link from "next/link";
import { requireRole } from "@/lib/session";
import { getDb } from "@/lib/db";
import { listVenueMerges, type VenueMergeRecord } from "@/lib/venue-merges";
import UndoMergeButton from "./UndoMergeButton";

export const dynamic = "force-dynamic";

function formatTimestamp(ts: string): string {
  const d = new Date(ts.includes("T") ? ts : ts + " UTC");
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

export default async function VenueMergesPage() {
  await requireRole("admin");

  const merges = listVenueMerges(200);
  // Resolve actor user emails in a single batch query — cheaper than N+1.
  const actorIds = Array.from(
    new Set(
      merges
        .flatMap((m) => [m.mergedBy, m.reversedBy])
        .filter((id): id is string => !!id),
    ),
  );
  const emailById = new Map<string, string>();
  if (actorIds.length > 0) {
    const placeholders = actorIds.map(() => "?").join(",");
    const rows = getDb()
      .prepare(`SELECT id, email FROM users WHERE id IN (${placeholders})`)
      .all(...actorIds) as { id: string; email: string }[];
    for (const r of rows) emailById.set(r.id, r.email);
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl space-y-6">
      <div>
        <Link
          href="/admin/venues"
          className="text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          ← All venues
        </Link>
      </div>

      <header>
        <h1 className="text-2xl font-[family-name:var(--font-ultra)] font-bold text-neutral-900 dark:text-neutral-100">
          Venue merge log
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 max-w-2xl">
          Every venue merge writes a snapshot of every field it touched. Use
          Undo to restore the pre-merge state for any merge — events,
          subscriptions, and connected sources go back to their original venue
          names exactly. Already-reversed merges show their reversal time.
        </p>
      </header>

      {merges.length === 0 ? (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md p-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
          No merges yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {merges.map((m) => (
            <MergeLogItem
              key={m.id}
              merge={m}
              actorEmail={m.mergedBy ? emailById.get(m.mergedBy) ?? null : null}
              reverserEmail={m.reversedBy ? emailById.get(m.reversedBy) ?? null : null}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function MergeLogItem({
  merge: m,
  actorEmail,
  reverserEmail,
}: {
  merge: VenueMergeRecord;
  actorEmail: string | null;
  reverserEmail: string | null;
}) {
  const reversed = !!m.reversedAt;
  return (
    <li className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline flex-wrap gap-2">
            <span className="font-medium text-neutral-900 dark:text-neutral-100 truncate">
              → {m.canonicalName}
            </span>
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
              {m.sourceNames.length} sources
            </span>
            {reversed && (
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                undone
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            <span className="font-mono">{m.affectedEvents.length}</span> events,{" "}
            <span className="font-mono">{m.affectedSources.length}</span> sources,{" "}
            <span className="font-mono">
              {m.affectedChannelSubs.length + m.affectedEventsTabSubs.length}
            </span>{" "}
            subs
            {m.defaultsChange?.copied_from_key &&
              !m.defaultsChange?.canonical_pre_existed && (
                <> · image copied to canonical</>
              )}
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Merged {formatTimestamp(m.mergedAt)}
            {actorEmail ? ` by ${actorEmail}` : ""}
            {reversed && (
              <>
                {" · "}reversed {formatTimestamp(m.reversedAt!)}
                {reverserEmail ? ` by ${reverserEmail}` : ""}
              </>
            )}
          </p>
          <details className="mt-2">
            <summary className="text-xs text-neutral-600 dark:text-neutral-400 cursor-pointer hover:text-neutral-900 dark:hover:text-neutral-100">
              Show source names
            </summary>
            <ul className="mt-1 text-xs text-neutral-600 dark:text-neutral-400 space-y-0.5 pl-3">
              {m.sourceNames.map((n) => (
                <li key={n} className="truncate">
                  • {n}
                </li>
              ))}
            </ul>
          </details>
        </div>
        <div className="shrink-0">
          {!reversed && <UndoMergeButton mergeId={m.id} />}
        </div>
      </div>
    </li>
  );
}
