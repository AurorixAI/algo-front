"use client";

import { useRef, useState } from "react";
import { AlertCircle, AlertTriangle, CalendarCheck, CheckCircle2, Eraser, Loader2, X } from "lucide-react";
import { FloatingPanel } from "@/components/ui/floating-panel";
import { Modal } from "@/components/ui/modal";
import {
  atStudentsWord,
  reasonHint,
  canApplyImport,
  canSave,
  errorRowIds,
  excelApplyLabel,
  excelFileLine,
  excelMissingLine,
  excelReportRows,
  excelRowText,
  noDebtDay,
  previewErrors,
  previewWarnings,
  quickDates,
  reasonNeeded,
  reasonProblem,
  reviewParts,
  valueText,
  type OpeningBatchPreview,
  type OpeningsImportPreview,
} from "@/lib/openings";
import { formatDateRu } from "@/lib/payments";
import { pluralRu } from "@/lib/plural";

const FIELD = "h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 sm:text-sm";

// ── The bar of the selected rows ────────────────────────────────────────────

/**
 * The bar over the table while rows are selected: «Оплачено до …» (two quick dates and a date picker), «Долга нет» and «Очистить».
 * It only changes the drafts of the rows - nothing is written until «Проверить» → «Сохранить».
 */
export function OpeningsBulkBar({
  count, total, accountingStart, onPaidUntil, onNoDebt, onClear, onSelectAll, onDeselect,
}: {
  count: number;
  /** Every row the filters show that can be selected (for «Выбрать всех»). */
  total: number;
  accountingStart: string;
  onPaidUntil: (date: string) => void;
  onNoDebt: () => void;
  onClear: () => void;
  onSelectAll: () => void;
  onDeselect: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const trigger = useRef<HTMLButtonElement | null>(null);
  const quick = quickDates(accountingStart);
  const apply = (value: string) => { setOpen(false); setDate(""); onPaidUntil(value); };
  const button = "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50";
  return (
    <div role="region" aria-label="Действия с выбранными" data-testid="openings-bulk-bar" className="rounded-2xl border border-primary-200 bg-white px-3.5 py-3 shadow-lg">
      <FloatingPanel open={open} triggerRef={trigger} onClose={() => setOpen(false)} width={320} label="Оплачено до" className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xl">
        <div data-testid="openings-bulk-paid-panel">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">Оплачено до…</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Закрыть" className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" aria-hidden="true" /></button>
          </div>
          <div className="flex flex-wrap gap-2">
            {quick.map((item) => (
              <button key={item.date} type="button" onClick={() => apply(item.date)} data-testid="openings-quick-date" data-date={item.date} className="rounded-full border border-primary-200 bg-primary-50 px-3 py-1.5 text-sm font-medium text-primary-700 hover:bg-primary-100">{item.label}</button>
            ))}
          </div>
          <div className="mt-3 flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <label htmlFor="openings-bulk-date" className="mb-1 block text-xs font-semibold text-slate-600">Другая дата</label>
              <input id="openings-bulk-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} className={FIELD} />
            </div>
            <button type="button" onClick={() => date && apply(date)} disabled={!date} data-testid="openings-bulk-paid-apply" className="h-9 rounded-xl bg-primary-600 px-3.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">Применить</button>
          </div>
        </div>
      </FloatingPanel>
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm text-slate-700" data-testid="openings-bulk-count">
          <span className="font-semibold text-slate-900">Выбрано: {count}</span>
          {count < total && <button type="button" onClick={onSelectAll} className="ml-2 font-medium text-primary-700 hover:underline">Выбрать всех ({total})</button>}
          <button type="button" onClick={onDeselect} className="ml-2 text-slate-500 hover:text-slate-800 hover:underline">Снять выбор</button>
        </p>
        <button ref={trigger} type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} data-testid="openings-bulk-paid" className={button}>
          <CalendarCheck className="h-4 w-4 text-slate-400" aria-hidden="true" /> Оплачено до…
        </button>
        <button type="button" onClick={onNoDebt} title={`Оплачено до ${formatDateRu(noDebtDay(accountingStart)).slice(0, 5)}: на начало учёта долга нет`} data-testid="openings-bulk-nodebt" className={button}>
          <CheckCircle2 className="h-4 w-4 text-slate-400" aria-hidden="true" /> Долга нет
        </button>
        <button type="button" onClick={onClear} data-testid="openings-bulk-clear" className={button}>
          <Eraser className="h-4 w-4 text-slate-400" aria-hidden="true" /> Очистить
        </button>
      </div>
    </div>
  );
}

