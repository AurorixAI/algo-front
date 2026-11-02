/**
 * WC-C (R3 B1/m3): a time limit for one request.  `fetch` has none: a dead socket (a change of network, a locked phone) never answers and
 * never fails, and a poll that waits for it stops for good.  `run` gets an AbortSignal that is aborted when `ms` have passed; the request
 * then rejects (the signal reaches fetch).  The timer is always cleared.
 */
export interface LimitEnv {
  setTimer: (run: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
}

const browserLimitEnv: LimitEnv = {
  setTimer: (run, ms) => setTimeout(run, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export async function withTimeLimit<T>(ms: number, run: (signal: AbortSignal) => Promise<T>, env: LimitEnv = browserLimitEnv): Promise<T> {
  const controller = new AbortController();
  const timer = env.setTimer(() => controller.abort(), ms);
  try {
    return await run(controller.signal);
  } finally {
    env.clearTimer(timer);
  }
}
