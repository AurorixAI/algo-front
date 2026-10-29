/**
 * The address of the public site (the landing) as the product links to it (K3 P2).
 *
 * The landing lives on its own host (algolab.me; stage: landing.stage.algolab.me), the product on app.algolab.me.  The address
 * comes from the build variable `NEXT_PUBLIC_SITE_URL` (never a literal: a stage build must not send people to the prod
 * landing).  Empty -> the same origin («/#demo»): the link stays harmless and nothing leaves the host.
 *
 * Pure TypeScript, so node:test loads it as is.
 */
import { sourceQuery } from "./portable/demo-form";

/** The build variable as a base without a trailing slash; "" = the same origin. */
export function siteBase(siteUrl: string | undefined | null): string {
  return (siteUrl ?? "").trim().replace(/\/+$/, "");
}

/** «Запросить демо»: `SITE_URL/#demo`, with the campaign tags of an old link (`search`) in front of the hash. */
export function demoRequestUrl(siteUrl: string | undefined | null, search = ""): string {
  return `${siteBase(siteUrl)}/${sourceQuery(search)}#demo`;
}

/** Old product pages that were the demo form: they now lead to the landing (temporary redirect while the domains move). */
export const LEGACY_DEMO_PATHS = ["/request-demo", "/register"] as const;

export function isLegacyDemoPath(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return (LEGACY_DEMO_PATHS as readonly string[]).includes(path);
}
