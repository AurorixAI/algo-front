"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { tidyMoneyText } from "@/lib/money-format";
import { serverPhraseShown } from "@/lib/enrol-labels";
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

/** One thing the server says about the student: the SHORT state (stands in the line of the name) and, muted and small under it, the server's detail. */
function Fact({ testId, name, first, tone, state, phrase, detail, aside }: { testId: string; name: string | null; first: boolean; tone?: "warn"; state?: ReactNode; phrase?: ReactNode; detail?: ReactNode; aside?: ReactNode }) {
  // the ONE rule: a thing with a short state stands in the line of the name; a thing that is a whole phrase of the server (no short state) - the name alone in bold and the phrase muted and small under it
  const alone = phrase !== undefined && name !== null;
  return (
    <div data-testid={testId} className={first ? undefined : "mt-1.5"}>
      {alone ? (first && <b className="block font-semibold text-slate-900">{name}</b>) : (
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0">{first && <Who name={name} />}<span className={tone === "warn" ? "text-warning-800" : undefined}>{state ?? phrase}</span></span>
          {aside}
        </div>
      )}
      {alone && <span className={MUTED_DETAIL}>{phrase}</span>}
      {detail}
    </div>
  );
}

const MUTED_DETAIL = "mt-0.5 block text-xs text-slate-600";

/**
 * ONE row per student for everything the server says about him before the write (Money-2 fix 11, F7): the name in bold with the short state in the same line, the server's detail muted and small under it, each further
 * thing on a line of its own under the first - never a second row with the same name.  Only the debt (and a refusal) is in the colour of a warning.  The facts: the balance of the last time, a leaving that is not
 * cancelled («записывается заново»), a leaving that is («возвращаем как было»).
 */
export function EnrolNoteRows({ note, paymentsBase }: { note: EnrolNote; paymentsBase: string | null }) {
  const facts: Array<Omit<Parameters<typeof Fact>[0], "name" | "first">> = [
    ...note.past.map((row) => ({
      testId: "enrol-note-past", tone: "warn" as const, state: serverPhraseShown(tidyMoneyText(pastBalanceNote(row))),
      aside: paymentsBase ? <Link href={statementHref(paymentsBase, row.membershipId)} data-testid="past-balance-link" className="inline-flex min-h-8 shrink-0 items-center text-sm font-semibold text-primary-700 hover:underline max-sm:min-h-10">Выписка</Link> : undefined,
    })),
    ...(note.rewrite ? [{
      testId: "enrol-note-rewrite", state: <span data-testid="leave-undo-line">{note.name && note.past.length === 0 ? "записывается заново" : "Записывается заново"}</span>,
      detail: <span className={MUTED_DETAIL} data-testid="leave-undo-text">{serverPhraseShown(tidyMoneyText(note.rewrite.text))}</span>,
    }] : []),
    ...(note.undone ? [{
      testId: "enrol-note-undone", phrase: <span data-testid="leave-undo-text">{serverPhraseShown(tidyMoneyText(note.undone.text))}</span>,
      detail: note.sharedUndone ? <span className={MUTED_DETAIL} data-testid="enrol-note-shared">Общие цена и дата на него не действуют — остаются прежние</span> : undefined,
    }] : []),
  ];
  if (facts.length === 0) return null;
  return (
    <ExceptionRow tone={note.past.length > 0 ? "warn" : "muted"} testId="enrol-student-row">
      {facts.map((fact, index) => <Fact key={`${fact.testId}-${index}`} name={note.name} first={index === 0} {...fact} />)}
    </ExceptionRow>
  );
}

/** A student the server will NOT write (the probe says so before the button: a full group, a day before his last stay...): his name, «не будет записан» in the colour of a warning and the server's reason muted under it. */
export function EnrolRefusedRow({ id, name, reason }: { id: string; name: string; reason: string }) {
  return (
    <ExceptionRow tone="warn" testId={`enrol-refused-${id}`}>
      <b className="font-semibold text-slate-900">{name}</b>{" — "}<span className="text-warning-800">не будет записан</span>
      {reason && <span className={MUTED_DETAIL} data-testid="enrol-refused-reason">{serverPhraseShown(reason)}</span>}
    </ExceptionRow>
  );
}

/** Nobody chosen will be written, all for the same reason (a full group): ONE line instead of a row per student. */
export function EnrolRefusedAllRow({ reason }: { reason: string }) {
  return (
    <ExceptionRow tone="warn" testId="enrol-refused-all">
      <span className="font-semibold text-warning-800">Никто не будет записан</span>
      {reason && <span className={MUTED_DETAIL} data-testid="enrol-refused-reason">{serverPhraseShown(reason)}</span>}
    </ExceptionRow>
  );
}
