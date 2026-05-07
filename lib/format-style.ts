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
export const FORMAT_BADGE: Record<string, string> = {
  // Plum — legendary / mythic
  Commander:
    "bg-[#E1D2EE] text-[#3F1F66] border border-[#9B7BB8] dark:bg-[#6B3FA0]/30 dark:text-[#E1D2EE] dark:border-[#6B3FA0]/55",
  // U — Island
  Modern:
    "bg-[#AAE0FA] text-[#0A3D68] border border-[#5C8FBE] dark:bg-[#0E68AB]/30 dark:text-[#AAE0FA] dark:border-[#0E68AB]/55",
  // G — Forest
  Standard:
    "bg-[#9BD3AE] text-[#0F4124] border border-[#5DA37C] dark:bg-[#00733E]/30 dark:text-[#9BD3AE] dark:border-[#00733E]/55",
  // R — Mountain
  Pioneer:
    "bg-[#F9AA8F] text-[#7A1E1E] border border-[#D87B5C] dark:bg-[#D3202A]/22 dark:text-[#F9AA8F] dark:border-[#D3202A]/55",
  // B — Swamp / eternal
  Legacy:
    "bg-[#CBC2BF] text-[#2A2520] border border-[#8B8276] dark:bg-[#3A352F]/55 dark:text-[#D8D0C6] dark:border-[#8B8276]/55",
  // W — Plains / commons
  Pauper:
    "bg-[#FFFBD5] text-[#5C4A1A] border border-[#E0D085] dark:bg-[#FFFBD5]/14 dark:text-[#FFFBD5] dark:border-[#FFFBD5]/30",
  // Amber-gold — limited
  Draft:
    "bg-[#F5C988] text-[#7A4810] border border-[#E08F2B] dark:bg-[#E08F2B]/25 dark:text-[#F5C988] dark:border-[#E08F2B]/55",
  // Bronze-gold — sealed mystery
  Sealed:
    "bg-[#E8C28A] text-[#5C3A0E] border border-[#B86E1F] dark:bg-[#B86E1F]/30 dark:text-[#E8C28A] dark:border-[#B86E1F]/55",
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
  "bg-gray-100 text-gray-600 border border-gray-200 dark:bg-gray-500/20 dark:text-gray-300 dark:border-gray-500/30";

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
