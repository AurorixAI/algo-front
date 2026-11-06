"use client";

import { useEffect } from "react";

/**
 * The cabinets of a teacher and a student are used with a thumb: while one is on screen `<html data-density="touch">` raises every Button / field that follows the token `--control-h-touch` from 40 to 44 px on
 * a phone (src/styles/tokens.css).  It sits on <html> and not on a wrapper, so a window (rendered into <body>) follows too.  Nothing else changes: a desktop keeps 40.
 */
export function useTouchDensity(): void {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-density", "touch");
    return () => root.removeAttribute("data-density");
  }, []);
}

export function TouchDensity() {
  useTouchDensity();
  return null;
}
