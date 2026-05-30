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
// and card frames, not Tailwind's generic palette. Light-mode values
// are the high-luminance pastel of each mana color (bright + soft, like
// a frosted Easter-egg sticker); dark-mode keeps the deep ink color at
// mid alpha so the chip stays readable on a near-black surface.
//
//   W (Plains)      #FCE48F / #5C4400     → Pauper (commons)
//   U (Island)      #B5D7F0 / #0E68AB     → Modern (control)
//   B (Swamp)       #D9D1C5 / #3A352F     → Legacy (eternal)
//   R (Mountain)    #FAB6A4 / #D3202A     → Pioneer (aggressive)
//   G (Forest)      #A8E0BD / #00733E     → Standard (current)
//   Plum            #E1C5F5 / #6B3FA0     → Commander (legendary/mythic)
//   Amber-gold      #FCC68C / #E08F2B     → Draft (limited)
//   Bronze          #E5BD93 / #B86E1F     → Sealed (sealed-pack)
//
// Commander uses plum (the "mythic / legendary stamp" color in MTG
// culture) rather than gold so it sits visually clear of Pauper's cream.
export const FORMAT_BADGE: Record<string, string> = {
  // Plum — legendary / mythic
  Commander:
    "bg-[#C9A2EE] text-[#2A1145] dark:bg-[#6B3FA0]/85 dark:text-[#F1E4F9]",
  // U — Island
  Modern:
    "bg-[#8FC1E8] text-[#0A2D4D] dark:bg-[#0E68AB]/85 dark:text-[#D6ECF7]",
  // G — Forest
  Standard:
    "bg-[#7DD49C] text-[#0A2E1A] dark:bg-[#00733E]/85 dark:text-[#D6F0DD]",
  // R — Mountain
  Pioneer:
    "bg-[#F69279] text-[#3D0E0E] dark:bg-[#D3202A]/75 dark:text-[#FAD8C9]",
  // B — Swamp / eternal
  Legacy:
    "bg-[#C8BDA9] text-[#15110D] dark:bg-[#3A352F] dark:text-[#E8E2DC]",
  // W — Plains / commons (pastel sun-gold)
  Pauper:
    "bg-[#FBD651] text-[#5C4400] dark:bg-[#F8E26B]/75 dark:text-[#FBF4C5]",
  // Amber-gold — limited
  Draft:
    "bg-[#FAA958] text-[#3D1F08] dark:bg-[#E08F2B]/85 dark:text-[#F9DCB0]",
  // Bronze-gold — sealed mystery
  Sealed:
    "bg-[#D9A467] text-[#291A07] dark:bg-[#B86E1F]/85 dark:text-[#EBCFA5]",
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

// Unknown / freeform formats (e.g. "Dungeons and Dragons Event") fall back
// to a pastel stone that sits at the same luminance as the colored MTG-
// format chips so it reads as part of the same badge family instead of
// dropping to flat gray.
export const FORMAT_BADGE_DEFAULT =
  "bg-stone-200 text-stone-900 dark:bg-stone-600/55 dark:text-stone-100";

export const FORMAT_EMOJI_DEFAULT = "\uD83C\uDCCF";

// Format strings that shouldn't render a badge \u2014 empty / null and the
// catch-all "Other" label. Anything else (recognized MTG formats AND
// freeform-but-meaningful values like "Dungeons and Dragons Event")
// still gets a chip.
const HIDDEN_FORMAT_VALUES = new Set(["", "Other"]);

export function showFormatBadge(format: string | null | undefined): boolean {
  return !!format && !HIDDEN_FORMAT_VALUES.has(format);
}

// Title-pattern match for Regional Championship Qualifier events.
// Mirrors the SQL filter in lib/events.ts (`title LIKE '%RCQ%' OR
// '%Regional Championship Qualifier%'`) so the on-page badge stays in
// sync with the ?rcq=1 filter. Scrapers don't expose an RCQ flag — the
// signal is in the title — so we detect at render time.
export function isRcq(title: string | null | undefined): boolean {
  if (!title) return false;
  return /RCQ|Regional Championship Qualifier/i.test(title);
}

// Brushed-steel / silver foil stamp with a periodic glint sweep — see
// the `.anim-rcq-glint` rule in app/globals.css for the gradient and
// animation. Sits alongside the format chip when a row is an RCQ. Uses
// Inter rather than Beleren (Beleren is reserved for format tags per
// project typography conventions). Silver reads as an "official stamp"
// (judge's seal / medal) and stays out of FORMAT_BADGE's mana-color
// palette so it doesn't compete with the format chip beside it.
export const RCQ_BADGE =
  "anim-rcq-glint inline-block rounded-sm font-bold uppercase tracking-wider";

// Title-pattern match for cEDH (competitive EDH / competitive Commander)
// events. Same shape as isRcq() — a sub-format signal that lives in the
// event title rather than the `format` column. Scrapers (TopDeck mostly,
// where ~80% of events are EDH) don't tag cEDH explicitly, so we detect
// the marker at render + query time. Most community spellings appear:
// "cEDH" (lowercase c, the convention), "CEDH" (all caps, also common),
// "Competitive EDH", "Competitive Commander".
export function isCedh(title: string | null | undefined): boolean {
  if (!title) return false;
  // Substring match (case-insensitive) on "cedh" — explicitly accepts
  // prefixed regional community names like "NJcEDH", "PAcEDH", "LAcEDH",
  // "TXcEDH", "ATLcEDH" (each is a real cEDH community). No English word
  // contains "cedh" as a substring outside this context, so the false-
  // positive risk is effectively zero. Matches SQL LIKE '%cEDH%' filter
  // in lib/events.ts so the badge and the ?cedh=1 query agree on which
  // rows count.
  return /cedh|competitive\s+(edh|commander)/i.test(title);
}

// Obsidian-black "competitive stamp" with a crimson glint sweep — see
// the `.anim-cedh-glint` rule in app/globals.css. Visually distinct from
// RCQ_BADGE's silver/foil treatment so an event can carry both badges
// without them blending. Crimson reads as "high-stakes / competitive"
// and contrasts with RCQ's neutral "judge's seal."
export const CEDH_BADGE =
  "anim-cedh-glint inline-block rounded-sm font-bold uppercase tracking-wider";

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

// Colored-square unicode used as the Discord-side substitute for the site's
// colored format pill. Discord won't render arbitrary backgrounds inside
// message text, but it does render these square emojis at their unicode
// color — paired with inline-code wrapping on the format name (which Discord
// draws as a rounded gray block), the result reads as a pill at a glance:
//
//     🟪 `Commander`
//
// Each square is the closest unicode-palette match to the site's FORMAT_DOT
// ink color. Falls back to ⬜ for unknown formats.
export const FORMAT_DISCORD_SQUARE: Record<string, string> = {
  Commander: "🟪", // 🟪 plum
  Modern: "🟦",    // 🟦 Island blue
  Standard: "🟩",  // 🟩 Forest green
  Pioneer: "🟥",   // 🟥 Mountain red
  Legacy: "⬛",          // ⬛ Swamp dark
  Pauper: "🟨",    // 🟨 Plains gold
  Draft: "🟧",     // 🟧 amber
  Sealed: "🟫",    // 🟫 bronze
};

export const FORMAT_DISCORD_SQUARE_DEFAULT = "⬜"; // ⬜

/**
 * Renders a format name as a Discord chat "pill": a colored unicode square
 * followed by the format wrapped in inline code (which Discord styles as a
 * rounded gray block). Matches what the site shows as a colored chip as
 * closely as Discord's text primitives allow. Returns null when the format
 * shouldn't render a chip (empty / "Other").
 */
export function formatDiscordPill(format: string | null | undefined): string | null {
  if (!format || !showFormatBadge(format)) return null;
  const square = FORMAT_DISCORD_SQUARE[format] ?? FORMAT_DISCORD_SQUARE_DEFAULT;
  return `${square} \`${format}\``;
}

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
