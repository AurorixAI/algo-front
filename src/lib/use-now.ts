import { useEffect, useState } from "react";

/**
 * The current time (ms since the epoch) that re-renders the component every `intervalMs` while `enabled`.
 * A value computed once - when a panel opens - goes stale; a time rule that gates a button (the last minutes
 * of a lesson) has to read this instead.  Nothing runs while disabled; the timer is cleared on disable and unmount,
 * and the clock is re-read the moment it is enabled (a panel opened long after the page loaded).
 */
export function useNow(intervalMs = 30_000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [enabled, intervalMs]);
  return now;
}
