import type { NextConfig } from "next";

// Headers applied to every response. Conservative — these are the
// "no-brainer" hardening headers that don't require knowing every
// inline-style/script the app emits (we'd need to ship a CSP nonce or
// hash inventory before we can add Content-Security-Policy without
// breaking pages). Re-evaluate CSP once Tailwind's runtime style story
// stabilizes and the framer-motion / next/font emissions are auditable.
const securityHeaders = [
  // Block MIME sniffing so a polymorphic upload can't be reinterpreted as HTML.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Allow embedding only from cardslinger.shop (and its subdomains like www.).
  // frame-ancestors is the modern replacement for X-Frame-Options — it lets us
  // whitelist specific origins rather than the all-or-nothing DENY/SAMEORIGIN.
  // X-Frame-Options is omitted because browsers that support frame-ancestors
  // ignore X-Frame-Options anyway, and legacy browsers don't support ALLOW-FROM.
  { key: "Content-Security-Policy", value: "frame-ancestors 'self' https://cardslinger.shop https://*.cardslinger.shop https://*.lovableproject.com https://*.lovable.app" },
  // Send origin only on cross-origin navigations; full URL stays on same-origin.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // 2-year HSTS with subdomains + preload eligibility. Only set for HTTPS;
  // localhost dev hits this header but ignores it (no certificate).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Disable browser features the app doesn't use (camera/mic/payment). Cuts
  // attack surface for any future XSS hole.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // Strip the `X-Powered-By: Next.js` header from every response. Tiny per-
  // response byte saving and removes a free fingerprint that helps attackers
  // narrow down which Next/Node versions to probe for known CVEs.
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "maps.googleapis.com" },
      { protocol: "https", hostname: "cdn.discordapp.com" },
      // Signed-in users render an avatar in AccountChip pulled from Google's
      // CDN (NextAuth Google OAuth). Without this entry, next/image refuses
      // to optimize the URL and the chip falls back to an unoptimized fetch.
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      // TopDeck organizer-uploaded event header images (scrapers/topdeck.ts
      // → eventHeaderImage). They live on Cloudflare Images (imagedelivery.net)
      // with a Firebase Storage long tail. Without these, next/image's
      // optimizer 400s the URL and the thumbnail fails to render entirely.
      { protocol: "https", hostname: "imagedelivery.net" },
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
    ],
    // Our /uploads/* sources are content-addressed (UUID filenames) — the
    // optimizer's output for a given (src, width, quality) tuple never
    // changes for the life of that file. Stock minimumCacheTTL is 60s, which
    // makes the optimizer re-encode the same WebP variant once a minute under
    // continuous traffic. Bump to 30 days so the on-disk cache survives
    // genuine reuse without thrashing the CPU on identical work.
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
    ];
  },
  async redirects() {
    return [
      // The companion life-tracker app's info page has been renamed twice:
      // /play (original) → /life (when we settled on "life tracker") → /track
      // (current brand name). Keep both old paths as 301s so shared links and
      // Discord-bot embed URLs continue to resolve.
      { source: "/play", destination: "/track", permanent: true },
      { source: "/life", destination: "/track", permanent: true },
    ];
  },
};

export default nextConfig;
