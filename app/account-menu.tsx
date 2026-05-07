"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AccountMenu({
  displayName,
  role,
  imageUrl,
  initials,
}: {
  displayName: string;
  role: "admin" | "organizer" | "user";
  imageUrl: string | null;
  initials: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const showImage = !!imageUrl && !imgFailed;

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function logout() {
    const csrf = await fetch("/api/auth/csrf").then((r) => r.json());
    await fetch("/api/auth/signout", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrfToken: csrf.csrfToken, callbackUrl: "/" }).toString(),
    });
    router.push("/");
    router.refresh();
  }

  return (
    <div ref={wrapperRef} className="fixed bottom-6 left-4 sm:bottom-auto sm:left-auto sm:top-[calc(var(--sticky-bar-h,3rem)+1rem)] sm:right-4 z-40 flex bg-white dark:bg-neutral-800 rounded-xl p-0.5 border border-neutral-200 dark:border-white/15 shadow-xl shadow-black/15 dark:shadow-black/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={displayName}
        aria-label={`Account menu for ${displayName}`}
        className="inline-flex items-center gap-2 h-8 pl-1 pr-2.5 rounded-lg cursor-pointer transition-colors text-neutral-700 dark:text-neutral-200 hover:text-neutral-900 dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/40 dark:focus-visible:ring-white/20"
      >
        <span className="flex items-center justify-center w-7 h-7 rounded-md overflow-hidden shrink-0">
          {showImage ? (
            // OAuth-provided avatar (Discord/Google CDN). Falls back to
            // initials below on load error via onError → setImgFailed.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl!}
              alt=""
              className="w-full h-full object-cover"
              onError={() => setImgFailed(true)}
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="w-full h-full rounded-md bg-neutral-800 dark:bg-neutral-100 text-white dark:text-neutral-900 text-[11px] font-bold flex items-center justify-center tracking-wide">
              {initials}
            </span>
          )}
        </span>
        <span className="text-sm font-medium max-w-[8rem] truncate">{displayName}</span>
        <MenuIcon open={open} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 bottom-full mb-2 sm:left-auto sm:bottom-auto sm:right-0 sm:top-full sm:mb-0 sm:mt-2 w-56 rounded-lg border border-neutral-200 dark:border-white/15 bg-white dark:bg-neutral-900 shadow-lg shadow-black/10 dark:shadow-black/40 overflow-hidden"
        >
          <div className="px-3 py-2 border-b border-neutral-100 dark:border-white/10">
            <div className="text-xs text-neutral-500 dark:text-neutral-400">Signed in as</div>
            <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">{displayName}</div>
            <div className="text-[10px] uppercase tracking-wide mt-0.5 text-neutral-400 dark:text-neutral-500">{role}</div>
          </div>

          <MenuGroup>
            <MenuLink href="/account/saved" onSelect={() => setOpen(false)}>Saved events</MenuLink>
            <MenuLink href="/account/events" onSelect={() => setOpen(false)}>My events</MenuLink>
            <MenuLink href="/account/events/new" onSelect={() => setOpen(false)}>+ Submit event</MenuLink>
            <MenuLink href="/account/sources" onSelect={() => setOpen(false)}>Event sources</MenuLink>
            <MenuLink href="/account/discord" onSelect={() => setOpen(false)}>Discord subscriptions</MenuLink>
          </MenuGroup>

          {role === "admin" && (
            <MenuGroup>
              <MenuLink href="/admin" onSelect={() => setOpen(false)} muted>
                → Admin portal
              </MenuLink>
            </MenuGroup>
          )}

          <MenuGroup last>
            <button
              type="button"
              onClick={logout}
              role="menuitem"
              className="w-full text-left px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 transition"
            >
              Log out
            </button>
          </MenuGroup>
        </div>
      )}
    </div>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  // Chevron-down that rotates 180° when the dropdown is open. Subtle
  // affordance for "this is a menu trigger" without an extra UI element.
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={`w-3.5 h-3.5 text-neutral-400 dark:text-neutral-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function MenuGroup({ children, last = false }: { children: React.ReactNode; last?: boolean }) {
  return (
    <div className={last ? "" : "border-b border-neutral-100 dark:border-white/10"}>{children}</div>
  );
}

function MenuLink({
  href,
  children,
  onSelect,
  muted = false,
}: {
  href: string;
  children: React.ReactNode;
  onSelect: () => void;
  muted?: boolean;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onSelect}
      className={`block px-3 py-2 text-sm transition ${
        muted
          ? "text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-white/5"
          : "text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5"
      }`}
    >
      {children}
    </Link>
  );
}
