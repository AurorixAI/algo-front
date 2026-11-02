/**
 * WC-C (F-A14): the student's waiting room asks `GET /sessions/{id}/status` until the teacher starts the exam.  It was a
 * `setInterval(…, 1500)`: a slow answer (> 1.5 s) let the requests of ONE student pile up on each other, a failure
 * (429 / 503) was met with the same pace, and a change of `examInfo` restarted the timer.  This is the only way from the
 * waiting room into the exam, so the poll is a pure, injectable controller (node:test drives it with a fake clock):
 *  - a recursive timeout: one ask at a time, the next one is planned when the previous one has answered; the pace is counted from the
 *    START of an ask (next = max(start + pause, end of the ask), at least 250 ms after it), so a slow answer does not add itself to the pause;
 *  - ONE ASK LASTS AT MOST 8 s (R3 B1: a request that never answers - a dead socket after a change of network - stopped the poll for good):
 *    after that it is aborted, counted as a transient failure (back-off) and the poll goes on; the answer of an abandoned ask is never applied;
 *  - a success asks again in 1.5 s; a transient failure (no answer, 429, 5xx) backs off 1.5 -> 3 -> 5 s and never beyond
 *    5 s (the start time is the server's: a student who is late loses minutes, so the ceiling is low); a `Retry-After`
 *    is honoured up to that same ceiling; ±20 % jitter so 30 students do not ask in the same millisecond;
 *  - NOT paused in the background (the exam may start while the tab is hidden); the tab coming back asks at once, and an ask that has been
 *    hanging for 8 s or more (its own timer may have been frozen in the background) is abandoned and asked again.
 */
import { browserTickerEnv, type TickerEnv } from "@/lib/exam-clock";

/** The normal pace of the waiting room. */
export const WAITING_POLL_MS = 1500;
/** The ceiling of the back-off: the message «экзамен начался» must reach the student within 5 s. */
export const WAITING_POLL_MAX_MS = 5000;
/** The longest an ask may take: then it is abandoned (aborted) and counted as a failure. */
export const WAITING_POLL_REQUEST_LIMIT_MS = 8000;
/** After an ask ends, the next one never starts sooner than this (a slow server is not asked back to back). */
export const WAITING_POLL_MIN_WAIT_MS = 250;
/** Returning to the tab (visibilitychange + pageshow + focus come together) does not ask more often than this. */
export const WAITING_POLL_MIN_GAP_MS = 1000;
/** ±20 %. */
const JITTER = 0.2;

export type WaitingPollOutcome = "ok" | "transient" | "error";

/**
 * The wait before the next ask.  A success goes back to the normal pace; a transient failure doubles the wait up to the
 * ceiling (and waits for the server's `Retry-After` when it is longer, but not past the ceiling); any other failure
 * (a 4xx the server meant) keeps the current pace.
 */
export function nextWaitingPollDelay(current: number, outcome: WaitingPollOutcome, retryAfterSeconds?: number): number {
  if (outcome === "ok") return WAITING_POLL_MS;
  if (outcome === "error") return Math.min(Math.max(current, WAITING_POLL_MS), WAITING_POLL_MAX_MS);
  const backoff = Math.min(Math.max(current, WAITING_POLL_MS) * 2, WAITING_POLL_MAX_MS);
  const asked = typeof retryAfterSeconds === "number" && retryAfterSeconds > 0 ? Math.min(retryAfterSeconds * 1000, WAITING_POLL_MAX_MS) : 0;
  return Math.max(backoff, asked);
}

/** ±20 % of `ms` (`random` is in [0, 1)), never above the ceiling. */
export function withJitter(ms: number, random: number): number {
  const factor = 1 - JITTER + 2 * JITTER * Math.min(Math.max(random, 0), 1);
  return Math.min(Math.round(ms * factor), WAITING_POLL_MAX_MS);
}

/** What a failed ask means: no answer / 429 / 5xx is transient (back off); a 4xx the server meant keeps the pace. */
export function waitingPollFailure(error: unknown): { outcome: "transient" | "error"; retryAfter?: number } {
  const { status, retryAfter } = (error ?? {}) as { status?: unknown; retryAfter?: unknown };
  const seconds = typeof retryAfter === "number" && Number.isFinite(retryAfter) ? retryAfter : undefined;
  if (typeof status !== "number" || status === 0 || status === 429 || status >= 500) return { outcome: "transient", retryAfter: seconds };
  return { outcome: "error" };
}

export interface WaitingPollEnv extends TickerEnv {
  /** In [0, 1). */
  random: () => number;
}

export interface WaitingPoll {
  /** Ends the poll for good: no timer is left, an answer that arrives later is dropped. */
  stop: () => void;
}

