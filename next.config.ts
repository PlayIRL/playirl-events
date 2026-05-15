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
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "maps.googleapis.com" },
      { protocol: "https", hostname: "cdn.discordapp.com" },
    ],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
    ];
  },
  async redirects() {
    return [
      // /play was the original info-page URL for the life-tracker companion
      // app. Renamed to /life since the app is a life-counter; keep the old
      // path as a permanent redirect so any shared links still resolve.
      { source: "/play", destination: "/life", permanent: true },
    ];
  },
};

export default nextConfig;
