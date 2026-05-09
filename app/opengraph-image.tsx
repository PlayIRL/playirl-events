// Dynamic Open Graph image for the site root + any page that doesn't
// override openGraph.images. Renders at request time via next/og's
// ImageResponse — no static PNG to maintain, automatic re-render on every
// brand tweak. Twitter cards fall back to this same image (Next.js
// auto-discovery: `opengraph-image.tsx` populates both og:image and
// twitter:image when no twitter-image.tsx exists alongside).
//
// Composition matches the in-app PlayIrlLogo wordmark: white canvas,
// black play triangle + heavy "IRL" text + light ".gg" tail. Subheading
// pulls the footer's "open-source, community-run alternative to the
// official Wizards event locator" framing — that's the strongest
// product-positioning line we have, and the share preview is exactly
// where new visitors decide whether to click.
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
export const alt = "PlayIRL.GG — an open-source alternative to the WotC event locator";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#ffffff",
          color: "#0a0a0a",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          letterSpacing: "-0.04em",
          padding: "60px 80px",
        }}
      >
        {/* Wordmark — same composition as PlayIrlLogo: triangle + heavy
            IRL + light .gg tail. Sizes mirror PlayIrlLogo's em-relative
            scale at a 220px IRL anchor:
              triangle: 0.57em → ~125px
              IRL: 1.00em → 220px (font-weight 900, tracking -0.04em)
              .gg:  0.50em → 110px (font-weight 300, tracking normal) */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <svg
            width={125}
            height={125}
            viewBox="0 0 100 100"
            fill="currentColor"
            style={{ marginRight: 40 }}
          >
            <path d="M14 8 C12 7 10 8.5 10 10.5 L10 89.5 C10 91.5 12 93 14 92 L88 52.5 C90 51.5 90 48.5 88 47.5 Z" />
          </svg>
          <div style={{ display: "flex", alignItems: "baseline", lineHeight: 1 }}>
            <span style={{ fontSize: 220, fontWeight: 900 }}>IRL</span>
            <span
              style={{
                fontSize: 110,
                fontWeight: 300,
                marginLeft: 12,
                letterSpacing: "normal",
              }}
            >
              .gg
            </span>
          </div>
        </div>

        {/* Subheading — pulled from the homepage footer copy. Two lines
            keeps each well under the 1040px-wide content area at 38px,
            and the line break sits naturally between "alternative" and
            "to" so the eye picks up both halves of the framing. Color
            picks up neutral-600 — matches the muted-paragraph tone the
            site uses for descriptive copy. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginTop: 56,
            gap: 6,
            color: "#525252",
            fontSize: 38,
            fontWeight: 500,
            letterSpacing: "-0.015em",
            textAlign: "center",
          }}
        >
          <div style={{ display: "flex" }}>
            An open-source, community-run alternative
          </div>
          <div style={{ display: "flex" }}>
            to the official Wizards event locator
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