interface Attempt {
  startedAt: number;
  timer: unknown;
  controller: AbortController | null;
  /** The ask ended (answered, failed, ran out of time or was abandoned): nothing it brings is applied any more. */
  settled: boolean;
}

/**
 * Starts the poll; the first ask comes after the normal pace (the page has just loaded the lobby), as the interval did.  `ask` makes
 * ONE request and applies its answer; it returns "stop" when the waiting room is over (kicked / closed / submitted / the exam began) and
 * "continue" otherwise; it throws when the request failed.  `alive()` tells `ask` that the poll was stopped or THIS ask was abandoned
 * (time ran out, the tab came back to a hanging ask) while the request was on the way: it must not write the state then; `signal`
 * is aborted at that moment (pass it to fetch).
 */
export function startWaitingRoomPoll(
  ask: (alive: () => boolean, signal?: AbortSignal) => Promise<"continue" | "stop">,
  env: WaitingPollEnv,
  onFailure?: (error: unknown) => void,
): WaitingPoll {
  let stopped = false;
  let current: Attempt | null = null;
  let timer: unknown = null;
  let delay = WAITING_POLL_MS;
  let lastStart = Number.NEGATIVE_INFINITY;
  let unsubscribe: () => void = () => {};

  const clearPlanned = () => {
    if (timer !== null) env.clearTimer(timer);
    timer = null;
  };
  const plan = (ms: number) => {
    if (stopped) return;
    clearPlanned();
    timer = env.setTimer(run, ms);
  };
  /** The ask is over for good: its timer is cleared, its request aborted, whatever it brings later is dropped. */
  const settle = (attempt: Attempt, abort: boolean): boolean => {
    if (attempt.settled) return false;
    attempt.settled = true;
    env.clearTimer(attempt.timer);
    if (abort) {
      try { attempt.controller?.abort(); } catch { /* nothing to abort */ }
    }
    if (current === attempt) current = null;
    return true;
  };
  /** The pause counted from the START of the ask, never shorter than {@link WAITING_POLL_MIN_WAIT_MS} after its end. */
  const planAfter = (attempt: Attempt, pause: number) => {
    plan(Math.max(WAITING_POLL_MIN_WAIT_MS, attempt.startedAt + pause - env.now()));
  };
  const fail = (attempt: Attempt, error: unknown) => {
    onFailure?.(error);
    const failure = waitingPollFailure(error);
    delay = nextWaitingPollDelay(delay, failure.outcome, failure.retryAfter);
    planAfter(attempt, withJitter(delay, env.random()));
  };
  const run = () => {
    timer = null;
    if (stopped || current) return;
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const attempt: Attempt = { startedAt: env.now(), timer: null, controller, settled: false };
    current = attempt;
    lastStart = attempt.startedAt;
    const alive = () => !stopped && !attempt.settled;
    attempt.timer = env.setTimer(() => {
      if (!settle(attempt, true) || stopped) return;
      fail(attempt, Object.assign(new Error("The status request took too long."), { status: 0 }));
    }, WAITING_POLL_REQUEST_LIMIT_MS);
    let asked: Promise<"continue" | "stop">;
    try {
      asked = ask(alive, controller?.signal);
    } catch (error) {
      asked = Promise.reject(error);
    }
    asked.then(
      (verdict) => {
        if (!settle(attempt, false) || stopped) return;
        if (verdict === "stop") {
          stopped = true;
          clearPlanned();
          unsubscribe();
          return;
        }
        delay = nextWaitingPollDelay(delay, "ok");
        planAfter(attempt, withJitter(delay, env.random()));
      },
      (error) => {
        if (!settle(attempt, false) || stopped) return;
        fail(attempt, error);
      },
    );
  };
  const onReturn = () => {
    if (stopped) return;
    const now = env.now();
    if (current) {
      // an ask on the way is waited for - unless it has hung for the whole limit (its own timer may be frozen in the background)
      if (now - current.startedAt < WAITING_POLL_REQUEST_LIMIT_MS) return;
      settle(current, true);
      clearPlanned();
      run();
      return;
    }
    if (now - lastStart < WAITING_POLL_MIN_GAP_MS) return;
    clearPlanned();
    run();
  };
  unsubscribe = env.onReturn(onReturn);
  plan(withJitter(delay, env.random()));
  return {
    stop: () => {
      stopped = true;
      if (current) settle(current, true);
      clearPlanned();
      unsubscribe();
    },
  };
}

export function browserWaitingPollEnv(): WaitingPollEnv {
  return { ...browserTickerEnv(), random: () => Math.random() };
}
