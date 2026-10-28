import { ASSIGN_TEACHER_ACTION, REPLACE_TEACHER_ACTION, canReplaceTeacher } from "./lesson-teacher";
import { businessWallTimeToInstant } from "./business-time";
import { roomWithPrefix } from "./lesson-slot-form";
import { GROUP_ARCHIVED_SCHEDULE_TEXT, dayAndDateLabel, opsErrorCode, opsErrorDetail } from "./ops-errors";
import { examDraftCancelText, examDraftMoveText, examRunningText, movedFromLabel, substitutionErrorText } from "./substitutions";
import type { ExamBinding, MoveCheckOut } from "./substitution-types";
import type { TeacherBusyDetail } from "./ops-b-types";

/** What the owner / administrator can do with one lesson of the group's week schedule, from the lesson sheet (the card itself has no buttons). */
export type ScheduleCardAction =
  | "assign"          // «Назначить замену» (future) / «Назначить того, кто провёл» (past): the teacher of this lesson
  | "reschedule"      // «Перенести урок» (the time / room of this lesson)
  | "cancel"          // «Отменить урок»
  | "mark"            // «Отметить посещаемость»: a past lesson nobody marked (the journal)
  | "journal"        // «Открыть в журнале»: a lesson that is held or going on
  | "restore"        // «Вернуть урок»: a cancelled lesson that has not started is planned again (W1 F3)
  | "editSeries"     // «Изменить постоянный урок»: the weekly lesson this one belongs to, from a future date
  | "endSeries";     // «Прекратить урок»: stop the weekly lesson from a future date

export const SCHEDULE_ACTION_LABEL: Record<Exclude<ScheduleCardAction, "assign">, string> = {
  reschedule: "Перенести урок",
  cancel: "Отменить урок",
  mark: "Отметить посещаемость",
  restore: "Вернуть урок",
  journal: "Открыть в журнале",
  editSeries: "Изменить постоянный урок",
  endSeries: "Прекратить урок",
};

/**
 * IA audit F17: ONE wording of what is done with a lesson, whichever screen does it (the sheet of the schedule, the column menu of the journal,
 * «Незакрытые уроки»): the same words for the same action, chosen by the DATE of the lesson - a lesson to come is «Отменить урок», one that has
 * passed «Урока не было»; a past lesson is marked with «Отметить посещаемость».
 */
export const CANCEL_PAST_LESSON_LABEL = "Урока не было";
export function cancelLessonLabel(past: boolean): string {
  return past ? CANCEL_PAST_LESSON_LABEL : SCHEDULE_ACTION_LABEL.cancel;
}
export const MARK_LESSON_LABEL = SCHEDULE_ACTION_LABEL.mark;
export const FINISH_LESSON_LABEL = "Завершить урок";
export const CORRECT_MARKS_LABEL = "Исправить отметки";

export const ASSIGN_SUBSTITUTE_ACTION = "Назначить замену";
export const ASSIGN_WHO_HELD_ACTION = "Назначить того, кто провёл";

export interface ScheduleCardInput {
  role: string | null | undefined;
  archived: boolean;
  /** `scheduled` | `in_progress` | `completed` | `cancelled` */
  state: string;
  date: string;
  today: string;
  /** The server sent who teaches the lesson (an older one does not: no assignment then). */
  hasTeacherInfo: boolean;
  /** «HH:MM» of the start: with it a lesson of today that has begun is treated as a past one. */
  startTime?: string | null;
  /** The lesson is an occurrence of a WEEKLY lesson (not a one-off one): the sheet then also changes / stops the weekly lesson. */
  recurring?: boolean;
  /** The moment of the decision (business clock is applied to it); the real now by default, a test passes its own. */
  now?: Date;
  /** A cancelled lesson that is the ORIGINAL of a move (it went to another date): it is not «returned», the copy is cancelled instead. */
  moved?: boolean;
  /** How a cancelled lesson was cancelled as the journal sends it (`centre` | `holiday` | `day_off`); `day_off` is undone by the day off itself. */
  cancelKind?: string | null;
}

