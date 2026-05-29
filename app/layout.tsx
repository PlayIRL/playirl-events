import type { Metadata, Viewport } from "next";
import { Figtree, Space_Grotesk, Space_Mono } from "next/font/google";
import localFont from "next/font/local";
import { cookies, headers } from "next/headers";
import { SITE_URL } from "@/lib/config";
import { CONSENT_COOKIE, getServerCountry, getServerLocale, isGdprCountry } from "@/lib/locale";
import "./globals.css";
import ThemeSync from "./theme-sync";
import CookieBanner from "./cookie-banner";

// Viewport / theme-color split out of `metadata` per the Next.js 14+ API.
// Critical on mobile: without `width=device-width, initial-scale=1`, iOS
// Safari renders at 980px and pinch-zoom the page, breaking every layout.
// We intentionally DO allow user zoom (no `maximum-scale` / `user-scalable=no`)
// because forcing fixed scale is a WCAG 1.4.4 fail.
//
// `themeColor` matches the body-bg per theme so the browser chrome (notch,
// pull-to-refresh strip) blends with the page in both light and dark modes.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

// Type system:
//   --font-figtree     → Figtree, used for headings/display (alias: --font-ultra)
//   --font-space-grotesk → Space Grotesk, used for body copy (alias: --font-inter)
//   --font-space-mono    → Space Mono, used for numbers/data (alias: --font-mono)
//   --font-card-title    → Beleren-Bold, used only for MTG format badges
// Aliases live in globals.css so existing callsites continue to resolve.
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

// Card-title font: the actual Beleren-Bold ttf used on MTG cards, self-
// hosted from public/fonts. Sourced from the magarena open-source MTG
// project. PlayIRL.GG is explicitly unaffiliated with Wizards of the
// Coast (see the About page disclaimer) — the font is shipped only as
// a stylistic nod on the format badge, not as a claim of endorsement.
const cardTitleFont = localFont({
  src: "../public/fonts/Beleren-Bold.ttf",
  variable: "--font-card-title",
  weight: "700",
  display: "swap",
});

const BUILD_SHA = process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "local";

const SITE_TITLE = "PlayIRL.GG";
const SITE_DESCRIPTION = "Find Magic: The Gathering events near you";

// Note: openGraph.images / twitter.images are populated automatically by
// `app/opengraph-image.tsx` (Next.js auto-discovery). Per-route metadata
// can override (e.g. event detail pages set their own hero photo).
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  openGraph: {
    siteName: SITE_TITLE,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "/",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  other: {
    "x-build-sha": BUILD_SHA,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Server-side theme detection. Reads the `theme` cookie that ThemeSync /
  // theme-toggle / floating-toolbar set on every change. SSR-applying the
  // `dark` class avoids the previous inline-script approach (which fired
  // React 19's "Encountered a script tag" warning every render). On the
  // first visit there's no cookie yet, so we render light and ThemeSync
  // re-applies the user's system preference on hydration; subsequent
  // visits read the cookie and SSR with no flash.
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get("theme")?.value;
  const isDark = themeCookie === "dark";

  // Decide whether to render the cookie banner. Two gates:
  //   1. The viewer's country is GDPR-covered (EU/EEA + UK + CH).
  //   2. They haven't already acknowledged via the consent cookie.
  // The component itself re-checks the cookie client-side so a same-tab
  // dismiss persists without a refresh; the server gate just avoids
  // shipping the banner JSX to viewers outside the consent zone at all.
  // PLAYIRL_FORCE_CONSENT=1 overrides the country gate for QA / staging.
  const consentAck = cookieStore.get(CONSENT_COOKIE)?.value === "ack";
  const requestHeaders = await headers();
  const viewerCountry = getServerCountry(requestHeaders);
  const viewerLocale = getServerLocale(requestHeaders);
  const forceConsent = process.env.PLAYIRL_FORCE_CONSENT === "1";
  const showConsent = !consentAck && (forceConsent || isGdprCountry(viewerCountry));

  return (
    <html
      // Dynamic language attribute drives:
      //   - Assistive tech (screen readers pronounce content correctly)
      //   - Search engines that segment SERPs by language
      //   - Browser auto-translate prompts (don't fire for already-matching tags)
      // We render the BCP-47 form ("fr-FR") rather than just the language part
      // ("fr") so country-flavored variants (en-GB vs en-US) survive.
      lang={viewerLocale}
      className={`${figtree.variable} ${spaceGrotesk.variable} ${spaceMono.variable} ${cardTitleFont.variable} antialiased${isDark ? " dark" : ""}`}
      style={{ colorScheme: isDark ? "dark" : "light" }}
      suppressHydrationWarning
    >
      <body className="min-h-[100dvh] flex flex-col font-[family-name:var(--font-inter)] text-neutral-900 dark:text-neutral-100">
        <ThemeSync />
        {children}
        {showConsent && <CookieBanner locale={viewerLocale} />}
      </body>
    </html>
  );
}
