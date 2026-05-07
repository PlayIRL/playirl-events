import type { Metadata } from "next";
import { Inter, Figtree } from "next/font/google";
import { cookies } from "next/headers";
import { SITE_URL } from "@/lib/config";
import "./globals.css";
import ThemeSync from "./theme-sync";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Display font for chips, prices, headings, calendar dates. Figtree at
// 900 (black) gives the site a sharper, more modern character than the
// previous Stack Sans Notch. Tight tracking is applied in globals.css.
const figtree = Figtree({
  variable: "--font-ultra",
  subsets: ["latin"],
  weight: ["800", "900"],
});

const BUILD_SHA = process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "local";

const SITE_TITLE = "PlayIRL.GG";
const SITE_DESCRIPTION = "Find Magic: The Gathering events near you";
const DEFAULT_OG_IMAGE = {
  url: "/logo.png",
  width: 1479,
  height: 826,
  alt: SITE_TITLE,
};

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
    images: [DEFAULT_OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE.url],
  },
  other: {
    "x-build-sha": BUILD_SHA,
    "x-build-feature": "bulk-retry-venues",
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
      className={`${inter.variable} ${figtree.variable} h-full antialiased${isDark ? " dark" : ""}`}
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
