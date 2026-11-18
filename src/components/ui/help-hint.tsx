"use client";

import type { ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { Hint } from "@/components/ui/hint";

/**
 * Money-2 fix 10: the «?» that holds an explanation instead of a line of text on the screen - the one `Hint` of the statement summary (hover / focus on a desktop, a tap on a phone, Esc or a press elsewhere
 * closes, `aria-describedby` reads the text).  A long text (the server's sentences) scrolls INSIDE the bubble.
 */
export function HelpHint({ text, className = "", width = 300, testId, content }: { text: string; className?: string; width?: number; testId?: string; content?: ReactNode }) {
  return (
    <span data-testid={testId} className="inline-flex shrink-0 align-middle">
      <Hint text={text} content={content} label="Пояснение" scrollable width={width} className={`inline-flex -my-1 min-h-6 min-w-6 items-center justify-center text-slate-500 hover:text-slate-800 max-sm:-my-3 max-sm:min-h-10 max-sm:min-w-10 ${className}`}>
        <HelpCircle className="h-4 w-4" aria-hidden="true" />
      </Hint>
    </span>
  );
}
