"use client";

import { DiscordIcon } from "./discord-icon";

/**
 * Branded OAuth sign-in button. Renders a hidden form that POSTs to the
 * Auth.js v5 signin endpoint for the chosen provider, with the look-and-feel
 * each provider's brand guidelines specify:
 *
 * - Google: white surface, multi-color "G" mark, dark text. Per Google's
 *   "Sign in with Google" button guidelines.
 * - Discord: Blurple (#5865F2) surface, white wordmark glyph, white text.
 *
 * The button is disabled until the CSRF token is fetched (Auth.js v5
 * requires it on every signin POST).
 */

type Provider = "google" | "discord";

interface Props {
  provider: Provider;
  action: string;
  csrfToken: string;
  callbackUrl: string;
}

export default function OAuthButton({ provider, action, csrfToken, callbackUrl }: Props) {
  const config = PROVIDERS[provider];
  return (
    <form action={action} method="POST">
      <input type="hidden" name="csrfToken" value={csrfToken} />
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <button type="submit" disabled={!csrfToken} className={config.className}>
        <config.Logo />
        <span>{config.label}</span>
      </button>
    </form>
  );
}

const PROVIDERS: Record<Provider, {
  label: string;
  className: string;
  Logo: () => React.ReactElement;
}> = {
  google: {
    label: "Sign in with Google",
    className:
      "flex items-center justify-center gap-3 w-full h-11 px-4 rounded-md bg-white dark:bg-[#131314] text-[#1f1f1f] dark:text-neutral-100 text-sm font-medium border border-[#dadce0] dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-[#1e1e1f] disabled:opacity-50 transition cursor-pointer",
    Logo: GoogleLogo,
  },
  discord: {
    label: "Sign in with Discord",
    className:
      "flex items-center justify-center gap-3 w-full h-11 px-4 rounded-md bg-[#5865F2] hover:bg-[#4752C4] text-white text-sm font-medium disabled:opacity-50 transition cursor-pointer",
    Logo: DiscordLogoButton,
  },
};

function GoogleLogo() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-[18px] h-[18px] shrink-0" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

// Local wrapper so the PROVIDERS map can keep its `Logo: () => ReactElement`
// shape without leaking the className-prop API to that table.
function DiscordLogoButton() {
  return <DiscordIcon className="w-5 h-5" />;
}
