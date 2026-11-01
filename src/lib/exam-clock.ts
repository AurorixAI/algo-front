/**
 * WB-P5 (F-A15): the countdown of the student's exam counts to a DEADLINE on the wall clock, it does not subtract one
 * second per tick.  A phone that is locked, or a tab in the background, has its timers slowed down or stopped by the
 * browser: a decrementing counter then shows minutes that are already gone, and the automatic submit comes late (the
 * server closes the exam at the real time).  Here every tick (and every return of the tab) recomputes the seconds left
 * from `Date.now()`, so a throttled timer only makes the display coarser, never wrong.
 * Pure (the clock, the timers and the page events are injected), so node:test drives it with a fake clock.
 */

/** The moment (ms since epoch) when `remainingSeconds` from now run out. */
export function deadlineAfter(remainingSeconds: number, now: number): number {
  return now + Math.max(0, remainingSeconds) * 1000;
}

/** Whole seconds left until `deadline` (rounded up, so the display shows 00:01 until the last moment), never below 0. */
export function secondsUntil(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export interface TickerEnv {
  now: () => number;
  setTimer: (run: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  /** `visibilitychange` of the document, `pageshow` / `focus` of the window: the moments the tab is looked at again. */
  onReturn: (run: () => void) => () => void;
}

export interface DeadlineTicker {
  stop: () => void;
}

/**
 * Calls `onTick(secondsLeft)` at once, then about once a second, and again whenever the tab comes back to the screen.
 * Stops itself after reporting 0.
 */
export function startDeadlineTicker(deadline: number, onTick: (secondsLeft: number) => void, env: TickerEnv): DeadlineTicker {
  let timer: unknown = null;
  let stopped = false;

  const schedule = () => {
    if (stopped) return;
    if (timer !== null) env.clearTimer(timer);
    timer = env.setTimer(tick, 1000);
  };
  const tick = () => {
    if (stopped) return;
    const left = secondsUntil(deadline, env.now());
    onTick(left);
    if (left <= 0) {
      stop();
      return;
    }
    schedule();
  };
  const unsubscribe = env.onReturn(tick);
  const stop = () => {
    stopped = true;
    if (timer !== null) env.clearTimer(timer);
    timer = null;
    unsubscribe();
  };
  tick();
  return { stop };
}

/** The ticker in the browser. */
export function browserTickerEnv(): TickerEnv {
  return {
    now: () => Date.now(),
    setTimer: (run, ms) => window.setTimeout(run, ms),
    clearTimer: (handle) => window.clearTimeout(handle as number),
    onReturn: (run) => {
      const onVisible = () => {
        if (document.visibilityState !== "hidden") run();
      };
      document.addEventListener("visibilitychange", onVisible);
      window.addEventListener("pageshow", run);
      window.addEventListener("focus", run);
      return () => {
        document.removeEventListener("visibilitychange", onVisible);
        window.removeEventListener("pageshow", run);
        window.removeEventListener("focus", run);
      };
    },
  };
}
