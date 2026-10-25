"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import { orgApi, type LessonEvent, type RecurringLessonEndImpact } from "@/lib/api";
import { Modal } from "@/components/ui/modal";
import { DateInput } from "@/components/ui/date-input";
import { Checkbox } from "@/components/ui/checkbox";
import { businessDayOfWeek, businessTimeMinutes, formatBusinessDate, formatIsoDateLabel, isoDateDayOfWeek } from "@/lib/business-time";
import { validFromError } from "@/lib/schedule-slots";
import { warningTexts } from "@/lib/ops-errors";
import { createOneOff, createWeeklyLessons, mergeNotices, refusalText, reviseWeeklyLessons } from "@/lib/weekly-lessons";
import {
  DAYS, DAY_REQUIRED_TEXT, NO_TEACHER_SCHEDULE_HINT, dayList, dayShort, nextBusinessDate, overlappingLesson, pastTimeProblem,
  timeRangeProblem, weeklyResultText, revisionPatch, sharedRevisionPatch, CHANGED_WORDS, type WeeklyLesson,
} from "@/lib/lesson-slot-form";
import { LessonScopeFields, LessonSlotFields, SLOT_FIELD_CLASS, WeekdayChips, type LessonScope, type SlotFormValue } from "@/components/schedule/lesson-slot-fields";

const DATE_REQUIRED_TEXT = "Выберите дату";

const DEFAULT_VALUE: SlotFormValue = { startTime: "10:00", endTime: "11:30", format: "offline", room: "", topic: "", color: "blue" };

export type { WeeklyLesson };

const CANCEL_BUTTON = "px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50";
const PRIMARY_BUTTON = "inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors shadow-sm";

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

// ── add a lesson to one group (owner / administrator) ───────────────────────────────────────────────────────────────────────

/**
 * «Добавить в расписание» on the group page: a weekly lesson (one or several weekdays at once) or a one-off lesson of THIS group, with
 * the rules of the teacher's form: nothing in the past of today, a clash of the teacher (409 TEACHER_BUSY) in calm words, a busy room is
 * a note after the save.  Several weekdays are saved one by one and the answer names the days that were added and the days that were
 * refused («Пн и Ср добавлены, Пт — преподаватель занят»): the refused ones stay chosen to be fixed or dropped.  A group without a
 * teacher is saved too (the server allows it): the dialog only says what to do next.
 */
