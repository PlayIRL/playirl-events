const STYLES: Record<string, string> = {
  admin: "bg-purple-50 border-purple-200 text-purple-800 dark:bg-purple-950 dark:border-purple-800 dark:text-purple-300",
  organizer: "bg-neutral-100 border-neutral-200 text-neutral-700 dark:bg-white/[0.06] dark:border-white/15 dark:text-neutral-300",
  user: "bg-neutral-50 border-neutral-200 text-neutral-700 dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-300",
};

export default function RoleBadge({ role }: { role: string }) {
  const cls = STYLES[role] ?? STYLES.user;
  return (
    <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-md border font-medium ${cls}`}>
      {role}
    </span>
  );
}
