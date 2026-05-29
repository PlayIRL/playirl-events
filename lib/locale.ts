/**
 * Locale + country detection for server-rendered and client-rendered surfaces.
 *
 * Today the app's audience is overwhelmingly US, so the default locale is
 * "en-US" and the default country is "US". As international scrape regions
 * come online, this module is the single chokepoint to swap that — every
 * date/time/cost render reaches for `DEFAULT_LOCALE` rather than baking
 * "en-US" inline.
 *
 * Resolution order (server):
 *   1. Explicit cookie: `playirl-locale` / `playirl-country`. Set by an
 *      eventual user settings page or a "view as" admin toggle.
 *   2. Accept-Language header from the request — picks the highest-q tag
 *      that has both language + region.
 *   3. ip-geo country (caller passes in if it already resolved one).
 *   4. DEFAULT_LOCALE / DEFAULT_COUNTRY.
 *
 * Resolution order (client):
 *   1. The same cookies (readable via document.cookie).
 *   2. navigator.language.
 *   3. DEFAULT_LOCALE.
 *
 * BCP 47 vs ISO 3166: locales look like "en-US", "fr-FR", "ja-JP" — language
 * code + dash + uppercase country. Country code by itself is alpha-2: "US",
 * "FR", "JP". This module keeps them distinct: pass locales to Intl.* APIs,
 * pass country codes to the distance/currency/scrape-grid helpers.
 */

export const DEFAULT_LOCALE = "en-US";
export const DEFAULT_COUNTRY = "US";

export const LOCALE_COOKIE = "playirl-locale";
export const COUNTRY_COOKIE = "playirl-country";
export const CONSENT_COOKIE = "playirl-consent";

/** Countries where the user is presumed to be covered by GDPR (EU/EEA) or
 *  the UK's near-identical UK-GDPR. Shown the consent banner; everyone else
 *  sees nothing by default. List intentionally inclusive of the EEA (NO, IS,
 *  LI) and Switzerland (FADP is close enough that erring on disclosure is
 *  cheaper than the alternative). */
const GDPR_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
  "GB", "IS", "LI", "NO", "CH",
]);

export function isGdprCountry(countryCode: string | null | undefined): boolean {
  if (!countryCode) return false;
  return GDPR_COUNTRIES.has(countryCode.toUpperCase());
}

/** Lowercase BCP 47 language-region match. Accepts both "en-US" and "en_US". */
const BCP47_RE = /^([a-z]{2,3})[-_]([a-z]{2})$/i;

/** Quick sanity check for an ISO 3166 alpha-2 country code. */
function isCountryCode(s: string): boolean {
  return /^[A-Z]{2}$/.test(s);
}

/** Quick sanity check for a BCP 47 locale tag. Accepts language-only ("en")
 *  but the rest of the app prefers the language-region form. */
function isLocale(s: string): boolean {
  if (BCP47_RE.test(s)) return true;
  // language-only is allowed by Intl; trust it.
  return /^[a-z]{2,3}$/i.test(s);
}

/** Normalize "en_US" → "en-US", uppercases the region part. */
function normalizeLocale(s: string): string {
  const m = s.match(BCP47_RE);
  if (m) return `${m[1].toLowerCase()}-${m[2].toUpperCase()}`;
  return s.toLowerCase();
}

/**
 * Parse Accept-Language and return the first tag that has a region subtag,
 * normalized to "lang-REGION". Falls back to the highest-q tag overall, then
 * to DEFAULT_LOCALE. Quality factors are honored — "en-US;q=0.8, fr-FR;q=0.9"
 * picks fr-FR.
 */
export function parseAcceptLanguage(header: string | null | undefined): string {
  if (!header) return DEFAULT_LOCALE;
  const parts = header
    .split(",")
    .map((p) => {
      const [tag, ...attrs] = p.trim().split(";");
      const qAttr = attrs.find((a) => a.trim().startsWith("q="));
      const q = qAttr ? parseFloat(qAttr.split("=")[1]) : 1;
      return { tag: tag.trim(), q: Number.isFinite(q) ? q : 0 };
    })
    .filter((p) => p.tag && p.tag !== "*")
    .sort((a, b) => b.q - a.q);

  // Prefer tags that already carry a region (en-US over en).
  const withRegion = parts.find((p) => BCP47_RE.test(p.tag));
  if (withRegion) return normalizeLocale(withRegion.tag);
  if (parts.length > 0 && isLocale(parts[0].tag)) return normalizeLocale(parts[0].tag);
  return DEFAULT_LOCALE;
}

