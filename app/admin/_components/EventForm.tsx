"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { geocodeAddress } from "@/lib/geocode";
import { FORMAT_SUGGESTIONS } from "@/lib/format-style";
import { currencyForCountry } from "@/lib/locale";
import VenueAutocomplete, { type Venue } from "./VenueAutocomplete";
import FormatCombobox from "./FormatCombobox";
import EventImageInput from "./EventImageInput";
import { Button } from "@/app/button";

export interface EventFormValues {
  id?: string;
  title: string;
  format: string;
  date: string;
  time: string;
  timezone: string;
  location: string;
  address: string;
  cost: string;
  /** ISO 4217 currency for entry fee. Stored alongside `cost` so the renderer
   *  can format properly per locale. Empty string = unset (legacy / Free). */
  currency: string;
  /** ISO 3166 alpha-2 country code for the venue. Stamped at scrape time
   *  for scraped events; admin sets explicitly when creating manually. */
  country: string;
  store_url: string;
  detail_url: string;
  latitude: string;
  longitude: string;
  status: string;
  notes: string;
  image_url: string;
  /** Capacity input; "" = uncapped. Stored as string in form state, coerced
   *  to number|null on submit. */
  capacity: string;
  rsvp_enabled: boolean;
  /** 'public' | 'unlisted' | 'private' — see lib/events.ts visibilityFilter. */
  visibility: string;
}

const EMPTY: EventFormValues = {
  title: "", format: "", date: "", time: "", timezone: "America/New_York",
  location: "", address: "", cost: "", currency: "USD", country: "US",
  store_url: "", detail_url: "",
  latitude: "", longitude: "", status: "active", notes: "", image_url: "",
  capacity: "", rsvp_enabled: true, visibility: "public",
};

// Country / currency dropdown options. Country list mirrors the scrape grids
// + a handful of common non-WPN markets admins might want to manually file
// events under. Currency follows ISO 4217. Both lists are intentionally
// short — admins can free-type by changing the value if they need an entry
// outside the list, but the dropdown gives them sane defaults for the 95%
// case without a search component.
const COUNTRY_OPTIONS: { value: string; label: string }[] = [
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
  { value: "MX", label: "Mexico" },
  { value: "GB", label: "United Kingdom" },
  { value: "IE", label: "Ireland" },
  { value: "FR", label: "France" },
  { value: "DE", label: "Germany" },
  { value: "ES", label: "Spain" },
  { value: "IT", label: "Italy" },
  { value: "PT", label: "Portugal" },
  { value: "NL", label: "Netherlands" },
  { value: "BE", label: "Belgium" },
  { value: "CH", label: "Switzerland" },
  { value: "AT", label: "Austria" },
  { value: "DK", label: "Denmark" },
  { value: "SE", label: "Sweden" },
  { value: "NO", label: "Norway" },
  { value: "FI", label: "Finland" },
  { value: "PL", label: "Poland" },
  { value: "CZ", label: "Czechia" },
  { value: "HU", label: "Hungary" },
  { value: "GR", label: "Greece" },
  { value: "AU", label: "Australia" },
  { value: "NZ", label: "New Zealand" },
  { value: "JP", label: "Japan" },
  { value: "KR", label: "South Korea" },
  { value: "SG", label: "Singapore" },
  { value: "BR", label: "Brazil" },
];

const CURRENCY_OPTIONS: { value: string; label: string }[] = [
  { value: "USD", label: "USD — US Dollar" },
  { value: "CAD", label: "CAD — Canadian Dollar" },
  { value: "MXN", label: "MXN — Mexican Peso" },
  { value: "GBP", label: "GBP — British Pound" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "CHF", label: "CHF — Swiss Franc" },
  { value: "DKK", label: "DKK — Danish Krone" },
  { value: "SEK", label: "SEK — Swedish Krona" },
  { value: "NOK", label: "NOK — Norwegian Krone" },
  { value: "PLN", label: "PLN — Polish Złoty" },
  { value: "CZK", label: "CZK — Czech Koruna" },
  { value: "HUF", label: "HUF — Hungarian Forint" },
  { value: "AUD", label: "AUD — Australian Dollar" },
  { value: "NZD", label: "NZD — NZ Dollar" },
  { value: "JPY", label: "JPY — Japanese Yen" },
  { value: "KRW", label: "KRW — Korean Won" },
  { value: "SGD", label: "SGD — Singapore Dollar" },
  { value: "BRL", label: "BRL — Brazilian Real" },
];

/** Currencies that don't use minor units (¥500 not ¥5.00). Mirrored from
 *  lib/format-cost.ts; kept inline so this client component doesn't pull
 *  in the entire format-cost module just for one Set. */
