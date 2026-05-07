const STYLES: Record<string, string> = {
  active: "bg-green-50 border-green-200 text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-300",
  skip: "bg-red-50 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-300",
  pinned: "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-950 dark:border-yellow-800 dark:text-yellow-300",
  pending: "bg-neutral-100 border-neutral-200 text-neutral-700 dark:bg-white/[0.06] dark:border-white/15 dark:text-neutral-300",
};

export default function StatusBadge({ status }: { status: string }) {
  const cls = STYLES[status] ?? "bg-neutral-50 border-neutral-200 text-neutral-700 dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-300";
  return (
    <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-md border font-medium ${cls}`}>
      {status}
    </span>
  );
}
