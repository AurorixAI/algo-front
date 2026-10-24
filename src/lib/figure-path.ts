/**
 * Strict allow-list for the public figure proxy (/api/v1/figures/<uuid>/<file>.<img-ext>).
 * The proxy is unauthenticated, so nothing but this exact shape may reach the content service.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,100}(\.[A-Za-z0-9_-]{1,20})*\.(png|jpe?g|webp|gif)$/i;

export const FIGURE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

export interface FigurePath {
  id: string;
  file: string;
  /** Path (no origin) that the content service must serve. */
  pathname: string;
}

/** Validate decoded catch-all segments. Returns null for anything but exactly `<uuid>/<image file>`. */
export function parseFigurePath(segments: unknown): FigurePath | null {
  if (!Array.isArray(segments) || segments.length !== 2) return null;
  const [id, file] = segments;
  if (typeof id !== "string" || typeof file !== "string") return null;
  if (!UUID_RE.test(id) || !FILE_RE.test(file)) return null;
  return { id, file, pathname: `/api/v1/figures/${id}/${file}` };
}

/**
 * Build the upstream URL (defence in depth): encode per segment, re-parse and require the
 * resulting pathname to be exactly the expected one. Returns null otherwise.
 */
export function buildFigureTargetUrl(base: string, segments: unknown): string | null {
  const parsed = parseFigurePath(segments);
  if (!parsed) return null;
  try {
    const url = new URL(
      `${base.replace(/\/+$/, "")}/api/v1/figures/${encodeURIComponent(parsed.id)}/${encodeURIComponent(parsed.file)}`
    );
    if (url.pathname !== parsed.pathname) return null;
    if (url.search || url.hash) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Return the bare image media type if it is an allowed image type, else null. */
export function allowedImageContentType(header: string | null | undefined): string | null {
  if (!header) return null;
  const type = header.split(";")[0].trim().toLowerCase();
  return (FIGURE_IMAGE_TYPES as readonly string[]).includes(type) ? type : null;
}