const ZERO_DECIMAL_CURRENCIES = new Set(["JPY", "KRW", "VND", "IDR", "CLP", "ISK", "HUF"]);

/** Lookup the conventional currency symbol for the form's cost-input
 *  prefix. We could use Intl.NumberFormat().formatToParts but for a single-
 *  char hint the small static map reads cleaner + avoids per-keystroke
 *  Intl construction. Falls back to the 3-letter code when unmapped. */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", CAD: "C$", MXN: "MX$", AUD: "A$", NZD: "NZ$",
  GBP: "£", EUR: "€", CHF: "Fr",
  DKK: "kr", SEK: "kr", NOK: "kr",
  PLN: "zł", CZK: "Kč", HUF: "Ft",
  JPY: "¥", KRW: "₩", SGD: "S$", BRL: "R$",
};

const FIELD = "w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-400/40 dark:focus:ring-white/20";

/**
 * Stored cost strings use "Free" or "$N" / "€N" / "¥N" (matches scraper
 * output for whatever currency the source carries). Parse into a
 * {paid, amount} pair for the UI, then serialize back on change. Strip
 * any leading currency-symbol-ish characters so the amount we present to
 * the input is just the number; the display symbol is reattached at
 * render time based on the selected currency.
 */
function parseCost(stored: string): { paid: boolean; amount: string } {
  const s = (stored ?? "").trim();
  if (!s) return { paid: false, amount: "" };
  if (/^free$/i.test(s)) return { paid: false, amount: "" };
  // Extract the first number from the string regardless of which currency
  // symbol prefixed it ($, €, £, ¥, kr, zł, Kč, Ft, R$, etc.). Decimals
  // optional — Yen amounts won't carry any.
  const m = s.match(/([0-9]+(?:[.,][0-9]+)?)/);
  if (m) return { paid: true, amount: m[1].replace(",", ".") };
  return { paid: true, amount: s }; // last-ditch — preserve raw input
}

/** Render the display cost string for storage. Uses the currency's
 *  conventional symbol so the existing public-facing cost rendering (which
 *  reads the raw string) keeps working for old viewers — newer rendering
 *  paths prefer entry_fee_minor + currency through displayCost() anyway. */
function serializeCost(paid: boolean, amount: string, currency: string): string {
  if (!paid) return "Free";
  const a = amount.trim();
  if (!a) return "";
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency + " ";
  return `${symbol}${a}`;
}

/** Convert a free-text amount in MAJOR units (e.g. "10" dollars, "500" yen)
 *  to minor units for storage (1000 cents, 500 yen — JPY has no minor
 *  units). Returns null when the amount can't be parsed; "" amount with
 *  paid=false → 0 (i.e. "Free"). */
function amountToMinor(paid: boolean, amount: string, currency: string): number | null {
  if (!paid) return 0;
  const trimmed = amount.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  if (ZERO_DECIMAL_CURRENCIES.has(currency)) return Math.round(n);
  return Math.round(n * 100);
}

