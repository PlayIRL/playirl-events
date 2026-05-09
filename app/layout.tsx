import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import { cookies } from "next/headers";
import { SITE_URL } from "@/lib/config";
import "./globals.css";
import ThemeSync from "./theme-sync";

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

// One font for the whole site. Both --font-inter and --font-ultra resolve
// to Figtree (see globals.css), so existing callsites continue to work
// without touching every className. We load the full weight range so the
// type system can use 400 for body, 600 for labels, 900 for display.
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
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
  const themeCookie = (await cookies()).get("theme")?.value;
  const isDark = themeCookie === "dark";

  return (
    <html
      lang="en"
      className={`${figtree.variable} h-full antialiased${isDark ? " dark" : ""}`}
      style={{ colorScheme: isDark ? "dark" : "light" }}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col font-[family-name:var(--font-inter)] text-neutral-900 dark:text-neutral-100">
        <ThemeSync />
        {children}
      </body>
    </html>
  );
}
