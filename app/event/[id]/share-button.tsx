"use client";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/app/button";

function useClickOutside(refs: React.RefObject<HTMLElement | null>[], onClose: () => void) {
  useEffect(() => {
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      if (refs.some((r) => r.current && r.current.contains(target))) return;
      onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [refs, onClose]);
}

export default function ShareButton({ title, url }: { title: string; url: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside([triggerRef, menuRef], () => setOpen(false));

  // Position the portal-rendered dropdown anchored to the trigger button
  // each time it opens. Using viewport coords (`fixed` positioning) means
  // the menu is unaffected by ancestor stacking contexts (e.g. the event
  // card's transform-induced stacking context) which `absolute + z-50`
  // can't escape. After mount we measure the menu and clamp its left
  // coord so it stays inside the viewport — on narrow mobile widths the
  // legacy right-anchored placement could push the dropdown off-screen
  // when the trigger sat far from the right edge.
  useEffect(() => {
    if (!open) { setPos(null); return; }
    const raf = requestAnimationFrame(() => {
      if (!triggerRef.current || !menuRef.current) return;
      const trigger = triggerRef.current.getBoundingClientRect();
      const menu = menuRef.current.getBoundingClientRect();
      const MARGIN = 8;
      let left = trigger.right - menu.width;
      left = Math.max(MARGIN, Math.min(window.innerWidth - menu.width - MARGIN, left));
      setPos({ top: trigger.bottom + 8, left });
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onChange = () => setOpen(false);
    window.addEventListener("scroll", onChange, { passive: true });
    window.addEventListener("resize", onChange);
    return () => {
      window.removeEventListener("scroll", onChange);
      window.removeEventListener("resize", onChange);
    };
  }, [open]);

  const canNativeShare = typeof navigator !== "undefined" && !!navigator.share;

  function handleShare() {
    if (canNativeShare) {
      navigator.share({ title, url }).catch(() => {});
    } else {
      setOpen((o) => !o);
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
    setOpen(false);
  }

  const smsBody = encodeURIComponent(`Check out this MTG event: ${title} — ${url}`);
  const emailBody = encodeURIComponent(`Hey,\n\nThought you might be interested in this MTG event:\n\n${title}\n${url}`);
  const emailSubject = encodeURIComponent(`MTG Event: ${title}`);

  return (
    <div ref={triggerRef} className="relative">
      {/* Primary fill so the Share CTA pops next to the muted "Add to
          calendar" chip — sharing the event link is the dominant action
          we want a viewer to take. Override the variant's default
          sizing with `!` so the smaller chip-sized values actually win
          over the variant's baked-in h-9/px-4/text-sm/gap-2 (without
          `!`, Tailwind's generated CSS lands h-9 after h-7 in the
          bundle and the override is silently ignored). */}
      <Button
        onClick={handleShare}
        variant="primary"
        className="!h-7 !px-3 !text-xs !gap-1.5"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
        {copied ? "Copied!" : "Share"}
      </Button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          className="fixed z-50 bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-white/10 rounded-md shadow-xl overflow-y-auto overscroll-contain max-h-[70vh] min-w-[160px] anim-scale-in"
          style={{
            top: pos ? `${pos.top}px` : -9999,
            left: pos ? `${pos.left}px` : -9999,
            maxWidth: "calc(100vw - 16px)",
            visibility: pos ? "visible" : "hidden",
            transformOrigin: "top right",
          }}
        >
          <button
            onClick={copyLink}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors text-left"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            Copy link
          </button>
          <a
            href={`sms:?body=${smsBody}`}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors"
            onClick={() => setOpen(false)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            Text
          </a>
          <a
            href={`mailto:?subject=${emailSubject}&body=${emailBody}`}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors"
            onClick={() => setOpen(false)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Email
          </a>
        </div>,
        document.body,
      )}
    </div>
  );
}
