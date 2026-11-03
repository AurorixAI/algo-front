// The gate of a counter that is re-read from the server (the badges of the menu): ONE request at a time, a call within a second of the previous one is skipped,
// a FORCED call (after an action that changed the number) queues exactly one more request behind the one in flight, and `reset` (another person signed in)
// drops every answer still on its way.  It was copied into `excuse-badge.ts` and `substitution-badge.ts` (WAVE E, DUP-7).  No React, no zustand: pure.

export const POLLING_MIN_GAP_MS = 1000;

export interface PollingGate {
  /** `load(isCurrent)` does the request and applies the answer; it must ignore the answer when `isCurrent()` is false.  A failure is swallowed (the last value stays). */
  run(force: boolean, load: (isCurrent: () => boolean) => Promise<unknown>): Promise<void>;
  /** Forget everything in flight; answers that arrive later are not current. */
  reset(): void;
}

export function createPollingGate(minGapMs: number = POLLING_MIN_GAP_MS, now: () => number = () => Date.now()): PollingGate {
  let inFlight: Promise<void> | null = null;
  let queued: Promise<void> | null = null;
  let lastStartedAt = 0;
  let epoch = 0;                                           // bumped by `reset`

  return {
    reset() {
      epoch += 1;
      inFlight = null;
      queued = null;
      lastStartedAt = 0;
    },
    run(force, load) {
      const start = (): Promise<void> => {
        lastStartedAt = now();
        const myEpoch = epoch;
        let loading: Promise<unknown>;
        try { loading = load(() => myEpoch === epoch); } catch (error) { loading = Promise.reject(error); }     // the request starts at once, as it did in the copies
        const request: Promise<void> = loading
          .then(() => undefined, () => undefined)
          .finally(() => { if (inFlight === request) inFlight = null; });
        inFlight = request;
        return request;
      };
      if (inFlight) {
        if (!force) return inFlight;
        // A forced refresh follows an action: the request already in flight may have been answered before it, so one more is queued behind it
        // (and shared by every forced caller meanwhile).
        if (!queued) queued = inFlight.then(() => { queued = null; return start(); });
        return queued;
      }
      if (!force && now() - lastStartedAt < minGapMs) return Promise.resolve();
      return start();
    },
  };
}
