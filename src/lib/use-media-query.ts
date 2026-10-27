"use client";

import { useEffect, useState } from "react";

/** Whether a CSS media query matches now; false until mounted (the server render and the first client render agree). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return matches;
}

/** The placeholder of a field: the short word on a phone (below `sm`), the full one from tablets up.  The accessible name stays the full one. */
export const PHONE_QUERY = "(max-width: 639px)";
