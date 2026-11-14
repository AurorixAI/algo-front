"use client";

import { AlertTriangle } from "lucide-react";
import {
  effectsFailureText,
  type EffectsVariant,
  EFFECTS_LOADING_TEXT,
  EFFECTS_NONE_TEXT,
  EFFECTS_RETRY_LABEL,
  EFFECTS_TITLE,
  effectLines,
  effectsEmpty,
  type EffectLine,
  type EffectTable,
  type MoneyEffects,
} from "@/lib/money-effects";
import { formatMoney, formatSignedMoney } from "@/lib/money-format";
import { periodClosedOf, type ClosedPurpose } from "@/lib/closed-period";
import { refusedInWords, type EffectsPreview } from "@/lib/money-preview";
import { PeriodClosedNotice } from "./period-closed-notice";
import { carriedRows } from "@/lib/dry-run";
import { tidyMoneyText } from "@/lib/money-format";
import { Button } from "@/components/ui/button";

const NUM = "whitespace-nowrap text-right tabular-nums";
const deltaClass = (delta: number | null) => (delta !== null && delta > 0 ? "text-emerald-700" : "text-slate-600");

/**
 * The pay of the teachers of a month (owner 06.11, UX pack §5.3).  ONE teacher: «Было / Станет +Δ» - a line - «Уже выплачено / Останется выплатить», numbers on the right.  Several teachers: a mini-table
 * «Преподаватель · Было · Станет · ±» and the payouts under it, a line per teacher.
 */
