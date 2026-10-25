"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import { orgApi, type LessonEvent, type RecurringLessonEndImpact } from "@/lib/api";
import { Modal } from "@/components/ui/modal";
import { DateInput } from "@/components/ui/date-input";
import { Checkbox } from "@/components/ui/checkbox";
import { businessDayOfWeek, businessTimeMinutes, formatBusinessDate, formatIsoDateLabel } from "@/lib/business-time";
import { VALID_FROM_HINT, roomForSave, validFromBounds, validFromError } from "@/lib/schedule-slots";
import { opsErrorCode, opsErrorDetail, scheduleErrorText, teacherConflictLines, warningTexts } from "@/lib/ops-errors";
import type { TeacherBusyDetail } from "@/lib/ops-b-types";
import {
  DAYS, DAY_REQUIRED_TEXT, LESSON_SUBJECT, NO_TEACHER_SCHEDULE_HINT, nextBusinessDate, overlappingLesson, pastTimeProblem,
  suggestedTimes, timeRangeProblem,
} from "@/lib/lesson-slot-form";
import { LessonSlotFields, SLOT_FIELD_CLASS, WeekdayField, type SlotFormValue } from "@/components/schedule/lesson-slot-fields";

/** The weekly lesson as both screens know it (`LessonEvent` of the schedule, or an occurrence of it). */
export type WeeklyLesson = Pick<LessonEvent, "id" | "groupName" | "classLevel" | "dayOfWeek" | "startTime" | "endTime" | "room" | "format" | "color"> & { topic?: string };

const CANCEL_BUTTON = "px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50";
const PRIMARY_BUTTON = "inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors shadow-sm";

/** A refusal of the schedule in calm words; a busy teacher is told by the clashes alone (the server's own sentence repeats the first one with an ISO date). */
function refusalText(failure: unknown, fallback: string): string {
  if (opsErrorCode(failure) === "TEACHER_BUSY") {
    const lines = teacherConflictLines(opsErrorDetail<TeacherBusyDetail>(failure), 2);
    if (lines.length) return `У преподавателя в это время уже есть урок. ${lines.join("; ")}`;
  }
  return scheduleErrorText(failure, fallback);
}

function Problem({ children, tone = "rose" }: { children: React.ReactNode; tone?: "rose" | "amber" }) {
  const palette = tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-rose-200 bg-rose-50 text-rose-700";
  return (
    <p role="alert" className={`flex items-start gap-2 rounded-xl border p-3 text-xs font-semibold ${palette}`}>
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{children}</span>
    </p>
  );
}

function OverlapNote({ lesson }: { lesson: { groupName: string; startTime: string; endTime: string } }) {
  return (
    <Problem>
      Пересечение по времени: в это время уже назначен урок группы «{lesson.groupName}» ({lesson.startTime} — {lesson.endTime}).
    </Problem>
  );
}

// ── add a weekly lesson to one group (owner / administrator) ────────────────────────────────────────────────────────────────

/**
 * «Добавить в расписание» on the group page: one weekly lesson of THIS group (day, time, room, format, «Действует с»).  The same
 * rules as the teacher's form: nothing in the past of today, a clash of the teacher (409 TEACHER_BUSY) in calm words, a busy room is
 * a note after the save.  A group without a teacher is saved too (the server allows it): the dialog only says what to do next.
 */
