"use client";

import {
  OVERRIDES_NOTE_PRICE,
  OVERRIDES_NOTE_REGIME,
  OVERRIDES_TITLE,
  overrideLine,
  overrideMoreText,
  whatIfAsOfText,
  whatIfMoreText,
  whatIfStudents,
  whatIfTotals,
  type RowTone,
  type WhatIfWindow,
} from "@/lib/whatif";
import { tidyMoneyText } from "@/lib/money-format";

/**
 * «Деньги-1 / Б», Б3 - the body of the window «Что изменится» of a change of a price / of the billing mode / of the day of the shared month: the sentence of the server over the list, then EVERY
 * student the change moves as a small table «было → станет» (сум, уроки, даты; the next period too), the students with an individual price apart, the totals last.
 *
 * Numbers go to the right edge and are `tabular-nums` (DESIGN_SYSTEM_AUDIT, decision 1).  From 640 px a row is four columns (what / was / will be / the difference); on a phone it is a card:
 * the name of the number and the difference on the first line, «было → станет» under it.  Colour is meaning: the amber/rose only for what is WORSE for the student, never a whole block.
 * The block draws NO title: the title «Что изменится» belongs to the window (UX pack, rule 1).
 */
const TONE: Record<RowTone, string> = { worse: "text-rose-700", better: "text-emerald-700", plain: "text-slate-600" };

export function WhatIfBody({ window, testId = "whatif" }: { window: WhatIfWindow | null; testId?: string }) {
  if (!window) return null;
  const students = whatIfStudents(window);
  const totals = whatIfTotals(window);
  const more = whatIfMoreText(window);
  const asOf = whatIfAsOfText(window);
  const overrideMore = overrideMoreText(window);
  if (students.length === 0 && window.overrides.length === 0) {
    return <p className="text-slate-600" data-testid={`${testId}-none`}>{window.text || "Деньги учеников не изменятся"}</p>;
  }
  return (
    <div className="space-y-3 text-[13px] leading-5" data-testid={testId}>
      {window.text && <p className="font-medium text-slate-800" data-testid={`${testId}-summary`}>{window.text}</p>}
      {asOf && <p className="text-slate-600" data-testid={`${testId}-asof`}>{asOf}</p>}
      {students.length > 0 && (
        <div data-testid={`${testId}-students`}>
          {/* the column titles: a table head on a wide screen, nothing on a phone (each number there carries its own caption) */}
          <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_6.75rem_6.75rem_6rem] gap-x-3 border-b border-slate-200 pb-1 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:grid">
            <span className="text-left">Ученик</span>
            <span>Было</span>
            <span>Станет</span>
            <span>Разница</span>
          </div>
          <ul className="max-h-[46vh] divide-y divide-slate-200 overflow-y-auto overscroll-contain sm:max-h-72" aria-label="У кого изменятся деньги">
            {students.map((student) => (
              <li key={student.id || student.name} className="py-2" data-testid="whatif-student">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3 font-semibold text-slate-900">
                  <span className="min-w-0 break-words">{student.name}</span>
                  {student.when && <span className="text-xs font-normal text-slate-500">{student.when}</span>}
                </p>
                <ul className="mt-1 space-y-1.5 sm:space-y-0.5">
                  {student.rows.map((row) => (
                    <li
                      key={row.key}
                      data-testid="whatif-row"
                      data-row={row.key}
                      data-tone={row.tone}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 tabular-nums sm:grid-cols-[minmax(0,1fr)_6.75rem_6.75rem_6rem]"
                    >
                      <span className="min-w-0 break-words text-slate-700">{row.label}</span>
                      <span className={`col-start-2 row-start-1 text-right font-medium sm:col-start-4 ${TONE[row.tone]}`} data-col="delta">{row.delta ?? ""}</span>
                      <span className="col-span-2 flex flex-wrap items-baseline justify-end gap-x-1.5 text-right text-slate-900 sm:contents">
                        <span className="text-right text-slate-600 sm:col-start-2 sm:row-start-1" data-col="before">
                          <span className="mr-1 text-[11px] uppercase tracking-wide text-slate-500 sm:hidden">было</span>{tidyMoneyText(row.before)}
                        </span>
                        <span aria-hidden="true" className="text-slate-400 sm:hidden">→</span>
                        <span className="text-right font-semibold sm:col-start-3 sm:row-start-1" data-col="after">
                          <span className="mr-1 text-[11px] font-normal uppercase tracking-wide text-slate-500 sm:hidden">станет</span>{tidyMoneyText(row.after)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {more && <p className="mt-1 text-slate-500" data-testid={`${testId}-more`}>{more}</p>}
        </div>
      )}
      {totals.length > 0 && (
        <dl className="space-y-0.5 border-t border-slate-200 pt-2" data-testid={`${testId}-totals`}>
          {totals.map((total) => (
            <div key={total.key} className="flex flex-wrap items-baseline justify-between gap-x-3 tabular-nums" data-total={total.key}>
              <dt className="min-w-0 text-slate-600">{total.label}</dt>
              <dd className="whitespace-nowrap text-right font-semibold text-slate-900">{total.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {window.overrides.length > 0 && (
        <div className="space-y-1 rounded-lg bg-slate-100 px-3 py-2" data-testid={`${testId}-overrides`}>
          <p className="font-semibold text-slate-800">{OVERRIDES_TITLE}</p>
          <p className="text-slate-600">{window.kind === "price" ? OVERRIDES_NOTE_PRICE : OVERRIDES_NOTE_REGIME}</p>
          <ul className="max-h-28 space-y-0.5 overflow-y-auto text-slate-700">
            {window.overrides.map((student) => <li key={student.membership_id || student.student_name} data-testid="whatif-override" className="break-words">{overrideLine(student, window.kind)}</li>)}
          </ul>
          {overrideMore && <p className="text-slate-500" data-testid={`${testId}-override-more`}>{overrideMore}</p>}
        </div>
      )}
    </div>
  );
}
