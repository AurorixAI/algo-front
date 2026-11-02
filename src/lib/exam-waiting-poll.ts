/**
 * WC-C (F-A14): the student's waiting room asks `GET /sessions/{id}/status` until the teacher starts the exam.  It was a
 * `setInterval(…, 1500)`: a slow answer (> 1.5 s) let the requests of ONE student pile up on each other, a failure
 * (429 / 503) was met with the same pace, and a change of `examInfo` restarted the timer.  This is the only way from the
 * waiting room into the exam, so the poll is a pure, injectable controller (node:test drives it with a fake clock):
 *  - a recursive timeout: the next ask is planned only AFTER the previous one has answered (no overlap);
 *  - a success asks again in 1.5 s; a transient failure (no answer, 429, 5xx) backs off 1.5 -> 3 -> 5 s and never beyond
 *    5 s (the start time is the server's: a student who is late loses minutes, so the ceiling is low); a `Retry-After`
 *    is honoured up to that same ceiling; ±20 % jitter so 30 students do not ask in the same millisecond;
 *  - NOT paused in the background (the exam may start while the tab is hidden); the tab coming back asks at once.
 */
import { browserTickerEnv, type TickerEnv } from "@/lib/exam-clock";

/** The normal pace of the waiting room. */
export const WAITING_POLL_MS = 1500;
/** The ceiling of the back-off: the message «экзамен начался» must reach the student within 5 s. */
export const WAITING_POLL_MAX_MS = 5000;
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

/**
 * Starts the poll; the first ask comes after the normal pace (the page has just loaded the lobby), as the interval did.  `ask` makes ONE request and applies its answer; it returns "stop"
 * when the waiting room is over (kicked / closed / submitted / the exam began) and "continue" otherwise; it throws when
 * the request failed.  `alive()` tells `ask` that the poll was stopped while the request was on the way (do not write
 * the state then).
 */
export function startWaitingRoomPoll(
  ask: (alive: () => boolean) => Promise<"continue" | "stop">,
  env: WaitingPollEnv,
  onFailure?: (error: unknown) => void,
): WaitingPoll {
  let stopped = false;
  let inFlight = false;
  let timer: unknown = null;
  let delay = WAITING_POLL_MS;
  let lastStart = Number.NEGATIVE_INFINITY;
  let unsubscribe: () => void = () => {};
  const alive = () => !stopped;

  const clearPlanned = () => {
    if (timer !== null) env.clearTimer(timer);
    timer = null;
  };
  const plan = (ms: number) => {
    if (stopped) return;
    clearPlanned();
    timer = env.setTimer(run, ms);
  };
  const run = async () => {
    timer = null;
    if (stopped || inFlight) return;
    inFlight = true;
    lastStart = env.now();
    let next: number | null = null;
    try {
      const verdict = await ask(alive);
      if (verdict === "stop") {
        stopped = true;
        unsubscribe();
      } else {
        delay = nextWaitingPollDelay(delay, "ok");
        next = withJitter(delay, env.random());
      }
    } catch (error) {
      if (!stopped) {
        onFailure?.(error);
        const failure = waitingPollFailure(error);
        delay = nextWaitingPollDelay(delay, failure.outcome, failure.retryAfter);
        next = withJitter(delay, env.random());
      }
    } finally {
      inFlight = false;
    }
    if (next !== null) plan(next);
  };
  const onReturn = () => {
    if (stopped || inFlight) return;
    if (env.now() - lastStart < WAITING_POLL_MIN_GAP_MS) return;
    clearPlanned();
    void run();
  };
  unsubscribe = env.onReturn(onReturn);
  plan(withJitter(delay, env.random()));
  return {
    stop: () => {
      stopped = true;
      clearPlanned();
      unsubscribe();
    },
  };
}

export function browserWaitingPollEnv(): WaitingPollEnv {
  return { ...browserTickerEnv(), random: () => Math.random() };
}
