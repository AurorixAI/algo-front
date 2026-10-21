"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, HelpCircle, History, Loader2, RefreshCw, Save, Undo2, Wallet } from "lucide-react";
import { formatUtcNaiveAsBusinessDateTime } from "@/lib/business-time";
import { formatMoney } from "@/lib/payments";
import { barFitsAbovePin } from "@/lib/save-bar";
import { Hint } from "@/components/ui/hint";
import {
  FORBIDDEN_TEXT,
  NOTE_MAX_LENGTH,
  STATUS_CHIP_CLASS,
  diffReasons,
  formatSignedMoney,
  lessonTypeLabel,
  percentShort,
  teacherRateHref,
  versionLabel,
  type PayrollDiff,
  type PayrollDiffLine,
  type PayrollRevision,
  type SheetStatusView,
  type WarningView,
} from "@/lib/payroll";

/**
 * «Печать» with the dates: the date grids are folded on screen («По датам»), but a printed sheet is the proof of its sums, so
 * every group opens for the print and folds back when the print dialog is gone.
 */
export function usePrintWithDates(): { printing: boolean; print: () => void } {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    if (!printing) return undefined;
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    const timer = window.setTimeout(() => window.print(), 80);
    return () => {
      window.removeEventListener("afterprint", done);
      window.clearTimeout(timer);
    };
  }, [printing]);
  return { printing, print: () => { if (printing) window.print(); else setPrinting(true); } };
}

/**
 * One chip: «Не рассчитано» / «Сохранено 16.10» / «Есть изменения».  With `hint` (see `statusHint`) the chip is a
 * label of a short explanation: it opens on hover, focus and a tap.
 */
export function StatusChip({ status, hint }: { status: SheetStatusView; hint?: string }) {
  const chip = (
    <span className={`inline-flex max-w-full items-center gap-1 rounded-2xl border px-2.5 py-1 text-xs font-semibold ${STATUS_CHIP_CLASS[status.tone]}`}>
      <span className="min-w-0 break-words">{status.label}</span>
      {hint && <HelpCircle className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />}
    </span>
  );
  return hint ? <Hint text={hint} className="inline-block max-w-full">{chip}</Hint> : chip;
}

/**
 * The floating bar of unsaved «начислить» edits: the note of the version, «Отменить правки» and the save button.  It exists
 * only while there is something to save and sticks to the bottom of the screen, so a long sheet needs no scrolling back.
 */
