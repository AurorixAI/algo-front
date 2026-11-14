import { Fragment, type ReactNode } from "react";

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

const DOT_SEPARATOR = " · ";

/**
 * A line of «name · date · sum» (the subtitle of a window): every piece is ONE box that goes to the next line whole (cut between its words only when it is wider than the line), and the dot stays at the END of the piece before it
 * (a non-breaking space joins them) - a line never begins with «·».  A text without « · » is just `Words`.  The text, copying and search are the same (the only added character is the non-breaking space before the dot).
 */
export function DotSeparated({ text }: { text: string }): ReactNode {
  const parts = text.split(DOT_SEPARATOR);
  return <span>{parts.map((part, index) => (
    <Fragment key={index}>
      {index > 0 && " "}
      <span className="inline-block max-w-full"><Words text={part} />{index < parts.length - 1 && "\u00a0·"}</span>
    </Fragment>
  ))}</span>;
}
