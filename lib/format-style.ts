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
// are the high-luminance pastel of each mana color; dark-mode is the
// deep ink color so the chip reads against a near-black page.
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
//
// All pairs are WCAG 2.1 AA compliant (≥ 4.5:1 contrast for normal text).
// Audited 2026-05-30 — earlier versions had several failures in dark mode
// where Pauper / Draft / Sealed used low-alpha bg + light text (both
// near the bright end), producing 2-3:1 ratios that were genuinely
// hard to read. Dark-mode now uses the deep ink color at full opacity
// with the pastel as text, matching the pattern Commander / Modern /
// Standard / Pioneer / Legacy already used.
export const FORMAT_BADGE: Record<string, string> = {
  // Plum — legendary / mythic
  Commander:
    "bg-[#C9A2EE] text-[#2A1145] dark:bg-[#6B3FA0]/85 dark:text-[#F1E4F9]",
  // Magenta-plum — Commander's sibling, distinguished by hue (pink-
  // leaning vs Commander's blue-leaning plum) so the two chips read
  // as related-but-distinct members of the same family. Same light-bg
  // / dark-text pattern as every other chip — the earlier dark-bg
  // treatment made cEDH the odd one out in the row.
  //
  // Contrast verified: #36082D on #E5A8DF ≈ 6.6:1, #FBD8F1 on #6B1F5A
  // ≈ 5.6:1 — both safely above WCAG AA.
  //
  // tracking-tight! overrides the chip wrapper's tracking-wide. Beleren
  // (the card-title font) is designed for ALL-CAPS with generous
  // spacing; cEDH's mixed casing reads as too-spread-out at the wider
  // default. Tightening pulls the four glyphs into a cohesive unit
  // while the all-caps chips stay at their original tracking.
  cEDH:
    "bg-[#E5A8DF] text-[#36082D] dark:bg-[#6B1F5A]/85 dark:text-[#FBD8F1] tracking-tight!",
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
  // W — Plains / commons (pastel sun-gold). Dark mode was previously
  // bg #F8E26B/75 with cream text — 2.05:1, unreadable. Now uses the
  // deep Plains ink as bg with the original pastel as text (~8.3:1).
  Pauper:
    "bg-[#FBD651] text-[#5C4400] dark:bg-[#5C4400] dark:text-[#FBF4C5]",
  // Amber-gold — limited. Dark mode was bg #E08F2B/85 with light amber
  // text — 2.60:1. Now deep-amber bg + pastel-amber text (~11.4:1).
  Draft:
    "bg-[#FAA958] text-[#3D1F08] dark:bg-[#3D1F08] dark:text-[#F9DCB0]",
  // Bronze-gold — sealed mystery. Dark mode was bg #B86E1F/85 — that
  // blended bg was stuck at L≈0.15 which can't pass 4.5:1 against ANY
  // text. Now deep-bronze bg + pastel-bronze text (~9.8:1).
  Sealed:
    "bg-[#D9A467] text-[#291A07] dark:bg-[#3D2208] dark:text-[#EBCFA5]",
};

// Saturated swatches for the format-selector dot in the radius dropdown.
// Use the deeper ("ink") version of each mana color so the dot reads at
// 8-10px against a light background.
export const FORMAT_DOT: Record<string, string> = {
  Commander: "bg-[#6B3FA0]",
  // Deep aubergine — same plum family as Commander but darker, so the
  // dropdown dots show the family relationship at a glance.
  cEDH: "bg-[#3D1F58]",
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
// events. Used at scrape time by wizards-locator.ts and topdeck.ts to
// promote format="Commander" → format="cEDH" when the title carries
// the marker. No longer used as a render-time badge — cEDH is its own
// canonical format now, and the FORMAT_BADGE.cEDH styling carries the
// "competitive" visual signal.
export function isCedh(title: string | null | undefined): boolean {
  if (!title) return false;
  // Substring match (case-insensitive) on "cedh" — explicitly accepts
  // prefixed regional community names like "NJcEDH", "PAcEDH", "LAcEDH",
  // "TXcEDH", "ATLcEDH" (each is a real cEDH community). No English word
  // contains "cedh" as a substring outside this context, so the false-
  // positive risk is effectively zero.
  return /cedh|competitive\s+(edh|commander)/i.test(title);
}

// Hex-int values for Discord embed `color` field. Mirrors FORMAT_DOT —
// the deep ("ink") version of each mana color, so the embed accent matches
// the dot color shown elsewhere.
export const FORMAT_EMBED_COLOR: Record<string, number> = {
  Commander: 0x6b3fa0, // plum ink (mythic/legendary)
  cEDH: 0x3d1f58,      // deep aubergine — Commander's competitive sibling
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
  cEDH: "⬛",        // ⬛ obsidian — competitive Commander (visually heavier than 🟪)
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
  "cEDH",
  "Modern",
  "Standard",
  "Pioneer",
  "Legacy",
  "Pauper",
  "Draft",
  "Sealed",
  "New Player Event",
] as const;
