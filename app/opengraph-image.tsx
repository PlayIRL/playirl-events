// Dynamic Open Graph image for the site root + any page that doesn't
// override openGraph.images. Renders at request time via next/og's
// ImageResponse — no static PNG to maintain, automatic re-render on every
// brand tweak. Twitter cards fall back to this same image (Next.js
// auto-discovery: `opengraph-image.tsx` populates both og:image and
// twitter:image when no twitter-image.tsx exists alongside).
//
// Style mirrors the homepage h1 / footer wordmark: black canvas, white
// play triangle + "IRL" set in heavy sans, ".gg" tail in a thinner weight.
// Tagline below in a muted gray. 1200×630 = standard Twitter / Discord /
// Slack / iMessage card size.

import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "PlayIRL.GG — Find Magic: The Gathering events near you";

// `next/og` requires `display: flex` (or `display: none`) on every parent
// element with multiple children — there's no inline rendering. The
// triangle is inlined as SVG markup; sizing in absolute px so the
// resulting raster is deterministic across runtimes.
export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#000",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          letterSpacing: "-0.04em",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <svg
            width={140}
            height={140}
            viewBox="0 0 100 100"
            fill="currentColor"
            style={{ marginRight: 36 }}
          >
            <path d="M14 8 C12 7 10 8.5 10 10.5 L10 89.5 C10 91.5 12 93 14 92 L88 52.5 C90 51.5 90 48.5 88 47.5 Z" />
          </svg>
          <div style={{ display: "flex", alignItems: "baseline", lineHeight: 1 }}>
            <span style={{ fontSize: 220, fontWeight: 900 }}>IRL</span>
            <span
              style={{
                fontSize: 110,
                fontWeight: 300,
                marginLeft: 10,
                letterSpacing: "normal",
              }}
            >
              .gg
            </span>
          </div>
        </div>
        <div
          style={{
            marginTop: 56,
            fontSize: 44,
            color: "#a3a3a3",
            letterSpacing: "normal",
          }}
        >
          Find Magic: The Gathering events near you
        </div>
      </div>
    ),
    { ...size },
  );
}
