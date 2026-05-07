export const FORMAT_EMOJI: Record<string, string> = {
  Commander: "\u2694\uFE0F",
  Modern: "\u26A1",
  Standard: "\u2B50",
  Pioneer: "\uD83E\uDE90",
  Legacy: "\uD83D\uDC51",
  Pauper: "\uD83E\uDE99",
  Draft: "\uD83C\uDFB2",
  Sealed: "\uD83C\uDF81",
};

// MTG's traditional WUBRG mana palette drives format colors. Each format
// is associated with the mana color whose flavor matches it: Modern → U
// (control / Island), Standard → G (current / Forest), Pioneer → R
// (aggressive / Mountain), Legacy → B (eternal / Swamp), Pauper → W
// (commons / Plains). Multicolor formats (Commander, Draft, Sealed) get
// gold-family hues since multicolor cards are gold-bordered in MTG.
export const FORMAT_BADGE: Record<string, string> = {
  // Gold — multicolor / legendary
  Commander: "bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-200 dark:border-amber-500/40",
  // U — Island
  Modern: "bg-sky-100 text-sky-800 border border-sky-300 dark:bg-sky-500/20 dark:text-sky-200 dark:border-sky-500/40",
  // G — Forest
  Standard: "bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-200 dark:border-emerald-500/40",
  // R — Mountain
  Pioneer: "bg-red-100 text-red-800 border border-red-300 dark:bg-red-500/20 dark:text-red-200 dark:border-red-500/40",
  // B — Swamp / eternal
  Legacy: "bg-zinc-200 text-zinc-800 border border-zinc-400 dark:bg-zinc-500/25 dark:text-zinc-100 dark:border-zinc-500/40",
  // W — Plains / commons
  Pauper: "bg-yellow-100 text-yellow-800 border border-yellow-300 dark:bg-yellow-500/20 dark:text-yellow-200 dark:border-yellow-500/40",
  // Gold-orange — limited
  Draft: "bg-orange-100 text-orange-800 border border-orange-300 dark:bg-orange-500/20 dark:text-orange-200 dark:border-orange-500/40",
  // Gold-violet — sealed mystery
  Sealed: "bg-violet-100 text-violet-800 border border-violet-300 dark:bg-violet-500/20 dark:text-violet-200 dark:border-violet-500/40",
};

export const FORMAT_DOT: Record<string, string> = {
  Commander: "bg-amber-500",
  Modern: "bg-sky-500",
  Standard: "bg-emerald-500",
  Pioneer: "bg-red-500",
  Legacy: "bg-zinc-600",
  Pauper: "bg-yellow-500",
  Draft: "bg-orange-500",
  Sealed: "bg-violet-500",
};

export const FORMAT_BADGE_DEFAULT =
  "bg-gray-100 text-gray-600 border border-gray-200 dark:bg-gray-500/20 dark:text-gray-300 dark:border-gray-500/30";

export const FORMAT_EMOJI_DEFAULT = "\uD83C\uDCCF";

// Hex-int color values for Discord embed `color` field. Mirrors FORMAT_DOT
// (Tailwind 500-shade values, except Legacy which uses zinc-600 for more
// presence on Discord's neutral embed background).
export const FORMAT_EMBED_COLOR: Record<string, number> = {
  Commander: 0xf59e0b, // amber-500
  Modern: 0x0ea5e9, // sky-500
  Standard: 0x10b981, // emerald-500
  Pioneer: 0xef4444, // red-500
  Legacy: 0x52525b, // zinc-600
  Pauper: 0xeab308, // yellow-500
  Draft: 0xf97316, // orange-500
  Sealed: 0x8b5cf6, // violet-500
};

export const FORMAT_EMBED_COLOR_DEFAULT = 0x6b7280;

// Human-readable source labels. Used by the event detail page footer and
// Discord embed footers — keeping one map means the surface vocabulary
// stays in sync as we add new sources.
export const SOURCE_LABELS: Record<string, string> = {
  "wizards-locator": "Wizards of the Coast Event Locator",
  "discord": "Discord Scheduled Event",
  "topdeck": "TopDeck.gg",
};

/**
 * Canonical format list shown in the event-form dropdown. Matches what the
 * scrapers emit today (see scrapers/discord.ts extractFormat and WotC API
 * format names) so admin-submitted and scraped events share one vocabulary.
 * The form still accepts free-text for one-off formats.
 */
export const FORMAT_SUGGESTIONS = [
  "Commander",
  "Modern",
  "Standard",
  "Pioneer",
  "Legacy",
  "Pauper",
  "Draft",
  "Sealed",
  "Dungeons and Dragons Event",
  "New Player Event",
] as const;
