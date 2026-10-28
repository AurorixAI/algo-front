"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarOff, Loader2 } from "lucide-react";
import { orgApi } from "@/lib/api";
import { formatBusinessDate } from "@/lib/business-time";
import { NOT_RESTORED_TITLE, VOID_EXAMS_NOTE, dayOffLessonLine, dayOffLine, dayOffNotRestoredLine, dayOffSpan, keptBlock, lessonsCount, sortDayOffLessons, splitDaysOff, voidSummary, type DayOffApplied, type DayOffOut, type DayOffVoided } from "@/lib/payf";
import { Modal } from "@/components/ui/modal";
import { DAY_OFF_TITLE, DayOffDialog, DayOffLessonList } from "./day-off-dialog";

/** The lines «28.10 · 10:00 · Группа — была замена: Имя Ф.» of the lessons that came back without their substitute, by date and time. */
function notRestoredLines(result: Pick<DayOffVoided, "restored" | "warnings">): Array<{ key: string; text: string }> {
  const rows = (result.warnings ?? []).map((warning) => {
    const lesson = result.restored.find((item) => item.lessonId === warning.lessonId && item.date === warning.date);
    return { key: `${warning.groupId}-${warning.lessonId}-${warning.date}`, text: dayOffNotRestoredLine(warning, result.restored), date: warning.date ?? "", startTime: warning.startTime ?? lesson?.startTime ?? null, groupName: warning.groupName ?? lesson?.groupName ?? "" };
  });
  return sortDayOffLessons(rows).map(({ key, text }) => ({ key, text }));
}

/** What «Отменить выходной» would do, in words: the sum, the lessons that come back, the ones that stay, the substitutes that do not return, the note about exams (only when something comes back). */
export function VoidPlanBody({ plan }: { plan: DayOffVoided }) {
  const kept = keptBlock(plan.kept);
  return (
    <>
      <p className="text-sm font-medium text-slate-900" data-testid="day-off-void-text">{voidSummary(plan)}</p>
      <DayOffLessonList title="Вернутся в расписание" lessons={plan.restored} tone="ok" testId="day-off-restored" />
      <DayOffLessonList title={kept.title} lessons={kept.lessons} tone="warn" testId="day-off-kept" />
      {(plan.warnings ?? []).length > 0 && (
        <div data-testid="day-off-not-restored" className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p className="font-semibold">{NOT_RESTORED_TITLE}</p>
          <ul className="list-disc space-y-0.5 pl-4 font-medium">{notRestoredLines(plan).map((line) => <li key={line.key}>{line.text}</li>)}</ul>
        </div>
      )}
      {plan.restored.length > 0 && <p className="text-xs text-slate-500" data-testid="day-off-void-exams-note">{VOID_EXAMS_NOTE}</p>}
    </>
  );
}

