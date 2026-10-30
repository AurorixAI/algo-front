/**
 * ONE list of the public pages (K2-2, F; LESSONS 68): every place that must know «this page is open without a sign-in» reads it here -
 * the middleware gate, the return address after a sign-in (`safe-redirect`), and the check that the nginx of the stacks masks the same
 * tokens in its logs (`algo-infrastructure/tests/test_k2_token_pages.py` holds the same literal list: change both together).
 */

/** Pages whose address carries a one-time token / code: noindex, no referrer, the token is masked in every log. */
export const TOKEN_PAGES = ["/invite/", "/set-password/", "/confirm-email/"] as const;

/** Public pages of a code (a student opens them): never a destination after a sign-in. */
export const CODE_PAGES = ["/d/", "/e/", "/diagnostic/"] as const;

/** Public pages without a token (exact paths). */
export const OPEN_PAGES = ["/login", "/forgot-password"] as const;

/** The middleware lets these prefixes through without a cookie. */
export const OPEN_PATH_PREFIXES: readonly string[] = [...TOKEN_PAGES, ...CODE_PAGES];

/** A signed-out visitor is not sent back to these after a sign-in (the sign-in itself, the forgot page, the token pages, the code pages). */
export function isPublicPage(pathname: string): boolean {
  if (pathname === "/" || pathname === "") return true;
  if (OPEN_PAGES.some((page) => pathname === page || pathname.startsWith(`${page}/`))) return true;
  return OPEN_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/** The paths the middleware lets through by exact match (besides the demo page and the icon, which the middleware names itself). */
export const OPEN_EXACT_PATHS: readonly string[] = ["/", ...OPEN_PAGES];
