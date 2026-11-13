import type { ReactNode } from "react";

/**
 * Names (a group «Алгебра 7 (вт/пт)», «7-А», a full name) wrap BETWEEN words only: after a «/» or a «-» inside a word the browser may break the line, and «вт/ пт» reads as two things.
 * Every word is one unbreakable box (it is cut inside only when it is wider than the whole line); the spaces stay ordinary spaces and no character is added, so the text, copying and search are the same.
 * The words live in ONE inline box of their own: a parent that is a flex container (a cell of a card on a phone) sees one item, not the words - otherwise the spaces between the boxes vanish
 * («Математика6Б»).  Self-contained: no parent needs a `gap`.
 */
export function Words({ text }: { text: string }): ReactNode {
  const parts = text.split(/(\s+)/);
  return <span>{parts.map((part, index) => (part && !/^\s+$/.test(part) ? <span key={index} className="inline-block max-w-full [overflow-wrap:anywhere]">{part}</span> : part))}</span>;
}