export function AddWeeklyLessonDialog({ open, group, teacherAssigned, siblings, onClose, onCreated }: {
  open: boolean;
  group: { id: string; name: string };
  teacherAssigned: boolean;
  /** The weekly lessons of the group already (for a clash inside the group and for the suggested time). */
  siblings: readonly LessonEvent[];
  onClose: () => void;
  onCreated: (created: LessonEvent, notices: string[]) => void;
}) {
  const [day, setDay] = useState<number | null>(null);
  const [value, setValue] = useState<SlotFormValue>({ startTime: "10:00", endTime: "11:30", format: "offline", room: "", topic: "", color: "blue" });
  const [validFrom, setValidFrom] = useState(formatBusinessDate());
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDay(null);
    setValue({ startTime: "10:00", endTime: "11:30", format: "offline", room: "", topic: "", color: "blue" });
    setValidFrom(formatBusinessDate());
    setTouched(false);
    setBusy(false);
    setError(null);
  }, [open]);

  const today = formatBusinessDate();
  const patch = (next: Partial<SlotFormValue>) => { setValue((current) => ({ ...current, ...next })); setError(null); };
  const chooseDay = (next: number) => {
    setDay(next);
    setError(null);
    const times = suggestedTimes(siblings.filter((lesson) => lesson.dayOfWeek === next));
    setValue((current) => ({ ...current, ...times }));
  };

  const overlap = day ? overlappingLesson(siblings, day, value.startTime, value.endTime) : undefined;
  const timeProblem = timeRangeProblem(value.startTime, value.endTime);
  // the server: a lesson of today whose start has gone is refused - say it before the click
  const startsToday = Boolean(day) && (validFrom || today) === today && day === businessDayOfWeek();
  const pastProblem = startsToday && !timeProblem ? pastTimeProblem(value.startTime, businessTimeMinutes()) : null;
  const dateProblem = validFromError(validFrom, today);
  const blocking = timeProblem || pastProblem || dateProblem || (overlap ? "overlap" : null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!day) { setError(DAY_REQUIRED_TEXT); return; }
    if (blocking || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await orgApi.createLesson({
        groupId: group.id,
        dayOfWeek: day,
        startTime: value.startTime,
        endTime: value.endTime,
        subject: LESSON_SUBJECT,
        room: roomForSave(value.room),
        format: value.format,
        color: value.color,
        topic: value.topic.trim() || undefined,
        validFrom: validFrom || today,
      });
      if (!created?.id) throw new Error("Сервер не вернул идентификатор урока");
      onCreated(created, warningTexts(created));
    } catch (failure) {
      setError(refusalText(failure, "Не удалось добавить урок. Расписание не изменено — повторите попытку."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Добавить в расписание"
      description={`Еженедельный урок группы «${group.name}». Он будет повторяться каждую неделю.`}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={CANCEL_BUTTON}>Отмена</button>
          <button type="submit" form="weekly-lesson-add-form" disabled={busy || Boolean(blocking)} className={PRIMARY_BUTTON}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Сохранить урок
          </button>
        </>
      }
    >
      <form id="weekly-lesson-add-form" onSubmit={submit} className="space-y-4 pb-1" noValidate>
        {!teacherAssigned && (
          <p data-testid="weekly-no-teacher-hint" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
            {NO_TEACHER_SCHEDULE_HINT}. Урок сохранится в расписании группы уже сейчас.
          </p>
        )}

        <div>
          <label htmlFor="weekly-add-den-nedeli" className="block text-xs font-semibold text-slate-700 mb-1">День недели</label>
          <WeekdayField id="weekly-add-den-nedeli" value={day} onChange={chooseDay} disabled={busy} invalid={touched && !day} />
          <p className="mt-1 text-[11px] leading-4 text-slate-500">Урок будет повторяться в этот день каждую неделю.</p>
        </div>

        <div>
          <label htmlFor="weekly-add-deystvuet-s" className="block text-xs font-semibold text-slate-700 mb-1">Действует с</label>
          <DateInput
            id="weekly-add-deystvuet-s"
            value={validFrom}
            min={validFromBounds(today).min}
            max={validFromBounds(today).max}
            onChange={(next) => { setValidFrom(next); setError(null); }}
            disabled={busy}
            className={SLOT_FIELD_CLASS}
          />
          <p className="mt-1 text-[11px] leading-4 text-slate-500">{VALID_FROM_HINT}</p>
        </div>

        <LessonSlotFields idPrefix="weekly-add" value={value} onChange={patch} disabled={busy} endInvalid={Boolean(timeProblem) && touched} />

        {overlap && <OverlapNote lesson={overlap} />}
        {timeProblem && <Problem>{timeProblem}</Problem>}
        {pastProblem && <Problem>{pastProblem}</Problem>}
        {dateProblem && <Problem>{dateProblem}</Problem>}
        {error && <Problem>{error}</Problem>}
      </form>
    </Modal>
  );
}

// ── change the weekly lesson from a future date (owner / administrator / teacher) ───────────────────────────────────────────

type EditSnapshot = { day: number; startTime: string; endTime: string; room: string; format: LessonEvent["format"]; topic: string; color: LessonEvent["color"] };

function snapshotOf(lesson: WeeklyLesson): EditSnapshot {
  return {
    day: Number(lesson.dayOfWeek),
    startTime: lesson.startTime,
    endTime: lesson.endTime,
    room: lesson.room ?? "",
    format: lesson.format || "offline",
    topic: lesson.topic || "",
    color: lesson.color || "blue",
  };
}

/**
 * «Изменить постоянное расписание»: a new time / day / room from a FUTURE date.  The lessons before that date keep their time and
 * their attendance (the server versions the schedule; it never rewrites a past lesson).
 */
