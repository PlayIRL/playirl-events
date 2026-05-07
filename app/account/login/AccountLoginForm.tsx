"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/app/button";
import OAuthButton from "@/app/oauth-button";
import { PlayIrlLogo } from "@/app/playirl-logo";

interface Provider { id: string; name: string }

export default function AccountLoginForm({ providers }: { providers: Provider[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [csrfToken, setCsrfToken] = useState("");
  const [pwSubmitting, setPwSubmitting] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "/account";

  useEffect(() => {
    fetch("/api/auth/csrf").then((r) => r.json()).then((d) => setCsrfToken(d.csrfToken));
  }, []);

  const hasOAuth = providers.some((p) => p.id === "discord" || p.id === "google");
  const hasEmail = providers.some((p) => p.id === "resend");
  const noProviders = providers.length === 0;
  const oauthAction = (id: string) => `/api/auth/signin/${id}`;

  async function passwordSignIn(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    setPwSubmitting(true);
    try {
      const res = await fetch("/api/auth/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      router.push(from);
      router.refresh();
    } catch (err) {
      setPwError(err instanceof Error ? err.message : String(err));
    } finally {
      setPwSubmitting(false);
    }
  }

  return (
    <main className="flex items-center justify-center min-h-screen bg-neutral-50 dark:bg-neutral-950 p-4 relative">
      <Link
        href="/"
        className="absolute top-4 left-4 inline-flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to PlayIRL.GG
      </Link>
      <div className="bg-white dark:bg-neutral-900 p-8 rounded-md shadow-md dark:shadow-black/40 w-full max-w-sm border border-transparent dark:border-neutral-700 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-[family-name:var(--font-ultra)] font-bold text-neutral-900 dark:text-neutral-100 flex items-baseline justify-center gap-2 flex-wrap">
            Welcome to
            <PlayIrlLogo className="text-2xl" />
            <span className="sr-only">PlayIRL.GG</span>
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
            Submit your own events and sync with Discord — pull events from a server, or publish PlayIRL events to one.
          </p>
        </div>

        {noProviders && !hasOAuth && !hasEmail && (
          <div className="text-center text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md p-3">
            No sign-in providers configured. Add Auth.js env vars (Discord / Google / Resend).
          </div>
        )}

        {hasOAuth && (
          <div className="space-y-2">
            {providers.filter((p) => p.id === "google").map((p) => (
              <OAuthButton key={p.id} provider="google" action={oauthAction(p.id)} csrfToken={csrfToken} callbackUrl={from} />
            ))}
            {providers.filter((p) => p.id === "discord").map((p) => (
              <OAuthButton key={p.id} provider="discord" action={oauthAction(p.id)} csrfToken={csrfToken} callbackUrl={from} />
            ))}
          </div>
        )}

        {/* Email + password sign-in. Always shown — independent of Auth.js
            providers. Lives at /api/auth/credentials, sets the same session
            cookie format as the OAuth providers. */}
        <div className="space-y-2">
          {hasOAuth && (
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-700" />
              <span className="text-xs text-neutral-500 dark:text-neutral-400">or</span>
              <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-700" />
            </div>
          )}
          <form onSubmit={passwordSignIn} className="space-y-2">
            <input
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
              className="w-full px-4 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400/40 dark:focus:ring-white/20"
            />
            <input
              type="password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              required
              className="w-full px-4 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400/40 dark:focus:ring-white/20"
            />
            {pwError && <p className="text-xs text-red-600 dark:text-red-400">{pwError}</p>}
            <Button type="submit" variant="primary" disabled={pwSubmitting} className="w-full">
              {pwSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <p className="text-xs text-center text-neutral-500 dark:text-neutral-400 pt-1">
            No account?{" "}
            <Link href={`/account/signup${from !== "/account" ? `?from=${encodeURIComponent(from)}` : ""}`} className="underline hover:text-neutral-700 dark:hover:text-neutral-300">
              Create one
            </Link>
          </p>
        </div>

        {hasEmail && (
          <>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-700" />
              <span className="text-xs text-neutral-500 dark:text-neutral-400">or</span>
              <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-700" />
            </div>
            <form action={oauthAction("resend")} method="POST" className="space-y-2">
              <input type="hidden" name="csrfToken" value={csrfToken} />
              <input type="hidden" name="callbackUrl" value={from} />
              <input
                type="email"
                name="email"
                placeholder="Email me a sign-in link"
                required
                className="w-full px-4 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400/40 dark:focus:ring-white/20"
              />
              <Button type="submit" variant="ghost" disabled={!csrfToken} className="w-full">
                Email me a magic link instead
              </Button>
            </form>
          </>
        )}

        <p className="text-xs text-center text-neutral-500 dark:text-neutral-400 leading-relaxed">
          By signing in you agree to use this service responsibly. Or{" "}
          <Link href="/" className="underline hover:text-neutral-700 dark:hover:text-neutral-300">browse events first</Link>.
        </p>
      </div>
    </main>
  );
}
