"use client";

export default function StoreLink({ name, url }: { name: string; url?: string }) {
  if (!url) return <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{name}</p>;

  return (
    <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
      <span
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(url, "_blank"); }}
        className="hover:text-neutral-900 dark:hover:text-white hover:underline cursor-pointer transition-colors"
      >
        {name}
      </span>
    </p>
  );
}
