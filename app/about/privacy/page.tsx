import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy — PlayIRL.GG",
  description: "What PlayIRL.GG stores, how it's used, and your rights as a visitor.",
};

// Plain-English privacy disclosure. The site is intentionally narrow in
// scope: no ads, no analytics, no marketing tools, no third-party trackers.
// This page documents that and lists every category of data we touch.
// Keeping it text-heavy rather than a "consent matrix" reflects the actual
// surface — there's no granular opt-in to make granular.

export default function PrivacyPage() {
  const updated = "May 29, 2026";
  return (
    <main className="max-w-2xl mx-auto px-4 py-10 prose prose-neutral dark:prose-invert prose-sm">
      <Link
        href="/about"
        className="text-sm text-neutral-500 dark:text-neutral-400 hover:underline no-underline"
      >
        ← Back to About
      </Link>
      <h1 className="text-2xl font-[family-name:var(--font-ultra)] font-bold mt-6 mb-2">
        Privacy
      </h1>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Last updated: {updated}
      </p>

      <h2>The short version</h2>
      <p>
        PlayIRL.GG is an independent MTG event aggregator. We don&apos;t sell your
        data. We don&apos;t run ads. We don&apos;t run analytics or marketing trackers.
        The site uses a small number of cookies to keep you signed in and
        remember your preferences — that&apos;s it.
      </p>

      <h2>What we store</h2>
      <ul>
        <li>
          <strong>Account data</strong> — email, display name, and OAuth
          identifiers (Discord, Google) when you sign in. Used solely to
          authenticate you and to attribute events / RSVPs to your account.
        </li>
        <li>
          <strong>Preferences</strong> — your default location, search radius,
          and preferred formats. Stored against your account so the homepage
          opens to the right slice the next time you visit.
        </li>
        <li>
          <strong>Saved events + RSVPs</strong> — the events you star and the
          RSVPs you place. Visible to event hosts so they know who&apos;s coming.
        </li>
        <li>
          <strong>Server logs</strong> — request IPs are processed by our
          hosting provider for rate-limiting and abuse prevention. Not retained
          beyond standard log rotation.
        </li>
      </ul>

      <h2>Cookies</h2>
      <ul>
        <li>
          <code>authjs.session-token</code> / <code>mtg-cal-session</code> —
          authentication. Without these you can&apos;t stay signed in.
        </li>
        <li>
          <code>theme</code> — light or dark mode preference.
        </li>
        <li>
          <code>playirl-locale</code> / <code>playirl-country</code> —
          overrides for language and country detection. Optional.
        </li>
        <li>
          <code>playirl-consent</code> — records that you&apos;ve seen this notice.
          Set when you click &quot;Got it&quot; on the banner. One-year lifetime.
        </li>
      </ul>
      <p>
        No analytics cookies, no advertising cookies, no third-party
        trackers. If that changes, this page changes first.
      </p>

      <h2>Third parties</h2>
      <ul>
        <li>
          <strong>Event sources</strong> — we pull public event listings from
          Wizards of the Coast&apos;s official store locator, TopDeck.gg, and
          Discord servers you (or a site admin) have connected. We do not send
          your personal data to those services in the course of scraping.
        </li>
        <li>
          <strong>Geocoding</strong> — when you change your location, we
          resolve the address to coordinates via Google&apos;s Geocoding API and/or
          OpenStreetMap Nominatim. They see the address you typed; they don&apos;t
          see your account.
        </li>
        <li>
          <strong>IP geolocation</strong> — for first-visit location detection,
          we send your IP to ipapi.co for a coarse country/lat-lng lookup.
          Result is cached server-side; no per-user record is kept beyond the
          24-hour cache TTL.
        </li>
        <li>
          <strong>Authentication providers</strong> — OAuth via Discord / Google
          shares the basic profile fields you authorize. Optional email
          sign-in goes through Resend (transactional email only).
        </li>
      </ul>

      <h2>Your rights</h2>
      <p>
        If you&apos;re in the EU/EEA, the UK, or any other jurisdiction with similar
        data protection rules, you have the right to access, correct, or
        delete the data we hold about you. Email{" "}
        <a href="mailto:PlayIRLgg@gmail.com">PlayIRLgg@gmail.com</a> and we&apos;ll
        respond within the statutory window.
      </p>

      <h2>Contact</h2>
      <p>
        Questions, requests, or anything else:{" "}
        <a href="mailto:PlayIRLgg@gmail.com">PlayIRLgg@gmail.com</a>.
      </p>
    </main>
  );
}
