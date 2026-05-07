"use client";
import { useState, useEffect } from "react";

const BTN = "flex items-center justify-center w-10 h-10 bg-white dark:bg-neutral-900 text-neutral-500 dark:text-neutral-400 rounded-xl border border-neutral-100 dark:border-white/8 shadow-lg shadow-black/5 dark:shadow-black/20 transition-all duration-200 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:border-neutral-200 dark:hover:border-white/15 hover:text-neutral-600 dark:hover:text-neutral-300";

function SunIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  );
}

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleTheme() {
    const html = document.documentElement;
    const goingDark = !html.classList.contains("dark");
    const value = goingDark ? "dark" : "light";
    html.classList.toggle("dark", goingDark);
    html.style.colorScheme = value;
    localStorage.setItem("theme", value);
    // Mirror to a cookie so RootLayout's SSR sees it on the next request.
    document.cookie = `theme=${value}; max-age=${60 * 60 * 24 * 365}; path=/; samesite=lax`;
    setIsDark(goingDark);
  }

  return (
    <button
      onClick={toggleTheme}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`fixed bottom-4 right-4 z-40 ${BTN}`}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
