"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type ThemeMode = "light" | "dark" | "system";

function readThemeMode(): ThemeMode {
  try {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {}
  return "system";
}

function applyTheme(mode: ThemeMode) {
  const html = document.documentElement;
  const resolved =
    mode === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : mode;
  html.classList.toggle("dark", resolved === "dark");
  html.style.colorScheme = resolved;
  document.cookie = `theme=${resolved}; max-age=${60 * 60 * 24 * 365}; path=/; samesite=lax`;
  try {
    if (mode === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", mode);
  } catch {}
}

interface User {
  name: string | null;
  email: string | null;
  image: string | null;
}

export default function AccountMenu({
  signedIn,
  user,
}: {
  signedIn: boolean;
  user: User | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>("system");
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTheme(readThemeMode());
  }, []);

  // Re-resolve when the OS preference changes and the user is on "system".
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapperRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pickTheme(next: ThemeMode) {
    setTheme(next);
    applyTheme(next);
  }

  async function logout() {
    const csrf = await fetch("/api/auth/csrf").then((r) => r.json());
    await fetch("/api/auth/signout", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrfToken: csrf.csrfToken, callbackUrl: "/" }).toString(),
    });
    setOpen(false);
    router.push("/");
    router.refresh();
  }

  const trigger = signedIn ? <SignedInTrigger user={user!} /> : <SignedOutTrigger />;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={signedIn ? user?.name ?? "Account" : "Sign in"}
        className="inline-flex items-center justify-center gap-2 w-10 h-10 px-0.5 sm:w-auto sm:pl-1 sm:pr-3 rounded-full cursor-pointer transition-colors text-neutral-700 dark:text-neutral-200 hover:text-neutral-900 dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/40 dark:focus-visible:ring-white/20"
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute z-50 top-full mt-2 right-0 min-w-[200px] bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-md shadow-xl shadow-black/15 dark:shadow-black/50 p-1 anim-scale-in"
          style={{ transformOrigin: "top right" }}
        >
          {signedIn ? (
            <MenuLink href="/account" onSelect={() => setOpen(false)}>Account dashboard</MenuLink>
          ) : (
            <MenuLink href="/account/login" onSelect={() => setOpen(false)}>Sign in</MenuLink>
          )}

          <div className="my-1 h-px bg-neutral-200 dark:bg-white/10" />

          <p className="px-2 pt-1 pb-1 text-[11px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Appearance
          </p>
          <div className="px-1 pb-1 flex gap-1">
            <ThemeOption label="Light" active={theme === "light"} onClick={() => pickTheme("light")} icon={<SunIcon />} />
            <ThemeOption label="Dark" active={theme === "dark"} onClick={() => pickTheme("dark")} icon={<MoonIcon />} />
            <ThemeOption label="System" active={theme === "system"} onClick={() => pickTheme("system")} icon={<SystemIcon />} />
          </div>

          {signedIn && (
            <>
              <div className="my-1 h-px bg-neutral-200 dark:bg-white/10" />
              <button
                type="button"
                onClick={logout}
                role="menuitem"
                className="w-full text-left px-2 py-1.5 rounded-md text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-white/5 cursor-pointer"
              >
                Sign out
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MenuLink({ href, onSelect, children }: { href: string; onSelect: () => void; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onSelect}
      className="block px-2 py-1.5 rounded-md text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-white/5"
    >
      {children}
    </Link>
  );
}

function ThemeOption({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="menuitemradio"
      aria-checked={active}
      title={label}
      className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-md text-[11px] font-medium cursor-pointer transition-colors ${
        active
          ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
          : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function SignedInTrigger({ user }: { user: User }) {
  const displayName = user.name?.split(" ")[0] ?? "Account";
  const initials = getInitials(user.name, user.email);
  const showImage = !!user.image;
  return (
    <>
      <span className="flex items-center justify-center w-9 h-9 rounded-full overflow-hidden shrink-0">
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image!}
            alt=""
            width={36}
            height={36}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className="w-full h-full rounded-full bg-neutral-800 dark:bg-neutral-100 text-white dark:text-neutral-900 text-[11px] font-bold flex items-center justify-center tracking-wide">
            {initials}
          </span>
        )}
      </span>
      <span className="hidden sm:inline text-sm font-medium max-w-[8rem] truncate">{displayName}</span>
    </>
  );
}

function SignedOutTrigger() {
  return (
    <>
      <UserIcon />
      <span className="hidden sm:inline text-sm font-medium">Sign in</span>
    </>
  );
}

function getInitials(name: string | null, email: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts.length === 1 && parts[0].length > 0) return parts[0][0].toUpperCase();
  }
  if (email && email.length > 0) return email[0].toUpperCase();
  return "?";
}

function UserIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  );
}

function SystemIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8m-4-4v4" />
    </svg>
  );
}