export default function EventForm({
  initial,
  endpoint,
  method,
  redirectTo,
  showStatus = true,
}: {
  initial?: Partial<EventFormValues>;
  endpoint: string;          // e.g. "/api/admin/events" for POST or "/api/admin/events/<id>" for PATCH
  method: "POST" | "PATCH";
  redirectTo: string;        // path to navigate to after save
  showStatus?: boolean;      // organizer flow hides this and forces 'active'
}) {
  const router = useRouter();
  const [values, setValues] = useState<EventFormValues>({ ...EMPTY, ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [venueFilled, setVenueFilled] = useState(false);
  const geoToken = useRef(0);

  // Cost UI state — derived from values.cost but kept local so "Paid with no
  // amount yet" doesn't immediately write an empty string back.
  const initialCost = parseCost(values.cost);
  const [costPaid, setCostPaid] = useState<boolean>(initialCost.paid);
  const [costAmount, setCostAmount] = useState<string>(initialCost.amount);
  const [imageUploading, setImageUploading] = useState(false);

  function field<K extends keyof EventFormValues>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setValues((v) => ({ ...v, [key]: e.target.value }));
  }

  function updateCost(nextPaid: boolean, nextAmount: string) {
    setCostPaid(nextPaid);
    setCostAmount(nextAmount);
    setValues((v) => ({ ...v, cost: serializeCost(nextPaid, nextAmount, v.currency || "USD") }));
  }

  /** Updating the country auto-suggests the currency (the country's
   *  conventional currency from lib/locale.ts). Admins can still override
   *  by changing the currency dropdown directly — this just removes a
   *  step for the 95% case where Japan = JPY, France = EUR, etc. */
  function updateCountry(nextCountry: string) {
    setValues((v) => {
      const nextCurrency = currencyForCountry(nextCountry);
      // Re-serialize cost under the new currency so the stored string
      // keeps the right symbol prefix for legacy rendering paths.
      return {
        ...v,
        country: nextCountry,
        currency: nextCurrency,
        cost: serializeCost(costPaid, costAmount, nextCurrency),
      };
    });
  }

  function updateCurrency(nextCurrency: string) {
    setValues((v) => ({
      ...v,
      currency: nextCurrency,
      cost: serializeCost(costPaid, costAmount, nextCurrency),
    }));
  }

  // Pulled from a known venue suggestion — fill in the details we have, but
  // don't overwrite fields the user has already typed manually (except the
  // hidden coordinates, which are always plumbing).
  function applyVenue(venue: Venue) {
    setValues((v) => ({
      ...v,
      location: venue.name,
      address: v.address.trim() ? v.address : venue.address,
      store_url: v.store_url.trim() ? v.store_url : venue.store_url,
      latitude: venue.latitude != null ? String(venue.latitude) : v.latitude,
      longitude: venue.longitude != null ? String(venue.longitude) : v.longitude,
    }));
    setVenueFilled(true);
  }

  // Auto-look-up coordinates when the address leaves focus. Users never see
  // lat/lng — we use them behind the scenes for distance filtering.
  async function lookupAddress() {
    const address = values.address.trim();
    if (!address) return;
    const myToken = ++geoToken.current;
    const result = await geocodeAddress(address);
    if (myToken !== geoToken.current) return;
    if (result) {
      setValues((v) => ({
        ...v,
        latitude: String(result.latitude),
        longitude: String(result.longitude),
      }));
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    // entry_fee_minor is the canonical machine-readable cost; `cost`
    // string sticks around for back-compat with renderers that haven't
    // switched to displayCost() yet.
    const entry_fee_minor = amountToMinor(costPaid, costAmount, values.currency || "USD");
    const payload = {
      ...values,
      latitude: values.latitude ? Number(values.latitude) : null,
      longitude: values.longitude ? Number(values.longitude) : null,
      capacity: values.capacity.trim() ? Math.max(0, parseInt(values.capacity, 10) || 0) : null,
      rsvp_enabled: values.rsvp_enabled ? 1 : 0,
      entry_fee_minor,
    };
    const res = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      router.push(redirectTo);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? `Save failed (${res.status})`);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {/* Section 1 — Basics. Title sits alone above the 3-up date/time/
          format row so the most-typed field gets full breathing room. */}
      <Section label="The basics">
        <Field label="Title" required>
          <input className={FIELD} value={values.title} onChange={field("title")} required />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Date" required>
            <input className={FIELD} type="date" value={values.date} onChange={field("date")} required />
          </Field>
          <Field label="Time">
            <input className={FIELD} type="time" value={values.time} onChange={field("time")} placeholder="HH:MM" />
          </Field>
          <Field label="Format">
            <FormatCombobox
              value={values.format}
              onChange={(next) => setValues((v) => ({ ...v, format: next }))}
              options={FORMAT_SUGGESTIONS}
              className={FIELD}
              placeholder="Start typing…"
            />
          </Field>
        </div>
      </Section>

      <Section label="Where">
        <Field
          label="Location (venue name)"
          hint={
            venueFilled
              ? "We filled in what we know. Edit anything that's changed."
              : "Start typing — we'll suggest venues we already know."
          }
        >
          <VenueAutocomplete
            value={values.location}
            onChange={(next) => {
              setValues((v) => ({ ...v, location: next }));
              if (venueFilled) setVenueFilled(false);
            }}
            onPick={applyVenue}
            className={FIELD}
            placeholder="e.g. Hamilton's Hand"
          />
        </Field>

        <Field label="Address">
          <input className={FIELD} value={values.address} onChange={field("address")} onBlur={lookupAddress} />
        </Field>
      </Section>

      <Section label="Cost & links">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field
            label="Country"
            hint="Drives default currency, distance unit, and which country grid this venue lives in."
          >
            <select
              className={FIELD}
              value={values.country}
              onChange={(e) => updateCountry(e.target.value)}
            >
              {COUNTRY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Currency" hint="Auto-set from country; change if the event prices in a different one.">
            <select
              className={FIELD}
              value={values.currency}
              onChange={(e) => updateCurrency(e.target.value)}
            >
              {CURRENCY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Cost">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
              <input
                type="radio"
                name="cost-kind"
                checked={!costPaid}
                onChange={() => updateCost(false, costAmount)}
              />
              Free
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
              <input
                type="radio"
                name="cost-kind"
                checked={costPaid}
                onChange={() => updateCost(true, costAmount)}
              />
              Paid
            </label>
            <div className={`flex items-center gap-1 transition ${costPaid ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
              <span className="text-neutral-500 dark:text-neutral-400 min-w-[1.5rem] text-right">
                {CURRENCY_SYMBOLS[values.currency] ?? values.currency}
              </span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step={ZERO_DECIMAL_CURRENCIES.has(values.currency) ? "1" : "0.01"}
                value={costAmount}
                onChange={(e) => updateCost(costPaid, e.target.value)}
                placeholder={ZERO_DECIMAL_CURRENCIES.has(values.currency) ? "500" : "5"}
                aria-label={`Price in ${values.currency}`}
                className="w-28 px-2 py-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-400/40 dark:focus:ring-white/20"
              />
              <span className="text-xs text-neutral-500 dark:text-neutral-400 ml-1">{values.currency}</span>
            </div>
          </div>
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field
            label="Venue website"
            hint="Optional. The store, bar, or club's main site — e.g. hamiltons.com."
          >
            <input
              className={FIELD}
              type="url"
              value={values.store_url}
              onChange={field("store_url")}
              placeholder="https://"
            />
          </Field>
          <Field
            label="Event detail URL"
            hint="Optional. Link directly to this event's registration or info page, if different from the venue site."
          >
            <input
              className={FIELD}
              type="url"
              value={values.detail_url}
              onChange={field("detail_url")}
              placeholder="https://"
            />
          </Field>
        </div>
      </Section>

      <Section label="Photo & description">
        <Field label="Photo">
          <EventImageInput
            value={values.image_url}
            onChange={(next) => setValues((v) => ({ ...v, image_url: next }))}
            onUploadingChange={setImageUploading}
          />
        </Field>

        <Field label="Description">
          <textarea className={FIELD} rows={3} value={values.notes} onChange={field("notes")} />
        </Field>
      </Section>

      <Section label="Settings">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field
            label="Player capacity"
            hint="Optional. Cap on the number of people who can RSVP &lsquo;Going&rsquo;. Leave blank for no cap."
          >
            <input
              className={FIELD}
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={values.capacity}
              onChange={field("capacity")}
              placeholder="e.g. 16"
            />
          </Field>
          <Field
            label="RSVPs"
            hint="Let signed-in players RSVP &lsquo;Going&rsquo; or &lsquo;Maybe&rsquo;. You'll see a roster on your event."
          >
            <label className="inline-flex items-center gap-2 mt-2 text-sm text-neutral-700 dark:text-neutral-300">
              <input
                type="checkbox"
                checked={values.rsvp_enabled}
                onChange={(e) => setValues((v) => ({ ...v, rsvp_enabled: e.target.checked }))}
                className="rounded-md border-neutral-300 dark:border-neutral-600"
              />
              Enabled
            </label>
          </Field>
        </div>

        <Field label="Visibility">
          <div className="space-y-2 mt-1">
            {[
              { v: "public", label: "Public", hint: "Listed on the homepage and in the public ICS feed." },
              { v: "unlisted", label: "Unlisted", hint: "Only viewable with a direct link. Hidden from the homepage and feeds." },
              { v: "private", label: "Private", hint: "Invite-only. Viewers must be signed in and either invited, RSVP'd, or the host." },
            ].map((opt) => (
              <label key={opt.v} className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="visibility"
                  value={opt.v}
                  checked={values.visibility === opt.v}
                  onChange={() => setValues((v) => ({ ...v, visibility: opt.v }))}
                  className="mt-0.5"
                />
                <span className="flex-1">
                  <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{opt.label}</span>
                  <span className="block text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{opt.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </Field>

        {showStatus && (
          <Field label="Status">
            <select className={FIELD} value={values.status} onChange={field("status")}>
              <option value="active">active</option>
              <option value="skip">skip</option>
              <option value="pinned">pinned</option>
              <option value="pending">pending</option>
            </select>
          </Field>
        )}
      </Section>

      <div className="flex gap-3 pt-2">
        <Button type="submit" variant="primary" disabled={saving || imageUploading}>
          {saving ? "Saving…" : imageUploading ? "Uploading photo…" : "Save"}
        </Button>
        <Button variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * Section break for the event form. Renders a standard h2 + hairline
 * divider above the children. Lighter-touch than card chrome (no
 * "boxes-within-boxes" feel) but still gives the eye a clear stopping
 * point between groups of fields.
 *
 * Hides the divider on the first section so the form doesn't open with
 * an orphaned line under the page header.
 */
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 pt-6 border-t border-neutral-200/70 dark:border-white/8 first:pt-0 first:border-t-0">
      <h2 className="text-base font-extrabold tracking-tight text-neutral-900 dark:text-neutral-100">
        {label}
      </h2>
      {children}
    </section>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
      {hint && <span className="block text-xs text-neutral-500 dark:text-neutral-400 mt-1">{hint}</span>}
    </label>
  );
}
