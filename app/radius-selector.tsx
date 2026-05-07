"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { FORMAT_DOT } from "@/lib/format-style";
import LocationPicker from "./location-picker";

// Build the canonical /calendar URL given the user's current filter state.
// Empty/falsy filters are omitted so subscribers to the bare /calendar
// keep getting the unfiltered global feed.
function buildFeedPath({ format, radius, days }: { format?: string; radius: number; days: number }): string {
  const sp = new URLSearchParams();
  if (format) sp.set("format", format);
  if (radius) sp.set("radius", String(radius));
  if (days) sp.set("days", String(days));
  const qs = sp.toString();
  return qs ? `/calendar?${qs}` : `/calendar`;
}

const RADIUS_OPTIONS = [5, 10, 15, 25, 50];
function getTimeOptions() {
  const now = new Date();
  const options: { value: string; label: string }[] = [
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
const CONNECTOR = "font-[family-name:var(--font-inter)] font-normal text-sm tracking-normal";
const DROPDOWN_BASE = "absolute top-full mt-2 z-50 bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-white/10 rounded-xl shadow-xl overflow-hidden min-w-max";
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
}: {
  label: string;
  heading: string;
  options: { value: string; label: string; dot?: string }[];
  value: string;
  onChange: (v: string) => void;
  dot?: boolean;
  align?: "start" | "center" | "end";
}) {
  const [status, setStatus] = useState<"closed" | "open" | "closing">("closed");
  const statusRef = useRef<"closed" | "open" | "closing">("closed");
  const ref = useRef<HTMLDivElement>(null);

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
            <p className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500">{heading}</p>
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
        </div>
      )}
    </div>
  );
}

function SubscribeDropdown({
  currentFormat,
  currentRadius,
  currentDays,
  onToast,
}: {
  currentFormat?: string;
  currentRadius: number;
  currentDays: number;
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
  const path = buildFeedPath({ format: currentFormat, radius: currentRadius, days: currentDays });
  const webcalUrl = `webcal://${host}${path}`;
  const httpsUrl = `https://${host}${path}`;
  const downloadName = `mtg-${currentFormat ?? "events"}-${currentRadius}mi-${currentDays}d.ics`;

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
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 text-neutral-600 dark:text-neutral-400 text-xs hover:border-neutral-300 dark:hover:border-white/20 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-neutral-800 active:opacity-70 transition-all duration-150 cursor-pointer focus:outline-none"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 3v3m8-3v3M4 9h16M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
        </svg>
        subscribe
      </button>
      {status !== "closed" && (
        <div className={`${DROPDOWN_BASE} right-0 ${status === "closing" ? "anim-scale-out" : "anim-scale-in"}`}>
          <div className="px-4 py-2.5 border-b border-neutral-100 dark:border-white/8">
            <p className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500">Subscribe</p>
            <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-300 font-medium">{filterSummary}</p>
          </div>

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

          {/* Discord pair — visible affordance, action lands later. Dimmed
              with a `Soon` pill so the row reads as roadmap, not broken. */}
          <div className="border-t border-neutral-100 dark:border-white/8 mt-1 pt-1">
            <button
              type="button"
              onClick={() => comingSoon("Discord posting coming soon!")}
              className={`${OPTION} text-neutral-500 dark:text-neutral-400 cursor-pointer opacity-70 hover:opacity-100`}
            >
              <DiscordIcon />
              <span className="flex-1">Post summary to Discord</span>
              <SoonPill />
            </button>
            <button
              type="button"
              onClick={() => comingSoon("Discord events coming soon!")}
              className={`${OPTION} text-neutral-500 dark:text-neutral-400 cursor-pointer opacity-70 hover:opacity-100`}
            >
              <DiscordIcon />
              <span className="flex-1">Add as Discord events</span>
              <SoonPill />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DiscordIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 71 55" className="w-4 h-3.5 shrink-0 text-neutral-400" fill="currentColor" aria-hidden>
      <path d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.440769 45.4204 0.525289C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.525289C25.5141 0.443589 25.4218 0.40133 25.3293 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9057 44.6363 54.2779 44.9293 54.6529 45.2082C54.7816 45.304 54.7732 45.5041 54.6333 45.5858C52.8646 46.6197 51.0259 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.038 50.6034 51.2554 52.5699 52.5959 54.435C52.6519 54.5139 52.7526 54.5477 52.845 54.5195C58.6464 52.7249 64.529 50.0174 70.6019 45.5576C70.6551 45.5182 70.6887 45.459 70.6943 45.3942C72.1747 30.0791 68.2147 16.7757 60.1968 4.9823C60.1772 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z" />
    </svg>
  );
}

function SoonPill() {
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-white/8 text-neutral-500 dark:text-neutral-400 font-semibold">
      Soon
    </span>
  );
}

export default function RadiusSelector({
  currentRadius,
  currentDays,
  currentFormat,
  formats,
  eventCount,
  currentLocationLabel,
  defaultLocationLabel,
  isLocationCustom,
}: {
  currentRadius: number;
  currentDays: number;
  currentFormat?: string;
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

  const radiusOptions = RADIUS_OPTIONS.map((r) => ({ value: String(r), label: `${r} miles` }));

  return (
    <>
      {toast && (
        <div
          className="fixed z-50 px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-white/8 rounded-lg text-sm text-neutral-900 dark:text-white font-medium shadow-lg whitespace-nowrap pointer-events-none"
          style={{ top: `${toast.top}px`, left: `${toast.left}px`, transform: "translateX(-50%)" }}
        >
          {toast.text}
        </div>
      )}
      {/* `<div>` not `<p>` — children include block-level elements (the
          ChipSelect dropdowns and SubscribeDropdown render `<div>`s), and
          a `<p>` containing `<div>` is invalid HTML, which surfaces as a
          React-19 hydration warning + DOM-nesting error in the console. */}
      <div className="text-neutral-400 dark:text-neutral-400 flex items-center justify-center flex-wrap gap-x-1.5 gap-y-1 text-sm sm:text-base leading-relaxed font-[family-name:var(--font-ultra)] font-bold">
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
        />

        <span className={CONNECTOR}>miles of</span>

        <LocationPicker
          currentLabel={currentLocationLabel}
          defaultLabel={defaultLocationLabel}
          isCustom={isLocationCustom}
        />

        {/* Timeframe selector + the "in" connector hidden per user request.
            Replaced by the DateJumper in the footer Prev/Next week row.
            Re-enable by un-commenting the block below. */}
        {/* <span className={CONNECTOR}>in</span>
        <ChipSelect
          label={TIME_OPTIONS.find((t) => t.value === String(currentDays))?.label || "This week"}
          heading="Timeframe"
          options={TIME_OPTIONS}
          value={String(currentDays)}
          onChange={(v) => updateParam("days", v)}
          align="end"
        /> */}

        {/* "= N" event count hidden per user request. Re-enable by un-commenting. */}
        {/* <span className={CONNECTOR}>=</span>
        <span className="inline-flex items-center justify-center min-w-[1.75rem] px-1.5 py-0.5 rounded-md bg-neutral-100 dark:bg-white/10 text-neutral-900 dark:text-white text-xs sm:text-sm font-semibold tabular-nums leading-none">{eventCount}</span> */}

        <SubscribeDropdown
          currentFormat={currentFormat}
          currentRadius={currentRadius}
          currentDays={currentDays}
          onToast={showToast}
        />
      </div>
    </>
  );
}
