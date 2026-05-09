"use client";

// Renders a friendly error banner on the login pages when Auth.js redirects
// back with `?error=...`. Without this, a suspended user (or a broken
// magic link, or a misconfigured OAuth) just sees the login form again
// and assumes they fat-fingered their password.
//
// Auth.js error codes we care about, mapped from
// https://authjs.dev/reference/core/errors:
//   - AccessDenied: signIn callback returned false. We use that for
//     suspended accounts (auth.ts) — surface a specific message + a
//     "contact us" link so the user has a path forward.
//   - Verification: magic-link expired or already used. Tell the user
//     to request a new one.
//   - OAuthAccountNotLinked: same email already exists with a different
//     provider. Tell the user which provider to try first.
//   - Configuration / Default / everything else: generic "couldn't sign
//     you in" with the raw code shown small for support.

import { useSearchParams } from "next/navigation";

const FRIENDLY_MESSAGES: Record<string, { title: string; body: string }> = {
  AccessDenied: {
    title: "Account suspended",
    body:
      "We couldn't sign you in — this account has been suspended. If you think that's a mistake, send us a note on Discord or email support so we can take a look.",
  },
  Verification: {
    title: "Sign-in link expired",
    body:
      "That magic link has either expired or been used already. Request a new one below and we'll email it right away.",
  },
  OAuthAccountNotLinked: {
    title: "Different provider on file",
    body:
      "This email is already linked to a different sign-in method (Google or Discord). Try whichever one you used the first time.",
  },
  CredentialsSignin: {
    title: "Wrong email or password",
    body: "Double-check your email and password and try again.",
  },
};

export default function AuthErrorBanner() {
  const error = useSearchParams().get("error");
  if (!error) return null;
  const friendly = FRIENDLY_MESSAGES[error];

  return (
    <div
      role="alert"
      className="text-sm bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-500/30 text-red-900 dark:text-red-200 rounded-md p-3 space-y-1"
    >
      <p className="font-semibold">
        {friendly?.title ?? "Couldn't sign you in"}
      </p>
      <p className="text-xs leading-relaxed">
        {friendly?.body ??
          "Something blocked the sign-in flow. Try again, or use a different sign-in method below."}
        {!friendly && (
          <span className="block mt-1 font-mono text-[10px] opacity-70">
            ref: {error}
          </span>
        )}
      </p>
    </div>
  );
}
