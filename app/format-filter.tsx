"use client";

const FORMAT_EMOJI: Record<string, string> = {
  Commander: "\u2694\uFE0F",
  Modern: "\u26A1",
  Standard: "\u2B50",
  Pioneer: "\uD83E\uDE90",
  Legacy: "\uD83D\uDC51",
  Pauper: "\uD83E\uDE99",
  Draft: "\uD83C\uDFB2",
  Sealed: "\uD83C\uDF81",
};

const FORMAT_ACTIVE: Record<string, string> = {
  Commander: "bg-purple-500/30 text-purple-200 border-purple-500/60",
  Modern: "bg-blue-500/30 text-blue-200 border-blue-500/60",
  Standard: "bg-green-500/30 text-green-200 border-green-500/60",
  Pioneer: "bg-orange-500/30 text-orange-200 border-orange-500/60",
  Legacy: "bg-red-500/30 text-red-200 border-red-500/60",
  Pauper: "bg-yellow-500/30 text-yellow-200 border-yellow-500/60",
  Draft: "bg-cyan-500/30 text-cyan-200 border-cyan-500/60",
  Sealed: "bg-pink-500/30 text-pink-200 border-pink-500/60",
};

const FORMAT_INACTIVE: Record<string, string> = {
  Commander: "border-purple-500/20 text-purple-400 hover:bg-purple-500/10",
  Modern: "border-blue-500/20 text-blue-400 hover:bg-blue-500/10",
  Standard: "border-green-500/20 text-green-400 hover:bg-green-500/10",
  Pioneer: "border-orange-500/20 text-orange-400 hover:bg-orange-500/10",
  Legacy: "border-red-500/20 text-red-400 hover:bg-red-500/10",
  Pauper: "border-yellow-500/20 text-yellow-400 hover:bg-yellow-500/10",
  Draft: "border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/10",
  Sealed: "border-pink-500/20 text-pink-400 hover:bg-pink-500/10",
};

export default function FormatFilter({ formats, activeFormat }: { formats: string[]; activeFormat?: string }) {
  function handleSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    window.location.href = val ? `/?format=${encodeURIComponent(val)}` : "/";
  }

  return (
    <div className="sticky top-0 z-10 bg-white dark:bg-neutral-900 backdrop-blur-md py-3 -mx-4 px-4 mb-6">
      {/* Mobile: dropdown */}
      <div className="md:hidden">
        <select
          value={activeFormat || ""}
          onChange={handleSelect}
          className="w-full px-3 py-2.5 rounded-md border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm font-medium text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-400/40 dark:focus:ring-white/20"
        >
          <option value="">{"\uD83C\uDCCF"} All Formats</option>
          {formats.map((f) => (
            <option key={f} value={f}>{FORMAT_EMOJI[f] || "\uD83C\uDCCF"} {f}</option>
          ))}
        </select>
      </div>

      {/* Desktop: pills */}
      <div className="hidden md:flex flex-wrap gap-2">
        <a
          href="/"
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition border ${
            !activeFormat
              ? "bg-white/15 text-white border-white/30"
              : "border-white/10 text-neutral-400 hover:bg-white/5"
          }`}
        >
          {"\uD83C\uDCCF"} All
        </a>
        {formats.map((f) => (
          <a
            key={f}
            href={`/?format=${encodeURIComponent(f)}`}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition border ${
              activeFormat === f
                ? FORMAT_ACTIVE[f] || "bg-white/15 text-white border-white/30"
                : FORMAT_INACTIVE[f] || "border-white/10 text-neutral-400 hover:bg-white/5"
            }`}
          >
            {FORMAT_EMOJI[f] || "\uD83C\uDCCF"} {f}
          </a>
        ))}
      </div>
    </div>
  );
}
