import type { MetadataRoute } from "next";

/**
 * The product (app.algolab.me, stage.algolab.me) is not for search engines: every page is a sign-in, a cabinet or a
 * one-time link.  The public site (landing) has its own robots.txt.  K3 P3, risk 19.
 */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
