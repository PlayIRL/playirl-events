import type { Metadata } from "next";
import Image from "next/image";
import { PlayIrlLogo } from "@/app/playirl-logo";

export const metadata: Metadata = {
  title: "PlayIRL.GG — Media Kit",
  description: "Logos, brand colors, and assets for PlayIRL.GG.",
  robots: { index: false, follow: false },
};

const BRAND_COLORS = [
  { name: "Neon Green",   hex: "#00FF00", hsl: "hsl(120,100%,50%)", dark: false, note: "BETA badge · primary accent" },
  { name: "Neutral 900",  hex: "#171717", hsl: "hsl(0,0%,9%)",      dark: true,  note: "Body text (light mode)" },
  { name: "Neutral 50",   hex: "#FAFAFA", hsl: "hsl(0,0%,98%)",     dark: false, note: "Body text (dark mode)" },
  { name: "Neutral 500",  hex: "#737373", hsl: "hsl(0,0%,45%)",     dark: false, note: "Secondary / muted text" },
];

const SCREENSHOTS = [
  { src: "/images/media/home-list-light.jpg", label: "Home · event list (light)" },
  { src: "/images/media/home-list-dark.jpg",  label: "Home · event list (dark)"  },
  { src: "/images/media/event-detail.jpg",    label: "Event detail page"          },
  { src: "/images/media/map-view.jpg",        label: "Map view"                   },
  { src: "/images/media/mobile-filter.jpg",   label: "Mobile · filter bar"        },
  { src: "/images/media/calendar-view.jpg",   label: "Calendar view"              },
];

function Swatch({ name, hex, hsl, dark, note }: typeof BRAND_COLORS[number]) {
  return (
    <div className="rounded-lg overflow-hidden border border-neutral-200 dark:border-white/10">
      <div className="h-20 w-full flex items-end p-2" style={{ background: hsl }}>
        <span className={`font-mono text-[11px] font-bold ${dark ? "text-white/70" : "text-black/50"}`}>{hex}</span>
      </div>
      <div className="bg-white dark:bg-white/[0.04] px-3 py-2">
        <p className="text-sm font-semibold text-neutral-900 dark:text-white">{name}</p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 font-mono mt-0.5">{hsl}</p>
        <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">{note}</p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-14">
      <h2 className="text-xs font-mono uppercase tracking-widest text-neutral-400 dark:text-neutral-500 mb-5 border-b border-neutral-100 dark:border-neutral-800 pb-2">{title}</h2>
      {children}
    </section>
  );
}

function LogoLockup({ size, label, dark }: { size: string; label: string; dark?: boolean }) {
  return (
    <div className={`rounded-lg p-6 flex flex-col items-center gap-3 border ${dark ? "bg-neutral-950 border-white/10" : "bg-white border-neutral-200"}`}>
      <div className={`flex items-start ${dark ? "text-white" : ""}`}>
        <PlayIrlLogo className={`${size} ${dark ? "[&_*]:text-white" : ""}`} />
        <span className="inline-block bg-[hsl(120,100%,50%)] text-black font-mono font-bold uppercase text-[10px] tracking-[0.15em] px-2 py-1 rounded leading-none -mt-1 -ml-2">Beta</span>
      </div>
      <span className="text-xs text-neutral-400">{label}</span>
    </div>
  );
}