// ── «Проверить» → the summary → «Сохранить» ────────────────────────────────

export interface ReviewState {
  phase: "loading" | "ready" | "saving" | "error";
  preview: OpeningBatchPreview | null;
  /** The refusal of the last call, in words (the dialog stays open: «Сохранить» may be pressed again). */
  error: string | null;
  /** What the dialog says first: the figures were refreshed (`PREVIEW_STALE`). */
  notice: string | null;
  /** The server asked for a reason although the preview did not (`REASON_REQUIRED` of the save). */
  reasonForced: boolean;
}

/** The summary of the batch: who, what, and what it does to the debts - the server's figures; the reason when there is money. */
export function OpeningsReviewDialog({
  state, reason, onReason, onSave, onClose, onDropErrors,
}: {
  state: ReviewState | null;
  reason: string;
  onReason: (value: string) => void;
  onSave: () => void;
  onClose: () => void;
  /** «Сохранить без этих строк»: the rows with an error are left out of the batch. */
  onDropErrors: () => void;
}) {
  const preview = state?.preview ?? null;
  const saving = state?.phase === "saving";
  const review = preview ? reviewParts(preview) : null;
  const errors = preview ? previewErrors(preview) : {};
  const errorIds = preview ? errorRowIds(preview) : [];
  const names = new Map((preview?.items ?? []).map((item) => [item.membership_id, item.student_name ?? "Ученик"] as const));
  const warnings = preview ? previewWarnings(preview) : [];
  const needReason = Boolean(preview && reasonNeeded(preview)) || Boolean(state?.reasonForced);
  const problem = needReason ? reasonProblem(reason) : null;
  const saveable = Boolean(preview) && canSave(preview, reason) && !saving && (!state?.reasonForced || problem === null);
  const goodCount = preview ? preview.summary.changed : 0;

  return (
    <Modal
      open={state !== null}
      title="Проверьте перед сохранением"
      onClose={onClose}
      busy={saving}
      maxWidthClassName="max-w-xl"
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">{errorIds.length > 0 ? "Вернуться к таблице" : "Отмена"}</button>
          {errorIds.length > 0 && goodCount > 0 && (
            <button type="button" onClick={onDropErrors} disabled={saving} data-testid="openings-review-drop-errors" className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Без этих строк</button>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={!saveable}
            data-testid="openings-review-save"
            className="flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {goodCount > 0 ? `Сохранить ${goodCount}` : "Сохранить"}
          </button>
        </>
      )}
    >
      <div className="space-y-3.5 pb-1" data-testid="openings-review">
        {state?.phase === "loading" && (
          <div className="flex items-center gap-2.5 py-6 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin text-primary-600" aria-hidden="true" /> Проверяем…</div>
        )}
        {state?.notice && (
          <p role="status" data-testid="openings-review-notice" className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{state.notice}</p>
        )}
        {state?.error && (
          <p role="alert" data-testid="openings-review-error" className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{state.error}</p>
        )}
        {review && preview && (
          <>
            {goodCount > 0 ? (
              <div className="space-y-1.5">
                <p className="text-base font-semibold text-slate-900" data-testid="openings-review-headline">{review.headline}</p>
                {review.parts.length > 0 && (
                  <ul className="space-y-0.5 text-sm text-slate-700" data-testid="openings-review-parts">
                    {review.parts.map((part) => <li key={part}>{part}</li>)}
                  </ul>
                )}
                <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-800" data-testid="openings-review-effect">{review.effect}</p>
                {review.notes.map((note) => <p key={note} className="text-sm text-slate-600">{note}</p>)}
              </div>
            ) : errorIds.length === 0 ? (
              <p className="text-sm text-slate-600" data-testid="openings-review-nothing">Ничего не изменится: в этих строках уже стоят такие же значения.</p>
            ) : null}
            {errorIds.length > 0 && (
              <div className="rounded-xl border border-rose-200 bg-rose-50/60 px-3 py-2.5" data-testid="openings-review-errors">
                <p className="text-sm font-semibold text-rose-800">Не получится сохранить: {errorIds.length} {pluralRu(errorIds.length, "строка", "строки", "строк")} с ошибкой — они отмечены в таблице</p>
                <ul className="mt-1 space-y-0.5 text-sm text-rose-800">
                  {errorIds.slice(0, 5).map((id) => <li key={id}><span className="font-medium">{names.get(id)}</span>: {errors[id]}</li>)}
                  {errorIds.length > 5 && <li>… и ещё {errorIds.length - 5}</li>}
                </ul>
              </div>
            )}
            {warnings.length > 0 && (
              <ul className="space-y-0.5 text-sm text-amber-800" data-testid="openings-review-warnings">
                {warnings.slice(0, 5).map((warning, index) => <li key={`${warning.id}-${index}`}><span className="font-medium">{warning.student}</span>: {warning.text}</li>)}
                {warnings.length > 5 && <li>… и ещё {warnings.length - 5}</li>}
              </ul>
            )}
            {needReason && (
              <div>
                <label htmlFor="openings-reason" className="mb-1 block text-xs font-semibold text-slate-600">
                  Причина <span className="font-normal text-slate-400">({reasonHint(preview.needs_reason.length)})</span>
                </label>
                <input id="openings-reason" value={reason} onChange={(event) => onReason(event.target.value)} maxLength={500} autoComplete="off" placeholder="Например: сверили с тетрадью учёта" data-testid="openings-reason" className={FIELD} />
                {reason !== "" && problem && <p className="mt-1 text-xs text-rose-700">{problem}</p>}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

// ── The Excel report ────────────────────────────────────────────────────────

export interface ExcelState {
  phase: "loading" | "ready" | "saving" | "error";
  fileName: string;
  report: OpeningsImportPreview | null;
  error: string | null;
  notice: string | null;
  reasonForced: boolean;
}

/** «Загрузить файл»: what the file says (read / changes / unchanged / errors with the row numbers), then «Применить N изменений». */
export function OpeningsExcelDialog({
  state, reason, onReason, onApply, onClose,
}: {
  state: ExcelState | null;
  reason: string;
  onReason: (value: string) => void;
  onApply: () => void;
  onClose: () => void;
}) {
  const report = state?.report ?? null;
  const saving = state?.phase === "saving";
  const rows = report ? excelReportRows(report.rows) : null;
  const review = report && report.summary.changed > 0 ? reviewParts(report) : null;
  const itemsById = new Map((report?.items ?? []).map((item) => [item.membership_id, item] as const));
  const missingLine = report ? excelMissingLine(report.file) : null;
  const needReason = Boolean(report && reasonNeeded(report)) || Boolean(state?.reasonForced);
  const applyable = canApplyImport(report, reason) && !saving && (!state?.reasonForced || reasonProblem(reason) === null);
  const count = report?.batch_items.length ?? 0;
  const start = report?.accounting_start ?? "";

  return (
    <Modal
      open={state !== null}
      title="Файл с остатками"
      description={state?.fileName}
      onClose={onClose}
      busy={saving}
      maxWidthClassName="max-w-2xl"
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Отмена</button>
          <button type="button" onClick={onApply} disabled={!applyable} data-testid="openings-excel-apply" className="flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {count > 0 ? excelApplyLabel(count) : "Применить"}
          </button>
        </>
      )}
    >
      <div className="space-y-3.5 pb-1" data-testid="openings-excel">
        {state?.phase === "loading" && <div className="flex items-center gap-2.5 py-6 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin text-primary-600" aria-hidden="true" /> Читаем файл…</div>}
        {state?.notice && <p role="status" className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{state.notice}</p>}
        {state?.error && <p role="alert" data-testid="openings-excel-error" className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{state.error}</p>}
        {report && rows && (
          <>
            <div>
              <p className="text-sm font-semibold text-slate-900" data-testid="openings-excel-file-line">{excelFileLine(report.file)}</p>
              {missingLine && <p className="mt-0.5 text-sm text-slate-500" data-testid="openings-excel-missing">{missingLine}</p>}
            </div>
            {review && (
              <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-800" data-testid="openings-excel-effect">{review.effect}</p>
            )}
            {rows.errors.length > 0 && (
              <div className="rounded-xl border border-rose-200 bg-rose-50/60 px-3 py-2.5" data-testid="openings-excel-errors">
                <p className="text-sm font-semibold text-rose-800">Эти строки не будут применены — исправьте их в файле и загрузите снова</p>
                <ul className="mt-1 max-h-44 space-y-0.5 overflow-y-auto text-sm text-rose-800">
                  {rows.errors.slice(0, 100).map((row) => (
                    <li key={row.row} data-testid="openings-excel-error-row">
                      {excelRowText(row)}
                      {row.student_name && <span className="text-rose-700/80"> ({row.student_name}{row.group_name ? `, ${row.group_name}` : ""})</span>}
                    </li>
                  ))}
                  {rows.errors.length > 100 && <li>… и ещё {rows.errors.length - 100}</li>}
                </ul>
              </div>
            )}
            {rows.changes.length > 0 && (
              <div data-testid="openings-excel-changes">
                <p className="mb-1 text-xs font-semibold text-slate-500">Что изменится</p>
                <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                  {rows.changes.slice(0, 200).map((row) => {
                    const item = row.membership_id ? itemsById.get(row.membership_id) : undefined;
                    return (
                      <li key={row.row} className="px-3 py-2 text-sm">
                        <p className="text-slate-900"><span className="font-medium">{row.student_name ?? item?.student_name ?? "Ученик"}</span>{(row.group_name ?? item?.group_name) && <span className="text-slate-500"> · {row.group_name ?? item?.group_name}</span>}</p>
                        {item && (
                          <p className="text-xs text-slate-600">
                            {valueText(item.before?.opening, start)} <span className="text-slate-400">→</span>{" "}
                            <span className={item.kind === "cleared" ? "font-medium text-rose-700" : "font-medium text-slate-800"}>{item.kind === "cleared" ? "остаток убрать" : valueText(item.target, start)}</span>
                          </p>
                        )}
                      </li>
                    );
                  })}
                  {rows.changes.length > 200 && <li className="px-3 py-2 text-xs text-slate-500">… и ещё {rows.changes.length - 200}</li>}
                </ul>
              </div>
            )}
            {needReason && (
              <div>
                <label htmlFor="openings-excel-reason" className="mb-1 block text-xs font-semibold text-slate-600">Причина <span className="font-normal text-slate-400">({reasonHint(0)})</span></label>
                <input id="openings-excel-reason" value={reason} onChange={(event) => onReason(event.target.value)} maxLength={500} autoComplete="off" data-testid="openings-excel-reason" className={FIELD} />
                {reason !== "" && reasonProblem(reason) && <p className="mt-1 text-xs text-rose-700">{reasonProblem(reason)}</p>}
              </div>
            )}
            {count === 0 && rows.errors.length === 0 && <p className="text-sm text-slate-600" data-testid="openings-excel-nothing">В файле нет изменений: остатки такие же, как в ALGO.</p>}
          </>
        )}
      </div>
    </Modal>
  );
}

// ── «Готово» ────────────────────────────────────────────────────────────────

/** «Готово — остальным остаток не нужен»: ends the checklist (state `done`); the banner of «Должники» goes away. */
export function OpeningsDoneDialog({ open, missing, busy, error, onConfirm, onClose }: { open: boolean; missing: number; busy: boolean; error: string | null; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal
      open={open}
      title="Закончить заполнение остатков?"
      onClose={onClose}
      busy={busy}
      maxWidthClassName="max-w-md"
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Отмена</button>
          <button type="button" onClick={onConfirm} disabled={busy} data-testid="openings-done-confirm" className="flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Да, готово
          </button>
        </>
      )}
    >
      <p className="text-sm text-slate-700">У {missing} {atStudentsWord(missing)} остаток не заполнен. Если у них до начала учёта не было ни долга, ни оплаты вперёд, можно закончить: напоминание в «Должниках» исчезнет, а долги будут считаться с даты начала учёта.</p>
      {error && <p role="alert" className="mt-2 text-sm font-medium text-rose-700">{error}</p>}
    </Modal>
  );
}