export function EditWeeklyLessonDialog({ lesson, siblings, onClose, onSaved }: {
  lesson: WeeklyLesson | null;
  /** The weekly lessons that may clash with the new time (the teacher's, or the group's). */
  siblings: readonly WeeklyLesson[];
  onClose: () => void;
  onSaved: (notices: string[], effectiveFrom: string) => void | Promise<void>;
}) {
  return lesson ? <EditWeeklyLessonForm key={lesson.id} lesson={lesson} siblings={siblings} onClose={onClose} onSaved={onSaved} /> : null;
}

function EditWeeklyLessonForm({ lesson, siblings, onClose, onSaved }: {
  lesson: WeeklyLesson;
  siblings: readonly WeeklyLesson[];
  onClose: () => void;
  onSaved: (notices: string[], effectiveFrom: string) => void | Promise<void>;
}) {
  const snapshot = useMemo(() => snapshotOf(lesson), [lesson]);
  const [day, setDay] = useState<number | null>(snapshot.day);
  const [value, setValue] = useState<SlotFormValue>({ startTime: snapshot.startTime, endTime: snapshot.endTime, format: snapshot.format, room: snapshot.room, topic: snapshot.topic, color: snapshot.color });
  const [effectiveFrom, setEffectiveFrom] = useState(nextBusinessDate());
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = (next: Partial<SlotFormValue>) => { setValue((current) => ({ ...current, ...next })); setError(null); };
  const overlap = day ? overlappingLesson(siblings, day, value.startTime, value.endTime, lesson.id) : undefined;
  const timeProblem = timeRangeProblem(value.startTime, value.endTime);
  // The server refuses an update without a real difference: compare with the normalised snapshot taken when the dialog opened.
  const changes = [
    day !== null && day !== snapshot.day && "день недели",
    (value.startTime !== snapshot.startTime || value.endTime !== snapshot.endTime) && "время занятия",
    value.room.trim() !== snapshot.room.trim() && "аудиторию",
    value.format !== snapshot.format && "формат проведения",
    value.topic.trim() !== snapshot.topic.trim() && "тему занятия",
    value.color !== snapshot.color && "цветовую метку",
  ].filter(Boolean) as string[];
  const hasChanges = changes.length > 0;
  const automaticReason = hasChanges ? `Изменены: ${changes.join(", ")}` : "Изменено постоянное расписание";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!day) { setError(DAY_REQUIRED_TEXT); return; }
    if (timeProblem) { setError(timeProblem); return; }
    if (!hasChanges) { setError("Измените хотя бы один параметр расписания."); return; }
    if (!effectiveFrom || effectiveFrom <= formatBusinessDate()) { setError("Постоянное расписание можно менять только начиная с будущей даты."); return; }
    setBusy(true);
    setError(null);
    try {
      const revised = await orgApi.reviseRecurringLesson(lesson.id, {
        effectiveFrom,
        reason: reason.trim() || automaticReason,
        dayOfWeek: day,
        startTime: value.startTime,
        endTime: value.endTime,
        room: roomForSave(value.room),
        format: value.format,
        color: value.color,
        topic: value.topic || undefined,
      });
      await onSaved(warningTexts(revised), effectiveFrom);
    } catch (failure) {
      setError(refusalText(failure, "Не удалось изменить постоянное расписание. Данные не изменены — повторите попытку."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title="Изменить постоянное расписание"
      description="Текущее и прошлые занятия не меняются. Новые правила начнут действовать с выбранной даты."
      onClose={onClose}
      busy={busy}
      footer={
        <>
          {!hasChanges && <p className="mr-auto text-[11px] text-slate-500">Измените хотя бы один параметр расписания.</p>}
          <button type="button" onClick={onClose} disabled={busy} className={CANCEL_BUTTON}>Отмена</button>
          <button type="submit" form="weekly-lesson-edit-form" disabled={busy || Boolean(overlap) || !hasChanges || !effectiveFrom || Boolean(timeProblem)} className={PRIMARY_BUTTON}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Изменить расписание
          </button>
        </>
      }
    >
      <form id="weekly-lesson-edit-form" onSubmit={submit} className="space-y-4 pb-1" noValidate>
        {/* A recurring revision cannot silently move a lesson to a different group. */}
        <div>
          <p className="block text-xs font-semibold text-slate-700 mb-1">Группа</p>
          <div className="w-full px-3 py-2 text-xs bg-slate-100 border border-slate-200 rounded-xl text-slate-700 font-medium">
            {lesson.groupName} ({lesson.classLevel} класс)
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="sched-edit-izmeneniya-deystvuyut-s" className="block text-xs font-semibold text-slate-700 mb-1">Изменения действуют с</label>
            <DateInput id="sched-edit-izmeneniya-deystvuyut-s" value={effectiveFrom} min={nextBusinessDate()} onChange={(next) => { setEffectiveFrom(next); setError(null); }} required disabled={busy} className={SLOT_FIELD_CLASS} />
          </div>
          <div className="flex items-end">
            <p className="rounded-xl border border-primary-100 bg-primary-50 px-3 py-2 text-[11px] leading-relaxed text-primary-800">Уроки до этой даты сохраняют прежнее время и посещаемость.</p>
          </div>
        </div>

        <div>
          <label htmlFor="sched-edit-den-nedeli" className="block text-xs font-semibold text-slate-700 mb-1">День недели</label>
          <WeekdayField id="sched-edit-den-nedeli" value={day} onChange={(next) => { setDay(next); setError(null); }} disabled={busy} />
        </div>

        <LessonSlotFields
          idPrefix="sched-edit"
          value={value}
          onChange={patch}
          disabled={busy}
          endInvalid={Boolean(timeProblem)}
          afterTopic={(
            <div>
              <label htmlFor="sched-edit-prichina-izmeneniya" className="block text-xs font-semibold text-slate-700 mb-1">
                Причина изменения <span className="font-normal text-slate-400">(необязательно)</span>
              </label>
              <textarea
                id="sched-edit-prichina-izmeneniya"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={500}
                rows={2}
                disabled={busy}
                placeholder="Например: постоянная смена аудитории"
                className={`${SLOT_FIELD_CLASS} resize-none`}
              />
              <p className="mt-1 text-[11px] text-slate-500">Если оставить поле пустым, система автоматически зафиксирует изменённые параметры.</p>
            </div>
          )}
        />

        {overlap && <OverlapNote lesson={overlap} />}
        {timeProblem && <Problem>{timeProblem}</Problem>}
        {error && <Problem>{error}</Problem>}
      </form>
    </Modal>
  );
}

// ── stop the weekly lesson from a future date ────────────────────────────────────────────────────────────────────────────────

/**
 * «Прекратить занятия»: the lesson stops from a future date; the past lessons, the attendance and the journal stay as they are.
 * Before it the dialog asks the server what the stop would do to the future exams of the lesson (they return to drafts only after an
 * explicit tick), exactly as the teacher's screen always did.
 */
export function EndWeeklyLessonDialog({ lesson, onClose, onEnded }: {
  lesson: WeeklyLesson | null;
  onClose: () => void;
  onEnded: () => void | Promise<void>;
}) {
  return lesson ? <EndWeeklyLessonForm key={lesson.id} lesson={lesson} onClose={onClose} onEnded={onEnded} /> : null;
}

function EndWeeklyLessonForm({ lesson, onClose, onEnded }: {
  lesson: WeeklyLesson;
  onClose: () => void;
  onEnded: () => void | Promise<void>;
}) {
  const [effectiveFrom, setEffectiveFrom] = useState(nextBusinessDate());
  const [reason, setReason] = useState("");
  const [impact, setImpact] = useState<RecurringLessonEndImpact | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [busy, setBusy] = useState(false);
  const [release, setRelease] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!effectiveFrom) return;
    if (effectiveFrom <= formatBusinessDate()) {
      setImpact(null);
      setError("Выберите будущую дату прекращения занятий.");
      return;
    }
    let cancelled = false;
    setLoadingImpact(true);
    setError(null);
    setImpact(null);
    setRelease(false);
    void orgApi.getRecurringLessonEndImpact(lesson.id, effectiveFrom)
      .then((result) => { if (!cancelled) setImpact(result); })
      .catch((failure) => {
        if (!cancelled) {
          setError(failure instanceof Error && failure.message
            ? failure.message
            : "Не удалось проверить связанные экзамены. Для безопасности прекращение сейчас недоступно.");
        }
      })
      .finally(() => { if (!cancelled) setLoadingImpact(false); });
    return () => { cancelled = true; };
  }, [lesson.id, effectiveFrom]);

  const confirm = async () => {
    if (!impact || busy) return;
    const text = reason.trim();
    if (text.length < 3) { setError("Укажите понятную причину прекращения регулярных занятий."); return; }
    if (!impact.canEnd) { setError("Сначала завершите или разберите экзамены, которые уже нельзя вернуть в черновик."); return; }
    if (impact.affectedExamCount > 0 && !release) { setError("Подтвердите, что затронутые экзамены будут возвращены в черновики."); return; }
    setBusy(true);
    setError(null);
    try {
      await orgApi.endRecurringLesson(lesson.id, { effectiveFrom, reason: text, releaseAffectedExams: release });
      await onEnded();
    } catch (failure) {
      setError(failure instanceof Error && failure.message ? failure.message : "Не удалось прекратить регулярные занятия. Расписание не изменено.");
    } finally {
      setBusy(false);
    }
  };

  const dayName = DAYS.find((day) => day.id === Number(lesson.dayOfWeek))?.name ?? "Регулярное занятие";
  return (
    <Modal
      open
      title="Прекратить занятия"
      description="Прошедшие уроки, посещаемость и журнал останутся без изменений. Новые экземпляры этого занятия перестанут появляться с выбранной даты."
      onClose={onClose}
      busy={busy}
      maxWidthClassName="max-w-lg"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={`${CANCEL_BUTTON} inline-flex items-center gap-1.5 sm:mr-auto`}>
            <ArrowLeft className="h-3.5 w-3.5" /> Назад
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={busy || loadingImpact || !impact || !impact.canEnd || reason.trim().length < 3 || (impact.affectedExamCount > 0 && !release)}
            className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Прекращаем…" : "Прекратить занятия"}
          </button>
        </>
      }
    >
      <div className="space-y-4 pb-1">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">{lesson.groupName}</p>
          <p className="mt-0.5 text-xs text-slate-500">{dayName} · {lesson.startTime}—{lesson.endTime}</p>
        </div>

        <label className="block text-xs font-semibold text-slate-700">
          Прекратить с даты
          <DateInput
            value={effectiveFrom}
            min={nextBusinessDate()}
            onChange={(next) => setEffectiveFrom(next)}
            disabled={busy}
            wrapperClassName="mt-1.5"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none transition focus:border-rose-400 focus:ring-2 focus:ring-rose-100 disabled:cursor-not-allowed disabled:bg-slate-50"
          />
        </label>

        <label className="block text-xs font-semibold text-slate-700">
          Причина
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            rows={2}
            disabled={busy}
            placeholder="Например: группа закончила курс"
            className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 disabled:cursor-not-allowed disabled:bg-slate-50"
          />
        </label>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
          <p className="text-sm font-bold text-slate-900">Проверка будущих экзаменов</p>
          {loadingImpact ? (
            <p className="mt-2 text-xs text-slate-500">Проверяем привязанные экзамены…</p>
          ) : impact ? (
            <div className="mt-2 space-y-3">
              {impact.affectedExamCount === 0 ? (
                <p className="text-xs leading-relaxed text-emerald-700">Связанных будущих экзаменов нет. Расписание можно безопасно прекратить.</p>
              ) : (
                <>
                  <p className="text-xs leading-relaxed text-slate-600">
                    Найдено: {impact.affectedExamCount}. {impact.canEnd
                      ? "После подтверждения они вернутся в черновики, а доступы и печатные комплекты будут закрыты."
                      : "Есть экзамены, которые уже нельзя безопасно вернуть в черновики."}
                  </p>
                  <div className="max-h-32 space-y-2 overflow-y-auto pr-1">
                    {impact.exams.map((exam) => (
                      <div key={exam.examId} className={`rounded-xl border px-3 py-2 ${exam.canRelease ? "border-slate-200 bg-white" : "border-rose-200 bg-rose-50"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-slate-800">{exam.title}</p>
                            <p className="mt-0.5 text-[11px] text-slate-500">{formatIsoDateLabel(exam.lessonDate, { day: "numeric", month: "long", year: "numeric" })} · {exam.deliveryMode === "print" ? "Печатный" : "Онлайн"}</p>
                          </div>
                          <span className={`shrink-0 text-[11px] font-semibold ${exam.canRelease ? "text-emerald-700" : "text-rose-700"}`}>
                            {exam.canRelease ? "Вернётся в черновик" : exam.blockerReason ?? "Требует разбора"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {impact.canEnd && (
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
                      <Checkbox checked={release} onChange={(event) => setRelease(event.target.checked)} disabled={busy} />
                      <span>Подтверждаю возврат затронутых экзаменов в черновики.</span>
                    </label>
                  )}
                </>
              )}
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-500">Выберите будущую дату, чтобы проверить последствия.</p>
          )}
        </div>

        {error && (
          <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs leading-relaxed text-rose-700">{error}</div>
        )}
      </div>
    </Modal>
  );
}