export function AddLessonDialog({ open, group, teacherAssigned, siblings, onClose, onAdded }: {
  open: boolean;
  group: { id: string; name: string };
  teacherAssigned: boolean;
  /** The weekly lessons of the group already (for a clash inside the group). */
  siblings: readonly LessonEvent[];
  onClose: () => void;
  /** Something was saved (also when only some days were): the schedule is read again. `closed` = the dialog is done. */
  onAdded: (summary: { text: string; notices: string[]; closed: boolean }) => void;
}) {
  const [scope, setScope] = useState<LessonScope>("recurring");
  const [days, setDays] = useState<number[]>([]);
  const [date, setDate] = useState(formatBusinessDate());
  const [value, setValue] = useState<SlotFormValue>(DEFAULT_VALUE);
  const [validFrom, setValidFrom] = useState(formatBusinessDate());
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);       // a second submit in the same tick (double click, Enter + click) sees the state of the first one: the state alone is not read yet
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setScope("recurring");
    setDays([]);
    setDate(formatBusinessDate());
    setValue(DEFAULT_VALUE);
    setValidFrom(formatBusinessDate());
    setTouched(false);
    setBusy(false);
    setError(null);
    setDetails([]);
  }, [open]);

  const today = formatBusinessDate();
  const patch = (next: Partial<SlotFormValue>) => { setValue((current) => ({ ...current, ...next })); setError(null); setDetails([]); };

  const timeProblem = timeRangeProblem(value.startTime, value.endTime);
  // a clash inside the group: every chosen weekday for a weekly lesson, the weekday of the date for a one-off one
  const overlaps = scope === "recurring"
    ? days.map((day) => ({ day, lesson: overlappingLesson(siblings, day, value.startTime, value.endTime) })).filter((item) => item.lesson)
    : /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? [{
          day: isoDateDayOfWeek(date),
          // a weekly lesson that does not act yet on that date is no clash
          lesson: overlappingLesson(siblings.filter((item) => !item.validFrom || item.validFrom <= date), isoDateDayOfWeek(date), value.startTime, value.endTime),
        }].filter((item) => item.lesson)
      : [];
  // the server: a lesson of today whose start has gone is refused.  A weekly lesson loses only that weekday (the others are saved and
  // the day is named); a one-off lesson of today is blocked as a whole
  const nowPast = !timeProblem && pastTimeProblem(value.startTime, businessTimeMinutes()) !== null;
  const pastDays = scope === "recurring" && nowPast && (validFrom || today) === today && days.includes(businessDayOfWeek()) ? [businessDayOfWeek()] : [];
  const sendDays = days.filter((day) => !pastDays.includes(day));
  const pastOneOff = scope === "one_off" && nowPast && date === today ? pastTimeProblem(value.startTime, businessTimeMinutes()) : null;
  const dateProblem = scope === "recurring"
    ? validFromError(validFrom, today)
    : !date ? DATE_REQUIRED_TEXT : date < today ? "Нельзя добавить занятие на прошедшую дату" : null;
  const allPast = scope === "recurring" && days.length > 0 && sendDays.length === 0;
  const blocking = timeProblem || pastOneOff || dateProblem || allPast || overlaps.length > 0;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || sending.current) return;
    setTouched(true);
    if (scope === "recurring" && days.length === 0) { setError(DAY_REQUIRED_TEXT); return; }
    if (blocking) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    setDetails([]);
    try {
      if (scope === "one_off") {
        const notices = await createOneOff(group.id, date, value);
        onAdded({ text: "Разовое занятие добавлено в расписание группы", notices, closed: true });
        return;
      }
      const result = await createWeeklyLessons(group.id, sendDays, { ...value, validFrom: validFrom || today });
      const skipped = pastDays.map((day) => ({ day, reason: "время уже прошло", detail: `${dayShort(day)}: время уже прошло — на этот день урок не добавлен.` }));
      const failed = [...result.failed, ...skipped];
      if (failed.length === 0) {
        onAdded({
          text: result.added.length > 1 ? `Уроки добавлены в расписание группы: ${dayList(result.added)}` : "Урок добавлен в расписание группы",
          notices: result.notices,
          closed: true,
        });
        return;
      }
      // no silent partial success: say which days were added and which were not; only the refused days stay chosen
      setError(weeklyResultText(result.added, failed));
      setDetails(failed.map((item) => item.detail.startsWith(`${dayShort(item.day)}:`) ? item.detail : `${dayShort(item.day)}: ${item.detail}`));
      setDays(failed.map((item) => item.day));
      if (result.added.length > 0) onAdded({ text: `${dayList(result.added)} — добавлено`, notices: result.notices, closed: false });
    } catch (failure) {
      setError(refusalText(failure, "Не удалось добавить урок. Расписание не изменено — повторите попытку."));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Добавить в расписание"
      description={`Урок группы «${group.name}»`}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={CANCEL_BUTTON}>Отмена</button>
          <button type="submit" form="lesson-add-form" disabled={busy || Boolean(blocking)} className={PRIMARY_BUTTON}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Сохранить урок
          </button>
        </>
      }
    >
      <form id="lesson-add-form" onSubmit={submit} className="space-y-4 pb-1" noValidate>
        {!teacherAssigned && (
          <p data-testid="weekly-no-teacher-hint" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
            {NO_TEACHER_SCHEDULE_HINT}. Урок сохранится в расписании группы уже сейчас.
          </p>
        )}

        <LessonScopeFields
          idPrefix="weekly-add"
          scope={scope}
          onScope={(next) => { setScope(next); setError(null); setDetails([]); }}
          days={days}
          onDays={(next) => { setDays(next); setError(null); setDetails([]); }}
          daysInvalid={touched && scope === "recurring" && days.length === 0}
          date={date}
          onDate={(next) => { setDate(next); setError(null); }}
          validFrom={validFrom}
          onValidFrom={(next) => { setValidFrom(next); setError(null); }}
          disabled={busy}
        />

        <LessonSlotFields idPrefix="weekly-add" value={value} onChange={patch} disabled={busy} endInvalid={Boolean(timeProblem)} />

        {overlaps.map((item) => item.lesson && <OverlapNote key={item.day} lesson={item.lesson} />)}
        {timeProblem && <Problem>{timeProblem}</Problem>}
        {pastOneOff && <Problem>{pastOneOff}</Problem>}
        {pastDays.length > 0 && !allPast && <Problem tone="amber">{dayShort(pastDays[0])}: время уже прошло — этот день не будет добавлен, остальные сохранятся.</Problem>}
        {allPast && <Problem>{dayShort(pastDays[0])}: время уже прошло. Выберите более позднее время или другие дни.</Problem>}
        {dateProblem && <Problem>{dateProblem}</Problem>}
        {error && (
          <div role="alert" data-testid="weekly-add-error" className="space-y-1.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
            <p className="flex items-start gap-2 font-semibold"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{error}</span></p>
            {details.map((line) => <p key={line} className="pl-6 font-normal leading-relaxed">{line}</p>)}
          </div>
        )}
      </form>
    </Modal>
  );
}

