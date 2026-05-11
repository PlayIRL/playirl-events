"use client";

// Shared layout primitives + helpers used by both the "+ New subscription"
// modal and the per-card edit form. Keeping them in one file means hint
// copy and field controls can never drift between create and edit.

import { useMemo } from "react";

export type Mode = "weekly" | "daily" | "reminder";

export const FORMAT_OPTIONS = ["", "Commander", "Modern", "Standard", "Pioneer", "Legacy", "Pauper", "Draft", "Sealed"];
export const SOURCE_OPTIONS = ["", "wizards-locator", "topdeck", "discord"];
export const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const LEAD_PRESETS: { value: string; label: string }[] = [
  { value: "1h", label: "1 hour before" },
  { value: "2h", label: "2 hours before" },
  { value: "morning_of", label: "Morning of" },
  { value: "day_before", label: "Day before" },
];

// Plain-language explanations rendered under each field. One source of truth
// so the create + edit forms stay aligned.
export const HINTS = {
  server: "Pick a Discord server you administer. Only servers where you have Manage Server permission and the bot is added show up here.",
  channel: "Which channel in this server the bot will post to. The bot needs Send Messages + Embed Links there.",
  modeWeekly: "One digest message per week with all matching events in the next 7 days.",
  modeDaily: "One digest each day with today's matching events.",
  modeReminder: "A separate reminder posted shortly before each matching event.",
  dow: "Which day of the week the digest fires.",
  hour: "When during the day the post lands. Shown in your local timezone.",
  lead: "How long before each event to send the reminder.",
  format: "Filter to events of a single format (e.g. Commander). Leave blank to include all formats.",
  near: "Center events on a city, address, or zip. We'll geocode it server-side. Required unless you set a venue scope above.",
  radius: "Only include events within this many miles of \"Near\". Required unless you set a venue scope above.",
  daysAhead: "How far ahead the digest looks for events. Default is one week.",
} as const;

// Shared text/select/number input styling. Used everywhere a form field
// needs the standard look — keep this in sync with the design system.
export const INPUT_CLASS =
  "w-full px-2.5 py-2 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400/40 focus:border-neutral-400 dark:focus:ring-white/20 dark:focus:border-white/30";

// --- Time / timezone helpers ----------------------------------------------

/** 24-entry hour-of-day options labeled in the viewer's local timezone. */
export function buildHourOptions(): { utcHour: number; label: string }[] {
  const today = new Date();
  return Array.from({ length: 24 }, (_, utcHour) => {
    const d = new Date(today);
    d.setUTCHours(utcHour, 0, 0, 0);
    return { utcHour, label: d.toLocaleTimeString([], { hour: "numeric", hour12: true }) };
  });
}

export function shortTimezoneLabel(): string {
  try {
    const parts = new Intl.DateTimeFormat([], { timeZoneName: "short" }).formatToParts(new Date());
    const tz = parts.find(p => p.type === "timeZoneName");
    if (tz?.value) return tz.value;
  } catch {}
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch {}
  return "your time";
}

export function utcHourToLocalLabel(utcHour: number): string {
  const d = new Date();
  d.setUTCHours(utcHour, 0, 0, 0);
  return d.toLocaleTimeString([], { hour: "numeric", hour12: true });
}

/** Hooks combining the above so client components don't recompute each render. */
export function useTimePicker() {
  const hourOptions = useMemo(buildHourOptions, []);
  const tzLabel = useMemo(shortTimezoneLabel, []);
  return { hourOptions, tzLabel };
}

// --- Layout primitives ----------------------------------------------------

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">{label}</span>
      {children}
      {hint && (
        <span className="block text-[11px] text-neutral-500 dark:text-neutral-400 mt-1.5 leading-snug">
          {hint}
        </span>
      )}
    </label>
  );
}

