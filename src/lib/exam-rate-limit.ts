/**
 * «Слишком много попыток» on the public exam page (nits N3, #92 в).
 *
 * A 429 (the entry limits of the exam service) is not a broken exam: the page says so calmly, counts the wait down when the
 * server sent `Retry-After`, and lets the student repeat the very same request when it is over.  Pure helpers, no React,
 * so node:test can load this file; `exam-entry.ts` keeps the status check and the banner text of the lobby.
 */
import { RATE_LIMIT_MESSAGE, isRateLimited } from "./exam-entry";

export const RATE_LIMIT_TITLE = "Слишком много попыток";
export const RATE_LIMIT_RETRY_LABEL = "Попробовать снова";
/** A Retry-After longer than this is shown as the fixed text: a countdown of an hour would only scare. */
const MAX_COUNTDOWN_SECONDS = 15 * 60;

/** Whole seconds from `Retry-After` of a 429, or `null` (no header, zero, garbage, absurdly long): then the fixed text is shown. */
export function rateLimitWaitSeconds(error: unknown): number | null {
  if (!isRateLimited(error)) return null;
  const raw = (error as { retryAfter?: unknown }).retryAfter;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return null;
  const seconds = Math.ceil(raw);
  return seconds > MAX_COUNTDOWN_SECONDS ? null : seconds;
}

/** The moment the wait is over (ms since epoch), or `null` when the server named no wait. */
export function rateLimitDeadline(error: unknown, now: number): number | null {
  const seconds = rateLimitWaitSeconds(error);
  return seconds === null ? null : now + seconds * 1000;
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
 * The sentence under the title: the countdown while it runs («Подождите 42 сек.»), a go-ahead when it is over, and the fixed text
 * when the server named no wait.
 */
export function rateLimitText(deadline: number | null, now: number): string {
  if (deadline === null) return RATE_LIMIT_MESSAGE;
  const left = secondsLeft(deadline, now);
  return left > 0 ? `Подождите ${waitLabel(left)}` : "Можно попробовать снова.";
}

/** The button repeats the request once the wait is over (at once when there was no wait to count). */
export function canRetryNow(deadline: number | null, now: number, busy = false): boolean {
  return !busy && secondsLeft(deadline, now) === 0;
}
