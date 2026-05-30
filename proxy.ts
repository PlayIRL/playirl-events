import { NextResponse, type NextRequest } from "next/server";

// NOTE: This proxy (formerly "middleware" in Next ≤15) runs on the edge
// runtime, which cannot open better-sqlite3. We do a coarse check here
// (is there *any* auth cookie?) and let server components / route handlers
// do the role check via `lib/session.ts` (which can hit the DB).

const LEGACY_COOKIE = "mtg-cal-session";
// Auth.js v5 default session cookie name (with optional __Secure- prefix in prod).
const AUTHJS_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

function hasAnySession(req: NextRequest): boolean {
  if (req.cookies.get(LEGACY_COOKIE)?.value) return true;
  return AUTHJS_COOKIES.some((name) => !!req.cookies.get(name)?.value);
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow the login pages and the auth endpoints themselves.
  if (
    pathname === "/admin/login" ||
    pathname === "/account/login" ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/admin/login") ||
    pathname.startsWith("/api/admin/logout")
  ) {
    return NextResponse.next();
  }

  const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/admin/");
  const isAccountPath = pathname === "/account" || pathname.startsWith("/account/") || pathname.startsWith("/api/account/");

  if (!isAdminPath && !isAccountPath) return NextResponse.next();

  if (hasAnySession(req)) return NextResponse.next();

  // No session at all → redirect HTML, 401 JSON for APIs.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const loginUrl = new URL(isAccountPath ? "/account/login" : "/admin/login", req.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*", "/account/:path*", "/api/admin/:path*", "/api/account/:path*"],
};
