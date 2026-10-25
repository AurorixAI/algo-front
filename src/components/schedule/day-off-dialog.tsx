"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { orgApi } from "@/lib/api";
import { formatBusinessDate } from "@/lib/business-time";
import { EXAMS_NOTE, dayOffBody, dayOffDatesError, dayOffError, dayOffLessonLine, dayOffPreviewBody, dayOffSummary, type DayOffApplied, type DayOffForm, type DayOffPlan } from "@/lib/payf";
import { DateInput } from "@/components/ui/date-input";
import { Modal } from "@/components/ui/modal";

const FIELD = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10";
const LABEL = "mb-1 block text-xs font-semibold text-slate-600";

export const DAY_OFF_TITLE = "Выходной день центра";

/** Lessons in a quiet list; `tone` says whether they are cancelled («amber» = not). */
export function DayOffLessonList({ title, lessons, tone, testId }: { title: string; lessons: DayOffPlan["blocked"]; tone: "ok" | "warn"; testId: string }) {
  if (lessons.length === 0) return null;
  return (
    <div className={`rounded-xl border px-3.5 py-2.5 text-xs ${tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-700"}`} data-testid={testId}>
      <p className="font-semibold">{title}</p>
      {/* a list that scrolls is reachable and named for the keyboard and the screen reader */}
      <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto" tabIndex={0} aria-label={title}>
        {lessons.map((lesson) => <li key={`${lesson.groupId}-${lesson.lessonId}-${lesson.date}`}>{dayOffLessonLine(lesson)}</li>)}
      </ul>
    </div>
  );
}

/**
 * «Выходной день центра»: a date or a range (up to 14 days) and a reason (Хайит, Навруз).  The dialog shows at once what would happen («Будут отменены 4 урока в 4 группах: …»;
 * the lessons that cannot be cancelled - started, held, an exam is running - are listed apart and stay), then «Отменить уроки» cancels each lesson by the usual cancellation.
 * Nothing is written before that button.
 */
export function DayOffDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (result: DayOffApplied) => void }) {
  const today = useMemo(() => formatBusinessDate(), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const [form, setForm] = useState<DayOffForm>({ dateFrom: "", dateTo: "", reason: "" });
  const [plan, setPlan] = useState<DayOffPlan | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm({ dateFrom: today, dateTo: "", reason: "" });
    setPlan(null);
    setError(null);
  }, [open, today]);

  const problem = dayOffError(form);
  // the dry run depends on the DATES only: typing the reason does not ask the server again
  const datesProblem = dayOffDatesError(form);
  const key = JSON.stringify(dayOffPreviewBody(form));
  useEffect(() => {
    if (!open || datesProblem) { setPlan(null); setChecking(false); return undefined; }
    let cancelled = false;
    setChecking(true);
    const timer = setTimeout(() => {
      orgApi.previewDayOff(dayOffPreviewBody(form))
        .then((answer) => { if (!cancelled) { setPlan(answer); setError(null); } })
        .catch((cause) => { if (!cancelled) { setPlan(null); setError(cause instanceof Error ? cause.message : "Не удалось проверить уроки"); } })
        .finally(() => { if (!cancelled) setChecking(false); });
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
    // `form` is a new object on every keystroke; its key stands for the content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, datesProblem, key]);

  const patch = (next: Partial<DayOffForm>) => { setError(null); setForm((previous) => ({ ...previous, ...next })); };

  const submit = async () => {
    if (busy || problem || checking || !plan) return;
    setBusy(true);
    setError(null);
    try {
      onDone(await orgApi.createDayOff(dayOffBody(form)));
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось назначить выходной. Проверьте уроки и повторите.");
    } finally {
      setBusy(false);
    }
  };

  const count = plan?.cancellable.length ?? 0;
  return (
    <Modal
      open={open}
      title={DAY_OFF_TITLE}
      description="Уроки этих дней отменятся у всех групп центра; ученики увидят причину."
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Назад</button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || checking || problem !== null || !plan}
            data-testid="day-off-apply"
            className="flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {count > 0 ? "Отменить уроки" : "Сохранить выходной"}
          </button>
        </>
      }
    >
      <div className="space-y-4 pb-2">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="day-off-from" className={LABEL}>Первый день</label>
            <DateInput id="day-off-from" value={form.dateFrom} min={undefined} onChange={(next) => patch({ dateFrom: next })} className={FIELD} />
          </div>
          <div>
            <label htmlFor="day-off-to" className={LABEL}>Последний день (если несколько)</label>
            <DateInput id="day-off-to" value={form.dateTo} onChange={(next) => patch({ dateTo: next })} className={FIELD} />
          </div>
        </div>
        <div>
          <label htmlFor="day-off-reason" className={LABEL}>Причина</label>
          <input id="day-off-reason" value={form.reason} onChange={(event) => patch({ reason: event.target.value })} maxLength={200} placeholder="Например: Хайит, Навруз" className={FIELD} />
        </div>

        <div aria-live="polite" className="space-y-2" data-testid="day-off-plan">
          {problem && <p className="text-xs text-slate-500">{problem}</p>}
          {checking && <p className="flex items-center gap-1.5 text-xs text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />Проверяем уроки…</p>}
          {!checking && plan && (
            <>
              <p className="text-sm font-medium text-slate-900" data-testid="day-off-plan-text">{dayOffSummary(plan)}</p>
              {plan.alreadyCancelled > 0 && <p className="text-xs text-slate-500">Уже отменено раньше: {plan.alreadyCancelled}</p>}
              <DayOffLessonList title="Будут отменены" lessons={plan.cancellable} tone="ok" testId="day-off-cancellable" />
              <DayOffLessonList title="Отмена будет переведена в праздник" lessons={plan.convertible ?? []} tone="ok" testId="day-off-convertible" />
              <DayOffLessonList title="Не будут отменены" lessons={plan.blocked} tone="warn" testId="day-off-blocked" />
              <p className="text-xs text-slate-500" data-testid="day-off-exams-note">{plan.examsNote ?? EXAMS_NOTE}</p>
            </>
          )}
        </div>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{error}
          </p>
        )}
      </div>
    </Modal>
  );
}
