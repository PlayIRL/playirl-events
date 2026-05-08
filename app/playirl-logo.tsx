type Props = {
  className?: string;
};

// Wordmark composed of an SVG play triangle + Figtree black "IRL" text.
// Previously a single all-SVG mark with custom IRL letterforms; switching
// to live text lets the wordmark inherit the rest of the site's typography
// (Figtree black, tight tracking) so the logo and the H1 chips read as
// one family.
//
// Size the logo with a `text-*` utility on the wrapper (the logo IS text
// now). The triangle and word both scale via em-relative units, so the
// caller controls overall size with a single font-size class.
export function PlayIrlLogo({ className = "text-base" }: Props) {
  return (
    <span
      role="img"
      aria-label="PlayIRL.GG"
      className={`inline-flex items-center gap-[0.18em] leading-none font-[family-name:var(--font-figtree)] font-black ${className}`}
      style={{ letterSpacing: "-0.04em" }}
    >
      <svg
        viewBox="0 0 100 100"
        className="h-[0.57em] w-[0.57em] shrink-0"
        fill="currentColor"
        aria-hidden="true"
      >
        {/* Right-pointing play triangle. Soft-rounded-md corners match the
            geometric tone of Figtree black. */}
        <path d="M14 8 C12 7 10 8.5 10 10.5 L10 89.5 C10 91.5 12 93 14 92 L88 52.5 C90 51.5 90 48.5 88 47.5 Z" />
      </svg>
      <span>
        IRL<span className="font-light text-[0.5em] tracking-normal ml-[0.15em]">.gg</span>
      </span>
    </span>
  );
}