export function SaveBar({
  dirty, problem, blockedReason = null, saving, note, onNote, onSave, onDiscard, hideUntilFits = false,
}: {
  /**
   * The bar lives in a section that can be far below the fold (the month page's preview): while it cannot float entirely
   * above the bottom bar it is not shown (it keeps its place in the layout), instead of sitting partly behind the bar.
   */
  hideUntilFits?: boolean;
  dirty: boolean;
  problem: string | null;
  /** A reason the sheet cannot be saved at all (it has no lines): the button is off and says why. */
  blockedReason?: string | null;
  saving: boolean;
  note: string;
  onNote: (text: string) => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const disabled = saving || Boolean(problem) || Boolean(blockedReason) || !dirty;
  const barRef = useRef<HTMLDivElement | null>(null);
  const [fits, setFits] = useState(true);
  useEffect(() => {
    const bar = barRef.current;
    if (!hideUntilFits || !dirty || !bar) {
      setFits(true);
      return undefined;
    }
    let frame = 0;
    const measure = () => {
      frame = 0;
      setFits(barFitsAbovePin({
        barBottom: bar.getBoundingClientRect().bottom,
        viewportHeight: window.innerHeight,
        pinOffset: parseFloat(getComputedStyle(bar).bottom) || 0,
      }));
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(measure); };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [hideUntilFits, dirty, problem]);
  if (!dirty) return null;
  return (
    <div
      ref={barRef}
      className={`${fits ? "" : "invisible "}sticky bottom-2 z-30 rounded-2xl border border-primary-200 bg-white px-4 py-3 shadow-lg max-md:bottom-[calc(4.5rem+env(safe-area-inset-bottom))] print:hidden`}
    >
      <p className="mb-2 text-xs text-slate-600">
        <span className="font-semibold text-slate-800">Есть несохранённые правки.</span>{" "}
        Суммы изменённых строк пересчитаны здесь по той же формуле и станут окончательными после сохранения.
      </p>
      {problem && <p role="alert" className="mb-2 text-xs font-medium text-rose-700">{problem}</p>}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
        <div className="min-w-0 flex-1 lg:min-w-[16rem]">
          <label htmlFor="payroll-note" className="mb-1 block text-xs font-medium text-slate-600">Примечание к версии (необязательно)</label>
          <input
            id="payroll-note"
            type="text"
            value={note}
            maxLength={NOTE_MAX_LENGTH}
            onChange={(event) => onNote(event.target.value)}
            placeholder="Например: начислили за пропущенную оплату"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onDiscard}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Undo2 className="h-4 w-4" />
            Отменить правки
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={disabled}
            title={blockedReason ?? undefined}
            className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Another user saved first (409): the sheet on screen is out of date. */
export function ConflictBanner({
  message, onReload, reloading, actionLabel = "Обновить",
}: {
  message: string;
  onReload: () => void;
  reloading: boolean;
  actionLabel?: string;
}) {
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-900 sm:flex-row sm:items-center sm:justify-between print:hidden">
      <p className="flex min-w-0 items-start gap-2 text-sm font-medium">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{message}</span>
      </p>
      <button
        type="button"
        onClick={onReload}
        disabled={reloading}
        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100 disabled:opacity-60"
      >
        <RefreshCw className={`h-4 w-4 ${reloading ? "animate-spin" : ""}`} />
        {actionLabel}
      </button>
    </div>
  );
}

/**
 * The server refused a calculation or a save: the teacher has no rate for a kind of lessons.  The rate is set in «Сотрудники»
 * (one place), so the notice says so in the server's words and leads there.
 */
export function RateRequiredNotice({ teacherId, message, month }: { teacherId: string; message: string; month?: string | null }) {
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 sm:flex-row sm:items-center sm:justify-between print:hidden">
      <p className="flex min-w-0 items-start gap-2 text-sm font-medium">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{message}</span>
      </p>
      <Link href={teacherRateHref(teacherId, month)} className="inline-flex shrink-0 items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-amber-900 ring-1 ring-amber-300 hover:bg-amber-100">
        Указать ставку
      </Link>
    </div>
  );
}

function change(before: number | null | undefined, after: number | null | undefined, format: (value: number) => string = String): string {
  const was = before ?? null;
  const now = after ?? null;
  if (was === null && now === null) return "—";
  if (was === now) return now === null ? "—" : format(now);
  return `${was === null ? "—" : format(was)} → ${now === null ? "—" : format(now)}`;
}

const STATUS_LABEL: Record<PayrollDiffLine["status"], string> = {
  changed: "",
  added: "новая строка",
  removed: "строки больше нет",
};

/**
 * «Что изменилось» of a sheet whose data moved: the reasons in words (the rate, a price taken from «Цены групп»), then the
 * lines.  Closed by default - the card above already says how much the total moves.
 */
export function DiffDetails({ diff }: { diff: PayrollDiff }) {
  const reasons = diffReasons(diff);
  // a line whose only change is the rate with no money moved (a student who has nothing counted) is noise: the reason above says it
  const moved = diff.lines.filter((line) => line.delta_amount !== 0 || line.status !== "changed");
  const lines = moved.length > 0 ? moved : diff.lines;
  if (reasons.length === 0 && lines.length === 0) return null;
  return (
    <details className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-sm text-amber-950 print:hidden">
      <summary className="cursor-pointer select-none font-medium">Что изменилось</summary>
      {reasons.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">
          {reasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      )}
      {lines.length > 0 && (
        <div className="mt-2 max-w-full overflow-x-auto">
          <table className="w-full min-w-[30rem] border-collapse text-xs">
            <thead>
              <tr className="border-b border-amber-200 text-xs text-amber-900/70">
                <th scope="col" className="py-1.5 pr-3 text-left font-semibold">Ученик</th>
                <th scope="col" className="px-3 py-1.5 text-center font-semibold">Засчитано</th>
                <th scope="col" className="px-3 py-1.5 text-center font-semibold">Без оплаты</th>
                <th scope="col" className="py-1.5 text-right font-semibold">Начислено</th>
              </tr>
            </thead>
            <tbody>
              {lines.slice(0, 100).map((line) => (
                <tr key={`${line.membership_id}-${line.status}`} className="border-b border-amber-100 last:border-b-0">
                  <th scope="row" className="py-1.5 pr-3 text-left font-medium">
                    {line.student_name ?? "Ученик"}
                    {line.group_name && <span className="block font-normal text-amber-900/70">{line.group_name}</span>}
                    {STATUS_LABEL[line.status] && <span className="block font-normal text-amber-900/70">{STATUS_LABEL[line.status]}</span>}
                    {line.changes.length > 0 && <span className="block font-normal text-amber-900/70">изменилось: {line.changes.join(", ")}</span>}
                  </th>
                  <td className="px-3 py-1.5 text-center tabular-nums">{change(line.saved?.counted, line.fresh?.counted)}</td>
                  <td className="px-3 py-1.5 text-center tabular-nums">{change(line.saved?.unpaid, line.fresh?.unpaid)}</td>
                  <td className="whitespace-nowrap py-1.5 text-right tabular-nums">
                    {change(line.saved?.amount, line.fresh?.amount, formatMoney)}
                    {line.delta_amount !== 0 && <span className="block text-amber-900/70">{formatSignedMoney(line.delta_amount)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {lines.length > 100 && <p className="mt-2 text-xs text-amber-900/70">…и ещё {lines.length - 100}</p>}
        </div>
      )}
    </details>
  );
}

/**
 * The warnings of a teacher's month or a sheet, in ONE line: only what is above 0, each one a link to where it is fixed (the
 * title says where), and one «?» at the end that says what they mean and what to do.
 */
export function WarningLinks({ views, label }: { views: WarningView[]; label: string }) {
  if (views.length === 0) return null;
  return (
    <ul aria-label={label} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 print:hidden">
      {views.map((view) => (
        <li key={view.key} className={`text-xs ${view.tone === "warning" ? "text-amber-800" : "text-slate-600"}`}>
          <Link href={view.href} title={`Перейти: ${view.target}`} className="font-medium underline decoration-dotted underline-offset-2 hover:underline">{view.text}</Link>
        </li>
      ))}
      <li className="text-xs text-slate-400">
        <Hint text={views.map((view) => `${view.text}\n${view.hint}`).join("\n\n")} className="inline-flex">
          <HelpCircle className="h-3.5 w-3.5" aria-label="Что это значит" />
        </Hint>
      </li>
    </ul>
  );
}

/** «История сохранений»: who saved which version and when, newest first. */
export function RevisionList({ revisions, currentRevision }: { revisions: PayrollRevision[]; currentRevision: number | null }) {
  if (revisions.length === 0) {
    return <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">Сохранений пока нет.</p>;
  }
  return (
    <ol aria-label="История сохранений" className="space-y-2.5">
      {revisions.map((revision, index) => {
        const previous = revisions[index + 1];
        const delta = previous ? revision.total_amount - previous.total_amount : null;
        const when = formatUtcNaiveAsBusinessDateTime(revision.changed_at);
        const percents = Object.entries(revision.percents ?? {});
        return (
          <li key={revision.revision} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                <History className="h-4 w-4 text-slate-400" />
                {versionLabel(revision.revision).replace(/^./, (c) => c.toUpperCase())}
                {revision.revision === currentRevision && (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">текущая</span>
                )}
              </p>
              <p className="text-sm font-semibold tabular-nums text-slate-900">
                {formatMoney(revision.total_amount)}
                {delta !== null && delta !== 0 && (
                  <span className={`ml-2 text-xs font-medium ${delta > 0 ? "text-emerald-700" : "text-rose-700"}`}>
                    {formatSignedMoney(delta)}
                  </span>
                )}
              </p>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {[when, revision.changed_by_name, `строк: ${revision.line_count}`].filter(Boolean).join(" · ")}
            </p>
            {percents.length > 0 && (
              <p className="mt-1 text-xs text-slate-600">
                Ставка: {percents.map(([type, value]) => `${lessonTypeLabel(type)} ${percentShort(value)}`).join(" · ")}
              </p>
            )}
            {revision.change_note && <p className="mt-1.5 break-words text-sm text-slate-700">{revision.change_note}</p>}
          </li>
        );
      })}
    </ol>
  );
}

/** The owner-only screens for anybody else (a 403 of the server): the same «Недостаточно прав» everywhere. */
export function PayrollForbidden() {
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-2 py-20 text-center">
      <Wallet className="h-7 w-7 text-slate-300" />
      <p className="text-sm font-semibold text-slate-800">Недостаточно прав</p>
      <p className="text-sm text-slate-500">{FORBIDDEN_TEXT}</p>
    </div>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 print:hidden">
      {children}
    </Link>
  );
}
