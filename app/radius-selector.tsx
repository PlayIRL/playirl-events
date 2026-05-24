"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { FORMAT_DOT } from "@/lib/format-style";
import LocationPicker from "./location-picker";
import { DiscordIcon } from "./discord-icon";

// Build the canonical /calendar URL given the user's current filter state.
// Empty/falsy filters are omitted so subscribers to the bare /calendar
// keep getting the unfiltered global feed.
function buildFeedPath({ format, radius, days, venue }: { format?: string; radius?: number; days?: number; venue?: string }): string {
  const sp = new URLSearchParams();
  if (format) sp.set("format", format);
  if (venue) {
    // Venue mode skips radius — the calendar feed treats `?venue=` as an
    // exact match and ignores radius/lat/lng when present.
    sp.set("venue", venue);
  } else if (radius) {
    sp.set("radius", String(radius));
  }
  if (days) sp.set("days", String(days));
  const qs = sp.toString();
  return qs ? `/calendar?${qs}` : `/calendar`;
}

const RADIUS_OPTIONS = [1, 5, 10, 15, 25, 50];
function getTimeOptions() {
  const now = new Date();
  const options: { value: string; label: string }[] = [
    { value: "1", label: "Today" },
    { value: "7", label: "This week" },
  ];

  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const daysUntilEnd = Math.ceil((endOfMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntilEnd < 3) continue;
    const label = i === 0 ? "This month" : d.toLocaleDateString("en-US", { month: "long" });
    options.push({ value: String(daysUntilEnd), label });
  }

  return options;
}

const TIME_OPTIONS = getTimeOptions();

// Outline-chip style for the madlib filter triggers. Previously these
// were dotted-underline text — readable but easy to miss as interactive,
// especially on mobile where there's no hover state to discover. The
// border + rounded background reads as a button at a glance; a small
// caret on the right reinforces "click to open a menu."
const CHIP_TRIGGER = "inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-white font-[family-name:var(--font-ultra)] focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/40 dark:focus-visible:ring-white/20 cursor-pointer bg-transparent hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-500 active:opacity-80 transition-colors duration-150";

function ChevronDown() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 shrink-0 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}
// Connector words ("events within", "miles of", "in") — Inter, body-text size, neutral weight, normal tracking. Matches the tagline rather than the slab madlib elements.
const CONNECTOR = "font-[family-name:var(--font-inter)] font-normal text-base tracking-normal";
const DROPDOWN_BASE = "absolute top-full mt-2 z-50 bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-white/10 rounded-md shadow-xl overflow-hidden min-w-max";
const DROPDOWN_ALIGN = { start: "left-0", center: "left-1/2 -translate-x-1/2", end: "right-0" };
const OPTION = "w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-left hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors";

function useClickOutside(refs: React.RefObject<HTMLElement | null>[], onClose: () => void) {
  useEffect(() => {
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      if (refs.some((r) => r.current && r.current.contains(target))) return;
      onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
    // refs are stable across renders; depending only on onClose avoids
    // re-binding the listener every render (the array literal would
    // otherwise be a new reference each pass).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);
}

// Position a portal-rendered dropdown anchored under a trigger, clamped
// to the viewport. Default alignment matches the legacy `right-0`
// behavior (dropdown's right edge aligns to the trigger's right edge),
// but shifts the dropdown rightward if it would overflow the left edge —
// the failure mode on narrow mobile viewports where the trigger sits
// near the center but `min-w-max` content needs ~280px of width.
function useAnchoredDropdown(
  status: "closed" | "open" | "closing",
  triggerRef: React.RefObject<HTMLElement | null>,
  menuRef: React.RefObject<HTMLElement | null>,
  close: () => void,
  placement: "bottom-end" | "top-center" = "bottom-end",
) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (status === "closed") setPos(null);
  }, [status]);

  useEffect(() => {
    if (status !== "open") return;
    const tick = () => {
      if (!triggerRef.current || !menuRef.current) return;
      const trigger = triggerRef.current.getBoundingClientRect();
      const menu = menuRef.current.getBoundingClientRect();
      const MARGIN = 8;
      let top: number, left: number;
      if (placement === "top-center") {
        top = trigger.top - menu.height - 8;
        left = trigger.left + trigger.width / 2 - menu.width / 2;
      } else {
        top = trigger.bottom + 8;
        left = trigger.right - menu.width;
      }
      left = Math.max(MARGIN, Math.min(window.innerWidth - menu.width - MARGIN, left));
      setPos({ top, left });
    };
    const raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [status, triggerRef, menuRef, placement]);

  useEffect(() => {
    if (status !== "open") return;
    const onChange = () => close();
    window.addEventListener("scroll", onChange, { passive: true });
    window.addEventListener("resize", onChange);
    return () => {
      window.removeEventListener("scroll", onChange);
      window.removeEventListener("resize", onChange);
    };
  }, [status, close]);

  return pos;
}

