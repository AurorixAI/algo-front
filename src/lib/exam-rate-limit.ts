/**
 * «Слишком много попыток» on the public exam page (nits N3, #92 в).
 *
 * A 429 (the entry limits of the exam service) is not a broken exam: the page says so calmly, holds the button for the wait and
 * lets the student repeat the very same request when it is over.  The wait is the server's `Retry-After` (seconds or an
 * HTTP-date, read by api.ts); without a usable one - missing, garbage, longer than a quarter of an hour - the button is held for
 * a default minute and the text is the server's own message (else the fixed calm one).  Pure helpers, no React, so node:test
 * can load this file; `exam-entry.ts` keeps the status check and the banner text of the lobby.
 */
import { isRateLimited, rateLimitMessage } from "./exam-entry";

export const RATE_LIMIT_TITLE = "Слишком много попыток";
export const RATE_LIMIT_RETRY_LABEL = "Попробовать снова";
/** A Retry-After longer than this is not counted down: a countdown of an hour would only scare. */
const MAX_COUNTDOWN_SECONDS = 15 * 60;
/** The hold of the button when the server named no usable wait. */
export const DEFAULT_WAIT_SECONDS = 60;

/** Whole seconds of the server's `Retry-After` of a 429 that can be counted down, or `null` (not a 429, no/zero/garbage/very long wait). */
export function rateLimitWaitSeconds(error: unknown): number | null {
  if (!isRateLimited(error)) return null;
  const raw = (error as { retryAfter?: unknown }).retryAfter;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return null;
  const seconds = Math.ceil(raw);
  return seconds > MAX_COUNTDOWN_SECONDS ? null : seconds;
}

/**
 * The moment the button may be pressed again (ms since epoch): the server's wait, else a default minute for any 429.
 * `null` only for an answer that is not a 429.
 */
export function rateLimitDeadline(error: unknown, now: number): number | null {
  if (!isRateLimited(error)) return null;
  return now + (rateLimitWaitSeconds(error) ?? DEFAULT_WAIT_SECONDS) * 1000;
}

/**
 * The text to show for the wait when it is NOT a counted one (no usable Retry-After): the server's own message, else the fixed
 * calm sentence.  `null` when the wait is counted down («Подождите N сек.»).
 */
export function rateLimitFallbackText(error: unknown): string | null {
  return rateLimitWaitSeconds(error) === null ? rateLimitMessage(error) : null;
}

/** Whole seconds still to wait (rounded up, never negative); 0 without a deadline. */
export function secondsLeft(deadline: number | null, now: number): number {
  if (deadline === null) return 0;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

/** «45 сек.» / «2 мин 5 сек.» / «3 мин.» */
export function waitLabel(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  if (total < 120) return `${total} сек.`;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${minutes} мин.` : `${minutes} мин ${rest} сек.`;
}

/**
 * The sentence under the title: the countdown while it runs («Подождите 42 сек.»), or `fallback` (the server's message / the fixed
 * calm text) when the wait is not a counted one, and a go-ahead when it is over.
 */
export function rateLimitText(deadline: number | null, now: number, fallback: string | null = null): string {
  if (deadline === null) return fallback ?? rateLimitMessage(null);
  const left = secondsLeft(deadline, now);
  if (left === 0) return "Можно попробовать снова.";
  return fallback ?? `Подождите ${waitLabel(left)}`;
}

/** The button repeats the request once the wait is over (at once when there was none). */
export function canRetryNow(deadline: number | null, now: number, busy = false): boolean {
  return !busy && secondsLeft(deadline, now) === 0;
}
