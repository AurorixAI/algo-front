/**
 * Where the API of a service lives (K3 P1, АД-1: ONE image of the front works on algolab.me, app.algolab.me and stage.algolab.me).
 *
 * `NEXT_PUBLIC_*_API_URL` is baked into the bundle at build time.  On prod and stage it is EMPTY, and an empty address means
 * «the site I was opened from»: in a browser `window.location.origin` (nginx of that host proxies /api/v1 to the services).
 * Before K3 an empty address silently became `http://localhost:800x`, so a front built without the variable was a broken image.
 *
 *   - non-empty address            -> used as it is (a local stack, the e2e harness, an old image with a full URL);
 *   - empty, in a browser          -> the origin of the page;
 *   - empty, on the Next server    -> the old fallback (`http://localhost:800x`): there is no page, hence no origin.
 *
 * Pure TypeScript (no React, no window read at import), so node:test loads it as is.
 */

/** The origin of the page, or null where there is no page (SSR, node). */
export function browserOrigin(): string | null {
  if (typeof window === "undefined") return null;
  const origin = window.location?.origin;
  return typeof origin === "string" && origin && origin !== "null" ? origin : null;
}

/** `origin` of a service WITHOUT a trailing slash: the configured address, else the page origin, else the server fallback. */
export function serviceOrigin(configured: string | undefined | null, serverFallback: string, pageOrigin: string | null = browserOrigin()): string {
  const set = (configured ?? "").trim();
  return (set || pageOrigin || serverFallback).replace(/\/+$/, "");
}

/** `<origin>/api/v1` of a service (see `serviceOrigin`). */
export function serviceApiV1(configured: string | undefined | null, serverFallback: string, pageOrigin: string | null = browserOrigin()): string {
  return `${serviceOrigin(configured, serverFallback, pageOrigin)}/api/v1`;
}
