import { ASSIGN_TEACHER_ACTION, REPLACE_TEACHER_ACTION, canReplaceTeacher } from "./lesson-teacher";
import { businessWallTimeToInstant } from "./business-time";
import { GROUP_ARCHIVED_SCHEDULE_TEXT, dayAndDateLabel, opsErrorCode, opsErrorDetail } from "./ops-errors";
import { examDraftCancelText, examRunningText, movedFromLabel, substitutionErrorText } from "./substitutions";
import type { ExamBinding, MoveCheckOut } from "./substitution-types";
import type { TeacherBusyDetail } from "./ops-b-types";

/** What the owner / administrator can do with one lesson of the group's week schedule, from the lesson sheet (the card itself has no buttons). */
export type ScheduleCardAction =
  | "assign"          // «Назначить замену» (future) / «Назначить того, кто провёл» (past): the teacher of this lesson
  | "reschedule"      // «Перенести урок» (the time / room of this lesson)
  | "cancel"          // «Отменить урок»
  | "mark"            // «Отметить посещаемость»: a past lesson nobody marked (the journal)
  | "journal";        // «Открыть в журнале»: a lesson that is held or going on

export const SCHEDULE_ACTION_LABEL: Record<Exclude<ScheduleCardAction, "assign">, string> = {
  reschedule: "Перенести урок",
  cancel: "Отменить урок",
  mark: "Отметить посещаемость",
  journal: "Открыть в журнале",
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
  /** The moment of the decision (business clock is applied to it); the real now by default, a test passes its own. */
  now?: Date;
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

/** The actions of the lesson sheet by situation; [] for a card that is information only (cancelled, archived group, not a manager). */
export function scheduleCardActions(input: ScheduleCardInput): ScheduleCardAction[] {
  if (input.archived || (input.role !== "owner" && input.role !== "admin")) return [];
  const { state, date, today } = input;
  if (state === "cancelled") return [];
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

/** The room of a lesson, only when it is set («Онлайн» for an online one); null: nothing to show. */
export function roomLabel(lesson: { room?: string | null; format?: string | null }): string | null {
  if (lesson.format === "online") return "Онлайн";
  const room = (lesson.room ?? "").trim();
  return room || null;
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
    case "LESSON_HAS_NO_TEACHER": return "У урока нет преподавателя: сначала назначьте его, потом переносите урок";
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
    const known = lessonMoveErrorText({ code }, "");
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
