/**
 * Names of the cabinet's access cookie (K2-1, A3). On https (stage, prod) the server sets `__Host-algo_auth_token`: host-only, `Secure`, `Path=/`,
 * no `Domain`, so a sibling subdomain cannot plant a cookie of that name. On plain-http development the prefix cannot be used (the browser drops a
 * `__Host-` cookie without `Secure`) and the name is `algo_auth_token`. The cookie is httpOnly: only the server side (middleware, server
 * components) can see that it exists; the page itself never reads or keeps a token.
 */
export const AUTH_COOKIE_NAMES = ["__Host-algo_auth_token", "algo_auth_token"] as const;

type CookieGetter = (name: string) => { value?: string } | undefined;

/** The value of the access cookie under whichever name the server used, or undefined. */
export function authCookieValue(get: CookieGetter): string | undefined {
  for (const name of AUTH_COOKIE_NAMES) {
    const value = get(name)?.value;
    if (value) return value;
  }
  return undefined;
}