/**
 * A lesson of TODAY whose start time has passed (business time, Tashkent) is no longer a future one: it can be neither moved nor
 * cancelled (the server answers LESSON_ALREADY_STARTED), it can be marked.  A past day is past; a later day never is.
 * Without a readable start time a lesson of today stays a future one (the server has the last word).
 */
export function lessonHasStarted(input: { date: string; today: string; startTime?: string | null; now?: Date }): boolean {
  if (input.date < input.today) return true;
  if (input.date > input.today) return false;
  const start = businessWallTimeToInstant(input.date, input.startTime);
  return start !== null && start.getTime() <= (input.now ?? new Date()).getTime();
}

/**
 * «The lesson is over» (business time, Tashkent) - the rule of the server for a missed lesson (`_resolve_reconcilable_missed_occurrence`: a lesson of today is reconciled only when the
 * current MINUTE is later than the minute of its end).  A past day is over; a later day never is; a lesson of today without a readable end is not (the server has the last word).
 * ONE helper (rule 38): «Урока не было» of the teacher asks it, not `lessonHasStarted` (a lesson that has begun but not ended is the teacher's to start and hold).
 */
export function lessonHasEnded(input: { date: string; today: string; endTime?: string | null; now?: Date }): boolean {
  if (input.date < input.today) return true;
  if (input.date > input.today) return false;
  const end = businessWallTimeToInstant(input.date, input.endTime);
  // the minute of the end is still «not over»: the first moment after it is the start of the next minute
  return end !== null && end.getTime() + 60_000 <= (input.now ?? new Date()).getTime();
}

/** The actions of the lesson sheet by situation; [] for a card that is information only (cancelled, archived group, not a manager). */
export function scheduleCardActions(input: ScheduleCardInput): ScheduleCardAction[] {
  const base = lessonActions(input);
  // the weekly lesson itself is changed / stopped from a future date, whatever happened to this one occurrence (a cancelled one has no sheet)
  // (a cancelled lesson offers only «Вернуть урок»: the weekly lesson is changed from a lesson that is held)
  return input.recurring && base.length > 0 && input.state !== "cancelled" ? [...base, "editSeries", "endSeries"] : base;
}

function lessonActions(input: ScheduleCardInput): ScheduleCardAction[] {
  if (input.archived || (input.role !== "owner" && input.role !== "admin")) return [];
  const { state, date, today } = input;
  if (state === "cancelled") return canRestoreLesson(input) ? ["restore"] : [];
  if (state === "completed") return ["journal"];
  if (state === "in_progress") return ["journal"];
  const out: ScheduleCardAction[] = [];
  const canAssign = input.hasTeacherInfo && canReplaceTeacher(input.role, state);
  if (!lessonHasStarted({ date, today, startTime: input.startTime, now: input.now })) {
    if (canAssign) out.push("assign");
    out.push("reschedule", "cancel");
  } else {
    out.push("mark");
    if (canAssign) out.push("assign");
  }
  return out;
}

/**
 * W1 F3, ONE rule for «Вернуть урок» (the server: S5): the owner / administrator, a lesson cancelled on its own (not the original of a move - its copy is cancelled
 * instead, not by a day off - the day off is undone itself) that has not started yet, in a group that is not archived.  The server has the last word (RESTORE_*).
 */
export function canRestoreLesson(input: Pick<ScheduleCardInput, "role" | "archived" | "state" | "date" | "today" | "startTime" | "now" | "moved" | "cancelKind">): boolean {
  if (input.archived || (input.role !== "owner" && input.role !== "admin")) return false;
  if (input.state !== "cancelled" || input.moved || input.cancelKind === "day_off") return false;
  return !lessonHasStarted({ date: input.date, today: input.today, startTime: input.startTime, now: input.now });
}

