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

// Format colors map to the actual MTG mana-symbol swatches — the cream,
// sky-blue, bone, salmon, and sage that show on the mana cost roundels
// and card frames, not Tailwind's generic palette. Hex values below are
// the canonical "lightest" mana symbol bg, paired with deeper tones for
// text and borders pulled from the same color identity.
//
//   W (Plains)      #FFFBD5 cream         → Pauper (commons)
//   U (Island)      #AAE0FA / #0E68AB     → Modern (control)
//   B (Swamp)       #CBC2BF / #150B00     → Legacy (eternal)
//   R (Mountain)    #F9AA8F / #D3202A     → Pioneer (aggressive)
//   G (Forest)      #9BD3AE / #00733E     → Standard (current)
//   Plum            #E1D2EE / #6B3FA0     → Commander (legendary/mythic)
//   Amber-gold      #F5C988 / #E08F2B     → Draft (limited)
//   Bronze          #E8C28A / #B86E1F     → Sealed (sealed-pack)
//
// Commander uses plum (the "mythic / legendary stamp" color in MTG
// culture) rather than gold so it sits visually clear of Pauper's cream.
// Gold/multicolor stays for Draft (limited) and Sealed (sealed-pack).
// Pastel-bright fills with near-black text. Borderless — the colored
// fill carries the chip's identity on its own; a 2px border at this
// size was reading as decorative weight rather than information.
export const FORMAT_BADGE: Record<string, string> = {
  // Plum — legendary / mythic
  Commander:
    "bg-[#EBDBF6] text-[#2A1145] dark:bg-[#6B3FA0]/35 dark:text-[#F1E4F9]",
  // U — Island
  Modern:
    "bg-[#C5E6F6] text-[#0A2D4D] dark:bg-[#0E68AB]/35 dark:text-[#D6ECF7]",
  // G — Forest
  Standard:
    "bg-[#C8EBD2] text-[#0A2E1A] dark:bg-[#00733E]/35 dark:text-[#D6F0DD]",
  // R — Mountain
  Pioneer:
    "bg-[#FCC9B8] text-[#3D0E0E] dark:bg-[#D3202A]/30 dark:text-[#FAD8C9]",
  // B — Swamp / eternal
  Legacy:
    "bg-[#D8D2CC] text-[#15110D] dark:bg-[#3A352F]/65 dark:text-[#E8E2DC]",
  // W — Plains / commons
  Pauper:
    "bg-[#FBF09F] text-[#3D2E08] dark:bg-[#F8E26B]/25 dark:text-[#FBF4C5]",
  // Amber-gold — limited
  Draft:
    "bg-[#F8CC8B] text-[#3D1F08] dark:bg-[#E08F2B]/35 dark:text-[#F9DCB0]",
  // Bronze-gold — sealed mystery
  Sealed:
    "bg-[#E8BC85] text-[#291A07] dark:bg-[#B86E1F]/40 dark:text-[#EBCFA5]",
};

// Saturated swatches for the format-selector dot in the radius dropdown.
// Use the deeper ("ink") version of each mana color so the dot reads at
// 8-10px against a light background.
export const FORMAT_DOT: Record<string, string> = {
  Commander: "bg-[#6B3FA0]",
  Modern: "bg-[#0E68AB]",
  Standard: "bg-[#00733E]",
  Pioneer: "bg-[#D3202A]",
  Legacy: "bg-[#3A352F]",
  Pauper: "bg-[#A89060]",
  Draft: "bg-[#E08F2B]",
  Sealed: "bg-[#B86E1F]",
};

export const FORMAT_BADGE_DEFAULT =
  "bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-200";

export const FORMAT_EMOJI_DEFAULT = "\uD83C\uDCCF";

// Hex-int values for Discord embed `color` field. Mirrors FORMAT_DOT —
// the deep ("ink") version of each mana color, so the embed accent matches
// the dot color shown elsewhere.
export const FORMAT_EMBED_COLOR: Record<string, number> = {
  Commander: 0x6b3fa0, // plum ink (mythic/legendary)
  Modern: 0x0e68ab, // U ink (Island deep blue)
  Standard: 0x00733e, // G ink (Forest deep green)
  Pioneer: 0xd3202a, // R ink (Mountain deep red)
  Legacy: 0x3a352f, // B ink (Swamp dark)
  Pauper: 0xa89060, // W ink (deeper Plains cream)
  Draft: 0xe08f2b, // amber-gold
  Sealed: 0xb86e1f, // bronze-gold
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
