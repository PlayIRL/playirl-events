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

/** Lookup table: lowercase alias → canonical name. */
const ALIASES: Record<string, CanonicalFormat> = {
  // Commander family
  "edh": "Commander",
  "commander": "Commander",
  "cedh": "Commander",
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
