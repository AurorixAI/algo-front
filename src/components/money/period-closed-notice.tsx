"use client";

import { useState } from "react";
import { canManageMoney, REOPEN_MONTH_LABEL } from "@/lib/money-effects";
import { canReopenFrom, type PeriodClosedInfo } from "@/lib/closed-period";
import { useAuthStore } from "@/lib/store";
import { ReopenMonthDialog } from "@/components/payroll/reopen-month-dialog";

/**
 * Money-1 A1: the refusal «месяц закрыт» (409 `PERIOD_CLOSED`, a pause's 422 `PAUSE_LOCKED`) in the window of a lesson / a pause / a decision: the sentence of the server (it
 * says who reopens the month) and - for the owner and an administrator with the money right - the button «Переоткрыть месяц» for exactly that teacher and month.  After the
 * reopening `onReopened` runs: the window repeats what it was asked to do (or asks the person to).  Everybody else reads the sentence and goes to the owner.
 */
export function PeriodClosedNotice({
  info, onReopened, aboveLessonPanel = false, className = "",
}: {
  info: PeriodClosedInfo;
  onReopened: () => void;
  aboveLessonPanel?: boolean;
  className?: string;
}) {
  const user = useAuthStore((state) => state.user);
  const [open, setOpen] = useState(false);
  const allowed = canReopenFrom(info, canManageMoney(user));
  return (
    <div role="alert" data-testid="period-closed" className={`space-y-1.5 ${className}`}>
      <p className="text-sm font-medium text-rose-700">{info.message || "Месяц закрыт: исправить урок нельзя, пока месяц не переоткрыт"}</p>
      {allowed && (
        <>
          <button type="button" data-testid="period-closed-reopen" onClick={() => setOpen(true)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">{REOPEN_MONTH_LABEL}</button>
          <ReopenMonthDialog
            target={open ? { month: info.month, teacherId: info.teacherId, teacherName: info.teacherName } : null}
            aboveLessonPanel={aboveLessonPanel}
            onClose={() => setOpen(false)}
            onReopened={() => { setOpen(false); onReopened(); }}
          />
        </>
      )}
    </div>
  );
}
