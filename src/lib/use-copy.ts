"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Copies `text` to the clipboard; false when the browser refuses (an insecure page, a denied permission). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * IA audit F16: THE «Копировать ID» of the app (it was three copies: the list of students, the roster of a group, the card).  `copied` is the
 * key of what was copied last, for 2 seconds (a check mark in place of the icon).
 */
export function useCopy(resetMs = 2000) {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const copy = useCallback(async (text: string, key: string = text) => {
    const ok = await copyText(text);
    if (!ok) return false;
    setCopied(key);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), resetMs);
    return true;
  }, [resetMs]);
  return { copied, copy };
}
