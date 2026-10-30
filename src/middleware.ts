import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { loginReturnTarget } from "./lib/safe-redirect";
import { DEMO_CONTACT_PATH, isLegacyDemoPath, legacyDemoAnswer } from "./lib/site-url";
import { authCookieValue, isSecureDeployment } from "./lib/auth-cookie";

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
  DEMO_CONTACT_PATH, // «Заявка на демо: напишите нам» (the answer of the old demo addresses when there is no landing to go to)
  "/icon",     // the site icon (src/app/icon.tsx) is requested before any sign-in
];

// Paths accessible without full auth (invite-based)
const OPEN_PATHS = [
  "/d/",       // Diagnostic by code
  "/e/",       // Exam by code
  "/invite/",  // Invite acceptance
  "/set-password/", // «Задать пароль» link of an approved centre's owner (one-time token)
  "/diagnostic/",
];

// Files the middleware lets through without a cookie: a path whose LAST segment ends in one of these. Any
// other dot (`/owner/payments/receipt/a.b`, `/teacher/groups/x.y`) is an ordinary page and is checked.
const STATIC_FILE = /\.(?:ico|png|jpe?g|gif|svg|webp|avif|css|js|map|txt|xml|json|webmanifest|woff2?|ttf)$/i;
// ...and never under the three staff areas, whatever the ending (a file-like id there is still a page).
const STAFF_AREA = /^\/(?:owner|admin|teacher)(?:\/|$)/;

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
    (STATIC_FILE.test(pathname) && !STAFF_AREA.test(pathname))
  ) {
    return NextResponse.next();
  }

  // The old demo form and the closed registration lived here; the form is on the landing now (K3 P2).  A temporary
  // redirect for the time of the move (old links of letters, ads and the old landing keep working, no 404); the campaign
  // tags (utm_*, ref) travel with it, nothing else.  The address is the RUNTIME variable SITE_URL (one image on any domain).
  // No landing to go to (empty, or the same host: a redirect to itself is a loop) -> the plain page «напишите нам».
  if (isLegacyDemoPath(pathname)) {
    const answer = legacyDemoAnswer(process.env.SITE_URL, request.headers.get("host") ?? request.nextUrl.host, request.nextUrl.search);
    if (answer.kind === "redirect") return NextResponse.redirect(answer.url, 302);
    return NextResponse.rewrite(new URL(DEMO_CONTACT_PATH, request.url));
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
  // The server sets the httpOnly cookie "__Host-algo_auth_token" (plain "algo_auth_token" on http development) on login/refresh. It lives as long
  // as the session cookie says (14 days with «Запомнить меня», until the browser closes without) while the JWT inside expires after an
  // hour: a stale JWT is NOT detected here (middleware cannot refresh) - the first API call answers 401 and api() refreshes.
  // The demo session cookie counts ONLY in a demo build (NEXT_PUBLIC_DEMO_MODE=true); on a real deployment a
  // hand-made `algo_demo_session=1` must not pass the gate.
  const authCookie =
    authCookieValue(
      (name) => request.cookies.get(name),
      isSecureDeployment(process.env, request.nextUrl.protocol, request.headers.get("x-forwarded-proto")),
    ) ??
    (process.env.NEXT_PUBLIC_DEMO_MODE === "true" ? request.cookies.get("algo_demo_session")?.value : undefined);

  if (!authCookie) {
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
