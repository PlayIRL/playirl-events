// Dynamic Open Graph image for the site root + any page that doesn't
// override openGraph.images. Renders at request time via next/og's
// ImageResponse — no static PNG to maintain, automatic re-render on
// every brand tweak. Twitter cards fall back to this same image
// (Next.js auto-discovery: `opengraph-image.tsx` populates both og:image
// and twitter:image when no twitter-image.tsx exists alongside).
//
// Composition: white canvas, "PlayIRL.gg" wordmark in Figtree —
// "PlayIRL" in weight 900 + ".gg" in weight 300, matching the in-app
// PlayIrlLogo exactly. Subheading pulls the homepage footer's
// "independent, community-run alternative to the official Wizards event
// locator" framing — strongest product-positioning line we have.
//
// Font strategy: Figtree weights 300/500/900 are fetched at request time
// from Google Fonts, each subset via `text=` to ONLY the glyphs that
// weight renders — wordmark uses 300 + 900 (10 glyphs), subhead uses
// 500 (~30 glyphs). Per-weight payload is ~2-4 KB, three fetches
// in parallel cost almost nothing next to the PNG render, and social
// platforms cache the result for hours.
//
// Both wordmark and subhead use Figtree so the share preview matches
// the in-app brand exactly. Satori (the engine behind ImageResponse)
// doesn't include any fonts by default — without registering Figtree,
// it falls back to a built-in Roboto, which would render glyphs at
// inconsistent weights and break the Black/Light contrast on .gg.

import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "PlayIRL.GG — an independent alternative to the WotC event locator";

const WORDMARK_GLYPHS = "PlayIRL.g";
const SUBHEAD_TEXT =
  "An independent, community-run alternative to the official Wizards event locator";

async function loadFigtree(weight: 300 | 500 | 900, glyphs: string): Promise<ArrayBuffer> {
  // Google Fonts' css2 endpoint returns a stylesheet with @font-face
  // rules whose `src: url(...) format(...)` line points at the actual
  // font binary. We fetch the CSS, parse out the URL, then fetch the
  // binary. The `text=` param subsets the font to just the requested
  // glyphs — turns a ~50 KB woff2 into ~2 KB.
  const cssUrl = `https://fonts.googleapis.com/css2?family=Figtree:wght@${weight}&text=${encodeURIComponent(glyphs)}`;
  const css = await fetch(cssUrl, {
    // A browser-like User-Agent gets the modern subset format Satori
    // supports — WOFF/WOFF2. The default Next.js fetch UA gets a legacy
    // TTF dump instead.
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
  }).then((r) => r.text());

  // Google serves WOFF (not WOFF2) when subsetting via `text=`, so
  // don't pin to a specific format — Satori handles WOFF/WOFF2/TTF/OTF.
  const match = css.match(/src:\s*url\(([^)]+)\)\s*format/);
  if (!match) {
    throw new Error(`opengraph-image: couldn't find font src in Figtree css (weight ${weight})`);
  }
  return fetch(match[1]).then((r) => r.arrayBuffer());
}

export default async function OpengraphImage() {
  const [figtreeBlack, figtreeLight, figtreeMedium] = await Promise.all([
    loadFigtree(900, WORDMARK_GLYPHS),
    loadFigtree(300, WORDMARK_GLYPHS),
    loadFigtree(500, SUBHEAD_TEXT),
  ]);

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
          fontFamily: "Figtree",
          padding: "60px 80px",
        }}
      >
        {/* Wordmark — Figtree Black 900 + Light 300, matching PlayIrlLogo. */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            fontSize: 220,
            lineHeight: 1,
            letterSpacing: "-0.04em",
          }}
        >
          <span style={{ fontWeight: 900 }}>PlayIRL</span>
          <span style={{ fontWeight: 300 }}>.gg</span>
        </div>

        {/* Subheading — homepage footer copy. Two lines so each fits at
            38px under the 1040px-wide content area, with the break
            between "alternative" and "to" landing at a natural pause. */}
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
            An independent, community-run alternative
          </div>
          <div style={{ display: "flex" }}>
            to the official Wizards event locator
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Figtree", data: figtreeBlack, weight: 900, style: "normal" },
        { name: "Figtree", data: figtreeMedium, weight: 500, style: "normal" },
        { name: "Figtree", data: figtreeLight, weight: 300, style: "normal" },
      ],
    },
  );
}