/** «Отменить выходной»: first says what comes back and what stays cancelled (the dry run), then does it. */
function VoidDialog({ day, onClose, onDone }: { day: DayOffOut | null; onClose: () => void; onDone: (result: DayOffVoided) => void }) {
  const [plan, setPlan] = useState<DayOffVoided | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);        // a second press in the same tick sees the state of the first one (rule 27)
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
    if (!day || busy || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      onDone(await orgApi.voidDayOff(day.id));
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось отменить выходной");
    } finally {
      sending.current = false;
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
        {plan && <VoidPlanBody plan={plan} />}
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
  /** What the cancellation of a day off left to do: the lessons that came back without their substitute. */
  const [noticeLines, setNoticeLines] = useState<string[]>([]);
  const [noticeLabel, setNoticeLabel] = useState("");

  const load = useCallback(async () => {
    try {
      setDays(await orgApi.listDaysOff());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить выходные");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const [unfinishedLocal, setUnfinished] = useState<DayOffOut | null>(null);
  // W1 S10: «not finished» is kept on the server (a day off with `incomplete`), so it is still offered after a reload; the answer of the apply tells at once
  const unfinished = unfinishedLocal ?? (days ?? []).find((day) => day.active && day.incomplete) ?? null;
  const [continuing, setContinuing] = useState(false);
  const continuingRef = useRef(false);        // a second press in the same tick sees the state of the first one (rule 27)
  const created = (result: DayOffApplied) => {
    const converted = result.converted?.length ?? 0;
    // W1: the lessons that were NOT cancelled are named with their reasons (started, held, a one-off set on purpose…), not only counted
    setNoticeLines(result.blocked.map(dayOffLessonLine));
    setNoticeLabel("Не отменены:");
    setNotice(`Выходной назначен: отменено уроков ${result.cancelled.length}${converted > 0 ? `, отмена переведена в праздник: ${converted}` : ""}${result.blocked.length > 0 ? `, не отменены ${result.blocked.length}` : ""}.`);
    setUnfinished(result.complete === false ? result.dayOff : null);
    void load();
  };
  // exam-service did not answer: the rest of the lessons waits; «Продолжить» tries again (the server skips what is cancelled)
  const proceed = async () => {
    if (!unfinished || continuing || continuingRef.current) return;
    continuingRef.current = true;
    setContinuing(true);
    try {
      created(await orgApi.applyDayOff(unfinished.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось продолжить");
    } finally {
      continuingRef.current = false;
      setContinuing(false);
    }
  };
  const voided = (result: DayOffVoided) => {
    setNoticeLines(notRestoredLines(result).map((line) => line.text));
    setNoticeLabel(`${NOT_RESTORED_TITLE}:`);
    setNotice(`Выходной отменён. В расписание вернулось: ${lessonsCount(result.restored.length)}${result.kept.length > 0 ? `; остались отменёнными: ${result.kept.length}` : ""}.`);
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
      {notice && (
        <div role="status" className={`space-y-1 rounded-xl px-3 py-2 text-xs font-medium ${noticeLines.length > 0 ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800"}`}>
          <p>{notice}</p>
          {noticeLines.length > 0 && <p className="font-semibold">{noticeLabel}</p>}
          {noticeLines.length > 0 && <ul data-testid="day-off-notice-lines" className="list-disc space-y-0.5 pl-4">{noticeLines.map((line) => <li key={line}>{line}</li>)}</ul>}
        </div>
      )}
      {unfinished && (
        <p role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900" data-testid="day-off-unfinished">
          Сервис экзаменов не ответил: часть уроков не отменена.
          <button type="button" onClick={() => void proceed()} disabled={continuing} className="rounded-lg bg-amber-600 px-3 py-1 font-semibold text-white hover:bg-amber-700 disabled:opacity-50">{continuing ? "Продолжаем…" : "Продолжить"}</button>
        </p>
      )}
      {error && <p role="alert" className="text-xs font-medium text-rose-700">{error}</p>}
      {days === null && !error && <p className="flex items-center gap-1.5 text-xs text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />Загрузка…</p>}
      {days !== null && days.length === 0 && <p className="text-sm text-slate-500">Выходных пока нет.</p>}
      {days !== null && days.length > 0 && (() => {
        const { current, past } = splitDaysOff(days, formatBusinessDate());
        const row = (day: DayOffOut) => (
          <li key={day.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span className={day.active && day.dateTo >= formatBusinessDate() ? "text-slate-900" : "text-slate-400 line-through"}>{dayOffLine(day)}</span>
            {day.active && day.dateTo >= formatBusinessDate() && <button type="button" onClick={() => setVoiding(day)} className="text-xs font-semibold text-primary-700 hover:underline">Отменить выходной</button>}
          </li>
        );
        return (
          <>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Действующие</h3>
              {current.length === 0
                ? <p className="py-2 text-sm text-slate-500" data-testid="days-off-current-empty">Действующих выходных нет.</p>
                : <ul className="divide-y divide-slate-100" data-testid="days-off-list">{current.map(row)}</ul>}
            </div>
            {past.length > 0 && (
              <details className="group" data-testid="days-off-past">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">Отменённые и прошедшие ({past.length})</summary>
                <ul className="divide-y divide-slate-100" data-testid="days-off-past-list">{past.map(row)}</ul>
              </details>
            )}
          </>
        );
      })()}
      <DayOffDialog open={creating} onClose={() => setCreating(false)} onDone={created} />
      <VoidDialog day={voiding} onClose={() => setVoiding(null)} onDone={voided} />
    </section>
  );
}
