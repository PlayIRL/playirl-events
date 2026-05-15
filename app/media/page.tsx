import type { Metadata } from "next";
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

const FORMAT_COLORS: Record<string, string> = {
  COMMANDER: "#7C3AED",
  DRAFT:     "#2563EB",
  STANDARD:  "#059669",
  PIONEER:   "#D97706",
  MODERN:    "#DC2626",
};

const MOCK_EVENTS = [
  { time: "5:00 PM", format: "COMMANDER", title: "Friday Night Magic Commander",  venue: "Top Deck Games · Cherry Hill", price: "$10" },
  { time: "6:30 PM", format: "DRAFT",     title: "Friday Night Booster Draft",    venue: "The Philly Game Shop",         price: "$22" },
  { time: "6:30 PM", format: "STANDARD",  title: "Standard Showdown FNM",         venue: "Hobby Vault",                  price: "$15" },
  { time: "7:00 PM", format: "COMMANDER", title: "FNM Commander Nights",          venue: "Play Another Game",            price: "Free" },
  { time: "7:00 PM", format: "PIONEER",   title: "Pioneer FNM",                   venue: "Kryptic Collections",          price: "$10" },
];

const MOCK_VENUES = [
  { name: "Top Deck Games",      lat: 39.92, lng: -75.02, events: 3 },
  { name: "The Philly Game Shop",lat: 39.95, lng: -75.16, events: 2 },
  { name: "Hobby Vault",         lat: 39.94, lng: -75.20, events: 2 },
  { name: "Play Another Game",   lat: 39.97, lng: -75.13, events: 1 },
  { name: "Kryptic Collections", lat: 39.90, lng: -75.24, events: 2 },
];

