import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { loginReturnTarget } from "./lib/safe-redirect";

/**
 * Middleware для серверной защиты маршрутов.
 * 
 * Проверяет наличие auth-токена в cookie "algo-auth".
 * Zustand persist сохраняет state в localStorage, но middleware работает
 * на сервере и не имеет доступа к localStorage — поэтому мы дублируем
 * токен в cookie при логине (store.ts).
 * 
 * Двойная защита: middleware (SSR) + AuthGuard (CSR).
 */

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password", // the link of the recovery e-mail: opened by somebody who cannot sign in
];

// Paths accessible without full auth (invite-based)
const OPEN_PATHS = [
  "/d/",       // Diagnostic by code
  "/e/",       // Exam by code
  "/invite/",  // Invite acceptance
  "/diagnostic/",
];

const ROLE_PATHS: Record<string, string[]> = {
  "/admin": ["admin", "owner", "superadmin"],
  "/owner": ["owner", "superadmin"],
  "/teacher": ["teacher", "admin", "owner", "superadmin"],
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static & API routes — skip
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Public paths — allow always
  if (PUBLIC_PATHS.some((p) => pathname === p)) {
    return NextResponse.next();
  }

  // Open paths (code-based access) — allow always
  if (OPEN_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Protected routes — check for auth cookie
  // Zustand persist stores data in localStorage which middleware can't access.
  // The AuthGuard on client-side handles the actual role check.
  // Here we just check if ANY auth state exists via cookie.
  // The server sets httpOnly cookie "algo_auth_token" on login/apply/refresh. The cookie lives as long
  // as the refresh cookie (30 days) while the JWT inside expires after an hour: a stale JWT is NOT
  // detected here (middleware cannot refresh) - the first API call answers 401 and api() refreshes.
  const authCookie =
    request.cookies.get("algo_auth_token") ?? request.cookies.get("algo_demo_session");

  if (!authCookie?.value) {
    // No token — redirect to login with the full return URL (path AND query), so that
    // /owner/settings?section=payments comes back as exactly that. Sanitised: the login
    // page follows it, and it must stay a path on this site.
    const loginUrl = new URL("/login", request.url);
    const returnTo = loginReturnTarget(pathname, request.nextUrl.search);
    if (returnTo) loginUrl.searchParams.set("redirect", returnTo);
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.next();

  // Teacher screens show live, organization-specific operational data. A
  // browser must never keep an obsolete dashboard shell after a deployment.
  if (pathname.startsWith("/teacher")) {
    response.headers.set(
      "Cache-Control",
      "private, no-store, max-age=0, must-revalidate",
    );
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