export function ChipButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs border transition ${
        active
          ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
          : "border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800"
      }`}
    >
      {children}
    </button>
  );
}

export function ModeButton({
  current,
  value,
  label,
  sub,
  onClick,
}: {
  current: Mode;
  value: Mode;
  label: string;
  sub: string;
  onClick: (m: Mode) => void;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={`text-left px-3 py-2.5 rounded-md border text-sm transition ${
        active
          ? "border-neutral-900 dark:border-white ring-1 ring-neutral-900 dark:ring-white"
          : "border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800"
      }`}
    >
      <div className="font-semibold text-neutral-900 dark:text-white">{label}</div>
      <div className="text-xs text-neutral-500 dark:text-neutral-400">{sub}</div>
    </button>
  );
}

// --- Schedule + Filter sections (the parts shared between create and edit) -

export interface ScheduleFiltersValue {
  mode: Mode;
  hourUtc: number;
  dow: number;
  daysAhead: number;
  lead: string;
  customLeadMinutes: number | "";
  format: string;
  near: string;
  radiusMiles: number | "";
}

export interface ScheduleFiltersHandlers {
  setHourUtc: (h: number) => void;
  setDow: (d: number) => void;
  setDaysAhead: (d: number) => void;
  setLead: (l: string) => void;
  setCustomLeadMinutes: (m: number | "") => void;
  setFormat: (f: string) => void;
  setNear: (n: string) => void;
  setRadiusMiles: (r: number | "") => void;
}

/**
 * Schedule + Filter form fields. Renders the bottom 60% of the create form
 * (the part that's identical in edit mode). Mode-aware: weekly shows day-of-
 * week chips, daily skips them, reminder shows lead-time chips instead of
 * a time-of-day picker.
 */
export function ScheduleAndFilterSections({
  value,
  on,
  /** When true, Near + Radius render with required-* markers and a visible
   *  hint reminding the user a scope must be set. The parent form is still
   *  the source of truth for actually blocking submission. */
  geoRequired = false,
}: {
  value: ScheduleFiltersValue;
  on: ScheduleFiltersHandlers;
  geoRequired?: boolean;
}) {
  const { hourOptions, tzLabel } = useTimePicker();

  return (
    <>
      {(value.mode === "weekly" || value.mode === "daily") && (
        <Section title={value.mode === "weekly" ? "When does the digest fire?" : "What time of day?"}>
          {value.mode === "weekly" && (
            <Field label="Day of week" hint={HINTS.dow}>
              <div className="flex flex-wrap gap-1.5">
                {DOW_LABELS.map((label, idx) => (
                  <ChipButton key={idx} active={value.dow === idx} onClick={() => on.setDow(idx)}>
                    {label}
                  </ChipButton>
                ))}
              </div>
            </Field>
          )}
          <Field label={`Time of day (${tzLabel})`} hint={HINTS.hour}>
            <select
              className={INPUT_CLASS}
              value={value.hourUtc}
              onChange={e => on.setHourUtc(Number(e.target.value))}
            >
              {hourOptions.map(o => (
                <option key={o.utcHour} value={o.utcHour}>{o.label}</option>
              ))}
            </select>
          </Field>
        </Section>
      )}

      {value.mode === "reminder" && (
        <Section title="When should reminders fire?">
          <Field label="Lead time" hint={HINTS.lead}>
            <div className="flex flex-wrap gap-1.5">
              {LEAD_PRESETS.map(p => (
                <ChipButton key={p.value} active={value.lead === p.value} onClick={() => on.setLead(p.value)}>
                  {p.label}
                </ChipButton>
              ))}
              <ChipButton active={value.lead === "custom"} onClick={() => on.setLead("custom")}>
                Custom…
              </ChipButton>
            </div>
            {value.lead === "custom" && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={10080}
                  value={value.customLeadMinutes}
                  onChange={e => on.setCustomLeadMinutes(e.target.value === "" ? "" : Number(e.target.value))}
                  className={`${INPUT_CLASS} w-32`}
                  placeholder="Minutes"
                />
                <span className="text-xs text-neutral-500 dark:text-neutral-400">minutes before</span>
              </div>
            )}
          </Field>
        </Section>
      )}

      <Section title="Filter the events">
        <Field label="Format" hint={HINTS.format}>
          <select className={INPUT_CLASS} value={value.format} onChange={e => on.setFormat(e.target.value)}>
            {FORMAT_OPTIONS.map(o => (
              <option key={o} value={o}>{o || "All formats"}</option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={geoRequired ? "Near *" : "Near"}
            hint={HINTS.near}
          >
            <input
              type="text"
              className={INPUT_CLASS}
              value={value.near}
              onChange={e => on.setNear(e.target.value)}
              placeholder="e.g. Philadelphia, PA"
              required={geoRequired}
              aria-required={geoRequired}
            />
          </Field>
          <Field
            label={geoRequired ? "Radius (miles) *" : "Radius (miles)"}
            hint={HINTS.radius}
          >
            <input
              type="number"
              min={1}
              max={500}
              className={INPUT_CLASS}
              value={value.radiusMiles}
              onChange={e => on.setRadiusMiles(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder={geoRequired ? "Required" : "(no limit)"}
              required={geoRequired}
              aria-required={geoRequired}
            />
          </Field>
        </div>
        {(value.mode === "weekly" || value.mode === "daily") && (
          <Field label="Days ahead to include" hint={HINTS.daysAhead}>
            <input
              type="number"
              min={1}
              max={60}
              className={INPUT_CLASS}
              value={value.daysAhead}
              onChange={e => on.setDaysAhead(Number(e.target.value))}
            />
          </Field>
        )}
      </Section>
    </>
  );
}

// --- Shared global styles for inputs --------------------------------------

/** Inject the .input class globally so both forms share the same look. */
export function FormInputStyles() {
  return (
    <style jsx global>{`
      .input {
        width: 100%;
        padding: 0.5rem 0.625rem;
        border-radius: 0.375rem;
        border: 1px solid rgb(229 231 235);
        background: white;
        font-size: 0.875rem;
        color: inherit;
      }
      .dark .input {
        background: #0c1220;
        border-color: rgba(255, 255, 255, 0.15);
      }
    `}</style>
  );
}
