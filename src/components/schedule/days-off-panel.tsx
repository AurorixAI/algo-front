"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarOff, Loader2 } from "lucide-react";
import { orgApi } from "@/lib/api";
import { dayOffLine, dayOffSpan, type DayOffApplied, type DayOffOut, type DayOffVoided } from "@/lib/payf";
import { Modal } from "@/components/ui/modal";
import { DAY_OFF_TITLE, DayOffDialog, DayOffLessonList } from "./day-off-dialog";

/** «Отменить выходной»: first says what comes back and what stays cancelled (the dry run), then does it. */
function VoidDialog({ day, onClose, onDone }: { day: DayOffOut | null; onClose: () => void; onDone: (result: DayOffVoided) => void }) {
  const [plan, setPlan] = useState<DayOffVoided | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPlan(null);
    setError(null);
    if (!day) return undefined;
    let cancelled = false;
    orgApi.voidDayOff(day.id, true)
      .then((answer) => { if (!cancelled) setPlan(answer); })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Не удалось проверить уроки"); });
    return () => { cancelled = true; };
  }, [day]);

  const submit = async () => {
    if (!day || busy) return;
    setBusy(true);
    setError(null);
    try {
      onDone(await orgApi.voidDayOff(day.id));
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось отменить выходной");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={day !== null}
      title="Отменить выходной"
      description={day ? `${day.reason} · ${dayOffSpan(day)}` : undefined}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Назад</button>
          <button type="button" onClick={() => void submit()} disabled={busy || !plan} data-testid="day-off-void-apply" className="flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Вернуть уроки
          </button>
        </>
      }
    >
      <div className="space-y-3 pb-2" aria-live="polite">
        {!plan && !error && <p className="flex items-center gap-1.5 text-sm text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />Проверяем уроки…</p>}
        {plan && <p className="text-sm font-medium text-slate-900" data-testid="day-off-void-text">Вернутся уроки: {plan.restored.length}. Останутся отменёнными: {plan.kept.length}.</p>}
        {plan && <DayOffLessonList title="Вернутся в расписание" lessons={plan.restored} tone="ok" testId="day-off-restored" />}
        {plan && <DayOffLessonList title="Останутся отменёнными" lessons={plan.kept} tone="warn" testId="day-off-kept" />}
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">{error}</p>}
      </div>
    </Modal>
  );
}

/**
 * The days off of the centre: the journal and the two actions (give a day off, cancel one).  For the owner and the administrator; it lives in «Настройки».
 */
export function DaysOffPanel() {
  const [days, setDays] = useState<DayOffOut[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [voiding, setVoiding] = useState<DayOffOut | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDays(await orgApi.listDaysOff());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить выходные");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const created = (result: DayOffApplied) => {
    setNotice(`Выходной назначен: отменено уроков ${result.cancelled.length}${result.blocked.length > 0 ? `, не отменены ${result.blocked.length}` : ""}.`);
    void load();
  };
  const voided = (result: DayOffVoided) => {
    setNotice(`Выходной отменён: вернулось уроков ${result.restored.length}${result.kept.length > 0 ? `, осталось отменёнными ${result.kept.length}` : ""}.`);
    void load();
  };

  return (
    <section aria-labelledby="days-off-title" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5" data-testid="days-off-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="days-off-title" className="flex items-center gap-2 text-base font-bold text-slate-900"><CalendarOff className="h-4 w-4 text-slate-500" aria-hidden />{DAY_OFF_TITLE}</h2>
          <p className="mt-0.5 text-xs text-slate-500">Праздник или день, когда центр не работает: уроки всех групп отменяются сразу, деньги по ним не пересчитываются.</p>
        </div>
        <button type="button" onClick={() => setCreating(true)} data-testid="day-off-new" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Назначить выходной</button>
      </div>
      {notice && <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">{notice}</p>}
      {error && <p role="alert" className="text-xs font-medium text-rose-700">{error}</p>}
      {days === null && !error && <p className="flex items-center gap-1.5 text-xs text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />Загрузка…</p>}
      {days !== null && days.length === 0 && <p className="text-sm text-slate-500">Выходных пока нет.</p>}
      {days !== null && days.length > 0 && (
        <ul className="divide-y divide-slate-100" data-testid="days-off-list">
          {days.map((day) => (
            <li key={day.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className={day.active ? "text-slate-900" : "text-slate-400 line-through"}>{dayOffLine(day)}</span>
              {day.active && <button type="button" onClick={() => setVoiding(day)} className="text-xs font-semibold text-primary-700 hover:underline">Отменить выходной</button>}
            </li>
          ))}
        </ul>
      )}
      <DayOffDialog open={creating} onClose={() => setCreating(false)} onDone={created} />
      <VoidDialog day={voiding} onClose={() => setVoiding(null)} onDone={voided} />
    </section>
  );
}