/** What the TEACHER's lesson panel offers instead of «Отменить этот урок» (W1 F1; the server: S3 - a teacher does not cancel, he asks «Не смогу провести»). */
export interface TeacherCancelOffer {
  /** `missed`: «Урока не было» of a past lesson nobody started; `attendance`: the lesson was started and its roster is empty (the one thing the server still lets him cancel). */
  route: "missed" | "attendance";
  /** `own_one_off`: a one-off lesson HE added himself (W1 S27) - the one lesson to come he may cancel. */
  variant: "not_held" | "own_one_off";
  /** One line, no second line: the panel that opens says the rest. */
  label: string;
}

export const CANCEL_ONE_OFF_LABEL = "Отменить разовый урок";

/** W1 S27: a one-off lesson the teacher added himself and that is not a copy of a move (`createdBy` comes with the occurrence). */
export function isOwnOneOff(lesson: { isOneOff?: boolean; movedFrom?: unknown; createdBy?: { id?: string | null } | null }, userId: string | null | undefined): boolean {
  return Boolean(userId && lesson.isOneOff && !lesson.movedFrom && lesson.createdBy?.id === userId);
}

/**
 * «Урока не было» for the teacher: only for a lesson that has passed and was never started (or, started with nobody on its roster, which cannot be finished).
 * A lesson to come is never offered: he asks «Не смогу провести» (the administrator decides).  ONE function for the schedule and the dashboard.
 */
export function teacherCancelOffer(input: {
  /** The viewer's org role: only a teacher is offered these rows (the owner / administrator cancel from the lesson sheet, with the kind of the cancellation - rule 38). */
  role: string | null | undefined;
  /** Somebody else leads this lesson now (the substitute of a replaced lesson; for the replaced teacher too): not his to cancel.  The substitute himself leads it and is offered. */
  otherLeads?: boolean;
  state: string | null | undefined; date: string; today: string; startTime?: string | null;
  /** «HH:MM» of the end: «Урока не было» comes only after it (`lessonHasEnded`, the server's rule). */
  endTime?: string | null;
  rosterEmpty?: boolean; now?: Date; ownOneOff?: boolean;
}): TeacherCancelOffer | null {
  if (input.role !== "teacher" || input.otherLeads) return null;
  const state = input.state || "scheduled";
  const notHeld = (route: TeacherCancelOffer["route"]): TeacherCancelOffer => ({ route, variant: "not_held", label: CANCEL_PAST_LESSON_LABEL });
  if (state === "in_progress") return input.rosterEmpty ? notHeld("attendance") : null;
  if (state !== "scheduled") return null;
  if (lessonHasEnded(input)) return notHeld("missed");
  // (a lesson that has begun but not ended is held, not «missed»: the teacher starts it as usual - nothing new on the panel)
  // W1 S27: a lesson to come is not his to cancel - except the one-off lesson he created himself (the server: 403 for every other)
  return input.ownOneOff ? { route: "attendance", variant: "own_one_off", label: CANCEL_ONE_OFF_LABEL } : null;
}

/** The label of «assign» by situation: a future lesson «Назначить замену» (or «Заменить преподавателя» when a substitute is already there), a past one «Назначить того, кто провёл». */
export function assignActionLabel(input: { past: boolean; lacksTeacher: boolean; isSubstitution: boolean }): string {
  if (input.lacksTeacher) return ASSIGN_TEACHER_ACTION;
  if (input.past) return ASSIGN_WHO_HELD_ACTION;
  return input.isSubstitution ? REPLACE_TEACHER_ACTION : ASSIGN_SUBSTITUTE_ACTION;
}

// ── what the card and the sheet say (income2 §1, owner review 22.10) ─────────────────────────────────────────────

