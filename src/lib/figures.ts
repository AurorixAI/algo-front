/**
 * Helper utilities for task figure and attachment URLs.
 */

export function resolveFigureUrl(url?: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // If already absolute HTTP(S) or data URL
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("data:")) {
    return trimmed;
  }

  // In browser, Next.js rewrites /api/v1/figures/... to the content service.
  // In SSR / Node, prepend content API URL if needed.
  if (typeof window === "undefined") {
    const contentBase = process.env.CONTENT_API_URL || process.env.NEXT_PUBLIC_CONTENT_API_URL || "http://localhost:8004";
    return `${contentBase}${trimmed.startsWith("/") ? "" : "/"}${trimmed}`;
  }

  // Client-side: relative path goes through Next.js rewrite or direct
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function extractFigureUrls(imageField?: string | string[] | null): string[] {
  if (!imageField) return [];
  if (Array.isArray(imageField)) {
    return imageField.map((u) => resolveFigureUrl(u)).filter((u): u is string => Boolean(u));
  }
  const str = String(imageField).trim();
  if (!str) return [];

  // If JSON array string
  if (str.startsWith("[") && str.endsWith("]")) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) {
        return parsed.map((u) => resolveFigureUrl(u)).filter((u): u is string => Boolean(u));
      }
    } catch {
      // ignore
    }
  }

  // If comma-separated
  if (str.includes(",")) {
    return str
      .split(",")
      .map((part) => resolveFigureUrl(part))
      .filter((u): u is string => Boolean(u));
  }

  const resolved = resolveFigureUrl(str);
  return resolved ? [resolved] : [];
}
