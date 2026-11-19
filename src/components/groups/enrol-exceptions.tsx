"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { tidyMoneyText } from "@/lib/money-format";
import { pastBalanceNote, type PastBalance } from "@/lib/past-balances";
import { statementHref } from "@/lib/payments";
import type { LeaveUndo } from "@/lib/transfer-effects";

const DOT: Record<"warn" | "muted" | "info", string> = { warn: "bg-warning-600", muted: "bg-slate-400", info: "bg-primary-600" };

/** One row of the special things: a coloured dot (amber - somebody has to know, grey - for information, blue - a choice), the text, and an action at the right edge («Выписка», «Задать цену»). */
export function ExceptionRow({ tone, children, aside, testId }: { tone: "warn" | "muted" | "info"; children: ReactNode; aside?: ReactNode; testId?: string }) {
  return (
    <div data-testid={testId} data-row-tone={tone} className="grid grid-cols-[8px_minmax(0,1fr)_auto] items-baseline gap-x-2.5 text-sm text-slate-800">
      <span aria-hidden="true" className={`h-2 w-2 -translate-y-px rounded-full ${DOT[tone]}`} />
      <div className="min-w-0 [overflow-wrap:anywhere]">{children}</div>
      {aside ? <div className="shrink-0">{aside}</div> : <span />}
    </div>
  );
}

/** The special things of the chosen students, one row each, ONLY when there are any: a frame-less block with a divider above (no rows - nothing is drawn). */
export function EnrolExceptions({ children }: { children: ReactNode }) {
  return <section aria-label="Особое" data-testid="enrol-exceptions" className="grid gap-3 border-t border-slate-100 px-5 py-3 empty:hidden max-sm:px-4">{children}</section>;
}

/** What the server says about ONE student before the write: the balance of the last time, a leaving that is not cancelled («записывается заново»), a leaving that is («вернётся как был»). */
export interface EnrolNote {
  id: string;
  /** null: the window is about one student and his name is in its title */
  name: string | null;
  past: PastBalance[];
  /** comes back in the ordinary way: the server's words are shown under «записывается заново» */
  rewrite: LeaveUndo | null;
  /** comes back as he was (the server's words) */
  undone: LeaveUndo | null;
  /** a common price or day is entered and does not apply to a student who comes back as he was */
  sharedUndone?: boolean;
}

const Who = ({ name }: { name: string | null }) => (name ? <><b className="font-semibold text-slate-900">{name}</b>{" — "}</> : null);

export function EnrolNoteRows({ note, paymentsBase }: { note: EnrolNote; paymentsBase: string | null }) {
  return (
    <>
      {note.past.map((row) => (
        <ExceptionRow
          key={row.key}
          tone="warn"
          testId="enrol-note-past"
          aside={paymentsBase ? <Link href={statementHref(paymentsBase, row.membershipId)} data-testid="past-balance-link" className="inline-flex min-h-8 items-center text-sm font-semibold text-primary-700 hover:underline max-sm:min-h-10">Выписка</Link> : undefined}
        >
          <Who name={note.name} /><span className="text-warning-800">{tidyMoneyText(pastBalanceNote(row))}</span>
        </ExceptionRow>
      ))}
      {note.rewrite && (
        <ExceptionRow tone="muted" testId="enrol-note-rewrite">
          <Who name={note.name} /><span data-testid="leave-undo-line">{note.name ? "записывается заново" : "Записывается заново"}</span>
          <span className="mt-0.5 block text-xs text-slate-600" data-testid="leave-undo-text">{tidyMoneyText(note.rewrite.text)}</span>
        </ExceptionRow>
      )}
      {note.undone && (
        <ExceptionRow tone="muted" testId="enrol-note-undone">
          <Who name={note.name} /><span data-testid="leave-undo-text">{tidyMoneyText(note.undone.text)}</span>
          {note.sharedUndone && <span className="mt-0.5 block text-xs text-slate-600" data-testid="enrol-note-shared">Общие цена и дата на него не действуют — остаются прежние</span>}
        </ExceptionRow>
      )}
    </>
  );
}
