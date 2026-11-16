"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * «Подробнее» with a chevron: the short thing stays in view, the rest opens under it (native `<details>`: works with the keyboard and on a phone).  A click inside does not reach the parent
 * (a card that is selected by a tap must not be selected by opening its details).
 */
export function Disclosure({ children, label = "Подробнее", testId, className = "" }: { children: ReactNode; label?: string; testId?: string; className?: string }) {
  return (
    <details className={`group/disclosure ${className}`} data-testid={testId} onClick={(event) => event.stopPropagation()}>
      <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 text-xs font-medium text-primary-700 marker:hidden [&::-webkit-details-marker]:hidden">
        {label}
        <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 transition-transform group-open/disclosure:rotate-180" />
      </summary>
      <div className="pb-1 pt-0.5 text-xs leading-relaxed text-slate-600">{children}</div>
    </details>
  );
}