// ── change the weekly lesson from a future date (owner / administrator / teacher) ───────────────────────────────────────────

/** The weekly lesson as it stands on a date (a revision already scheduled counts); null when it cannot be told. */
export type ResolveWeeklyLesson = (date: string) => Promise<WeeklyLesson | null>;

const CHANGED_FIELD_NAME: Record<string, string> = {
  dayOfWeek: "день недели", startTime: "время занятия", endTime: "время занятия", room: "аудиторию", format: "формат проведения", topic: "тему занятия", color: "цветовую метку",
};

/**
 * «Изменить постоянное расписание»: a new time / day / room from a FUTURE date.  The lessons before that date keep their time and
 * their attendance (the server versions the schedule; it never rewrites a past lesson).  The form starts from the lesson as it stands
 * ON that date, and only the fields that were really changed are sent: a revision already scheduled is never undone by a field nobody touched.
 */
export function EditWeeklyLessonDialog({ lesson, siblings, onClose, onSaved, onProgress, defaultEffectiveFrom, resolveAt, aboveLessonPanel = false }: {
  lesson: WeeklyLesson | null;
  /** The date the change starts from when the dialog opens (a future one; default: tomorrow). */
  defaultEffectiveFrom?: string;
  /** The weekly lessons that may clash with the new time (the teacher's, or the group's). */
  siblings: readonly WeeklyLesson[];
  /** The lesson as it stands on another date, when the user moves «Изменения действуют с». */
  resolveAt?: ResolveWeeklyLesson;
  /** Over the lesson panel of the teacher's cabinet (z 99999). */
  aboveLessonPanel?: boolean;
  onClose: () => void;
  onSaved: (notices: string[], effectiveFrom: string) => void | Promise<void>;
  /** Some of the lessons were changed and the dialog stays open (a refused one is left to fix): read the schedule again. */
  onProgress?: () => void;
}) {
  return lesson ? (
    <EditWeeklyLessonForm key={lesson.id} lesson={lesson} siblings={siblings} onClose={onClose} onSaved={onSaved} onProgress={onProgress} defaultEffectiveFrom={defaultEffectiveFrom} resolveAt={resolveAt} aboveLessonPanel={aboveLessonPanel} />
  ) : null;
}

function startingFrom(defaultEffectiveFrom?: string): string {
  return defaultEffectiveFrom && defaultEffectiveFrom >= nextBusinessDate() ? defaultEffectiveFrom : nextBusinessDate();
}

