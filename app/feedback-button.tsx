"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Floating "Send feedback" button + modal. Lives at the bottom-right
 * stacked above CreateEventButton so the two pill-shaped CTAs read as a
 * cluster instead of competing for the same prime real-estate.
 *
 * Modal collects: free-text message + optional reply-to email + a
 * honeypot. POSTs to /api/feedback, which fires a Resend email to the
 * project owner. Keep the surface small: this is a hand-typed "tell me
 * what you think" channel, not a structured bug tracker.
 */
export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot — bots fill, humans don't
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus the textarea on open, reset state on close.
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => textareaRef.current?.focus());
    } else {
      // Brief delay so the closing animation can play before fields reset.
      const t = setTimeout(() => {
        setMessage("");
        setContactEmail("");
        setWebsite("");
        setStatus("idle");
        setErrorMsg("");
      }, 180);
      return () => clearTimeout(t);
    }
  }, [open]);

  // ESC to close.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const submit = useCallback(async () => {
    if (!message.trim() || status === "sending") return;
    setStatus("sending");
    setErrorMsg("");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim(),
          contactEmail: contactEmail.trim() || undefined,
          website, // honeypot — server rejects non-empty
          page: typeof window !== "undefined" ? window.location.href : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      setStatus("sent");
      // Auto-close after a beat so users see the confirmation.
      setTimeout(() => setOpen(false), 1600);
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
    }
  }, [message, contactEmail, website, status]);

  return (
    <>
      {/* The button itself — mirrors CreateEventButton's chrome (white
          pill, border, shadow) so they read as siblings. Stacks above
          Create event via an extra ~60px in the bottom calc. */}
      <div
        className="fixed right-4 z-40 bg-white dark:bg-neutral-950 rounded-md p-1 border border-neutral-200 dark:border-white/15 shadow-xl shadow-black/25 dark:shadow-black/50 bottom-[calc(1.5rem+env(safe-area-inset-bottom)+8px+3.5rem)] sm:bottom-[calc(1.5rem+env(safe-area-inset-bottom)+10px+3.75rem)]"
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Send feedback"
          aria-label="Send feedback"
          className="flex items-center justify-center gap-1.5 w-10 h-10 sm:w-auto sm:h-11 sm:px-4 rounded-md text-neutral-900 dark:text-white text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/40 dark:focus-visible:ring-white/40"
        >
          {/* Speech-bubble icon */}
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 sm:w-[18px] sm:h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-5l-5 5v-5z" />
          </svg>
          <span className="hidden sm:inline">Feedback</span>
        </button>
      </div>

      {open && typeof document !== "undefined" && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-title"
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 anim-fade-in"
        >
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Close feedback dialog"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40 dark:bg-black/60 cursor-default"
          />
          {/* Modal */}
          <div className="relative w-full max-w-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-md shadow-xl shadow-black/30 dark:shadow-black/60 anim-scale-in">
            <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-100 dark:border-white/8">
              <p id="feedback-title" className="text-base font-[family-name:var(--font-ultra)] font-bold text-neutral-900 dark:text-white">
                Send feedback
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="w-7 h-7 rounded-md flex items-center justify-center text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 space-y-3">
              <label className="block">
                <span className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1.5">
                  What&rsquo;s on your mind?
                </span>
                <textarea
                  ref={textareaRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  maxLength={4000}
                  placeholder="Bugs, ideas, or just a quick note — anything goes."
                  disabled={status === "sending" || status === "sent"}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      submit();
                    }
                  }}
                  className="w-full px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400/40 dark:focus:ring-white/20 resize-y disabled:opacity-60"
                />
              </label>

              <label className="block">
                <span className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1.5">
                  Your email <span className="text-neutral-400 dark:text-neutral-500 normal-case font-normal tracking-normal">(optional, for a reply)</span>
                </span>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={status === "sending" || status === "sent"}
                  className="w-full px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400/40 dark:focus:ring-white/20 disabled:opacity-60"
                />
              </label>

              {/* Honeypot — hidden from sighted + AT users. Real users
                  don't fill this; naive bots do. The server rejects any
                  request where this field has a value. */}
              <label
                className="absolute opacity-0 pointer-events-none"
                style={{ left: "-9999px" }}
                aria-hidden="true"
              >
                Website
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </label>

              {status === "error" && errorMsg && (
                <p className="text-xs text-red-600 dark:text-red-400">{errorMsg}</p>
              )}
              {status === "sent" && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                  Thanks — got it!
                </p>
              )}
            </div>

            <div className="px-5 py-3 border-t border-neutral-100 dark:border-white/8 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={status === "sending"}
                className="text-sm font-medium px-3 py-1.5 rounded-md text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!message.trim() || status === "sending" || status === "sent"}
                className="text-sm font-semibold px-4 py-1.5 rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {status === "sending" ? "Sending…" : status === "sent" ? "Sent" : "Send"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
