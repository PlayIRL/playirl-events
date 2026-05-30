// Single source of truth for MTG format names. Sources spell formats in
// many ways ("EDH" / "Commander" / "cEDH"; "Booster Draft" / "Draft";
// "Sealed Deck" / "Sealed" / "Limited"). Without canonicalization, the
// homepage filter dropdown shows the same format twice and per-format ICS
// files split events across files.
//
// Add new aliases here, not in the scrapers.

/** The canonical names we display and store. Order is roughly popularity. */
export const CANONICAL_FORMATS = [
  "Commander",
  // cEDH (competitive EDH) is its own format-chip rather than a sub-tag
  // of Commander. Scrapers detect the title pattern (see scrapers/*.ts)
  // and override format="Commander" → "cEDH" at ingest time. Treated as
  // a sibling format in the dropdown, the homepage filter, and ICS feeds.
  "cEDH",
  "Standard",
  "Modern",
  "Pioneer",
  "Legacy",
  "Vintage",
  "Pauper",
  "Draft",
  "Sealed",
  "Prerelease",
  "Brawl",
  "Historic",
  "Pauper EDH",
] as const;

export type CanonicalFormat = (typeof CANONICAL_FORMATS)[number];

/** Formats surfaced in a dedicated "Popular" group at the top of the
 *  homepage Format chip dropdown — saves users from scrolling through
 *  the long-tail list to find what they actually came for. Picked by
 *  community popularity + on-platform event volume: Commander dominates
 *  by a wide margin; cEDH is its competitive sibling; Modern / Standard
 *  cover the constructed crowd; Draft covers limited. Reorder or
 *  resize here as the mix shifts — the dropdown adapts automatically.
 *  Anything not in this list falls into an alphabetical "Other" group
 *  below. */
export const POPULAR_FORMATS = ["Commander", "cEDH", "Modern", "Standard", "Draft"] as const;

/** Lookup table: lowercase alias → canonical name. */
const ALIASES: Record<string, CanonicalFormat> = {
  // Commander family. Note: we DON'T alias "cedh" → "Commander" anymore.
  // cEDH is now its own canonical format; the scraper-time logic in
  // wizards-locator.ts / topdeck.ts promotes format="Commander" → "cEDH"
  // when the title matches the cEDH pattern (via lib/format-style.ts
  // isCedh()). If a source ever emits the literal string "cEDH" as the
  // format, the explicit alias below normalizes the casing.
  "cedh": "cEDH",
  "edh": "Commander",
  "commander": "Commander",
  "commander (edh)": "Commander",
  "edh / commander": "Commander",
  "pauper edh": "Pauper EDH",
  "pedh": "Pauper EDH",

  // Limited
  "draft": "Draft",
  "booster draft": "Draft",
  "pick 2 draft": "Draft", // WotC variant — group with Draft for display
  "sealed": "Sealed",
  "sealed deck": "Sealed",
  "limited": "Sealed",
  "four pack sealed": "Sealed", // WotC variant — group with Sealed
  "prerelease": "Prerelease",
  "pre-release": "Prerelease",

  // Constructed
  "standard": "Standard",
  "modern": "Modern",
  "pioneer": "Pioneer",
  "legacy": "Legacy",
  "vintage": "Vintage",
  "pauper": "Pauper",
  "brawl": "Brawl",
  "historic": "Historic",
};

/**
 * Convert any source's raw format string into our canonical name. Returns
 * the original (trimmed) string if unmatched — admins can spot weird new
 * formats in the homepage dropdown and add aliases here.
 */
export function normalizeFormat(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = String(raw).trim();
  if (!trimmed) return "";
  const hit = ALIASES[trimmed.toLowerCase()];
  return hit ?? trimmed;
}

/** URL-safe slug for ICS filenames. Canonical formats get short slugs;
 *  unknown formats fall through to a generic kebab-case. */
const SLUG_OVERRIDES: Record<string, string> = {
  Commander: "commander",
  cEDH: "cedh",
  Standard: "standard",
  Modern: "modern",
  Pioneer: "pioneer",
  Legacy: "legacy",
  Vintage: "vintage",
  Pauper: "pauper",
  Draft: "draft",
  Sealed: "sealed",
  Prerelease: "prerelease",
  Brawl: "brawl",
  Historic: "historic",
  "Pauper EDH": "pauper-edh",
};

export function formatSlug(format: string): string {
  if (SLUG_OVERRIDES[format]) return SLUG_OVERRIDES[format];
  return format.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