function EditWeeklyLessonForm({ lesson, siblings, onClose, onSaved, onProgress, defaultEffectiveFrom, resolveAt, aboveLessonPanel }: {
  lesson: WeeklyLesson;
  defaultEffectiveFrom?: string;
  siblings: readonly WeeklyLesson[];
  resolveAt?: ResolveWeeklyLesson;
  aboveLessonPanel: boolean;
  onClose: () => void;
  onSaved: (notices: string[], effectiveFrom: string) => void | Promise<void>;
  onProgress?: () => void;
}) {
  const fieldsOf = (source: WeeklyLesson): SlotFormValue => ({ startTime: source.startTime, endTime: source.endTime, format: source.format || "offline", room: source.room ?? "", topic: source.topic || "", color: source.color || "blue" });
  const initialFrom = useMemo(() => startingFrom(defaultEffectiveFrom), [defaultEffectiveFrom]);
  const [baseline, setBaseline] = useState<WeeklyLesson>(lesson);
  const [day, setDay] = useState<number | null>(Number(lesson.dayOfWeek));
  const [value, setValue] = useState<SlotFormValue>(fieldsOf(lesson));
  const [effectiveFrom, setEffectiveFrom] = useState(initialFrom);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [error, setError] = useState<string | null>(null);
  // «Применить также к другим дням группы»: the ids of the other weekly lessons of the group the same change goes to
  const [tickedIds, setTickedIds] = useState<string[]>([]);
  const [mainSaved, setMainSaved] = useState(false);
  const [details, setDetails] = useState<string[]>([]);
  const latest = useRef({ baseline, day, value });
  latest.current = { baseline, day, value };

  const formOf = (d: number, v: SlotFormValue) => ({ day: d, ...v });
  // The lesson as it stands on the chosen date: a revision already scheduled for it counts.  A form nobody has touched takes the new state;
  // a form with edits keeps them and is compared with the new state.
  useEffect(() => {
    if (!resolveAt || effectiveFrom === initialFrom || effectiveFrom < nextBusinessDate()) return undefined;
    let cancelled = false;
    void resolveAt(effectiveFrom).then((snapshot) => {
      if (cancelled || !snapshot) return;
      const now = latest.current;
      const untouched = now.day !== null && Object.keys(revisionPatch(now.baseline, formOf(now.day, now.value))).length === 0;
      setBaseline(snapshot);
      if (untouched) { setDay(Number(snapshot.dayOfWeek)); setValue(fieldsOf(snapshot)); }
    }).catch(() => undefined);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveFrom]);

  const patch = (next: Partial<SlotFormValue>) => { setValue((current) => ({ ...current, ...next })); setError(null); setDetails([]); };
  const overlap = day ? overlappingLesson(siblings, day, value.startTime, value.endTime, lesson.id) : undefined;
  const timeProblem = timeRangeProblem(value.startTime, value.endTime);
  // The server refuses an update without a real difference: compare with the lesson as it stands on the date of the change.
  const changed = day !== null ? revisionPatch(baseline, formOf(day, value)) : {};
  const changedNames = Array.from(new Set(Object.keys(changed).map((key) => CHANGED_FIELD_NAME[key]).filter(Boolean)));
  const hasChanges = changedNames.length > 0;
  const automaticReason = hasChanges ? `Изменены: ${changedNames.join(", ")}` : "Изменено постоянное расписание";

  // the other weekly lessons of THIS group: the same time / room / format / topic can go to them too (never the day)
  const shared = sharedRevisionPatch(changed, value);
  const groupOthers = useMemo(
    () => siblings
      .filter((item) => item.id !== lesson.id && Boolean(lesson.groupId) && item.groupId === lesson.groupId)
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime)),
    [siblings, lesson.id, lesson.groupId],
  );
  const showOthers = groupOthers.length > 0 && Object.keys(shared).length > 0;
  const targets = showOthers ? groupOthers.filter((item) => tickedIds.includes(item.id)) : [];
  // each ticked lesson with its new time must not touch another lesson (the edited one at its new place included)
  const targetOverlaps = day === null ? [] : targets.map((target) => {
    const asEdited = { id: lesson.id, groupName: lesson.groupName, dayOfWeek: day, startTime: value.startTime, endTime: value.endTime };
    const others = [...siblings.filter((item) => item.id !== lesson.id && item.id !== target.id), asEdited];
    return { target, clash: overlappingLesson(others, target.dayOfWeek, shared.startTime ?? target.startTime, shared.endTime ?? target.endTime) };
  }).filter((item) => item.clash);
  const toggleTarget = (id: string) => { setTickedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id])); setError(null); setDetails([]); };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || sending.current) return;
    if (!day) { setError(DAY_REQUIRED_TEXT); return; }
    if (timeProblem) { setError(timeProblem); return; }
    if (!mainSaved && !hasChanges) { setError("Измените хотя бы один параметр расписания."); return; }
    if (!effectiveFrom || effectiveFrom <= formatBusinessDate()) { setError("Постоянное расписание можно менять только начиная с будущей даты."); return; }
    sending.current = true;
    setBusy(true);
    setError(null);
    setDetails([]);
    const text = reason.trim() || automaticReason;
    let notices: string[] = [];
    const mainFound: Array<{ note: string; day: number }> = [];
    try {
      if (!mainSaved) {
        const revised = await orgApi.reviseRecurringLesson(lesson.id, { effectiveFrom, reason: text, ...changed });
        for (const note of warningTexts(revised)) mainFound.push({ note, day: Number(lesson.dayOfWeek) });
        notices = mergeNotices(mainFound, 1);
        setMainSaved(true);
      }
    } catch (failure) {
      setError(refusalText(failure, "Не удалось изменить постоянное расписание. Данные не изменены — повторите попытку."));
      sending.current = false;
      setBusy(false);
      return;
    }
    try {
      if (targets.length === 0) {
        await onSaved(notices, effectiveFrom);
        return;
      }
      // the same change for the ticked days, one by one: a refusal names its day and leaves the others done; only the refused stay ticked
      const result = await reviseWeeklyLessons(targets, effectiveFrom, text, shared);
      notices = mergeNotices([...mainFound, ...result.found], targets.length + 1);
      if (result.failed.length === 0) {
        await onSaved(notices, effectiveFrom);
        return;
      }
      setError(weeklyResultText([day, ...result.done], result.failed, CHANGED_WORDS));
      setDetails(result.failed.map((item) => `${dayShort(item.day)}: ${item.detail}`));
      setTickedIds(result.failed.map((item) => item.id));
      onProgress?.();
    } catch (failure) {
      setError(refusalText(failure, "Не удалось изменить постоянное расписание. Данные не изменены — повторите попытку."));
    } finally {
      sending.current = false;
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
      aboveLessonPanel={aboveLessonPanel}
      footer={
        <>
          {!hasChanges && !mainSaved && <p className="mr-auto text-[11px] text-slate-500">Измените хотя бы один параметр расписания.</p>}
          <button type="button" onClick={onClose} disabled={busy} className={CANCEL_BUTTON}>Отмена</button>
          <button type="submit" form="weekly-lesson-edit-form" disabled={busy || Boolean(overlap) || targetOverlaps.length > 0 || (!mainSaved && !hasChanges) || (mainSaved && targets.length === 0) || !effectiveFrom || Boolean(timeProblem)} className={PRIMARY_BUTTON}>
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

        <WeekdayChips idPrefix="sched-edit" single days={day ? [day] : []} onChange={(next) => { setDay(next[0] ?? null); setError(null); setDetails([]); }} disabled={busy || mainSaved} />

        <LessonSlotFields
          idPrefix="sched-edit"
          value={value}
          onChange={patch}
          disabled={busy || mainSaved}
          endInvalid={Boolean(timeProblem)}
        />

        {showOthers && (
          <fieldset data-testid="apply-to-others" className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <legend className="px-1 text-xs font-semibold text-slate-700">Применить также к другим дням группы</legend>
            <p className="mb-2 text-[11px] leading-4 text-slate-500">Изменённые время, кабинет, формат и тема пойдут и в выбранные уроки с той же даты. День у них не меняется.</p>
            <div className="flex flex-wrap gap-2">
              {groupOthers.map((item) => (
                <label key={item.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700">
                  <Checkbox checked={tickedIds.includes(item.id)} onChange={() => toggleTarget(item.id)} disabled={busy} />
                  {dayShort(item.dayOfWeek)} {item.startTime}–{item.endTime}
                </label>
              ))}
            </div>
          </fieldset>
        )}

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
        {overlap && <OverlapNote lesson={overlap} />}
        {targetOverlaps.map((item) => item.clash && (
          <Problem key={item.target.id}>{dayShort(item.target.dayOfWeek)}: после изменения пересечение по времени с уроком группы «{item.clash.groupName}» ({item.clash.startTime} — {item.clash.endTime}).</Problem>
        ))}
        {timeProblem && <Problem>{timeProblem}</Problem>}
        {error && (
          <div role="alert" data-testid="weekly-edit-error" className="space-y-1.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
            <p className="flex items-start gap-2 font-semibold"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{error}</span></p>
            {details.map((line) => <p key={line} className="pl-6 font-normal leading-relaxed">{line}</p>)}
          </div>
        )}
      </form>
    </Modal>
  );
}

// ── stop the weekly lesson from a future date ────────────────────────────────────────────────────────────────────────────────

/**
 * «Прекратить занятия»: the lesson stops from a future date; the past lessons, the attendance and the journal stay as they are.
 * Before it the dialog asks the server what the stop would do to the future exams of the lesson (they return to drafts only after an
 * explicit tick), exactly as the teacher's screen always did.  The line of the lesson shows its time on the chosen date.
 */
export function EndWeeklyLessonDialog({ lesson, onClose, onEnded, defaultEffectiveFrom, resolveAt, aboveLessonPanel = false }: {
  lesson: WeeklyLesson | null;
  defaultEffectiveFrom?: string;
  resolveAt?: ResolveWeeklyLesson;
  /** Over the lesson panel of the teacher's cabinet (z 99999). */
  aboveLessonPanel?: boolean;
  onClose: () => void;
  onEnded: () => void | Promise<void>;
}) {
  return lesson ? (
    <EndWeeklyLessonForm key={lesson.id} lesson={lesson} onClose={onClose} onEnded={onEnded} defaultEffectiveFrom={defaultEffectiveFrom} resolveAt={resolveAt} aboveLessonPanel={aboveLessonPanel} />
  ) : null;
}

function EndWeeklyLessonForm({ lesson, onClose, onEnded, defaultEffectiveFrom, resolveAt, aboveLessonPanel }: {
  lesson: WeeklyLesson;
  defaultEffectiveFrom?: string;
  resolveAt?: ResolveWeeklyLesson;
  aboveLessonPanel: boolean;
  onClose: () => void;
  onEnded: () => void | Promise<void>;
}) {
  const initialFrom = useMemo(() => startingFrom(defaultEffectiveFrom), [defaultEffectiveFrom]);
  const [effectiveFrom, setEffectiveFrom] = useState(initialFrom);
  const [shown, setShown] = useState<WeeklyLesson>(lesson);
  const [reason, setReason] = useState("");
  const [impact, setImpact] = useState<RecurringLessonEndImpact | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [busy, setBusy] = useState(false);
  const [release, setRelease] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolveRef = useRef(resolveAt);
  resolveRef.current = resolveAt;
  useEffect(() => {
    const resolve = resolveRef.current;
    if (!resolve || effectiveFrom === initialFrom || effectiveFrom < nextBusinessDate()) return undefined;
    let cancelled = false;
    void resolve(effectiveFrom).then((snapshot) => { if (!cancelled && snapshot) setShown(snapshot); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [effectiveFrom, initialFrom]);

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

  const dayName = DAYS.find((day) => day.id === Number(shown.dayOfWeek))?.name ?? "Регулярное занятие";
  return (
    <Modal
      open
      title="Прекратить занятия"
      description="Прошедшие уроки, посещаемость и журнал останутся без изменений. Новые экземпляры этого занятия перестанут появляться с выбранной даты."
      onClose={onClose}
      busy={busy}
      aboveLessonPanel={aboveLessonPanel}
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
          <p className="text-sm font-semibold text-slate-900">{shown.groupName}</p>
          <p className="mt-0.5 text-xs text-slate-500">{dayName} · {shown.startTime}—{shown.endTime}</p>
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
