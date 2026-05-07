export default function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg p-4">
      <div className="text-xs text-neutral-500 dark:text-neutral-400">{label}</div>
      <div className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100 mt-1">{value}</div>
      {hint && <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">{hint}</div>}
    </div>
  );
}
