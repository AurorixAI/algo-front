/**
 * WC-C (F-A13): a background poll that works only while the tab is looked at: the timer skips a hidden tab and the tab
 * coming back asks at once (the dashboard, the exam hub and the administrator's pages do the same by hand).  Injectable,
 * so node:test drives it with a fake clock and a fake page.
 */
export interface VisiblePollEnv {
  setEvery: (run: () => void, ms: number) => unknown;
  clearEvery: (handle: unknown) => void;
  isVisible: () => boolean;
  /** `visibilitychange`; returns the unsubscribe. */
  onVisibilityChange: (run: () => void) => () => void;
}

/** Runs `run` every `ms` while the tab is visible and at once when it becomes visible again; the returned function stops it. */
export function startVisiblePolling(run: () => void, ms: number, env: VisiblePollEnv): () => void {
  const ifVisible = () => { if (env.isVisible()) run(); };
  const timer = env.setEvery(ifVisible, ms);
  const unsubscribe = env.onVisibilityChange(ifVisible);
  return () => {
    env.clearEvery(timer);
    unsubscribe();
  };
}

export function browserVisiblePollEnv(): VisiblePollEnv {
  return {
    setEvery: (run, ms) => window.setInterval(run, ms),
    clearEvery: (handle) => window.clearInterval(handle as number),
    isVisible: () => document.visibilityState === "visible",
    onVisibilityChange: (run) => {
      document.addEventListener("visibilitychange", run);
      return () => document.removeEventListener("visibilitychange", run);
    },
  };
}
