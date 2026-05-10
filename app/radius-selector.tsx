"use client";
import { useState, useRef, useEffect, useCallback } from "react";
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

const CHIP_TRIGGER = "inline-block underline decoration-dotted underline-offset-4 decoration-neutral-400 dark:decoration-neutral-500 text-neutral-900 dark:text-white font-[family-name:var(--font-ultra)] focus:outline-none cursor-pointer bg-transparent hover:decoration-solid hover:decoration-neutral-900 dark:hover:decoration-white hover:text-neutral-600 dark:hover:text-neutral-300 active:opacity-60 transition-all duration-150 px-1";
// Connector words ("events within", "miles of", "in") — Inter, body-text size, neutral weight, normal tracking. Matches the tagline rather than the slab madlib elements.
const CONNECTOR = "font-[family-name:var(--font-inter)] font-normal text-base tracking-normal";
const DROPDOWN_BASE = "absolute top-full mt-2 z-50 bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-white/10 rounded-md shadow-xl overflow-hidden min-w-max";
const DROPDOWN_ALIGN = { start: "left-0", center: "left-1/2 -translate-x-1/2", end: "right-0" };
const OPTION = "w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-left hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors";

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, onClose]);
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

  useClickOutside(ref, close);

  return (
    <div ref={ref} className="relative inline-block">
      <button onClick={() => status === "open" ? close() : open()} className={CHIP_TRIGGER}>
        {label}
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
                className="text-xs px-2.5 py-1.5 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
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
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
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

  useClickOutside(ref, close);

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

  function comingSoon(text: string) {
    if (triggerRef.current) {
      onToast(text, triggerRef.current.getBoundingClientRect());
    }
    close();
  }

  return (
    <div ref={ref} className="relative ml-1 inline-block">
      <button
        ref={triggerRef}
        onClick={() => status === "open" ? close() : open()}
        title="Subscribe to calendar"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white text-xs font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800 transition cursor-pointer focus:outline-none"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 3v3m8-3v3M4 9h16M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
        </svg>
        Subscribe
      </button>
      {status !== "closed" && (
        <div className={`${DROPDOWN_BASE} right-0 ${status === "closing" ? "anim-scale-out" : "anim-scale-in"}`}>
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

          {/* Discord pair: the first one is wired to the auto-posts manager
              we already shipped. The second is roadmap (Discord guild
              scheduled-events API integration) — kept as a Soon pill. */}
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
            <button
              type="button"
              onClick={() => comingSoon("Creating Discord scheduled events is coming soon!")}
              className={`${OPTION} text-neutral-500 dark:text-neutral-400 cursor-pointer opacity-70 hover:opacity-100`}
            >
              <DiscordIcon className="w-4 h-4 text-neutral-400" />
              <span className="flex-1">Add to a server&apos;s Events tab</span>
              <SoonPill />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SoonPill() {
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-neutral-100 dark:bg-white/8 text-neutral-500 dark:text-neutral-400 font-semibold">
      Soon
    </span>
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
          className="z-50 px-3 py-1.5 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-medium shadow-lg pointer-events-none"
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
        />

        <span className={CONNECTOR}>miles of</span>

        <LocationPicker
          currentLabel={currentLocationLabel}
          defaultLabel={defaultLocationLabel}
          isCustom={isLocationCustom}
        />

        {/* Timeframe selector — only shown in map view. List view extends
            forward via the footer "Load more events" button, and calendar
            view has its own week navigation, so neither needs a chip here. */}
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

        {/* "= N" event count hidden per user request. Re-enable by un-commenting. */}
        {/* <span className={CONNECTOR}>=</span>
        <span className="inline-flex items-center justify-center min-w-[1.75rem] px-1.5 py-0.5 rounded-md bg-neutral-100 dark:bg-white/10 text-neutral-900 dark:text-white text-xs sm:text-sm font-semibold tabular-nums leading-none">{eventCount}</span> */}

        <SubscribeDropdown
          currentFormat={currentFormat}
          currentRadius={currentRadius}
          currentDays={currentDays}
          onToast={showToast}
        />

        {/* Create Event — sits next to Subscribe so the chip bar carries
            both directions ("get events out" + "put events in"). Links to
            /account/events/new; non-signed-in users get bounced to the
            login page by the (authed) route group's gate, which is the
            expected behavior — no need for a separate signed-in check
            here that'd just duplicate the auth middleware. */}
        <Link
          href="/account/events/new"
          title="Create a new event"
          className="ml-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white text-xs font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800 transition cursor-pointer focus:outline-none"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Create event
        </Link>
      </div>
    </>
  );
}