// Wraps content at 2× logical size then scales down to fill a 16:9 frame.
// `scale` controls the zoom-out factor; adjust per mockup to show the right crop.
function MockScreen({ children, dark, scale = 0.5 }: { children: React.ReactNode; dark?: boolean; scale?: number }) {
  return (
    <div
      className={`rounded-lg overflow-hidden border ${dark ? "border-white/10 bg-neutral-950" : "border-neutral-200 bg-white"}`}
      style={{ aspectRatio: "16/9", position: "relative" }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: `${(1 / scale) * 100}%`,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          pointerEvents: "none",
        }}
      >
        {children}
      </div>
      <div
        className="absolute bottom-2 right-2 text-[9px] font-mono px-1.5 py-0.5 rounded"
        style={{ background: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", color: dark ? "#666" : "#bbb" }}
      >
        sample data
      </div>
    </div>
  );
}

function FormatBadge({ format }: { format: string }) {
  return (
    <span
      className="inline-block text-white text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide"
      style={{ background: FORMAT_COLORS[format] ?? "#666", fontFamily: "monospace" }}
    >
      {format}
    </span>
  );
}

function MockEventRow({ time, format, title, venue, price, dark }: typeof MOCK_EVENTS[number] & { dark?: boolean }) {
  return (
    <div
      className={`flex items-start gap-2.5 px-3 py-2.5 border-b text-left ${dark ? "border-white/5" : "border-neutral-100"}`}
    >
      <span className={`text-[11px] font-mono w-14 shrink-0 pt-0.5 ${dark ? "text-neutral-400" : "text-neutral-500"}`}>{time}</span>
      <div className="flex-1 min-w-0">
        <div className="mb-1"><FormatBadge format={format} /></div>
        <p className={`text-[12px] font-semibold leading-tight ${dark ? "text-white" : "text-neutral-900"}`}>{title}</p>
        <p className={`text-[10px] mt-0.5 ${dark ? "text-neutral-500" : "text-neutral-400"}`}>{venue}</p>
      </div>
      <span className={`text-[11px] font-mono shrink-0 pt-0.5 ${dark ? "text-neutral-300" : "text-neutral-700"}`}>{price}</span>
    </div>
  );
}

function MockFilterBar({ dark }: { dark?: boolean }) {
  const chip = `rounded-md border px-2.5 py-1.5 text-[11px] font-medium flex items-center gap-1 ${
    dark ? "border-white/15 text-neutral-200 bg-white/5" : "border-neutral-300 text-neutral-800 bg-white"
  }`;
  return (
    <div className={`px-3 py-2 flex flex-wrap items-center gap-2 border-b ${dark ? "border-white/10 bg-neutral-950" : "border-neutral-200 bg-white"}`}>
      <button className={chip}>All MTG <span className="opacity-40 text-[9px]">▾</span></button>
      <span className={`text-[10px] ${dark ? "text-neutral-500" : "text-neutral-400"}`}>events within</span>
      <button className={`${chip} font-mono font-bold`}>10 <span className="opacity-40 text-[9px]">▾</span></button>
      <span className={`text-[10px] ${dark ? "text-neutral-500" : "text-neutral-400"}`}>miles of</span>
      <button className={chip}>Philly <span className="opacity-40 text-[9px]">▾</span></button>
    </div>
  );
}

function MockDayHeading({ label, count, dark }: { label: string; count: number; dark?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-3 pt-4 pb-1.5 ${dark ? "" : ""}`}>
      <span className={`text-[13px] font-black ${dark ? "text-white" : "text-neutral-900"}`} style={{ fontFamily: "var(--font-ultra, sans-serif)" }}>{label}</span>
      <span className={`text-[10px] font-mono ${dark ? "text-neutral-500" : "text-neutral-400"}`}>{count} events</span>
    </div>
  );
}

// ─── Individual mockup screens ───────────────────────────────────────────────

function HomeListLight() {
  return (
    <MockScreen dark={false} scale={0.48}>
      <div style={{ width: 600 }}>
        {/* header */}
        <div className="text-center pt-5 pb-3 px-4">
          <div className="flex items-start justify-center">
            <PlayIrlLogo className="text-4xl" />
            <span className="inline-block bg-[hsl(120,100%,50%)] text-black font-mono font-bold uppercase text-[10px] tracking-[0.15em] px-2 py-1 rounded leading-none -mt-1 -ml-2">Beta</span>
          </div>
          <p className="text-[11px] text-neutral-500 mt-2">An independent, alternative way to find MTG events near you.</p>
        </div>
        <MockFilterBar />
        <MockDayHeading label="Today · Friday, May 15" count={8} />
        {MOCK_EVENTS.slice(0, 3).map((e) => <MockEventRow key={e.title} {...e} />)}
        <MockDayHeading label="Tomorrow · Saturday, May 16" count={5} />
        {MOCK_EVENTS.slice(3, 5).map((e) => <MockEventRow key={e.title} {...e} />)}
      </div>
    </MockScreen>
  );
}

function HomeListDark() {
  return (
    <MockScreen dark scale={0.48}>
      <div style={{ width: 600, background: "#0a0a0a" }}>
        <div className="text-center pt-5 pb-3 px-4">
          <div className="flex items-start justify-center">
            <PlayIrlLogo className="text-4xl text-white" />
            <span className="inline-block bg-[hsl(120,100%,50%)] text-black font-mono font-bold uppercase text-[10px] tracking-[0.15em] px-2 py-1 rounded leading-none -mt-1 -ml-2">Beta</span>
          </div>
          <p className="text-[11px] text-neutral-500 mt-2">An independent, alternative way to find MTG events near you.</p>
        </div>
        <MockFilterBar dark />
        <MockDayHeading label="Today · Friday, May 15" count={8} dark />
        {MOCK_EVENTS.slice(0, 3).map((e) => <MockEventRow key={e.title} {...e} dark />)}
        <MockDayHeading label="Tomorrow · Saturday, May 16" count={5} dark />
        {MOCK_EVENTS.slice(3, 5).map((e) => <MockEventRow key={e.title} {...e} dark />)}
      </div>
    </MockScreen>
  );
}

function EventDetail() {
  const ev = MOCK_EVENTS[0];
  return (
    <MockScreen dark={false} scale={0.48}>
      <div style={{ width: 600 }}>
        <div className="px-4 pt-4 pb-2 border-b border-neutral-100 flex items-center gap-2">
          <span className="text-neutral-400 text-[11px]">← Back to events</span>
        </div>
        <div className="px-4 pt-4 pb-3">
          <FormatBadge format={ev.format} />
          <h2 className="text-[18px] font-black text-neutral-900 mt-2 leading-tight">{ev.title}</h2>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-[12px] font-mono text-neutral-600">Friday, May 15 · {ev.time}</span>
            <span className="text-[12px] font-mono font-bold text-neutral-900">{ev.price}</span>
          </div>
        </div>
        <div className="mx-4 rounded-lg border border-neutral-200 overflow-hidden mb-3">
          <div className="bg-neutral-100 h-20 flex items-center justify-center">
            <span className="text-neutral-300 text-[11px]">map</span>
          </div>
          <div className="px-3 py-2">
            <p className="text-[12px] font-semibold text-neutral-900">Top Deck Games</p>
            <p className="text-[10px] text-neutral-500">1234 Marlton Pike E, Cherry Hill, NJ 08034</p>
          </div>
        </div>
        <div className="mx-4 rounded-lg border border-neutral-200 p-3 text-[11px] text-neutral-600 leading-relaxed">
          Competitive Commander bracket with prize support. Swiss rounds + top 8 cut. Bring your best 100-card deck. Registration opens at 4:30 PM.
        </div>
        <div className="px-4 pt-3">
          <button className="w-full bg-neutral-900 text-white text-[12px] font-semibold py-2.5 rounded-lg">Register on Melee.gg →</button>
        </div>
      </div>
    </MockScreen>
  );
}

function MapView() {
  return (
    <MockScreen dark={false} scale={0.48}>
      <div style={{ width: 600 }}>
        <MockFilterBar />
        {/* map body */}
        <div className="relative bg-[#e8ead0] overflow-hidden" style={{ height: 280 }}>
          {/* grid lines */}
          {[0,1,2,3].map(i => (
            <div key={i} className="absolute border-t border-[#d4d6be]" style={{ top: i * 70, left: 0, right: 0 }} />
          ))}
          {[0,1,2,3,4].map(i => (
            <div key={i} className="absolute border-l border-[#d4d6be]" style={{ left: i * 120, top: 0, bottom: 0 }} />
          ))}
          {/* roads */}
          <div className="absolute bg-white h-2 opacity-70" style={{ top: 140, left: 0, right: 0 }} />
          <div className="absolute bg-white w-2 opacity-70" style={{ left: 240, top: 0, bottom: 0 }} />
          {/* venue pins */}
          {[
            { x: 320, y: 80,  label: "Top Deck", count: 3 },
            { x: 160, y: 110, label: "Philly GS", count: 2 },
            { x: 100, y: 155, label: "Hobby Vault", count: 2 },
            { x: 200, y: 55,  label: "PAG",        count: 1 },
            { x: 60,  y: 210, label: "Kryptic",    count: 2 },
          ].map(({ x, y, label, count }) => (
            <div key={label} className="absolute flex flex-col items-center" style={{ left: x, top: y, transform: "translate(-50%,-100%)" }}>
              <div className="bg-neutral-900 text-white text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap shadow">{label} · {count}</div>
              <div className="w-0 h-0" style={{ borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "6px solid #171717" }} />
            </div>
          ))}
          {/* radius circle */}
          <div className="absolute rounded-full border-2 border-blue-500/30 bg-blue-500/5" style={{ width: 200, height: 200, left: 200, top: 90, transform: "translate(-50%,-50%)" }} />
        </div>
        {/* event count bar */}
        <div className="px-3 py-2 border-t border-neutral-200 flex items-center justify-between">
          <span className="text-[11px] text-neutral-600">10 events · 5 venues · 10 mi radius</span>
          <span className="text-[10px] text-blue-600 font-medium">Today</span>
        </div>
      </div>
    </MockScreen>
  );
}

function MobileFilterBar() {
  return (
    <MockScreen dark={false} scale={0.48}>
      <div style={{ width: 600 }}>
        {/* status bar */}
        <div className="bg-white px-4 pt-3 pb-1 flex justify-between text-[10px] text-neutral-400 font-mono">
          <span>9:41 AM</span><span>●●●</span>
        </div>
        {/* logo */}
        <div className="flex justify-center pb-3">
          <div className="flex items-start">
            <PlayIrlLogo className="text-3xl" />
            <span className="inline-block bg-[hsl(120,100%,50%)] text-black font-mono font-bold uppercase text-[9px] tracking-[0.15em] px-1.5 py-0.5 rounded leading-none -mt-0.5 -ml-1.5">Beta</span>
          </div>
        </div>
        {/* sticky filter bar */}
        <div className="bg-white border-y border-neutral-200 px-3 py-2 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <button className="rounded-md border border-neutral-300 px-2 py-1 text-[11px] font-medium flex items-center gap-1">All MTG <span className="opacity-40 text-[9px]">▾</span></button>
            <span className="text-[10px] text-neutral-400">events within</span>
            <button className="rounded-md border border-neutral-300 px-2 py-1 text-[11px] font-mono font-bold flex items-center gap-1">10 <span className="opacity-40 text-[9px]">▾</span></button>
            <span className="text-[10px] text-neutral-400">miles of</span>
            <button className="rounded-md border border-neutral-300 px-2 py-1 text-[11px] font-medium flex items-center gap-1">Philly <span className="opacity-40 text-[9px]">▾</span></button>
          </div>
        </div>
        <MockDayHeading label="Today · Friday, May 15" count={8} />
        {MOCK_EVENTS.slice(0, 4).map((e) => <MockEventRow key={e.title} {...e} />)}
        {/* floating toolbar */}
        <div className="mx-3 mt-3 bg-neutral-900 rounded-xl px-4 py-2 flex justify-around shadow-xl">
          {["List","Calendar","Map"].map(v => (
            <div key={v} className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg ${v==="List" ? "bg-white/10" : ""}`}>
              <span className="text-[9px] text-white/70">{v}</span>
            </div>
          ))}
        </div>
      </div>
    </MockScreen>
  );
}

