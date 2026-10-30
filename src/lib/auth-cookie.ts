/**
 * Names of the cabinet's access cookie (K2-1, A3). On https (stage, prod) the server sets `__Host-algo_auth_token`: host-only, `Secure`, `Path=/`,
 * no `Domain`, so a sibling subdomain cannot plant a cookie of that name. On plain-http development the prefix cannot be used (the browser drops a
 * `__Host-` cookie without `Secure`) and the name is `algo_auth_token`. The cookie is httpOnly: only the server side (middleware, server
 * components) can see that it exists; the page itself never reads or keeps a token.
 */
export const AUTH_COOKIE_NAMES = ["__Host-algo_auth_token", "algo_auth_token"] as const;

type CookieGetter = (name: string) => { value?: string } | undefined;

/**
 * Is this a REAL deployment (a production build behind https)? There the server only ever sets the `__Host-` name, so a cookie under the plain name is a leftover of
 * before K2-1 or something a sibling subdomain planted: it must not count as a sign-in (the middleware gate). Development, tests and the plain-http e2e stack
 * (a production build over http) keep the plain name.
 */
export function isSecureDeployment(env: { NODE_ENV?: string }, protocol: string | null | undefined, forwardedProto?: string | null): boolean {
  if (env.NODE_ENV !== "production") return false;
  const proto = (forwardedProto || protocol || "").replace(/:$/, "").split(",")[0].trim().toLowerCase();
  return proto === "https";
}

/** The value of the access cookie under the name this deployment uses (`secure`: only the `__Host-` name), or undefined. */
export function authCookieValue(get: CookieGetter, secure = false): string | undefined {
  for (const name of secure ? AUTH_COOKIE_NAMES.slice(0, 1) : AUTH_COOKIE_NAMES) {
    const value = get(name)?.value;
    if (value) return value;
  }
  return undefined;
}
