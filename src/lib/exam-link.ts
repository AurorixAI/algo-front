/**
 * WB-P5 (F-A22): the link a student opens for an exam (`/e/<code>`) and the copy button next to it - ONE place.
 * It was assembled by hand in six screens, three of them with the fallback host «https://algo.uz» (not our address): a link
 * built without a window is relative instead, which a person can never copy by mistake.
 */
export function examLink(origin: string | null | undefined, code: string): string {
  return `${(origin ?? "").replace(/\/+$/, "")}/e/${encodeURIComponent(code)}`;
}

/** The exam link on the site the page was opened from (empty origin while rendering on the server). */
export function examLinkHere(code: string): string {
  return examLink(typeof window !== "undefined" ? window.location.origin : "", code);
}

/** The link as the person reads it («app.algolab.me/e/ABC123»), without the scheme. */
export function examLinkDisplay(code: string): string {
  return `${typeof window !== "undefined" ? window.location.host : ""}/e/${encodeURIComponent(code)}`;
}

/** Shown when the browser refuses the clipboard (an insecure page, a denied permission): nothing was copied, and the button must not say so. */
export const COPY_FAILED_TEXT = "Не удалось скопировать. Выделите текст и скопируйте вручную.";