function ChipSelect({
  label,
  heading,
  options,
  value,
  onChange,
  dot,
  align = "center",
  custom,
  mono = false,
}: {
  label: string;
  heading: string;
  options: { value: string; label: string; dot?: string }[];
  value: string;
  onChange: (v: string) => void;
  dot?: boolean;
  align?: "start" | "center" | "end";
  /** Optional freeform numeric input at the bottom of the dropdown — used by
   *  the Range chip so users can pick e.g. "3 mi" without a preset for it. */
  custom?: { unit: string; placeholder: string; min: number; max: number };
  /** Render the chip label in Space Mono — for numeric-data chips like the
   *  radius value. */
  mono?: boolean;
}) {
  const [status, setStatus] = useState<"closed" | "open" | "closing">("closed");
  const statusRef = useRef<"closed" | "open" | "closing">("closed");
  const ref = useRef<HTMLDivElement>(null);
  const [customDraft, setCustomDraft] = useState("");

  function applyCustom() {
    if (!custom) return;
    const n = parseInt(customDraft.trim(), 10);
    if (!Number.isFinite(n)) return;
    const clamped = Math.max(custom.min, Math.min(custom.max, n));
    setCustomDraft("");
    close();
    onChange(String(clamped));
  }

  const close = useCallback(() => {
    if (statusRef.current !== "open") return;
    statusRef.current = "closing";
    setStatus("closing");
    setTimeout(() => {
      statusRef.current = "closed";
      setStatus("closed");
    }, 140);
  }, []);

  const open = useCallback(() => {
    statusRef.current = "open";
    setStatus("open");
  }, []);

  useClickOutside([ref], close);

  return (
    <div ref={ref} className="relative inline-block">
      <button onClick={() => status === "open" ? close() : open()} className={CHIP_TRIGGER}>
        <span className={mono ? "font-mono tabular-nums" : ""}>{label}</span>
        <ChevronDown />
      </button>
      {status !== "closed" && (
        <div className={`${DROPDOWN_BASE} ${DROPDOWN_ALIGN[align]} ${status === "closing" ? "anim-scale-out" : "anim-scale-in"}`}>
          <div className="px-4 py-2.5 border-b border-neutral-100 dark:border-white/8">
            <p className="text-[10px] font-semibold text-neutral-500 dark:text-neutral-400">{heading}</p>
          </div>
          {options.map((opt) => {
            const selected = value === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => { close(); onChange(opt.value); }}
                className={`${OPTION} ${selected ? "bg-neutral-50 dark:bg-white/8 text-neutral-900 dark:text-white font-semibold" : "text-neutral-500 dark:text-neutral-400 font-medium"}`}
              >
                {dot && <span className={`w-2 h-2 rounded-full shrink-0 ${opt.dot || "bg-neutral-400 dark:bg-neutral-600"}`} />}
                <span className="flex-1">{opt.label}</span>
                {selected && (
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 shrink-0 text-neutral-900 dark:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
          {custom && (
            <div className="border-t border-neutral-100 dark:border-white/8 px-3 py-2 flex items-center gap-1.5">
              <input
                type="number"
                inputMode="numeric"
                min={custom.min}
                max={custom.max}
                value={customDraft}
                onChange={(e) => setCustomDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyCustom(); } }}
                placeholder={custom.placeholder}
                className="flex-1 min-w-0 px-2 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-400/40 dark:focus:ring-white/20"
              />
              <span className="text-xs text-neutral-500 dark:text-neutral-400 shrink-0">{custom.unit}</span>
              <button
                onClick={applyCustom}
                disabled={!customDraft.trim()}
                className="text-xs px-2.5 py-1.5 rounded-md bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white font-medium hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
              >
                Set
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SubscribeDropdown({
  currentFormat,
  currentRadius,
  currentDays,
  venueName,
  onToast,
}: {
  currentFormat?: string;
  currentRadius: number;
  currentDays: number;
  /** When set, the dropdown subscribes the user to ONE venue's events
   *  (skips radius). Triggered from the venue page's Subscribe button. */
  venueName?: string;
  onToast: (text: string, anchor: DOMRect) => void;
}) {
  const [status, setStatus] = useState<"closed" | "open" | "closing">("closed");
  const statusRef = useRef<"closed" | "open" | "closing">("closed");
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const close = useCallback(() => {
    if (statusRef.current !== "open") return;
    statusRef.current = "closing";
    setStatus("closing");
    setTimeout(() => {
      statusRef.current = "closed";
      setStatus("closed");
    }, 140);
  }, []);

  const open = useCallback(() => {
    statusRef.current = "open";
    setStatus("open");
  }, []);

  useClickOutside([triggerRef, menuRef], close);
  const pos = useAnchoredDropdown(status, triggerRef, menuRef, close);

  // Filter-aware feed URLs. Anchored to the user's current filter state so
  // a subscribed calendar shows exactly the slice they're looking at.
  const host = typeof window !== "undefined" ? window.location.host : "playirl.gg";
  const path = buildFeedPath({
    format: currentFormat,
    radius: venueName ? undefined : currentRadius,
    days: currentDays,
    venue: venueName,
  });
  const webcalUrl = `webcal://${host}${path}`;
  const httpsUrl = `https://${host}${path}`;
  const venueSlug = venueName ? venueName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : null;
  const downloadName = venueName
    ? `mtg-${currentFormat ?? "events"}-${venueSlug}-${currentDays}d.ics`
    : `mtg-${currentFormat ?? "events"}-${currentRadius}mi-${currentDays}d.ics`;

  // Filter summary — same labels the user picked in the chip bar above.
  const timeLabel = TIME_OPTIONS.find((t) => t.value === String(currentDays))?.label ?? `${currentDays}d`;
  const filterSummary = [
    currentFormat ?? "All MTG",
    `${currentRadius} mi`,
    timeLabel,
  ].join(" · ");

  function copyLink() {
    navigator.clipboard.writeText(httpsUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div ref={triggerRef} className="relative inline-block">
      <button
        onClick={() => status === "open" ? close() : open()}
        title="Subscribe to calendar"
        aria-label="Subscribe to calendar"
        className="inline-flex items-center justify-center h-[1.925em] w-[1.925em] rounded-md border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-white bg-transparent hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-500 active:opacity-80 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/40 dark:focus-visible:ring-white/20 cursor-pointer"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 3v3m8-3v3M4 9h16M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 13v5m2.5-2.5h-5" />
        </svg>
      </button>
      {status !== "closed" && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          className={`fixed z-50 bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-white/10 rounded-md shadow-xl overflow-hidden min-w-max ${status === "closing" ? "anim-scale-out" : "anim-scale-in"}`}
          style={{
            top: pos ? `${pos.top}px` : -9999,
            left: pos ? `${pos.left}px` : -9999,
            maxWidth: "calc(100vw - 16px)",
            visibility: pos ? "visible" : "hidden",
            transformOrigin: "top right",
          }}
        >
          <a
            href={webcalUrl}
            onClick={close}
            className={`${OPTION} text-neutral-700 dark:text-neutral-300`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 shrink-0 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 3v3m8-3v3M4 9h16M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
            </svg>
            Subscribe in calendar app
          </a>

          <button
            type="button"
            onClick={copyLink}
            className={`${OPTION} text-neutral-700 dark:text-neutral-300 cursor-pointer`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 shrink-0 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            {copied ? "Copied!" : "Copy URL"}
          </button>

          <a
            href={httpsUrl}
            download={downloadName}
            onClick={close}
            className={`${OPTION} text-neutral-700 dark:text-neutral-300`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 shrink-0 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M7 10l5 5 5-5M12 15V3" />
            </svg>
            Download .ics
          </a>

          {/* Discord pair: both items go to /account?tab=discord — the first
              prefills the channel-message subscription form, the second
              prefills the Events-tab subscription form. */}
          <div className="border-t border-neutral-100 dark:border-white/8 mt-1 pt-1">
            <Link
              href={venueName ? `/account?tab=discord&venue=${encodeURIComponent(venueName)}` : "/account?tab=discord"}
              onClick={close}
              className={`${OPTION} text-neutral-700 dark:text-neutral-200`}
            >
              <DiscordIcon className="w-4 h-4 text-neutral-400" />
              <span className="flex-1">Post events to Discord</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 shrink-0 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
            <Link
              href={venueName
                ? `/account?tab=discord&events_tab_open=1&venue=${encodeURIComponent(venueName)}`
                : `/account?tab=discord&events_tab_open=1`}
              onClick={close}
              className={`${OPTION} text-neutral-700 dark:text-neutral-200`}
            >
              <DiscordIcon className="w-4 h-4 text-neutral-400" />
              <span className="flex-1">Add to a server&apos;s Events tab</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 shrink-0 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function CreateEventButton() {
  return (
    <div
      className="fixed right-4 z-40 bg-white dark:bg-neutral-950 rounded-md p-1 border border-neutral-200 dark:border-white/15 shadow-xl shadow-black/25 dark:shadow-black/50 bottom-[calc(1.5rem+env(safe-area-inset-bottom)+8px)] sm:bottom-[calc(1.5rem+env(safe-area-inset-bottom)+10px)]"
    >
      <Link
        href="/account/events/new"
        title="Create a new event"
        aria-label="Create a new event"
        className="flex items-center justify-center gap-1.5 w-10 h-10 sm:w-auto sm:h-11 sm:px-4 rounded-md text-neutral-900 dark:text-white text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/40 dark:focus-visible:ring-white/40"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 sm:w-[18px] sm:h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        <span className="hidden sm:inline">Create event</span>
      </Link>
    </div>
  );
}

/**
 * Standalone Subscribe button for pages that don't have the full filter
 * chip bar (e.g., the venue page). Wraps SubscribeDropdown with sensible
 * defaults and an inline toast so consumers don't have to wire one up.
 */
export function VenueSubscribeButton({ venueName, days = 30 }: { venueName: string; days?: number }) {
  const [toast, setToast] = useState<{ top: number; left: number; text: string } | null>(null);
  function showToast(text: string, anchor: DOMRect) {
    const margin = 80;
    const center = anchor.left + anchor.width / 2;
    setToast({
      top: anchor.bottom + 8,
      left: Math.max(margin, Math.min(window.innerWidth - margin, center)),
      text,
    });
    setTimeout(() => setToast(null), 2500);
  }
  return (
    <>
      <SubscribeDropdown
        venueName={venueName}
        currentRadius={0}
        currentDays={days}
        onToast={showToast}
      />
      {toast && (
        <div
          style={{ position: "fixed", top: toast.top, left: toast.left, transform: "translateX(-50%)" }}
          className="z-50 px-3 py-1.5 rounded-md bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white text-xs font-medium shadow-lg pointer-events-none"
        >
          {toast.text}
        </div>
      )}
    </>
  );
}

export default function RadiusSelector({
  currentRadius,
  currentDays,
  currentFormat,
  currentView,
  formats,
  eventCount,
  currentLocationLabel,
  defaultLocationLabel,
  isLocationCustom,
}: {
  currentRadius: number;
  currentDays: number;
  currentFormat?: string;
  /** Active view ("list" | "calendar" | "map"). The timeframe chip only
   *  renders for the map view since list has its own Load-more affordance
   *  and calendar has built-in week navigation. */
  currentView: string;
  formats: string[];
  eventCount: number;
  /** Human label for the current location (e.g. "Philly", "Cherry Hill, NJ"). */
  currentLocationLabel: string;
  /** Default label shown after a "Reset to default" click. */
  defaultLocationLabel: string;
  /** True when the URL or user prefs have set a non-default location. */
  isLocationCustom: boolean;
}) {
  function updateParam(key: string, value: string) {
    const url = new URL(window.location.href);
    if (value) {
      url.searchParams.set(key, value);
    } else {
      url.searchParams.delete(key);
    }
    window.location.href = url.toString();
  }

  const [toast, setToast] = useState<{ top: number; left: number; text: string } | null>(null);

  function clampToast(rect: DOMRect) {
    const margin = 80;
    const center = rect.left + rect.width / 2;
    return { top: rect.bottom + 8, left: Math.max(margin, Math.min(window.innerWidth - margin, center)) };
  }

  function showToast(text: string, anchor: DOMRect) {
    setToast({ ...clampToast(anchor), text });
    setTimeout(() => setToast(null), 2500);
  }

  const formatOptions = [
    { value: "", label: "All formats", dot: "bg-neutral-400 dark:bg-neutral-600" },
    ...formats.map((f) => ({ value: f, label: f, dot: FORMAT_DOT[f] || "bg-neutral-400" })),
  ];

  const radiusOptions = RADIUS_OPTIONS.map((r) => ({ value: String(r), label: `${r} ${r === 1 ? "mile" : "miles"}` }));

  return (
    <>
      {toast && (
        <div
          className="fixed z-50 px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-white/8 rounded-md text-sm text-neutral-900 dark:text-white font-medium shadow-lg whitespace-nowrap pointer-events-none"
          style={{ top: `${toast.top}px`, left: `${toast.left}px`, transform: "translateX(-50%)" }}
        >
          {toast.text}
        </div>
      )}
      {/* `<div>` not `<p>` — children include block-level elements (the
          ChipSelect dropdowns and SubscribeDropdown render `<div>`s), and
          a `<p>` containing `<div>` is invalid HTML, which surfaces as a
          React-19 hydration warning + DOM-nesting error in the console. */}
      <div className="text-neutral-500 dark:text-neutral-400 flex items-center justify-center flex-wrap gap-x-1.5 gap-y-1 text-lg sm:text-xl leading-relaxed font-[family-name:var(--font-ultra)] font-bold">
        <ChipSelect
          label={currentFormat || "All MTG"}
          heading="Format"
          options={formatOptions}
          value={currentFormat || ""}
          onChange={(v) => updateParam("format", v)}
          dot
          align="start"
        />

        <span className={CONNECTOR}>events within</span>

        <ChipSelect
          label={`${currentRadius}`}
          heading="Range"
          options={radiusOptions}
          value={String(currentRadius)}
          onChange={(v) => updateParam("radius", v)}
          custom={{ unit: "miles", placeholder: String(currentRadius), min: 1, max: 500 }}
          mono
        />

        {/* Force the mobile wrap to break between "[N]" and "miles of" so the
            sentence splits as "All MTG events within 10" / "miles of Philly"
            instead of dumping "Philly" alone on line 2. Zero-height full-basis
            flex item is the standard flex line-break trick; hidden at sm+ where
            the sentence fits on one line. */}
        <span aria-hidden="true" className="basis-full h-0 sm:hidden" />

        <span className={CONNECTOR}>miles of</span>

        <LocationPicker
          currentLabel={currentLocationLabel}
          defaultLabel={defaultLocationLabel}
          isCustom={isLocationCustom}
        />

        {/* "= N" event count hidden per user request. Re-enable by un-commenting. */}
        {/* <span className={CONNECTOR}>=</span>
        <span className="inline-flex items-center justify-center min-w-[1.75rem] px-1.5 py-0.5 rounded-md bg-neutral-100 dark:bg-white/10 text-neutral-900 dark:text-white text-xs sm:text-sm font-semibold tabular-nums leading-none">{eventCount}</span> */}

        {/* Trailing controls (timeframe + subscribe) bundled into a single
            inline-flex unit so they wrap as a group instead of leaving the
            subscribe button stranded on its own line when the row barely
            overflows. Timeframe only renders in map view (list/calendar have
            their own navigation). */}
        <div className="inline-flex items-center gap-x-1.5">
          {currentView === "map" && (
            <>
              <span className={CONNECTOR}>,</span>
              <ChipSelect
                label={TIME_OPTIONS.find((t) => t.value === String(currentDays))?.label || "This week"}
                heading="Timeframe"
                options={TIME_OPTIONS}
                value={String(currentDays)}
                onChange={(v) => updateParam("days", v)}
                align="end"
              />
            </>
          )}
          <SubscribeDropdown
            currentFormat={currentFormat}
            currentRadius={currentRadius}
            currentDays={currentDays}
            onToast={showToast}
          />
        </div>
      </div>
      <CreateEventButton />
    </>
  );
}
