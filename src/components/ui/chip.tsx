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
