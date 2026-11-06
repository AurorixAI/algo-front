import type { ReactNode } from "react";
import { chipClass, type ChipSize, type ChipTone } from "@/lib/chip-tone";

/**
 * IA audit F14: THE chip - a status, a tag, a count in a row.  One border, one palette (`ChipTone`), two sizes, two shapes; the classes were
 * typed by hand in about seventy places.  Pure markup (no hooks), so a server render and node:test show it as it is.
 */
export function Chip({ tone = "neutral", size = "md", pill = false, title, testId, className = "", children }: {
  tone?: ChipTone;
  size?: ChipSize;
  /** A rounded pill instead of a rounded rectangle. */
  pill?: boolean;
  title?: string;
  testId?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={`${chipClass({ tone, size, pill })}${className ? ` ${className}` : ""}`} title={title} data-testid={testId}>
      {children}
    </span>
  );
}

/**
 * A STATUS - something that changes («Оплачено», «Месяц открыт», «Долг 400 000 сум»): a pill, one line, an optional dot.  One tone per chip; the number goes AFTER the word.
 * `warn` only when somebody has to act; `ok` only for «сделано»; «открыт / закрыт / активна / запланирован» are `neutral` or `info`.
 */
export function StatusChip({ tone = "neutral", dot = false, title, testId, className = "", children }: {
  tone?: ChipTone;
  /** A coloured dot before the word. */
  dot?: boolean;
  title?: string;
  testId?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={`${chipClass({ tone, size: "md", pill: true })} whitespace-nowrap${className ? ` ${className}` : ""}`} title={title} data-testid={testId} data-kind="status" data-tone={tone}>
      {dot && <span aria-hidden="true" className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current align-middle" />}
      {children}
    </span>
  );
}

/** An ATTRIBUTE - what stays («7 класс», «Группа», «Замена»): a 6 px rectangle, neutral or violet, never a status colour. */
export function Tag({ tone = "neutral", title, testId, className = "", children }: {
  tone?: Extract<ChipTone, "neutral" | "violet">;
  title?: string;
  testId?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={`${chipClass({ tone, size: "md" })}${className ? ` ${className}` : ""}`} title={title} data-testid={testId} data-kind="tag" data-tone={tone}>
      {children}
    </span>
  );
}
