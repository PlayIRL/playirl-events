// Dynamic Open Graph image for the site root + any page that doesn't
// override openGraph.images. Renders at request time via next/og's
// ImageResponse — no static PNG to maintain, automatic re-render on every
// brand tweak. Twitter cards fall back to this same image (Next.js
// auto-discovery: `opengraph-image.tsx` populates both og:image and
// twitter:image when no twitter-image.tsx exists alongside).
//
// Composition: black canvas, wordmark anchored slightly above center,
// tagline beneath in white/80%, and a WUBRG mana-color row at the bottom
// to telegraph "this is MTG" without typing out "Magic: The Gathering."
// 1200×630 = standard Twitter / Discord / Slack / iMessage card size.
//
// Why no custom font: next/og runs on the Edge runtime where loading the
// Figtree TTF requires a runtime fetch (Google Fonts → woff2 → decode →
// ArrayBuffer) per request. The added latency + failure surface isn't
// worth it for an asset social platforms cache for hours. system-ui
// renders as SF Pro Display / Segoe UI / Roboto across the platforms
// that scrape OG images, all of which pair fine with bold wordmarks.

import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "PlayIRL.GG — Find Magic: The Gathering events near you";

// WUBRG mana-color swatches matching `lib/format-style.ts` (saturated
// versions, post-PR-#113). Renders as 5 dots at the bottom of the card
// to identify the site as MTG at a glance even when the wordmark is
// small (e.g. iMessage's compact preview).
const MANA_COLORS = [
  "#F8DC68", // W — Plains
  "#9BCBEC", // U — Island
  "#B8B0A8", // B — Swamp
  "#F8A992", // R — Mountain
  "#9CDCB1", // G — Forest
];

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background:
            "radial-gradient(ellipse at center top, #1a1a1a 0%, #000 60%)",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          letterSpacing: "-0.04em",
          padding: "60px 80px",
          position: "relative",
        }}
      >
        {/* Wordmark — play triangle + IRL + .gg, slightly smaller than v1
            to leave more visual weight for the tagline below. */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <svg
            width={120}
            height={120}
            viewBox="0 0 100 100"
            fill="currentColor"
            style={{ marginRight: 30 }}
          >
            <path d="M14 8 C12 7 10 8.5 10 10.5 L10 89.5 C10 91.5 12 93 14 92 L88 52.5 C90 51.5 90 48.5 88 47.5 Z" />
          </svg>
          <div style={{ display: "flex", alignItems: "baseline", lineHeight: 1 }}>
            <span style={{ fontSize: 190, fontWeight: 900 }}>IRL</span>
            <span
              style={{
                fontSize: 96,
                fontWeight: 300,
                marginLeft: 8,
                letterSpacing: "normal",
              }}
            >
              .gg
            </span>
          </div>
        </div>

        {/* Tagline — bigger and brighter than v1 (was 44px / #a3a3a3, now
            50px / #e5e5e5). 50px is the largest size that fits the full
            "Find Magic: The Gathering events near you" string on one line
            with our padding; 58px wrapped "you" awkwardly. */}
        <div
          style={{
            display: "flex",
            marginTop: 40,
            fontSize: 50,
            fontWeight: 500,
            color: "#e5e5e5",
            letterSpacing: "-0.02em",
            textAlign: "center",
            whiteSpace: "nowrap",
          }}
        >
          Find Magic: The Gathering events near you
        </div>

        {/* WUBRG mana row — anchored to the bottom of the card. The five
            saturated dots (cream/blue/swamp-gray/red/green) read as MTG
            mana to anyone who plays the game, while staying minimal
            enough not to clutter the wordmark composition. */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            bottom: 48,
            left: 0,
            right: 0,
            justifyContent: "center",
            gap: 18,
          }}
        >
          {MANA_COLORS.map((color) => (
            <div
              key={color}
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                background: color,
                boxShadow: "0 0 0 1px rgba(255,255,255,0.06)",
              }}
            />
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