function CalendarView() {
  const days = ["Su","Mo","Tu","We","Th","Fr","Sa"];
  const WEEKS = [
    [null,null,null,null,1,2,3],
    [4,5,6,7,8,9,10],
    [11,12,13,14,15,16,17],
    [18,19,20,21,22,23,24],
    [25,26,27,28,29,30,31],
  ];
  const events: Record<number, string[]> = {
    2: ["COMMANDER"], 5: ["DRAFT","MODERN"], 9: ["COMMANDER","STANDARD"],
    12: ["DRAFT"], 15: ["COMMANDER","DRAFT","STANDARD"], 16: ["COMMANDER","PIONEER"],
    19: ["MODERN"], 22: ["COMMANDER","DRAFT"], 23: ["STANDARD","PIONEER"],
    26: ["COMMANDER"], 29: ["DRAFT","COMMANDER","MODERN"],
  };
  return (
    <MockScreen dark={false} scale={0.48}>
      <div style={{ width: 600 }}>
        <MockFilterBar />
        {/* month header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-100">
          <span className="text-[11px] text-neutral-400">◀</span>
          <span className="text-[13px] font-bold text-neutral-900">May 2026</span>
          <span className="text-[11px] text-neutral-400">▶</span>
        </div>
        {/* day labels */}
        <div className="grid grid-cols-7 border-b border-neutral-100">
          {days.map(d => (
            <div key={d} className="text-center py-1 text-[9px] font-bold text-neutral-400">{d}</div>
          ))}
        </div>
        {/* calendar grid */}
        {WEEKS.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-neutral-50">
            {week.map((day, di) => (
              <div key={di} className={`relative min-h-[36px] border-r border-neutral-50 p-0.5 ${day === 15 ? "bg-blue-50" : ""}`}>
                {day && (
                  <>
                    <span className={`text-[9px] font-mono block text-right px-0.5 ${day === 15 ? "text-blue-600 font-bold" : "text-neutral-500"}`}>{day}</span>
                    <div className="flex flex-col gap-px mt-px">
                      {(events[day] ?? []).map((f, i) => (
                        <div key={i} className="rounded-sm px-0.5 py-px text-[7px] text-white font-bold truncate" style={{ background: FORMAT_COLORS[f] ?? "#888" }}>{f[0]}</div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </MockScreen>
  );
}

// ─── Shared layout helpers ────────────────────────────────────────────────────

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

// ─── Page ─────────────────────────────────────────────────────────────────────

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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><p className="text-[10px] font-mono text-neutral-400 mb-2 uppercase tracking-widest">Home · event list (light)</p><HomeListLight /></div>
          <div><p className="text-[10px] font-mono text-neutral-400 mb-2 uppercase tracking-widest">Home · event list (dark)</p><HomeListDark /></div>
          <div><p className="text-[10px] font-mono text-neutral-400 mb-2 uppercase tracking-widest">Event detail page</p><EventDetail /></div>
          <div><p className="text-[10px] font-mono text-neutral-400 mb-2 uppercase tracking-widest">Map view</p><MapView /></div>
          <div><p className="text-[10px] font-mono text-neutral-400 mb-2 uppercase tracking-widest">Mobile · filter bar</p><MobileFilterBar /></div>
          <div><p className="text-[10px] font-mono text-neutral-400 mb-2 uppercase tracking-widest">Calendar view</p><CalendarView /></div>
        </div>
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
