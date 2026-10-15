"use client";

import Link from "next/link";
import { AlertTriangle, History, Loader2, RefreshCw, Save, Undo2, Wallet } from "lucide-react";
import { formatUtcNaiveAsBusinessDateTime } from "@/lib/business-time";
import { formatMoney } from "@/lib/payments";
import {
  FORBIDDEN_TEXT,
  NOTE_MAX_LENGTH,
  STATUS_CHIP_CLASS,
  lessonTypeLabel,
  parsePercent,
  percentFieldText,
  percentLabel,
  revisionLabel,
  sanitizePercentTyping,
  setPercentEdit,
  sheetLessonTypes,
  teacherLabel,
  warningViews,
  type PayrollDiff,
  type PayrollDiffLine,
  type PayrollMonthWarnings,
  type PayrollRevision,
  type PayrollSheet,
  type PayrollSheetWarnings,
  type SheetEdits,
  type SheetStatusView,
} from "@/lib/payroll";

/** «не рассчитано» / «сохранено · редакция 3 · 1 250 000 сум» / «данные изменились». */
export function StatusChip({ status }: { status: SheetStatusView }) {
  return (
    <span className={`inline-flex max-w-full items-center rounded-2xl border px-2.5 py-1 text-xs font-semibold ${STATUS_CHIP_CLASS[status.tone]}`}>
      <span className="min-w-0 break-words">{status.label}</span>
    </span>
  );
}

/** One percent field per lesson type of the sheet.  On paper they become a line of text. */
export function PercentEditor({
  sheet, edits, onEdits,
}: {
  sheet: PayrollSheet;
  edits: SheetEdits;
  onEdits: (update: (previous: SheetEdits) => SheetEdits) => void;
}) {
  const types = sheetLessonTypes(sheet);
  if (types.length === 0) return null;
  return (
    <>
      <fieldset className="rounded-2xl border border-slate-200 bg-white px-4 py-3 print:hidden">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Проценты преподавателя</legend>
        <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
          {types.map((type) => {
            const text = percentFieldText(sheet, edits, type);
            const error = parsePercent(text).error;
            const id = `payroll-sheet-percent-${sheet.teacher_id || "t"}-${type}`;
            return (
              <div key={type} className="min-w-0">
                <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-600">{lessonTypeLabel(type)}</label>
                <div className="flex items-center gap-1.5">
                  <input
                    id={id}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={text}
                    aria-label={`Процент для ${teacherLabel(sheet.teacher_name)}, ${lessonTypeLabel(type)}`}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? `${id}-error` : undefined}
                    onChange={(event) => onEdits((previous) => setPercentEdit(previous, sheet, type, sanitizePercentTyping(event.target.value)))}
                    className={`w-20 rounded-lg border bg-white px-2.5 py-1.5 text-right text-sm tabular-nums outline-none focus:ring-2 ${
                      error ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/10" : "border-slate-200 focus:border-primary-500 focus:ring-primary-500/10"
                    }`}
                  />
                  <span className="text-sm text-slate-500">%</span>
                </div>
                {error && <p id={`${id}-error`} role="alert" className="mt-1 max-w-[14rem] text-xs font-medium text-rose-700">{error}</p>}
              </div>
            );
          })}
        </div>
      </fieldset>
      <p className="hidden text-sm text-slate-700 print:block">
        Проценты: {types.map((type) => `${lessonTypeLabel(type)} — ${percentLabel(parsePercent(percentFieldText(sheet, edits, type)).value ?? sheet.percents[type])}`).join("; ")}
      </p>
    </>
  );
}

/**
 * Save controls of an open sheet: the note of the revision, «Отменить правки» and the save button.  The bar
 * sticks to the bottom of the screen while there is something to save, so a long sheet needs no scrolling back.
 */
