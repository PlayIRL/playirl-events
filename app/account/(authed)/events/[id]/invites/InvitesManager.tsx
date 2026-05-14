"use client";
import { useState } from "react";
import { Button } from "@/app/button";
import type { InviteWithRedeemer } from "@/lib/event-invites";

export default function InvitesManager({
  eventId,
  initialInvites,
}: {
  eventId: string;
  initialInvites: InviteWithRedeemer[];
}) {
  const [invites, setInvites] = useState<InviteWithRedeemer[]>(initialInvites);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    try {
      const res = await fetch(`/api/account/events/${encodeURIComponent(eventId)}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() }),
      });
      const json = await res.json();
      if (res.ok && json.invite) {
        setInvites((cur) => [{ ...json.invite, used_by_email: null, used_by_name: null }, ...cur]);
        setLabel("");
      }
    } finally {
      setBusy(false);
    }
  }

  async function revoke(inviteId: string) {
    if (!confirm("Revoke this invite? Anyone who hasn't already redeemed it will lose access.")) return;
    const res = await fetch(
      `/api/account/events/${encodeURIComponent(eventId)}/invites/${encodeURIComponent(inviteId)}`,
      { method: "DELETE" },
    );
    if (res.ok) setInvites((cur) => cur.filter((i) => i.id !== inviteId));
  }

  function urlFor(token: string): string {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://playirl.gg";
    return `${origin}/event/${encodeURIComponent(eventId)}?token=${encodeURIComponent(token)}`;
  }

  function copy(invite: InviteWithRedeemer) {
    const url = urlFor(invite.token);
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(invite.id);
      setTimeout(() => setCopiedId(null), 1800);
    });
  }

  return (
    <div className="space-y-6">
      {/* Generator */}
      <section className="rounded-md border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-900 p-4 space-y-3">
        <h2 className="text-base font-extrabold tracking-tight text-neutral-900 dark:text-neutral-100">Generate invite link</h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Each link grants read access to this event without needing to be on the
          attendee list. The link is multi-use — anyone you share it with can open
          it. Add a label to remember who you sent it to.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Discord #pods or Alex's group"
            maxLength={80}
            className="flex-1 px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-400/40 dark:focus:ring-white/20"
          />
          <Button variant="primary" onClick={generate} disabled={busy}>
            {busy ? "Generating…" : "Generate"}
          </Button>
        </div>
      </section>

      {/* List */}
      <section>
        <h2 className="text-xs text-neutral-500 dark:text-neutral-400 font-semibold mb-2">
          Active invites · {invites.length}
        </h2>
        {invites.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400 italic">
            No invites yet. Generate one above to share a link with someone.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100 dark:divide-white/8 border border-neutral-100 dark:border-white/8 rounded-md overflow-hidden">
            {invites.map((inv) => (
              <li key={inv.id} className="px-4 py-3 bg-white dark:bg-neutral-900 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                    {inv.label || <span className="text-neutral-500 dark:text-neutral-400 italic">No label</span>}
                  </p>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
                    {urlFor(inv.token)}
                  </p>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
                    Created {inv.created_at}
                    {inv.used_by_email
                      ? ` · First redeemed by ${inv.used_by_name ?? inv.used_by_email}`
                      : " · Not yet redeemed"}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => copy(inv)}
                    className="text-xs px-2 py-1 rounded-md border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    {copiedId === inv.id ? "Copied!" : "Copy"}
                  </button>
                  <button
                    type="button"
                    onClick={() => revoke(inv.id)}
                    className="text-xs px-2 py-1 rounded-md border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
                  >
                    Revoke
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
