/**
 * A busy server is not a failed exam (ROADMAP #95 R3).
 *
 * The exam service answers 503 + Retry-After when a row lock, a statement or its connection pool was busy for too
 * long; nothing was written, and `start` / `submit` are idempotent (the same attempt comes back, a second submit
 * returns the stored result), so the page simply asks again - a few times, keeping the exam on screen - and only
 * then shows the failure, with a button that repeats the very same request.
 */

/** What the student reads while the page repeats the save. */
export const SAVING_RETRY_MESSAGE = "Сохраняем… повторяем попытку";
export const START_RETRY_MESSAGE = "Входим в экзамен… повторяем попытку";
/** When the server gave neither a text nor a Retry-After. */
export const BUSY_MESSAGE = "Сервер временно перегружен. Подождите несколько секунд и повторите.";

/** The first try and two repeats. */
export const RETRY_ATTEMPTS = 3;
const DEFAULT_WAIT_SECONDS = 2;
const MIN_WAIT_SECONDS = 1;
const MAX_WAIT_SECONDS = 5;

/** The server (or a proxy in front of it) was busy or briefly unreachable: asking again is safe. */
export function isTransientServerError(error: unknown): boolean {
  const status = ((error ?? {}) as { status?: unknown }).status;
  return status === 503 || status === 502 || status === 504;
}

/** How long to wait before the next try: the server's `Retry-After`, kept between one and five seconds. */
export function retryDelayMs(error: unknown): number {
  const raw = ((error ?? {}) as { retryAfter?: unknown }).retryAfter;
  const seconds = typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_WAIT_SECONDS;
  return Math.min(Math.max(seconds, MIN_WAIT_SECONDS), MAX_WAIT_SECONDS) * 1000;
}

/** The failure text once the tries are used up: the server's own Russian text, else the fixed one. */
export function transientFailureMessage(error: unknown): string {
  const message = ((error ?? {}) as { message?: unknown }).message;
  return typeof message === "string" && message.trim() ? message : BUSY_MESSAGE;
}

export interface RetryOptions {
  attempts?: number;
  /** Tests inject a clock; the page waits for real. */
  sleep?: (ms: number) => Promise<void>;
  /** Called before each repeat (to show «Сохраняем… повторяем попытку»). */
  onRetry?: (error: unknown, nextAttempt: number) => void;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Run `run`; on a transient server error wait for Retry-After and run it again, up to `attempts` times in all. */
export async function withTransientRetry<T>(run: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? RETRY_ATTEMPTS);
  const sleep = options.sleep ?? realSleep;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= attempts || !isTransientServerError(error)) throw error;
      options.onRetry?.(error, attempt + 1);
      await sleep(retryDelayMs(error));
    }
  }
}
