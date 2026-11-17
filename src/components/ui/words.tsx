"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

const useBeforePaint = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Names (a group «Алгебра 7 (вт/пт)», «7-А», a full name) wrap BETWEEN words only: after a «/» or a «-» inside a word the browser may break the line, and «вт/ пт» reads as two things.
 * Every word is one unbreakable box (it is cut inside only when it is wider than the whole line); the spaces stay ordinary spaces and no character is added, so the text, copying and search are the same.
 * The words live in ONE inline box of their own: a parent that is a flex container (a cell of a card on a phone) sees one item, not the words - otherwise the spaces between the boxes vanish
 * («Математика6Б»).  Self-contained: no parent needs a `gap`.
 */
export function Words({ text, tail }: { text: string; /** Glued to the LAST word inside its box (a separator that must never fall alone onto the next line). */ tail?: ReactNode }): ReactNode {
  const parts = text.split(/(\s+)/);
  let last = -1;
  parts.forEach((part, index) => { if (part && !/^\s+$/.test(part)) last = index; });
  return <span>{parts.map((part, index) => (part && !/^\s+$/.test(part) ? <span key={index} className="inline-block max-w-full [overflow-wrap:anywhere]">{part}{index === last ? tail : null}</span> : part))}</span>;
}

const DOT_SEPARATOR = " · ";

/**
 * A line of «name · date · sum» (the subtitle of a window): every piece is ONE box that goes to the next line whole (cut between its words only when it is wider than the line).  The dot stays at the END
 * of its piece (a non-breaking space joins them) - a line never begins with «·» - and it is HIDDEN when the next piece has wrapped below it - a line never ENDS with «·» either (Money-2 fix 5, п.2).
 * The text, copying and search are the same (the only added character is the non-breaking space before the dot).  A text without « · » is just `Words`.
 */
export function DotSeparated({ text }: { text: string }): ReactNode {
  const parts = text.split(DOT_SEPARATOR);
  const box = useRef<HTMLSpanElement | null>(null);
  useBeforePaint(() => {
    const root = box.current;
    if (!root || parts.length < 2) return;
    const settle = () => {
      const pieces = root.querySelectorAll<HTMLElement>("[data-dot-piece]");
      root.querySelectorAll<HTMLElement>("[data-dot]").forEach((dot, index) => {
        const next = pieces[index + 1];
        const wrapped = next !== undefined && next.getBoundingClientRect().top >= dot.getBoundingClientRect().bottom - 1;
        dot.style.visibility = wrapped ? "hidden" : "";
      });
    };
    settle();
    if (typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(settle);
    watch.observe(root.parentElement ?? root);
    return () => watch.disconnect();
  }, [text]);
  return <span ref={box}>{parts.map((part, index) => (
    <Fragment key={index}>
      {index > 0 && " "}
      <span data-dot-piece="" className="inline-block max-w-full"><Words text={part} tail={index < parts.length - 1 ? <span data-dot="">{"\u00a0·"}</span> : undefined} /></span>
    </Fragment>
  ))}</span>;
}