export function SaveBar({
  dirty, problem, saveLabel, canSaveClean, saving, note, onNote, onSave, onDiscard,
}: {
  dirty: boolean;
  problem: string | null;
  saveLabel: string;
  /** A calculation that is not saved yet can be saved as it is; a saved sheet only when edited. */
  canSaveClean: boolean;
  saving: boolean;
  note: string;
  onNote: (text: string) => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const disabled = saving || Boolean(problem) || (!dirty && !canSaveClean);
  return (
    <div
      className={`rounded-2xl border bg-white px-4 py-3 shadow-sm print:hidden ${dirty ? "sticky bottom-2 z-20 border-primary-200 shadow-lg" : "border-slate-200"}`}
    >
      {dirty && (
        <p className="mb-2 text-xs text-slate-600">
          <span className="font-semibold text-slate-800">Есть несохранённые правки.</span>{" "}
          Суммы изменённых строк пересчитаны здесь по той же формуле и станут окончательными после сохранения.
        </p>
      )}
      {problem && <p role="alert" className="mb-2 text-xs font-medium text-rose-700">{problem}</p>}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
        <div className="min-w-0 flex-1 lg:min-w-[16rem]">
          <label htmlFor="payroll-note" className="mb-1 block text-xs font-medium text-slate-600">Примечание к редакции (необязательно)</label>
          <input
            id="payroll-note"
            type="text"
            value={note}
            maxLength={NOTE_MAX_LENGTH}
            onChange={(event) => onNote(event.target.value)}
            placeholder="Например: поправили оплату после справки"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dirty && (
            <button
              type="button"
              onClick={onDiscard}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Undo2 className="h-4 w-4" />
              Отменить правки
            </button>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={disabled}
            className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Сохранение…" : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Another user saved first (409): the sheet on screen is out of date. */
export function ConflictBanner({ message, onReload, reloading }: { message: string; onReload: () => void; reloading: boolean }) {
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
        Обновить
      </button>
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

function signedMoney(delta: number): string {
  return `${delta > 0 ? "+" : "−"}${formatMoney(Math.abs(delta))}`;
}

/** «Данные изменились — пересчитать?» with the difference line by line. */
export function DiffBanner({
  diff, busy, onRecalculate,
}: {
  diff: PayrollDiff;
  busy: boolean;
  onRecalculate: () => void;
}) {
  return (
    <section aria-label="Данные изменились" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 print:hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Данные изменились после сохранения — пересчитать?
          </p>
          <p className="mt-1 text-sm text-amber-900/90">
            Изменились посещаемость, оплаты или подтверждения пропусков. Сохранённая ведомость сама не меняется:
            пересчёт создаст новую редакцию, прежняя останется в истории.
          </p>
          {diff.saved_total !== diff.fresh_total && (
            <p className="mt-1 text-sm font-semibold tabular-nums">
              Итого: {formatMoney(diff.saved_total)} → {formatMoney(diff.fresh_total)}
              {diff.delta_amount !== 0 && <span className="ml-2 font-medium">({signedMoney(diff.delta_amount)})</span>}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onRecalculate}
          disabled={busy}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Пересчитать
        </button>
      </div>

      {diff.lines.length > 0 && (
        <details className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-sm">
          <summary className="cursor-pointer select-none font-medium">Что изменится по строкам ({diff.lines.length})</summary>
          <div className="mt-2 max-w-full overflow-x-auto">
            <table className="w-full min-w-[30rem] border-collapse text-xs">
              <thead>
                <tr className="border-b border-amber-200 text-left text-[11px] uppercase tracking-wide text-amber-900/70">
                  <th scope="col" className="py-1.5 pr-3 font-semibold">Ученик</th>
                  <th scope="col" className="py-1.5 pr-3 font-semibold">Засчитано</th>
                  <th scope="col" className="py-1.5 pr-3 font-semibold">Не оплачено</th>
                  <th scope="col" className="py-1.5 text-right font-semibold">Начислено</th>
                </tr>
              </thead>
              <tbody>
                {diff.lines.slice(0, 100).map((line) => (
                  <tr key={`${line.membership_id}-${line.status}`} className="border-b border-amber-100 last:border-b-0">
                    <th scope="row" className="py-1.5 pr-3 text-left font-medium">
                      {line.student_name ?? "Ученик"}
                      {line.group_name && <span className="block font-normal text-amber-900/70">{line.group_name}</span>}
                      {STATUS_LABEL[line.status] && <span className="block font-normal text-amber-900/70">{STATUS_LABEL[line.status]}</span>}
                      {line.changes.length > 0 && <span className="block font-normal text-amber-900/70">изменилось: {line.changes.join(", ")}</span>}
                    </th>
                    <td className="py-1.5 pr-3 tabular-nums">{change(line.saved?.counted, line.fresh?.counted)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{change(line.saved?.unpaid, line.fresh?.unpaid)}</td>
                    <td className="whitespace-nowrap py-1.5 text-right tabular-nums">
                      {change(line.saved?.amount, line.fresh?.amount, formatMoney)}
                      {line.delta_amount !== 0 && <span className="block text-amber-900/70">{signedMoney(line.delta_amount)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {diff.lines.length > 100 && <p className="mt-2 text-xs text-amber-900/70">…и ещё {diff.lines.length - 100}</p>}
          </div>
        </details>
      )}
    </section>
  );
}

/** The warnings of a teacher's month or a sheet: only what is above 0, each one a link to where it is fixed. */
export function WarningLinks({
  counts, label, stacked = false,
}: {
  counts: PayrollSheetWarnings | PayrollMonthWarnings;
  label: string;
  /** One under another (a table cell) instead of in a row. */
  stacked?: boolean;
}) {
  const views = warningViews(counts);
  if (views.length === 0) return null;
  return (
    <ul aria-label={label} className={`${stacked ? "space-y-1" : "flex flex-wrap gap-x-4 gap-y-1"} print:hidden`}>
      {views.map((view) => (
        <li key={view.key} className={`flex items-start gap-1.5 text-xs ${view.tone === "warning" ? "text-amber-800" : "text-slate-600"}`}>
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <Link href={view.href} className="font-medium underline-offset-2 hover:underline">{view.text}</Link>
        </li>
      ))}
    </ul>
  );
}

/** «История редакций»: who saved which revision and when, newest first. */
export function RevisionList({ revisions, currentRevision }: { revisions: PayrollRevision[]; currentRevision: number | null }) {
  if (revisions.length === 0) {
    return <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">Редакций пока нет.</p>;
  }
  return (
    <ol aria-label="История редакций" className="space-y-2.5">
      {revisions.map((revision, index) => {
        const previous = revisions[index + 1];
        const delta = previous ? revision.total_amount - previous.total_amount : null;
        const when = formatUtcNaiveAsBusinessDateTime(revision.changed_at);
        const percents = Object.entries(revision.percents);
        return (
          <li key={revision.revision} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                <History className="h-4 w-4 text-slate-400" />
                {revisionLabel(revision.revision).replace(/^./, (c) => c.toUpperCase())}
                {revision.revision === currentRevision && (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">текущая</span>
                )}
              </p>
              <p className="text-sm font-semibold tabular-nums text-slate-900">
                {formatMoney(revision.total_amount)}
                {delta !== null && delta !== 0 && (
                  <span className={`ml-2 text-xs font-medium ${delta > 0 ? "text-emerald-700" : "text-rose-700"}`}>
                    {delta > 0 ? "+" : "−"}{formatMoney(Math.abs(delta))}
                  </span>
                )}
              </p>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {[when, revision.changed_by_name, `строк: ${revision.line_count}`].filter(Boolean).join(" · ")}
            </p>
            {percents.length > 0 && (
              <p className="mt-1 text-xs text-slate-600">
                Проценты: {percents.map(([type, value]) => `${lessonTypeLabel(type)} ${percentLabel(value)}`).join("; ")}
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
