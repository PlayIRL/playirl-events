import { requireRole } from "@/lib/session";
import { getPendingEvents } from "@/lib/events";
import PendingQueue from "./PendingQueue";

export const dynamic = "force-dynamic";

export default async function PendingEventsPage() {
  await requireRole("admin");
  const events = getPendingEvents();

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-[family-name:var(--font-ultra)] font-bold text-neutral-900 dark:text-neutral-100">
          Pending review
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          Events submitted by signed-in users, awaiting approval before they appear on the public calendar.
        </p>
      </div>

      {events.length === 0 ? (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md p-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
          No pending submissions. Nice inbox zero.
        </div>
      ) : (
        <PendingQueue events={events} />
      )}
    </div>
  );
}