function PayrollTable({ table }: { table: EffectTable }) {
  const single = !table.multi && table.rows.length === 1 ? table.rows[0] : null;
  if (single) {
    const known = single.before !== null && single.after !== null;
    return (
      <div data-testid="effect-table" className="mt-1.5 space-y-1.5 text-sm">
        <dl className="space-y-0.5">
          {known ? (
            <>
              <div className="flex items-baseline justify-between gap-3"><dt className="text-slate-600">Было</dt><dd className={NUM} data-testid="effect-before">{formatMoney(single.before as number)}</dd></div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="font-semibold text-slate-900">Станет</dt>
                <dd className={`${NUM} font-semibold text-slate-900`} data-testid="effect-after">
                  {single.delta !== null && single.delta !== 0 && <span className={`mr-2 text-xs font-medium ${deltaClass(single.delta)}`} data-testid="effect-delta">{formatSignedMoney(single.delta)}</span>}{" "}
                  {formatMoney(single.after as number)}
                </dd>
              </div>
            </>
          ) : (
            single.delta !== null && <div className="flex items-baseline justify-between gap-3"><dt className="text-slate-600">Изменится на</dt><dd className={`${NUM} font-semibold`} data-testid="effect-delta">{formatSignedMoney(single.delta)}</dd></div>
          )}
        </dl>
        {single.paid && (
          <dl className="space-y-0.5 border-t border-slate-200 pt-1.5" data-testid="effect-paid">
            <div className="flex items-baseline justify-between gap-3"><dt className="text-slate-500">Уже выплачено</dt><dd className={`${NUM} text-slate-600`}>{formatMoney(single.paid.paid)}</dd></div>
            <div className="flex items-baseline justify-between gap-3"><dt className="font-semibold text-slate-900">{single.paid.leftLabel}</dt><dd className={`${NUM} font-semibold text-slate-900`}>{formatMoney(single.paid.left)}</dd></div>
          </dl>
        )}
      </div>
    );
  }
  const paidRows = table.rows.filter((row) => row.paid);
  return (
    <div data-testid="effect-table" className="mt-1.5 space-y-1.5 text-sm">
      {/* a phone has no room for four columns: a teacher is a name over «Было / Станет +Δ» */}
      <ul className="space-y-1.5 sm:hidden" data-testid="effect-table-phone">
        {table.rows.map((row) => (
          <li key={row.name}>
            <p className="font-medium text-slate-900">{row.name}</p>
            <dl className="space-y-0.5 tabular-nums">
              <div className="flex items-baseline justify-between gap-3"><dt className="text-slate-600">Было</dt><dd className={NUM}>{row.before === null ? "—" : formatMoney(row.before)}</dd></div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="font-semibold text-slate-900">Станет</dt>
                <dd className={`${NUM} font-semibold text-slate-900`}>
                  {row.delta !== null && row.delta !== 0 && <span className={`mr-2 text-xs font-medium ${deltaClass(row.delta)}`}>{formatSignedMoney(row.delta)}</span>}{" "}
                  {row.after === null ? "—" : formatMoney(row.after)}
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
      <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-baseline gap-x-3 gap-y-0.5 tabular-nums" role="table" aria-label={table.title}>
        <div role="row" className="contents text-xs text-slate-500">
          <span role="columnheader">Преподаватель</span><span role="columnheader" className="text-right">Было</span><span role="columnheader" className="text-right">Станет</span><span role="columnheader" className="text-right">±</span>
        </div>
        {table.rows.map((row) => (
          <div role="row" key={row.name} className="contents">
            <span role="cell" className="min-w-0 break-words">{row.name}</span>
            <span role="cell" className={`${NUM} text-slate-600`}>{row.before === null ? "—" : formatMoney(row.before)}</span>
            <span role="cell" className={`${NUM} font-semibold`}>{row.after === null ? "—" : formatMoney(row.after)}</span>
            <span role="cell" className={`${NUM} ${deltaClass(row.delta)}`}>{row.delta === null ? "—" : formatSignedMoney(row.delta)}</span>
          </div>
        ))}
      </div>
      {paidRows.length > 0 && (
        <ul className="space-y-0.5 border-t border-slate-200 pt-1.5 text-slate-600" data-testid="effect-paid">
          {paidRows.map((row) => (
            <li key={row.name} className="tabular-nums">
              {row.name}: уже выплачено {formatMoney(row.paid!.paid)} · <span className="font-semibold text-slate-900">{row.paid!.leftLabel.toLowerCase()} {formatMoney(row.paid!.left)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The pay of the teachers of ONE month as the window draws it: the title and the table (the owner) or the sentence (an administrator).  For a window that draws the lines itself («Урока не было»). */
export function PayrollEffect({ line }: { line: EffectLine }) {
  return (
    <div className="text-sm text-slate-800" data-testid="payroll-effect">
      <p className={line.table ? "font-semibold text-slate-900" : undefined}>{tidyMoneyText(line.table ? line.table.title : line.text)}</p>
      {line.table && <PayrollTable table={line.table} />}
      {line.note && <p className="mt-1 font-medium text-amber-900">{line.note}</p>}
    </div>
  );
}

/**
 * The lines of money of an action (the same ones the toast carries).  The pay of the teachers is a heading, a line per teacher and - only when something has to be done - a sentence of what
 * (an amber one, UX round of the owner 05.11); everything else is information.
 */
export function EffectLines({ effects, withPaid = false, teacherName = null }: { effects: MoneyEffects; withPaid?: boolean; teacherName?: string | null }) {
  return (
    <ul className="space-y-1.5">
      {effectLines(effects, { withPaid, teacherName }).map((line) => (
        <li key={line.key} data-testid="effect-line" className="text-sm text-slate-800">
          <p className={line.tone === "warn" && !line.note ? "font-medium text-amber-900" : line.table ? "font-semibold text-slate-900" : undefined}>{tidyMoneyText(line.table ? line.table.title : line.text)}</p>
          {line.table && <PayrollTable table={line.table} />}
          {!line.table && line.rows && line.rows.length > 0 && (
            <ul className="mt-1 space-y-0.5" data-testid="effect-rows">
              {line.rows.map((row) => (
                <li key={row.name} className="flex flex-wrap items-baseline justify-between gap-x-3 tabular-nums">
                  <span className="min-w-0">{tidyMoneyText(row.name)}</span>
                  <span className="flex items-baseline gap-x-3 whitespace-nowrap">
                    {row.change && <span className="text-slate-600">{tidyMoneyText(row.change)}</span>}
                    {row.delta && <span className="font-semibold">{tidyMoneyText(row.delta)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {!line.table && !line.rows && line.items && line.items.length > 0 && (
            <ul className="mt-0.5 space-y-0.5 pl-3">
              {line.items.map((item) => <li key={item} className="tabular-nums">{item}</li>)}
            </ul>
          )}
          {!line.table && line.after && line.after.length > 0 && (
            <ul className="mt-1 space-y-0.5" data-testid="effect-paid">
              {line.after.map((text) => <li key={text} className="tabular-nums text-slate-700">{text}</li>)}
            </ul>
          )}
          {line.note && <p className="mt-1 font-medium text-amber-900" data-testid="effect-note">{line.note}</p>}
        </li>
      ))}
    </ul>
  );
}

/** The grey bars that stand where the lines of the block will be: the same size and colour as the block itself, so nothing jumps when the answer comes (UX pack, rule 1). */
function EffectsSkeleton() {
  return (
    <div role="status" aria-label={EFFECTS_LOADING_TEXT} data-testid="money-effects-skeleton" className="space-y-1.5" aria-busy="true">
      <span className="sr-only">{EFFECTS_LOADING_TEXT}</span>
      <div className="h-3.5 w-3/4 animate-pulse rounded bg-slate-200" />
      <div className="h-3.5 w-1/2 animate-pulse rounded bg-slate-200" />
    </div>
  );
}

/**
 * «Что изменится» in a window of confirmation (I-5, UX pack rule 1): the packs of the students and the pay of the teachers the action touches - the answer of the server to a dry run.
 *  - ONE title for every window; NEUTRAL colour; amber only when the person has to do a step after the action (a closed month: «сохраните новую сумму»); never red inside the block;
 *  - nothing changes: ONE grey line «Деньги не изменятся» and no block;
 *  - while it is asked: a skeleton of the same size and colour; a failure says so in amber and offers «Повторить» (the button of the window waits for the answer: `effectsAllowConfirm`);
 *  - a refusal «месяц закрыт» is NOT a part of the block: it is its own amber block (`PeriodClosedNotice`) with «Переоткрыть месяц», after which the dry run is asked again;
 *  - `variant="quiet"` (a transfer of a student: the window has its own part about the student's money): when nothing moves for the teachers it says NOTHING (no «Деньги не изменятся»).
 *  - A payment, a write-off and a refund do not draw it (UX pack §5.1-тер, owner 05.11: about the student only); the cancel and the correction of a payment do since Money-1 Г - with `serverText`, the sentence of the server about the debt in another group and the pay of the teachers.
 */
export function MoneyEffectsBlock({
  preview, onRetry, aboveLessonPanel = false, variant = "lesson", noneText, className = "", closedPurpose, withPaid = false, teacherName = null, serverText = false, bare = false,
}: {
  preview: EffectsPreview;
  onRetry: () => void;
  aboveLessonPanel?: boolean;
  variant?: EffectsVariant;
  /** What «nothing moves» says when the action has a sense of its own (a decision «Включить в зарплату» in a month without a saved sheet), instead of the common line. */
  noneText?: string;
  className?: string;
  closedPurpose?: ClosedPurpose;
  /** A decision about the pay of a lesson also says what is paid already («Уже выплачено … — до новой суммы останется …», owner only). */
  withPaid?: boolean;
  /** The teacher the window is about (a decision about his lesson): an administrator without the right of money reads «Изменится зарплата Эргашева К. за ноябрь · суммы видит владелец». */
  teacherName?: string | null;
  /** Money-1 Г (Г-4, Р-2, Р-3): the block is the server's own sentence (`money_effects.text`: a debt in another group, the pay of the teachers), one row per part; no consequences - no block at all. */
  serverText?: boolean;
  /** No frame and no title of its own: the window already has a block «Что изменится» (a correction of a payment: the plan of the student) - the server's rows go inside it, ONE title per window. */
  bare?: boolean;
}) {
  const closed = preview.status === "failed" ? periodClosedOf(preview.error) : null;
  if (closed) return <PeriodClosedNotice info={closed} aboveLessonPanel={aboveLessonPanel} onReopened={onRetry} purpose={closedPurpose} className={className} />;
  const lines = preview.status === "ready" && preview.effects !== null && !serverText ? effectLines(preview.effects, { withPaid, teacherName }) : [];
  const none = preview.status === "ready" && preview.effects !== null && (serverText ? preview.effects.text === "" : effectsEmpty(preview.effects) || lines.length === 0);
  const warn = lines.some((line) => line.tone === "warn");
  const failed = preview.status === "failed";
  const idle = preview.status === "idle" || (preview.status === "ready" && preview.effects === null);   // the server sent no block: nothing is claimed about the money
  if (idle) return null;
  if (none) {
    if ((variant === "quiet" || serverText) && !noneText) return null;
    const text = noneText ?? EFFECTS_NONE_TEXT;
    return <p data-testid="money-effects-none" data-state="ready" className={`text-sm text-slate-600 ${className}`}>{text}</p>;
  }
  const amber = warn || failed;
  const body = (
    <>
      {preview.status === "loading" && <EffectsSkeleton />}
      {failed && (
        <div role="alert" className="space-y-1.5">
          <p className="text-sm font-medium text-amber-900">{effectsFailureText(preview.error)}</p>
          {!refusedInWords(preview.error) && <Button type="button" data-testid="money-effects-retry" onClick={onRetry} variant="secondary" size="sm">{EFFECTS_RETRY_LABEL}</Button>}
        </div>
      )}
      {preview.status === "ready" && preview.effects !== null && (serverText
        ? <ul className="space-y-1.5">{carriedRows(preview.effects.text).map((row) => <li key={row} data-testid="effects-text-row" className="text-sm text-slate-800">{row}</li>)}</ul>
        : <EffectLines effects={preview.effects} withPaid={withPaid} teacherName={teacherName} />)}
    </>
  );
  if (bare) return <div data-testid="money-effects" data-state={preview.status} className={`space-y-2 ${className}`}>{body}</div>;
  const tone = amber ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50";
  return (
    <section aria-label={EFFECTS_TITLE} data-testid="money-effects" data-state={preview.status} className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${tone} ${className}`}>
      {amber && <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-xs font-semibold text-slate-600">{EFFECTS_TITLE}</p>
        {body}
      </div>
    </section>
  );
}
