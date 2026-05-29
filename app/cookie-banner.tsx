"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CONSENT_COOKIE } from "@/lib/locale";
import { t } from "@/lib/i18n";

/**
 * Minimal cookie / privacy notice banner.
 *
 * Rendered only when the viewer is in a GDPR-covered country (EU/EEA + UK +
 * CH) and hasn't already acknowledged via the `playirl-consent` cookie. The
 * server-side wrapper in app/layout.tsx decides whether to mount this; this
 * component handles the dismiss state and cookie write.
 *
 * The site only sets strictly-necessary cookies today (auth session, theme,
 * locale, this consent stamp) — no analytics or marketing trackers. So this
 * is a notice + acknowledgement rather than a true consent gate. If analytics
 * land later, this is the chokepoint to upgrade to an Accept/Reject flow.
 */
export default function CookieBanner({ locale }: { locale?: string }) {
  // Start hidden to avoid a hydration flicker; reveal in effect after
  // checking the cookie client-side (server may have rendered us based on
  // a stale state — e.g. user just acknowledged on another tab).
  const [visible, setVisible] = useState(false);
  const tr = (key: string, params?: Record<string, string | number>) => t(key, params, locale);

  // We have to read document.cookie on mount (no DOM during SSR) and toggle
  // visibility based on the result. There's no external store to subscribe
  // to here; the cookie state is read-once at mount.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const ack = document.cookie.split(";").some((c) => c.trim().startsWith(`${CONSENT_COOKIE}=`));
    if (!ack) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(true);
    }
  }, []);

  function acknowledge() {
    // 1-year persistence is the GDPR-conventional re-prompt cadence.
    const oneYearSec = 60 * 60 * 24 * 365;
    document.cookie = `${CONSENT_COOKIE}=ack; Max-Age=${oneYearSec}; Path=/; SameSite=Lax`;
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie notice"
      className="fixed bottom-3 left-3 right-3 sm:bottom-4 sm:left-4 sm:right-auto sm:max-w-md z-50 rounded-md border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-900 shadow-xl p-4 text-sm text-neutral-700 dark:text-neutral-200"
    >
      <p className="leading-snug">
        {tr("cookie_banner.notice")}{" "}
        <Link
          href="/about/privacy"
          className="underline text-neutral-900 dark:text-white hover:no-underline"
        >
          {tr("cookie_banner.privacy_link")}
        </Link>
      </p>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={acknowledge}
          className="px-3 py-1.5 rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-xs font-medium hover:opacity-90 transition cursor-pointer"
        >
          {tr("cookie_banner.accept")}
        </button>
      </div>
    </div>
  );
}