/** The title of a lesson: its topic, else the name of the group (never the bare word «Занятие»). */
export function lessonTitle(lesson: { topic?: string | null }, groupName: string | null | undefined): string {
  return (lesson.topic ?? "").trim() || (groupName ?? "").trim() || "Урок";
}

/** W1 S26: «Добавил: Каримов Р., преподаватель» on a one-off lesson (the sheet of the owner / administrator); null for a lesson of the weekly schedule. */
export function addedByLine(lesson: { createdBy?: { name?: string | null; role?: string | null } | null }): string | null {
  const name = (lesson.createdBy?.name ?? "").trim();
  if (!name) return null;
  const role = lesson.createdBy?.role === "owner" ? "владелец" : lesson.createdBy?.role === "admin" ? "администратор" : lesson.createdBy?.role === "teacher" ? "преподаватель" : "";
  return `Добавил: ${name}${role ? `, ${role}` : ""}`;
}

/** The room of a lesson, only when it is set («Онлайн» for an online one); null: nothing to show. */
export function roomLabel(lesson: { room?: string | null; format?: string | null }): string | null {
  if (lesson.format === "online") return "Онлайн";
  const room = (lesson.room ?? "").trim();
  return room || null;
}

/** The room as the lines of the schedule say it: «каб. 12» (a room that begins with a word stays as it is), «Онлайн»; null: nothing to show. */
export function roomLine(lesson: { room?: string | null; format?: string | null }): string | null {
  const room = roomLabel(lesson);
  return room && lesson.format !== "online" ? roomWithPrefix(room) : room;
}

/**
 * «Ведёт: Коллега У. — замена за Основной У.» / «Ведёт: Основной У.» / «Преподаватель не назначен»; null without the server's answer.
 * `noTeacherText` is the sentence for a lesson without a teacher.
 */
export function teacherLine(
  info: { teacherId?: string | null; teacherName?: string | null; isSubstitution?: boolean; defaultTeacherName?: string | null } | null | undefined,
  noTeacherText: string,
): string | null {
  if (!info) return null;
  if (!info.teacherId) return noTeacherText;
  const name = (info.teacherName ?? "").trim();
  if (!name) return null;
  const regular = (info.defaultTeacherName ?? "").trim();
  if (info.isSubstitution) return regular ? `Ведёт: ${name} — замена за ${regular}` : `Ведёт: ${name} — замена`;
  return `Ведёт: ${name}`;
}

/** The server writes the reason of a move as «Перенесён на 29.10, 16:00–17:30: Личные обстоятельства»: the reason alone. */
export function movedReasonOf(text: string | null | undefined): string | null {
  const match = /^Перенесён на [^:]*\d{2}:\d{2}(?:–\d{2}:\d{2})?:\s*([\s\S]+)$/.exec((text ?? "").trim());
  return match ? match[1].trim() || null : null;
}

/** The lines of the sheet of a cancelled / moved lesson: where it went and the reason in full; [] for an ordinary lesson. */
export function sheetNotes(input: { moved: boolean; movedToText?: string | null; reason: string | null | undefined; cancelled: boolean }): string[] {
  const lines: string[] = [];
  if (input.moved) {
    if (input.movedToText) lines.push(`Перенесён на ${input.movedToText}`);
    const reason = movedReasonOf(input.reason) ?? ((input.reason ?? "").trim() || null);
    if (reason && !/^Перенесён на /.test(reason)) lines.push(`Причина: ${reason}`);
  } else if (input.cancelled && (input.reason ?? "").trim()) {
    lines.push(`Причина: ${(input.reason ?? "").trim()}`);
  }
  return lines;
}

