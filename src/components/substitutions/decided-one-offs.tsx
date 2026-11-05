"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { orgApi } from "@/lib/api";
import { formatBusinessDate, formatDateRu, shiftMonthKey } from "@/lib/business-time";
import { formatDateTimeRu } from "@/lib/attendance-excuses";
import { monthTitle } from "@/lib/payroll";
import { toastWithEffects } from "@/lib/money-effects";
import {
  DECIDED_EMPTY_TEXT, DECIDED_HINT, DECIDED_LOAD_ERROR_TEXT, DECIDED_MONTH_CLOSED_TEXT, DECIDED_TITLE, UNDO_DECISION_BUTTON, UNDO_DECISION_TOAST,
  decidedByLine, decidedMoneyText, decisionLessonLine, decisionWhoLine, type DecidedOneOffItem,
} from "@/lib/one-off";
import { UndoDecisionDialog, type UndoDecisionTarget } from "@/components/groups/undo-decision-dialog";
import { PeriodClosedNotice } from "@/components/money/period-closed-notice";

/**
 * R3 #28 (the money right): «Решённые дополнительные уроки» of a month on the tab «Решённые» of «Замены» - what was decided (paid to the teacher or not), who decided and when.
 * «Отменить решение» is there while the month of the teacher is open (`canUndo`); for a closed month the row says so and offers «Переоткрыть месяц» - the undo follows.
 */
export function DecidedOneOffsBlock({ showToast, onChanged }: { showToast: (text: string, type: "success" | "error" | "warning", details?: string[]) => void; onChanged?: () => void }) {
  const [month, setMonth] = useState(() => formatBusinessDate().slice(0, 7));
  const [items, setItems] = useState<DecidedOneOffItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<UndoDecisionTarget | null>(null);
  const sequence = useRef(0);

  const load = useCallback(async (silent = false) => {
    const mine = ++sequence.current;
    if (!silent) setLoading(true);
    try {
      const data = await orgApi.getDecidedOneOffs(month);
      if (mine !== sequence.current) return;
      setItems(data.items);
      setTotal(data.total);
      setError(null);
    } catch {
      if (mine !== sequence.current) return;
      if (!silent) { setItems([]); setError(DECIDED_LOAD_ERROR_TEXT); }
    } finally {
      if (mine === sequence.current) setLoading(false);
    }
  }, [month]);
  useEffect(() => { void load(); return () => { sequence.current += 1; }; }, [load]);

  const thisMonth = formatBusinessDate().slice(0, 7);
  return (
    <section aria-label={DECIDED_TITLE} data-testid="decided-one-offs" className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900">{DECIDED_TITLE}{!loading && !error ? ` · ${total}` : ""}</h2>
          <p className="text-xs text-slate-500">{DECIDED_HINT}</p>
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Месяц">
          <button type="button" aria-label="Предыдущий месяц" data-testid="decided-prev" onClick={() => setMonth((value) => shiftMonthKey(value, -1))} className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" aria-hidden /></button>
          <span data-testid="decided-month" className="min-w-[8.5rem] text-center text-sm font-semibold text-slate-800">{monthTitle(month)}</span>
          <button type="button" aria-label="Следующий месяц" data-testid="decided-next" disabled={month >= thisMonth} onClick={() => setMonth((value) => shiftMonthKey(value, 1))} className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40"><ChevronRight className="h-4 w-4" aria-hidden /></button>
        </div>
      </header>
      {loading ? (
        <div className="flex items-center gap-2 px-4 py-3 text-xs text-slate-500" data-testid="decided-loading"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Загружаем…</div>
      ) : error ? (
        <div role="alert" data-testid="decided-error" className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm text-rose-800">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">{error}</span>
          <button type="button" onClick={() => void load()} className="rounded-lg border border-rose-200 bg-white px-3 py-1 text-xs font-semibold text-rose-800 hover:bg-rose-100">Повторить</button>
        </div>
      ) : items.length === 0 ? (
        <p className="px-4 py-3 text-sm text-slate-500" data-testid="decided-empty">{DECIDED_EMPTY_TEXT}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((item) => <DecidedRow key={item.lessonId + item.lessonDate} item={item} onUndo={setUndo} onReopened={() => void load(true)} />)}
        </ul>
      )}
      <UndoDecisionDialog
        target={undo}
        onClose={() => setUndo(null)}
        onDone={(result) => { setUndo(null); const note = toastWithEffects(result); showToast(UNDO_DECISION_TOAST, note.tone, note.details); void load(true); onChanged?.(); }}
      />
    </section>
  );
}

/** One decided additional lesson: what was decided, by whom and when; «Отменить решение» while the month is open, else the way to reopen it. */
export function DecidedRow({ item, onUndo, onReopened }: { item: DecidedOneOffItem; onUndo: (target: UndoDecisionTarget) => void; onReopened: () => void }) {
  return (
    <li data-testid="decided-row" className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-start md:justify-between md:gap-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">{decisionLessonLine(item)}</p>
        <p className="mt-0.5 text-xs text-slate-500">{decisionWhoLine(item)}</p>
        <p className="mt-0.5 text-xs text-slate-500" data-testid="decided-by">
          <span className={`font-semibold ${item.money === "paid" ? "text-emerald-700" : "text-slate-700"}`}>{decidedMoneyText(item.money)}</span>
          {decidedByLine(item, formatDateTimeRu) ? ` · ${decidedByLine(item, formatDateTimeRu)}` : ""}
        </p>
      </div>
      <div className="shrink-0 md:max-w-[18rem] md:text-right">
        {item.canUndo ? (
          <button
            type="button"
            data-testid="decided-undo"
            onClick={() => onUndo({ lessonId: item.lessonId, lessonDate: item.lessonDate, money: item.money })}
            aria-label={`${UNDO_DECISION_BUTTON}: ${item.groupName}, ${formatDateRu(item.lessonDate)}`}
            className="h-9 w-full rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 md:w-auto"
          >
            {UNDO_DECISION_BUTTON}
          </button>
        ) : (
          <PeriodClosedNotice
            info={{ month: item.lessonDate.slice(0, 7), teacherId: item.teacher?.id ?? null, teacherName: item.teacher?.name ?? null, closedOn: null, message: DECIDED_MONTH_CLOSED_TEXT }}
            onReopened={onReopened}
          />
        )}
      </div>
    </li>
  );
}
