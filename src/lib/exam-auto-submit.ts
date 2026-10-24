/**
 * The automatic submit when the exam timer reaches zero (nits N3-1).
 *
 * It fires at most ONCE per exam session.  When that submit is refused with a 429, exactly one more automatic try is made when the
 * wait ends; after that - and after any other failure (a busy server, ...) - only the student's button repeats it.  Without this,
 * putting the page back to «exam» after a failed submit re-ran the «time is up» effect: back-to-back requests without end.
 * Pure (timers injected), so node:test can count the calls.
 */

/** What one submit attempt came to: `retryAt` (ms since epoch) is set only for a 429, when the server's wait ends. */
export interface SubmitOutcome {
  ok: boolean;
  retryAt: number | null;
}

export interface AutoSubmitOptions {
  /** One attempt; it must not throw (the page shows its own failure). */
  submit: () => Promise<SubmitOutcome | void>;
  now?: () => number;
  setTimer?: (run: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface AutoSubmit {
  /** Called by the effect whenever «time is up» holds; only the first call (per session) does anything. */
  trigger: () => void;
  /** A new exam session: the next «time is up» may fire again. */
  reset: () => void;
  /** Leaving the page: drop a scheduled retry. */
  cancel: () => void;
}

export function createAutoSubmit(options: AutoSubmitOptions): AutoSubmit {
  const now = options.now ?? Date.now;
  const setTimer = options.setTimer ?? ((run, ms) => setTimeout(run, ms));
  const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  let fired = false;
  let timer: unknown = null;

  const cancel = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  return {
    trigger() {
      if (fired) return;
      fired = true;
      void options.submit().then((outcome) => {
        if (!outcome || outcome.ok || outcome.retryAt === null) return;
        // The one automatic retry, when the wait of the 429 is over.
        timer = setTimer(() => {
          timer = null;
          void options.submit();
        }, Math.max(0, outcome.retryAt - now()));
      });
    },
    reset() {
      cancel();
      fired = false;
    },
    cancel,
  };
}
