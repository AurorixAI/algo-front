"use client";

import { useEffect, useState } from "react";

/**
 * The current time, ticking once a second while a `deadline` (ms since epoch) is still ahead; it stops by itself at the deadline.
 * Derive the seconds left from the deadline and this value (`secondsLeft`), so a throttled background tab catches up at once.
 */
export function useNowUntil(deadline: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null) return;
    setNow(Date.now());
    if (Date.now() >= deadline) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= deadline) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [deadline]);
  return now;
}
