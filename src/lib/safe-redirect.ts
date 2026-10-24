/**
 * Where to send somebody back to after the sign-in page.
 *
 * `middleware.ts` puts the page a signed-out visitor asked for into `/login?redirect=...`; the sign-in
 * page reads it back. The value comes from the address bar, so it is untrusted: only a path on THIS site
 * may ever be followed (no open redirect). Pure helpers - no React, no window - so node:test can load
 * this file.
 */
import { WORKSPACE_ROLES, loginHome } from "./role-home";

/** Longest return address kept (a URL longer than this is not worth a redirect). */
const MAX_REDIRECT_LENGTH = 2048;

/** Never a destination after sign-in: the sign-in itself (a loop) and the technical routes. */
const NOT_A_DESTINATION = /^\/(login|api|_next)(\/|\?|#|$)/;

const PLACEHOLDER_ORIGIN = "http://algo.invalid";

/**
 * The same-site path (`/path?query#hash`) behind an untrusted `redirect` value, or `null`.
 *
 * Accepted: a string that starts with exactly one `/`. Rejected: `//host` and `/\host` (protocol-relative,
 * browsers read `\` as `/`), absolute URLs (`https://...`, `javascript:...`), anything with a backslash or
 * a control character (a tab or newline inside `/\t/host` is dropped by URL parsers and leaves `//host`),
 * a path that only becomes `//host` after dot-segments are resolved (`/..//host`), the sign-in page itself
 * and `/api`, `/_next`. The value that is returned is the normalised one that was checked, not the input.
 */
export function safeRedirectPath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_REDIRECT_LENGTH) return null;
  if (raw[0] !== "/" || raw[1] === "/" || raw[1] === "\\") return null;
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw, PLACEHOLDER_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PLACEHOLDER_ORIGIN) return null;
  const path = `${url.pathname}${url.search}${url.hash}`;
  // The normalised form is what gets followed: it must satisfy the same rule as the input.
  if (path[0] !== "/" || path[1] === "/" || path[1] === "\\") return null;
  if (NOT_A_DESTINATION.test(path)) return null;
  return path;
}

/** `?a=1&_rsc=xyz&b=2` -> `?a=1&b=2`: Next.js adds `_rsc` to its own navigation requests; it is not the user's query. */
export function withoutInternalParams(search: string | null | undefined): string {
  if (!search) return "";
  const kept = search
    .replace(/^\?/, "")
    .split("&")
    .filter((pair) => pair !== "" && pair.split("=")[0] !== "_rsc");
  return kept.length ? `?${kept.join("&")}` : "";
}

/**
 * The `redirect` value the middleware attaches to `/login`: the whole page the visitor asked for
 * (`/owner/settings?section=payments`), or `null` when there is nothing worth coming back to.
 */
export function loginReturnTarget(pathname: string, search: string | null | undefined): string | null {
  return safeRedirectPath(`${pathname}${withoutInternalParams(search)}`);
}

/** Pages a signed-out visitor may open: coming back to them after a sign-in is meaningless. */
const PUBLIC_PAGES = /^\/($|(login|register|activate)(\/|$)|invite\/|d\/|e\/|diagnostic\/)/;

/**
 * The sign-in address a CLIENT-side redirect uses (a dead session found by a failed request): `/login` with
 * the page the user was on as `?redirect=`, exactly like the middleware does for a server-side one. Public
 * pages and unsafe addresses get the bare `/login`.
 */
export function loginUrlForPage(pathname: string, search: string | null | undefined): string {
  if (PUBLIC_PAGES.test(pathname)) return "/login";
  const target = loginReturnTarget(pathname, search);
  return target ? `/login?${new URLSearchParams({ redirect: target }).toString()}` : "/login";
}

/**
 * Where the sign-in page sends the user after a successful login: the page they were bounced from if it
 * is a safe path AND a workspace this role may open (a teacher who followed an `/owner/...` link lands
 * on their own home instead of being refused there), otherwise the role's own home.
 */
export function postLoginTarget(rawRedirect: unknown, role?: string | null): string {
  const target = safeRedirectPath(rawRedirect);
  if (!target) return loginHome(role);
  const workspace = /^\/(owner|admin|teacher)(\/|\?|#|$)/.exec(target)?.[1] as keyof typeof WORKSPACE_ROLES | undefined;
  if (workspace) {
    const allowed: readonly string[] = WORKSPACE_ROLES[workspace];
    if (!role || !allowed.includes(role)) return loginHome(role);
  }
  return target;
}
