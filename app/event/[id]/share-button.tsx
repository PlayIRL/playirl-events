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
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside([triggerRef, menuRef], () => setOpen(false));

  // Position the portal-rendered dropdown anchored to the trigger button
  // each time it opens. Using viewport coords (`fixed` positioning) means
  // the menu is unaffected by ancestor stacking contexts (e.g. the event
  // card's transform-induced stacking context) which `absolute + z-50`
  // can't escape.
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
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
      <Button onClick={handleShare}>
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
        {copied ? "Copied!" : "Share"}
      </Button>

      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          className="fixed z-50 bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-white/10 rounded-md shadow-xl overflow-hidden min-w-[160px] anim-scale-in"
          style={{ top: `${pos.top}px`, right: `${pos.right}px`, transformOrigin: "top right" }}
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
