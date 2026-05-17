/**
 * Apple-styled "Get the beta on TestFlight" pill. Black background, white
 * content, SF system font stack — matches Apple's brand vocabulary for
 * "Get the App" badges so it reads as an authentic store link rather than
 * a generic CTA. Used on /track and /about; intentionally not in the
 * site-wide footer.
 */
const TESTFLIGHT_URL = "https://testflight.apple.com/join/rkHbRdu9";

export function TestFlightBadge({ className = "" }: { className?: string }) {
  return (
    <a
      href={TESTFLIGHT_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black text-white hover:bg-neutral-800 transition-colors ${className}`}
      title="Join the PlayIRL.gg iOS beta on TestFlight"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif" }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="w-4 h-4">
        <path d="M12 2 L21 21 L12 16.5 L3 21 Z" fill="#5AC8FA" />
      </svg>
      <span className="flex flex-col leading-none">
        <span className="text-[9px] tracking-wide opacity-80">Get the beta on</span>
        <span className="text-[13px] font-medium tracking-tight mt-0.5">TestFlight</span>
      </span>
    </a>
  );
}