/** Free typing of a time → «HH:MM» (24 h, whatever the browser's locale): «930», «9:30», «09.30» → «09:30»; null when it is not a time. */
export function normalizeTime(text: string): string | null {
  const digits = text.trim().replace(/[^0-9]/g, "");
  const match = /^(\d{1,2})(\d{2})$/.exec(digits);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${match[2]}`;
}

// ── #124: the move without a request, the cancel precheck, «Перенесён с …» ─────────────────────────────────────────

/** «Перенесён с 25.10, 10:00» on the new lesson of a move; null on any other lesson (one text with the schedules of the teacher and the student). */
export const movedFromText = movedFromLabel;

export const LESSON_CHANGED_TEXT = "Урок уже изменили — обновите";

/** The codes that mean «the lesson is not what the sheet shows any more»: the sheet offers «Обновить» (re-reads the schedule, closes) instead of a retry. */
export const STALE_LESSON_CODES: readonly string[] = [
  "LESSON_CHANGED",
  "SUBSTITUTION_ALREADY_DECIDED",
  "LESSON_CANCELLED",
  "LESSON_NOT_FOUND",
  "GROUP_ARCHIVED",
  "LESSON_ALREADY_STARTED",
];

export function isStaleLessonCode(code: string | null | undefined): boolean {
  return Boolean(code) && STALE_LESSON_CODES.includes(code as string);
}

/** A refusal that means «somebody changed this lesson first» (or it is gone / started / its group archived): the sheet offers «Обновить». */
export function isLessonChanged(error: unknown): boolean {
  return isStaleLessonCode(opsErrorCode(error));
}

/** The refusals of `lesson-move` in the words of the sheet; the shared texts of the substitutions for the rest. */
export function lessonMoveErrorText(error: unknown, fallback = "Не удалось перенести урок. Расписание не изменено."): string {
  switch (opsErrorCode(error)) {
    case "LESSON_CHANGED":
    case "SUBSTITUTION_ALREADY_DECIDED": return LESSON_CHANGED_TEXT;
    case "LESSON_HAS_NO_TEACHER": return "У группы нет преподавателя — назначьте его в карточке группы";
    case "EXAM_SERVICE_UNAVAILABLE": return "Не удалось проверить экзамены группы. Повторите попытку.";
    case "LESSON_ALREADY_STARTED": return "Урок уже начался или прошёл: перенести его нельзя";
    case "LESSON_CANCELLED": return "Урок уже отменён — обновите расписание";
    case "LESSON_NOT_FOUND": return "Этого урока больше нет в расписании — обновите";
    case "GROUP_ARCHIVED": return GROUP_ARCHIVED_SCHEDULE_TEXT;
    case "TEACHER_BUSY": {
      const first = opsErrorDetail<TeacherBusyDetail>(error)?.conflicts?.[0];
      return first ? `Преподаватель занят в это время: «${first.withGroupName}», ${dayAndDateLabel(first.date)} ${first.startTime}–${first.endTime}` : "Преподаватель занят в это время";
    }
    case "GROUP_BUSY": return "У группы уже есть урок в это время";
    default: return substitutionErrorText(error, fallback);
  }
}

/** The live check under the move form: «Время свободно» or what is in the way («Преподаватель занят в это время», «У группы уже есть урок»). */
export function lessonMoveCheckLines(check: MoveCheckOut, teacherLabel?: string | null): { ok: boolean; lines: string[]; warnings: string[]; code: string | null; stale: boolean } {
  const lines: string[] = [];
  const warnings = (check.warnings ?? []).map((warning) => (warning.message ?? "").trim()).filter(Boolean);
  // a refusal of the ORIGIN lesson (ok:false with a code): LESSON_ALREADY_STARTED, LESSON_CANCELLED, GROUP_ARCHIVED, LESSON_NOT_FOUND
  const code = check.ok ? null : (check.code ?? "").trim() || null;
  if (code) {
    const known = lessonMoveErrorText({ code, detail: { code, message: check.message ?? "" } }, "");
    const text = known || (check.message ?? "").trim() || "Этот урок перенести нельзя";
    return { ok: false, lines: [text], warnings, code, stale: isStaleLessonCode(code) };
  }
  for (const conflict of check.teacherConflicts ?? []) {
    lines.push(`Преподаватель занят в это время: «${conflict.withGroupName}», ${dayAndDateLabel(conflict.date)} ${conflict.startTime}–${conflict.endTime}`);
  }
  for (const conflict of check.groupConflicts ?? []) {
    lines.push(`У группы уже есть урок ${dayAndDateLabel(conflict.date)} ${conflict.startTime}–${conflict.endTime}`);
  }
  if (lines.length === 0 && check.ok) {
    const name = (teacherLabel ?? check.teacherName ?? "").trim();
    return { ok: true, lines: [name ? `Время свободно: у ${name} и у группы пересечений нет` : "Время свободно"], warnings, code: null, stale: false };
  }
  return { ok: false, lines: lines.length ? lines : [(check.message ?? "").trim() || "Это время недоступно"], warnings, code: null, stale: false };
}

/** The state of the live check of the move form, as the sheet holds it. */
export interface MoveCheckState {
  /** The request is on its way. */
  checking: boolean;
  /** The request failed (network, 5xx, a refusal thrown as an error). */
  failed: boolean;
  /** The answer, or null while there is none. */
  check: Pick<MoveCheckOut, "ok"> | null;
}

/**
 * «Перенести урок» is enabled only on a live answer «ok»: not while the check is loading, not after it failed, not when it has not
 * run yet (the date or time is not valid / not changed), and not when the answer is `!ok`.
 */
export function moveConfirmDisabled(state: MoveCheckState & { busy?: boolean }): boolean {
  if (state.busy) return true;
  if (state.checking || state.failed) return true;
  return state.check === null || state.check.ok !== true;
}

export interface ExamCancelState {
  /** The binding has not arrived yet. */
  loading: boolean;
  /** The confirm button is disabled. */
  blocked: boolean;
  /** The sentence to show (null: nothing to say). */
  message: string | null;
  tone: "info" | "warn" | "error";
  /** «Повторить»: the exam service did not answer. */
  retry: boolean;
}

/** What the exam bound to the lesson means for «Отменить урок» (`lesson-exam-binding`). `null` = not read yet. */
/** The same answer for a MOVE: a live exam blocks it (the server refuses with LESSON_HAS_LIVE_EXAM), a draft one is released - warn before. */
export function examMoveState(binding: ExamBinding | null | undefined): ExamCancelState {
  const state = examCancelState(binding);
  const title = (binding?.title ?? "").trim();
  if (!state.blocked && state.tone === "warn" && title) return { ...state, message: examDraftMoveText(title) };
  if (state.blocked && state.tone === "error" && binding && binding.state !== "unavailable" && !(binding.message ?? "").trim()) {
    return { ...state, message: title ? `Идёт экзамен «${title}» — урок нельзя перенести, пока экзамен не закончится.` : "Идёт экзамен — урок нельзя перенести, пока экзамен не закончится." };
  }
  return state;
}

export function examCancelState(binding: ExamBinding | null | undefined): ExamCancelState {
  if (!binding) return { loading: true, blocked: true, message: null, tone: "info", retry: false };
  const title = (binding.title ?? "").trim();
  const message = (binding.message ?? "").trim();
  if (binding.state === "unavailable") {
    return { loading: false, blocked: true, message: message || "Не удалось проверить экзамены группы. Повторите попытку.", tone: "error", retry: true };
  }
  // `canCancel:false` wins over `state:"none"`: the server may refuse without naming an exam
  if (binding.canCancel === false) {
    return { loading: false, blocked: true, message: message || (title ? examRunningText(title) : "Нельзя отменить урок с активным экзаменом"), tone: "error", retry: false };
  }
  if (binding.state === "none") return { loading: false, blocked: false, message: null, tone: "info", retry: false };
  return { loading: false, blocked: false, message: title ? examDraftCancelText(title) : null, tone: "warn", retry: false };
}
