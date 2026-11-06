"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Info, Loader2 } from "lucide-react";
import { orgApi } from "@/lib/api";
import { formatBusinessDate } from "@/lib/business-time";
import { REASON_MIN } from "@/lib/payments";
import { REASON_LIMITS } from "@/lib/reason-rules";
import { DAY_OFF_LIST_PREVIEW, DAY_OFF_MONEY_LINE, EXAMS_NOTE, dayOffBody, dayOffDatesError, dayOffError, dayOffLessonLine, dayOffPreviewBody, dayOffSummary, sortDayOffLessons, type DayOffApplied, type DayOffForm, type DayOffPlan } from "@/lib/payf";
import { DateInput } from "@/components/ui/date-input";
import { Modal } from "@/components/ui/modal";
import { CONFIRM_FOOTER_CLASS, ConfirmFooter } from "@/components/money/dialog-footer";
import { substitutionErrorText } from "@/lib/substitutions";

const FIELD = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10";
const LABEL = "mb-1 block text-xs font-semibold text-slate-600";

export const DAY_OFF_TITLE = "Выходной день центра";

/**
 * Lessons in a quiet list, by date and time, one line each («28.10 · 10:00–10:45 · Группа»); `tone` says whether they are cancelled («amber» = not).  A long list shows the first
 * five and «Показать все N» opens the rest - no hidden scrolling inside the window.
 */
export function DayOffLessonList({ title, lessons, tone, testId, hideTitle = false }: { title: string; lessons: DayOffPlan["blocked"]; tone: "ok" | "warn"; testId: string; hideTitle?: boolean }) {
  const [all, setAll] = useState(false);
  if (lessons.length === 0) return null;
  const sorted = sortDayOffLessons(lessons);
  const long = sorted.length > DAY_OFF_LIST_PREVIEW;
  const shown = long && !all ? sorted.slice(0, DAY_OFF_LIST_PREVIEW) : sorted;
  return (
    <div className={`rounded-xl border px-3.5 py-2.5 text-xs ${tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-700"}`} data-testid={testId}>
      {/* re-audit С8: the sentence over the list («Будет отменён 1 урок в 1 группе») is its title - no second heading */}
      <p className={hideTitle ? "sr-only" : "font-semibold"}>{title}</p>
      <ul className={`${hideTitle ? "" : "mt-1 "}space-y-0.5`} aria-label={title}>
        {shown.map((lesson) => <li key={`${lesson.groupId}-${lesson.lessonId}-${lesson.date}`}>{dayOffLessonLine(lesson)}</li>)}
      </ul>
      {long && (
        <button type="button" onClick={() => setAll((previous) => !previous)} aria-expanded={all} data-testid={`${testId}-toggle`} className="mt-1.5 font-semibold underline underline-offset-2 hover:no-underline">
          {all ? "Свернуть" : `Показать все ${sorted.length}`}
        </button>
      )}
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
  const [reasonTouched, setReasonTouched] = useState(false);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);        // a second press in the same tick sees the state of the first one (rule 27)
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm({ dateFrom: today, dateTo: "", reason: "" });
    setReasonTouched(false);
    setPlan(null);
    setError(null);
  }, [open, today]);

  const problem = dayOffError(form);
  // re-audit С8: the short reason is told UNDER ITS FIELD once the field was left (the line over the button says it for the button)
  const reasonShort = reasonTouched && form.reason.trim().length < REASON_MIN;
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
    if (busy || sending.current || problem || checking || !plan) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      onDone(await orgApi.createDayOff(dayOffBody(form)));
      onClose();
    } catch (cause) {
      setError(substitutionErrorText(cause, "Не удалось назначить выходной. Проверьте уроки и повторите."));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={DAY_OFF_TITLE}
      description="Уроки этих дней отменятся у всех групп центра; ученики увидят причину."
      onClose={onClose}
      busy={busy}
      footerClassName={CONFIRM_FOOTER_CLASS}
      footer={(
        // UX pack №12 / rule 3: «Назначить выходной» (a day off can be cancelled - blue); off - with the line «почему»
        <ConfirmFooter
          primary="Назначить выходной"
          onPrimary={() => void submit()}
          busy={busy}
          disabled={checking || problem !== null || !plan}
          why={problem ?? (checking ? "Проверяем, какие уроки отменятся…" : "Выберите дни — покажем, какие уроки отменятся.")}
          whyId="day-off-why"
          onCancel={onClose}
          testId="day-off-apply"
        />
      )}
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
          <label htmlFor="day-off-reason" className={LABEL}>Причина <span className="font-normal text-slate-500">(обязательно)</span></label>
          <input
            id="day-off-reason"
            value={form.reason}
            onChange={(event) => patch({ reason: event.target.value })}
            onBlur={() => setReasonTouched(form.reason.length > 0)}
            maxLength={REASON_LIMITS.dayOff.max}
            placeholder="Например: Хайит, Навруз"
            aria-required="true"
            aria-invalid={reasonShort ? true : undefined}
            aria-describedby={reasonShort ? "day-off-reason-error" : undefined}
            className={reasonShort ? FIELD.replace("border-slate-200", "border-red-500") : FIELD}
          />
          {reasonShort && <p id="day-off-reason-error" data-testid="day-off-reason-error" role="alert" className="mt-1 text-xs font-medium text-red-700">{`Укажите причину — не короче ${REASON_MIN} символов`}</p>}
        </div>

        <div aria-live="polite" className="space-y-2" data-testid="day-off-plan">
          {checking && <p className="flex items-center gap-1.5 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Проверяем уроки…</p>}
          {!checking && plan && (
            <>
              <p className="text-sm font-medium text-slate-900" data-testid="day-off-plan-text">{dayOffSummary(plan)}</p>
              {plan.alreadyCancelled > 0 && <p className="text-xs text-slate-500">Уже отменено раньше: {plan.alreadyCancelled}</p>}
              <DayOffLessonList title="Будут отменены" lessons={plan.cancellable} tone="ok" testId="day-off-cancellable" hideTitle />
              <DayOffLessonList title="Отмена будет переведена в праздник" lessons={plan.convertible ?? []} tone="ok" testId="day-off-convertible" />
              <DayOffLessonList title="Не будут отменены" lessons={plan.blocked} tone="warn" testId="day-off-blocked" />
              {plan.cancellable.length + (plan.convertible ?? []).length > 0 && <p className="text-xs text-slate-700" data-testid="day-off-money">{DAY_OFF_MONEY_LINE}</p>}
              <p className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700" data-testid="day-off-exams-note"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />{plan.examsNote ?? EXAMS_NOTE}</p>
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