/** Extract the country subtag from a BCP 47 locale, or null if absent. */
export function countryFromLocale(locale: string): string | null {
  const m = locale.match(BCP47_RE);
  return m ? m[2].toUpperCase() : null;
}

/** Read a cookie value from a `Cookie:` header. Lightweight — avoids pulling
 *  in `next/headers` so this module works from middleware and server actions. */
function readCookie(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = cookieHeader.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * Resolve the display locale for a server-rendered request. Pass in the
 * incoming `Headers` (from `next/headers` or a Request); the caller doesn't
 * need to do anything else.
 */
export function getServerLocale(headers: Headers | null | undefined): string {
  if (!headers) return DEFAULT_LOCALE;
  const cookie = readCookie(headers.get("cookie"), LOCALE_COOKIE);
  if (cookie && isLocale(cookie)) return normalizeLocale(cookie);
  return parseAcceptLanguage(headers.get("accept-language"));
}

/**
 * Resolve the display country. Cookie wins; otherwise infer from the locale.
 * The IP-geo fallback is the caller's responsibility — pass `ipCountry` in
 * when you've already resolved one (saves a redundant geo lookup).
 */
export function getServerCountry(
  headers: Headers | null | undefined,
  ipCountry?: string | null,
): string {
  if (headers) {
    const cookie = readCookie(headers.get("cookie"), COUNTRY_COOKIE);
    if (cookie && isCountryCode(cookie.toUpperCase())) return cookie.toUpperCase();
    const fromLocale = countryFromLocale(getServerLocale(headers));
    if (fromLocale) return fromLocale;
  }
  if (ipCountry && isCountryCode(ipCountry.toUpperCase())) return ipCountry.toUpperCase();
  return DEFAULT_COUNTRY;
}

/** Country → ISO 4217 currency. Covers the WotC-active footprint; extend
 *  here when adding scrape regions. Unknown countries fall through to USD. */
const COUNTRY_TO_CURRENCY: Record<string, string> = {
  US: "USD", CA: "CAD", MX: "MXN",
  GB: "GBP", IE: "EUR",
  FR: "EUR", DE: "EUR", IT: "EUR", ES: "EUR", PT: "EUR",
  NL: "EUR", BE: "EUR", LU: "EUR",
  AT: "EUR", FI: "EUR", GR: "EUR",
  CH: "CHF",
  DK: "DKK", SE: "SEK", NO: "NOK", IS: "ISK",
  PL: "PLN", CZ: "CZK", SK: "EUR", HU: "HUF", RO: "RON",
  AU: "AUD", NZ: "NZD",
  JP: "JPY", KR: "KRW", CN: "CNY", TW: "TWD", HK: "HKD", SG: "SGD",
  TH: "THB", VN: "VND", PH: "PHP", ID: "IDR", MY: "MYR",
  IN: "INR",
  BR: "BRL", AR: "ARS", CL: "CLP", CO: "COP", PE: "PEN",
  ZA: "ZAR",
};

export function currencyForCountry(countryCode: string | null | undefined): string {
  if (!countryCode) return "USD";
  return COUNTRY_TO_CURRENCY[countryCode.toUpperCase()] || "USD";
}

/**
 * Client-side locale resolution. Use from "use client" components to render
 * Intl-formatted strings in the viewer's actual locale. Order:
 *   1. The `playirl-locale` cookie (set by the eventual user settings page).
 *   2. navigator.language (the browser's preferred locale).
 *   3. DEFAULT_LOCALE.
 *
 * Returns DEFAULT_LOCALE on SSR (typeof window === "undefined") so server
 * + client render the same string and hydration matches.
 */
export function getClientLocale(): string {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const cookieMatch = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]*)`),
  );
  if (cookieMatch) {
    const v = decodeURIComponent(cookieMatch[1]);
    if (isLocale(v)) return normalizeLocale(v);
  }
  if (typeof navigator !== "undefined" && navigator.language) {
    return normalizeLocale(navigator.language);
  }
  return DEFAULT_LOCALE;
}
