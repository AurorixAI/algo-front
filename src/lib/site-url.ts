/**
 * The old addresses of the demo form and the address of the public site (the landing) (K3 P2).
 *
 * The landing lives on its own host (algolab.me; stage: landing.stage.algolab.me), the product on app.algolab.me.  The address is the
 * RUNTIME variable `SITE_URL` of the Next server (not `NEXT_PUBLIC_*`: one image of the front serves prod and stage, АД-1).
 * Only the middleware reads it; the sign-in page links to the relative `/request-demo` of its own origin.
 *
 * `/request-demo` and `/register` (old links of letters, ads, the old landing) answer by this table:
 *   - SITE_URL is an address of ANOTHER host  -> 302 to `SITE_URL/#demo` (the campaign tags of the old link travel with it);
 *   - SITE_URL is empty, broken, or the SAME host as the request -> no redirect (it would lead to itself: a loop), the plain
 *     page «Заявка на демо: напишите нам» (`/demo-contact`).
 *
 * Pure TypeScript, so node:test loads it as is.
 */
import { sourceQuery } from "./portable/demo-form";

/** The internal page that answers when there is no landing to go to (the middleware rewrites to it, the address stays). */
export const DEMO_CONTACT_PATH = "/demo-contact";

/** Old product pages that were the demo form. */
export const LEGACY_DEMO_PATHS = ["/request-demo", "/register"] as const;

export function isLegacyDemoPath(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return (LEGACY_DEMO_PATHS as readonly string[]).includes(path);
}

/** The origin of an http(s) address without a trailing slash, or null for an empty / broken / foreign-scheme value. */
export function siteOrigin(siteUrl: string | undefined | null): URL | null {
  const text = (siteUrl ?? "").trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

export type LegacyDemoAnswer = { kind: "redirect"; url: string } | { kind: "contact" };

/** What an old demo address answers: `requestHost` is the host the request came to («app.algolab.me», «localhost:3000»). */
export function legacyDemoAnswer(siteUrl: string | undefined | null, requestHost: string, search = ""): LegacyDemoAnswer {
  const site = siteOrigin(siteUrl);
  if (!site || site.host.toLowerCase() === requestHost.trim().toLowerCase()) return { kind: "contact" };
  const base = `${site.protocol}//${site.host}${site.pathname.replace(/\/+$/, "")}`;
  return { kind: "redirect", url: `${base}/${sourceQuery(search)}#demo` };
}
