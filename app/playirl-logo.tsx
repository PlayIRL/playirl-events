type Props = {
  className?: string;
};

// Brand wordmark — "PlayIRL.gg" with "PlayIRL" in Figtree Black (900)
// and ".gg" in Figtree Light (300). Replaces an earlier vector lockup
// (play-triangle + custom letterforms) with plain text rendered in the
// brand font so the logo participates in CSS color, font-size, and
// kerning like any other piece of typography.
//
// Sizing API: pass a `text-*` utility on the parent — the wrapper sets
// the font-size and everything inside scales from there. `inline-block`
// + `leading-none` keep the wordmark snug next to adjacent text.
export function PlayIrlLogo({ className = "text-base" }: Props) {
  return (
    <span
      role="img"
      aria-label="PlayIRL.gg"
      className={`inline-block leading-none font-[family-name:var(--font-ultra)] tracking-tight text-neutral-900 dark:text-white ${className}`}
    >
      <span className="font-black">PlayIRL</span>
      <span className="font-light">.gg</span>
    </span>
  );
}
