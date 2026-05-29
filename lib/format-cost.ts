/**
 * Currency-aware cost formatting for event entry fees.
 *
 * Scrapers stash three things: a free-text `cost` (the legacy display string —
 * "$10", "Free"), a `currency` (ISO 4217: "USD", "EUR", "GBP", "JPY"), and an
 * `entry_fee_minor` integer in minor units (cents/pence/yen). When both
 * structured fields are present, prefer them — Intl.NumberFormat renders the
 * right symbol and decimal precision per locale. Fall back to the raw `cost`
 * string when the source didn't carry structured pricing (TopDeck, Discord).
 */

import { DEFAULT_LOCALE } from "./locale";

const ZERO_DECIMAL_CURRENCIES = new Set([
  "JPY", "KRW", "VND", "IDR", "CLP", "ISK", "HUF",
]);

function minorUnitsToMajor(minor: number, currency: string): number {
  if (ZERO_DECIMAL_CURRENCIES.has(currency)) return minor;
  return minor / 100;
}

/**
 * Render a structured (entry_fee_minor, currency) pair. Returns "" when
 * either input is missing — callers should fall back to the legacy `cost`
 * string. `locale` defaults to "en-US" because the existing UI is English;
 * the locale only affects digit grouping and decimal separator, not the
 * currency symbol.
 */
export function formatCost(
  entryFeeMinor: number | null | undefined,
  currency: string | null | undefined,
  locale: string = DEFAULT_LOCALE,
): string {
  if (entryFeeMinor == null) return "";
  if (entryFeeMinor === 0) return "Free";
  const cc = (currency || "").toUpperCase();
  if (!cc) return "";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: cc,
      // Keep "$10" rather than "$10.00" when the source amount is a round
      // number of major units — matches the existing in-DB display style.
      maximumFractionDigits: entryFeeMinor % 100 === 0 && !ZERO_DECIMAL_CURRENCIES.has(cc) ? 0 : undefined,
    }).format(minorUnitsToMajor(entryFeeMinor, cc));
  } catch {
    // Bad currency code → don't crash, fall through to caller's text path.
    return "";
  }
}

/**
 * Pick the best display string given both structured + legacy fields. Use
 * this in render code rather than calling `formatCost` directly so the
 * scraper's pre-rendered string stays the source of truth for anything
 * that came in pre-international-support.
 */
export function displayCost(
  legacyCost: string | null | undefined,
  entryFeeMinor: number | null | undefined,
  currency: string | null | undefined,
  locale: string = DEFAULT_LOCALE,
): string {
  const structured = formatCost(entryFeeMinor, currency, locale);
  if (structured) return structured;
  return (legacyCost ?? "").trim();
}
