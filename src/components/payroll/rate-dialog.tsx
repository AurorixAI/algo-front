"use client";

import { Select } from "@/components/ui/select";
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { orgApi } from "@/lib/api";
import {
  RATE_FIRST_NOTE,
  RATE_PAST_NOTE,
  checkRateForm,
  defaultRateFrom,
  defaultRateMonth,
  hasAnyRate,
  lessonTypeLabel,
  payrollErrorText,
  percentInputText,
  rateHistoryView,
  rateDialogTypes,
  rateMonthOptions,
  ratePutBody,
  sanitizePercentTyping,
  teacherLabel,
  type PayrollErrorLike,
  type PayrollRateHistoryItem,
  type PayrollRateItem,
} from "@/lib/payroll";
import { Modal } from "@/components/ui/modal";

const FORM_ID = "payroll-rate-form";

/**
 * «Изменить ставку»: the percent of each kind of lessons the teacher teaches, the month it starts in (the current one by
 * default) and the history of the rates.  This is the ONE place a rate is set: «Зарплата» only reads it.
 */
export function TeacherRateDialog({
  item, today, month, onClose, onSaved,
}: {
  /** The teacher whose rate is edited; null closes the dialog. */
  item: PayrollRateItem | null;
  today: string;
  /** The payroll month the owner came from (`?month=`): the rate starts in it when the teacher already has a rate of another kind. */
  month?: string | null;
  onClose: () => void;
  /** The server's answer (the teacher's item with his new rates). */
  onSaved: (item: PayrollRateItem) => void;
}) {
  const types = useMemo(() => (item ? rateDialogTypes(item) : []), [item]);
  const current = useMemo(
    () => Object.fromEntries(types.map((type) => [type, item?.rates?.[type]?.percent ?? null])),
    [item, types],
  );
  const months = useMemo(() => rateMonthOptions(today, month), [today, month]);
  const currentMonth = defaultRateMonth(today);

  const [texts, setTexts] = useState<Record<string, string>>({});
  const [validFrom, setValidFrom] = useState(defaultRateFrom({ hasAnyRate: item ? hasAnyRate(item) : false, today, month }));
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<PayrollRateHistoryItem[] | "failed" | null>(null);

  // A new teacher (or the dialog opening again): the fields start from the rates in force.
  useEffect(() => {
    if (!item) return;
    setTexts(Object.fromEntries(types.map((type) => [type, percentInputText(current[type])])));
    setValidFrom(defaultRateFrom({ hasAnyRate: hasAnyRate(item), today, month }));
    setAttempted(false);
    setSaving(false);
    setError(null);
    setHistoryOpen(false);
    setHistory(null);
    // the fields are reset only when another teacher is opened
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.teacher_id]);

  useEffect(() => {
    if (!item || !historyOpen || history !== null) return;
    let cancelled = false;
    orgApi.getPayrollRateHistory(item.teacher_id)
      .then((rows) => { if (!cancelled) setHistory(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setHistory("failed"); });
    return () => { cancelled = true; };
  }, [item, historyOpen, history]);

  if (!item) return <Modal open={false} title="Изменить ставку" onClose={onClose}>{null}</Modal>;

  const checked = checkRateForm(types, texts, current);
  const firstRate = !hasAnyRate(item);
  const name = teacherLabel(item.teacher_name);

  const submit = async () => {
    if (saving) return;
    setAttempted(true);
    if (Object.keys(checked.errors).length > 0 || checked.changed === 0) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await orgApi.putPayrollRates(item.teacher_id, ratePutBody(validFrom, checked, current));
      onSaved(saved);
    } catch (cause) {
      setError(payrollErrorText(cause as PayrollErrorLike));
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title="Изменить ставку"
      description={name}
      onClose={onClose}
      busy={saving}
      maxWidthClassName="max-w-[480px]"
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">
            Отмена
          </button>
          <button
            type="submit"
            form={FORM_ID}
            disabled={saving || checked.changed === 0}
            title={checked.changed === 0 ? "Измените ставку, чтобы сохранить" : undefined}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Сохранить
          </button>
        </>
      )}
    >
      <form id={FORM_ID} onSubmit={(event) => { event.preventDefault(); void submit(); }} className="space-y-5" noValidate>
        <p className="text-sm text-slate-600">Какую часть оплаты ученика за урок получает преподаватель.</p>
        <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
          {types.map((type) => {
            const id = `payroll-rate-${type}`;
            const problem = checked.errors[type];
            const shown = problem && (attempted || (texts[type] ?? "") !== "") ? problem : null;
            return (
              <div key={type} className="min-w-0">
                <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">{lessonTypeLabel(type)}</label>
                <div className="flex items-center gap-1.5">
                  <input
                    id={id}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={texts[type] ?? ""}
                    placeholder="—"
                    aria-invalid={Boolean(shown)}
                    aria-describedby={shown ? `${id}-error` : undefined}
                    onChange={(event) => { setError(null); setTexts((previous) => ({ ...previous, [type]: sanitizePercentTyping(event.target.value) })); }}
                    className={`w-24 rounded-lg border bg-white px-3 py-2 text-right text-sm tabular-nums outline-none focus:ring-2 ${
                      shown ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/10" : "border-slate-200 focus:border-primary-500 focus:ring-primary-500/10"
                    }`}
                  />
                  <span className="text-sm text-slate-500">%</span>
                </div>
                {shown && <p id={`${id}-error`} className="mt-1 max-w-[12rem] text-xs font-medium text-rose-700">{shown}</p>}
              </div>
            );
          })}
        </div>

        <div>
          <label htmlFor="payroll-rate-from" className="mb-1 block text-sm font-medium text-slate-700">Действует с</label>
          <Select
            id="payroll-rate-from"
            value={validFrom}
            onChange={(event) => setValidFrom(event.target.value)}
            options={months.map((option) => ({ value: option.value, label: option.label }))}
            className="sm:w-64"
            buttonClassName="bg-white py-2"
          />
          {!firstRate && validFrom <= currentMonth && <p className="mt-1.5 text-xs text-slate-500">{RATE_PAST_NOTE}</p>}
          {firstRate && validFrom <= currentMonth && <p className="mt-1.5 text-xs text-slate-500">{RATE_FIRST_NOTE}</p>}
        </div>

        {error && <p role="alert" className="text-sm font-medium text-rose-700">{error}</p>}
      </form>

      <div className="mt-5 border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={() => setHistoryOpen((value) => !value)}
          aria-expanded={historyOpen}
          className="text-sm font-medium text-primary-700 hover:underline"
        >
          {historyOpen ? "Скрыть историю ставки" : "История ставки"}
        </button>
        {historyOpen && (
          <div className="mt-2">
            {history === null ? (
              <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Загрузка…</p>
            ) : history === "failed" ? (
              <p role="alert" className="text-sm text-rose-700">Не удалось загрузить историю.</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-slate-500">Ставка ещё не задавалась.</p>
            ) : (
              <ol aria-label="История ставки" className="space-y-2">
                {history.map((row, index) => {
                  const view = rateHistoryView(row);
                  return (
                    <li key={`${row.lesson_type}-${row.valid_from}-${row.set_at ?? index}`} className="text-sm">
                      <span className="font-medium text-slate-900">{view.title}</span>
                      <span className="block text-xs text-slate-500">{view.detail}</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
