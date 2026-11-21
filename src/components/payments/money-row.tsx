"use client";

import Link from "next/link";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { Words } from "@/components/ui/words";
import type { ChipTone } from "@/lib/chip-tone";

/**
 * PAY-TAILS Б2.8: THE compact row of a list of money on a PHONE (< 640) - one component for the tabs of «Оплаты» and for the «Оплаты» of a group (frames 20-23):
 *  line 1 - the name (one line, an ellipsis) and the label of the sum (does not shrink);
 *  line 2 - «group · the sub-line of the state» (one line, an ellipsis) and the action, a 40 px button (does not shrink);
 *  line 3 (small) - only for the second sum («и к оплате 231 000 до 24.11»).
 * A press on the row opens the statement; the action does not (`stopPropagation`); the row has no «⋯».  Every word is the server's.
 * The row is ONE link stretched over the card and the button lifted over it, so the keyboard reaches each once and Enter / Space fire the button ONCE.
 */
export function MoneyRow({ name, statementHref, onOpenStatement, label, tone, sub, group, second, action, testId = "money-row" }: {
  name: string;
  /** Where the press on the row leads (the statement of the membership). */
  statementHref: string;
  onOpenStatement?: () => void;
  /** The label of the sum (the server's `state_text` / `debt_text` / `due_text`); null - the server said nothing. */
  label: string | null;
  tone: ChipTone;
  /** The server's sub-line of the state («просрочено 45 дней», «ушёл 28.10»): it does not shrink. */
  sub?: string | null;
  /** The group: only its name is cut by an ellipsis («просрочено 45 дней · Математика 7»); the group's own tab has none. */
  group?: string | null;
  second?: string | null;
  /** The action of the row by its state; null - the statement only. */
  action: { label: string; ariaLabel: string; onClick: () => void; testId?: string } | null;
  testId?: string;
}) {
  return (
    <li data-testid={testId} className="relative min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2">
      <Link
        href={statementHref}
        onClick={onOpenStatement}
        aria-label={`Выписка: ${name}`}
        data-testid="money-row-statement"
        className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      />
      <div className="pointer-events-none relative flex min-w-0 items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-semibold text-slate-900" data-testid="money-row-name"><Words text={name} /></p>
        {label && <Chip tone={tone} className="shrink-0" testId="pay-label">{label}</Chip>}
      </div>
      <div className="pointer-events-none relative mt-0.5 flex min-h-10 min-w-0 items-center justify-between gap-3">
        <p className="flex min-w-0 flex-1 text-sm text-slate-500" data-testid="money-row-line">
          {sub && <span className="max-w-full shrink-0 truncate">{sub}</span>}
          {group && <span className="min-w-0 truncate whitespace-pre">{sub ? " · " : ""}{group}</span>}
        </p>
        {action && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-label={action.ariaLabel}
            data-testid={action.testId ?? "money-row-action"}
            className="pointer-events-auto relative z-10 shrink-0"
            onClick={(event) => { event.stopPropagation(); action.onClick(); }}
          >
            {action.label}
          </Button>
        )}
      </div>
      {second && <p className="pointer-events-none relative -mt-0.5 pb-0.5 text-xs text-slate-500" data-testid="pay-second">{second}</p>}
    </li>
  );
}
