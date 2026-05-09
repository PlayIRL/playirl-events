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
// tuned to match the saturation of the WUBRG color wheel: vivid enough to
// be instantly recognizable as MTG mana, with deeper tones for text and
// borders pulled from the same color identity.
//
//   W (Plains)      #F8DC68 / #5C4400     → Pauper (commons)
//   U (Island)      #9BCBEC / #0E68AB     → Modern (control)
//   B (Swamp)       #B8B0A8 / #3A352F     → Legacy (eternal)
//   R (Mountain)    #F8A992 / #D3202A     → Pioneer (aggressive)
//   G (Forest)      #9CDCB1 / #00733E     → Standard (current)
//   Plum            #D9BCEE / #6B3FA0     → Commander (legendary/mythic)
//   Amber-gold      #F5BB75 / #E08F2B     → Draft (limited)
//   Bronze          #DDA873 / #B86E1F     → Sealed (sealed-pack)
//
// Commander uses plum (the "mythic / legendary stamp" color in MTG
// culture) rather than gold so it sits visually clear of Pauper's cream.
// Gold/multicolor stays for Draft (limited) and Sealed (sealed-pack).
// Saturated fills with near-black text — saturated enough to read as the
// matching mana symbol at a glance. Borderless: the colored fill carries
// the chip's identity on its own; a 2px border at this size was reading
// as decorative weight rather than information.
export const FORMAT_BADGE: Record<string, string> = {
  // Plum — legendary / mythic
  Commander:
    "bg-[#D9BCEE] text-[#2A1145] dark:bg-[#6B3FA0]/45 dark:text-[#F1E4F9]",
  // U — Island
  Modern:
    "bg-[#9BCBEC] text-[#0A2D4D] dark:bg-[#0E68AB]/50 dark:text-[#D6ECF7]",
  // G — Forest
  Standard:
    "bg-[#9CDCB1] text-[#0A2E1A] dark:bg-[#00733E]/50 dark:text-[#D6F0DD]",
  // R — Mountain
  Pioneer:
    "bg-[#F8A992] text-[#3D0E0E] dark:bg-[#D3202A]/45 dark:text-[#FAD8C9]",
  // B — Swamp / eternal
  Legacy:
    "bg-[#B8B0A8] text-[#15110D] dark:bg-[#3A352F]/80 dark:text-[#E8E2DC]",
  // W — Plains / commons (cream-yellow, matching the wheel's sun panel)
  Pauper:
    "bg-[#F8DC68] text-[#5C4400] dark:bg-[#F8E26B]/40 dark:text-[#FBF4C5]",
  // Amber-gold — limited
  Draft:
    "bg-[#F5BB75] text-[#3D1F08] dark:bg-[#E08F2B]/50 dark:text-[#F9DCB0]",
  // Bronze-gold — sealed mystery
  Sealed:
    "bg-[#DDA873] text-[#291A07] dark:bg-[#B86E1F]/55 dark:text-[#EBCFA5]",
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