export default function MediaPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12 text-left">
      <div className="mb-10">
        <p className="text-xs font-mono uppercase tracking-widest text-neutral-400 mb-2">Media Kit</p>
        <h1 className="text-3xl font-[family-name:var(--font-ultra)] font-black text-neutral-900 dark:text-white mb-3">
          PlayIRL.GG Brand Assets
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed max-w-lg">
          Logos, colors, and screenshots for use by partners, press, and collaborators. This page is not publicly linked — please don&apos;t redistribute without permission.
        </p>
        <div className="flex flex-wrap gap-3 mt-4 text-xs">
          <a href="mailto:CardSlingerTCG@gmail.com" className="inline-flex items-center gap-1.5 text-neutral-500 hover:text-neutral-900 dark:hover:text-white underline underline-offset-2 transition-colors">
            CardSlingerTCG@gmail.com
          </a>
          <span className="text-neutral-300 dark:text-neutral-700">·</span>
          <a href="https://cardslinger.shop" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-neutral-500 hover:text-neutral-900 dark:hover:text-white underline underline-offset-2 transition-colors">
            cardslinger.shop
          </a>
        </div>
      </div>

      <Section title="Logo — PlayIRL.GG">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <LogoLockup size="text-4xl" label="Light background · 40px" />
          <LogoLockup size="text-4xl" label="Dark background · 40px" dark />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <LogoLockup size="text-2xl" label="Light background · 24px" />
          <LogoLockup size="text-2xl" label="Dark background · 24px" dark />
        </div>
        <div className="mt-4 rounded-lg border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.04] p-4 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
          <strong className="text-neutral-900 dark:text-white font-semibold">Typeface:</strong> Figtree Black (900) for &ldquo;PlayIRL&rdquo;, Figtree Light (300) for &ldquo;.gg&rdquo;.{" "}
          The BETA badge is Space Mono Bold, uppercase, <span className="font-mono text-xs bg-neutral-100 dark:bg-white/10 px-1 py-0.5 rounded">hsl(120,100%,50%)</span> background, black text.
        </div>
      </Section>

      <Section title="Brand Colors">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {BRAND_COLORS.map((c) => <Swatch key={c.name} {...c} />)}
        </div>
      </Section>

      <Section title="Product Screenshots — PlayIRL.GG">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {SCREENSHOTS.map(({ src, label }) => (
            <div key={src}>
              <p className="text-[10px] font-mono text-neutral-400 mb-2 uppercase tracking-widest">{label}</p>
              <a href={src} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden border border-neutral-200 dark:border-white/10 hover:border-neutral-400 dark:hover:border-white/30 transition-colors">
                <Image
                  src={src}
                  alt={label}
                  width={1200}
                  height={800}
                  className="w-full h-auto block"
                />
              </a>
            </div>
          ))}
        </div>
        <p className="text-xs text-neutral-400 dark:text-neutral-600 mt-4">Click any screenshot to open full size.</p>
      </Section>

      <Section title="Boilerplate Copy">
        <div className="space-y-4">
          {[
            {
              label: "One-liner",
              copy: "PlayIRL.GG is an independent, community-run MTG event locator for players who want a simple alternative to the official Wizards locator.",
            },
            {
              label: "Two sentences",
              copy: "PlayIRL.GG is a free, open-source event locator for Magic: The Gathering — built to be faster and simpler than the official tools. Find local events by format, distance, and date without the friction of the official Wizards locator.",
            },
            {
              label: "Tagline",
              copy: "An independent, alternative way to find and schedule MTG events near you.",
            },
          ].map(({ label, copy }) => (
            <div key={label} className="rounded-lg border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.04] p-4">
              <p className="text-xs font-mono uppercase tracking-widest text-neutral-400 mb-2">{label}</p>
              <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">&ldquo;{copy}&rdquo;</p>
            </div>
          ))}
        </div>
      </Section>

      <footer className="pt-6 border-t border-neutral-100 dark:border-neutral-800 text-xs text-neutral-400 dark:text-neutral-600 leading-relaxed">
        PlayIRL.GG is not affiliated with Wizards of the Coast. Magic: The Gathering is a trademark of Wizards of the Coast LLC.
        For questions or partnership inquiries: <a href="mailto:CardSlingerTCG@gmail.com" className="underline hover:text-neutral-900 dark:hover:text-white transition-colors">CardSlingerTCG@gmail.com</a>
      </footer>
    </main>
  );
}
